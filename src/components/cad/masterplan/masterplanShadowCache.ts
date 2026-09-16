import { Point2D, BuildingLoop } from '@/types/geometry';
import {
  PolygonWithHoles,
  unionPolygonsWithHoles,
} from '@/utils/math2d/polygons';
import {
  getMasterplanSolarAngles,
  computeStoryShadowPolygonWithHoles,
  computeSoftShadowEnvelopeWithHoles,
  polygonFingerprint,
  MasterplanStoryTier,
} from './masterplanGeometry';
import { clusterTiersByShadowOverlap, unionPolygonsWithHolesHierarchical, Bounds, polygonsWithHolesBounds } from './masterplanSpatial';
import { getCachedBuildingShadow, makeSunBucketKey, getOrComputeBuildingShadow, getOrComputeBuildingSoftShadow } from '@/engine/buildingGeometryCache';

export type MasterplanShadowAlgorithm = 'legacy' | 'soft';

export interface MasterplanColorSample {
  color: string;
  offsetMin: number;
}

export interface MasterplanShadowSample {
  color: string;
  polys: PolygonWithHoles[];
}

export interface MasterplanShadowRenderResult {
  algorithm: MasterplanShadowAlgorithm;
  samples: MasterplanShadowSample[];
}

/**
 * Cache cieni gruntowych Masterplanu: computeStoryShadowPolygon/unionPolygonsWithHoles są kosztowne
 * (polygon-clipping), a wynik nie zależy od viewState (pan/zoom/rotacja) — tylko od geometrii
 * tierów i pozycji słońca. Bez cache renderer przeliczałby je na każdej klatce, w tym podczas
 * czystego pan/zoom.
 */
const DEFAULT_PENUMBRA_SAMPLE: MasterplanColorSample = { color: 'rgba(30, 41, 59, 0.08)', offsetMin: -1 };
const DEFAULT_UMBRA_SAMPLE: MasterplanColorSample = { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 };

let groundLastKey: string | null = null;
let groundLastResult: MasterplanShadowRenderResult = { algorithm: 'legacy', samples: [] };

/** Scala listę poligonów klastra do wyniku: bez unii dla pojedynczego elementu, hierarchicznie dla wielu. */
function accumulatePolygons(dest: PolygonWithHoles[], src: PolygonWithHoles[]): void {
  if (src.length === 1) dest.push(src[0]);
  else if (src.length > 1) dest.push(...unionPolygonsWithHolesHierarchical(src));
}

function tierFingerprint(t: MasterplanStoryTier): string {
  const holesFingerprint = (t.holes && t.holes.length > 0) ? t.holes.map(polygonFingerprint).join(';') : '';
  return `${t.buildingId}:${t.storyIndex}:${t.hTop.toFixed(2)}:${t.hBottom.toFixed(2)}:${polygonFingerprint(t.polygon)}#${holesFingerprint}`;
}

/**
 * Klastry przestrzennie niezależne (patrz masterplanSpatial.ts) nie mogą się wzajemnie przecinać,
 * więc unia per klaster + konkatenacja wyników między klastrami daje identyczny wynik co jedna
 * wielka unia całej sceny — ale sweep-line w polygon-clipping dostaje dużo mniejsze N na raz.
 */
function computeLegacySamples(
  tiers: MasterplanStoryTier[],
  samples: MasterplanColorSample[],
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): MasterplanShadowSample[] {
  const baseAngles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0, method);
  const clusters = clusterTiersByShadowOverlap(
    tiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0),
    baseAngles
  );

  const result: MasterplanShadowSample[] = [];
  for (const sample of samples) {
    const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, sample.offsetMin, method);
    const mergedPolys: PolygonWithHoles[] = [];

    for (const cluster of clusters) {
      const clusterPolys: PolygonWithHoles[] = [];
      for (const tier of cluster) {
        const key = makeSunBucketKey(tier.storyIndex, 'legacy', method, latitude, longitude, equinoxDate, hourFraction, sample.offsetMin);
        const polys = getOrComputeBuildingShadow(tier.bldgRef, key, () =>
          computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, angles, tier.hTop, tier.hBottom)
        );
        clusterPolys.push(...polys);
      }
      accumulatePolygons(mergedPolys, clusterPolys);
    }

    if (mergedPolys.length > 0) {
      result.push({ color: sample.color, polys: mergedPolys });
    }
  }
  return result;
}

/**
 * Miękki cień (penumbra jako promienista tarcza słońca wokół umbry):
 * Generuje 2 warstwy — Penumbra (nadzbiór, rysowana pierwsza) i Umbra (podzbiór, na wierzchu).
 * Używa unii hierarchicznej per klaster AABB.
 */
function computeSoftSamples(
  tiers: MasterplanStoryTier[],
  umbraColor: string,
  penumbraColor: string,
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): MasterplanShadowSample[] {
  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0, method);
  const validTiers = tiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
  const clusters = clusterTiersByShadowOverlap(validTiers, angles);

  const penumbraPolysAll: PolygonWithHoles[] = [];
  const umbraPolysAll: PolygonWithHoles[] = [];

  for (const cluster of clusters) {
    const cPenumbra: PolygonWithHoles[] = [];
    const cUmbra: PolygonWithHoles[] = [];

    for (const tier of cluster) {
      const umbraKey = makeSunBucketKey(tier.storyIndex, 'soft', method, latitude, longitude, equinoxDate, hourFraction, 0, 'umbra');
      const penumbraKey = makeSunBucketKey(tier.storyIndex, 'soft', method, latitude, longitude, equinoxDate, hourFraction, 0, 'penumbra');
      const { umbra, penumbra } = getOrComputeBuildingSoftShadow(tier.bldgRef, umbraKey, penumbraKey, () =>
        computeSoftShadowEnvelopeWithHoles(tier.polygon, tier.holes, angles, tier.hTop, tier.hBottom)
      );
      cUmbra.push(...umbra);
      cPenumbra.push(...penumbra);
    }

    accumulatePolygons(umbraPolysAll, cUmbra);
    accumulatePolygons(penumbraPolysAll, cPenumbra);
  }

  const samples: MasterplanShadowSample[] = [];
  if (penumbraPolysAll.length > 0) samples.push({ color: penumbraColor, polys: penumbraPolysAll });
  if (umbraPolysAll.length > 0) samples.push({ color: umbraColor, polys: umbraPolysAll });

  return samples;
}

/**
 * Wypełnia wielokąty z otworami na Canvas 2D.
 */
export function fillPolys(ctx: CanvasRenderingContext2D, polys: PolygonWithHoles[], color: string): void {
  if (!polys || polys.length === 0) return;

  const validPolys = polys.filter((p) => p && p.outer && p.outer.length >= 3);
  if (validPolys.length === 0) return;

  ctx.fillStyle = color;
  for (const pwh of validPolys) {
    ctx.beginPath();
    pwh.outer.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();

    if (pwh.holes && pwh.holes.length > 0) {
      for (const hole of pwh.holes) {
        if (!hole || hole.length < 3) continue;
        hole.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      }
    }
    ctx.fill('evenodd');
  }
}

/**
 * Zwraca funkcję odpytującą cache cienia (storyIndex=0, reprezentatywny dolny tier) pod kątem
 * viewport-cullingu (`cullBuildingsByViewport` w `masterplanSpatial.ts`) — klucz budowany raz,
 * niezależnie od liczby budynków, zamiast per-budynek wewnątrz filtra. Współdzielona przez oba
 * renderery (ground/roofs), żeby konwencja klucza cache'u nie była duplikowana w dwóch miejscach.
 */
export function getCachedShadowBoundsForCulling(
  algorithm: MasterplanShadowAlgorithm,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka',
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number
): (bldg: BuildingLoop) => Bounds | null {
  const key = makeSunBucketKey(0, algorithm, method, latitude, longitude, equinoxDate, hourFraction, 0);
  return (bldg: BuildingLoop) => {
    const cached = getCachedBuildingShadow(bldg, key);
    return cached ? polygonsWithHolesBounds(cached) : null;
  };
}

/** Rysuje wynik cienia (warstwy próbek) na podanym kontekście. */
export function drawMasterplanShadowResult(
  ctx: CanvasRenderingContext2D,
  result: MasterplanShadowRenderResult
): void {
  for (const sample of result.samples) {
    fillPolys(ctx, sample.polys, sample.color);
  }
}

export function getCachedGroundShadowSamples(
  algorithm: MasterplanShadowAlgorithm,
  tiers: MasterplanStoryTier[],
  samples: MasterplanColorSample[],
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): MasterplanShadowRenderResult {
  const key = `${algorithm}|${method}|${tiers.map(tierFingerprint).join(',')}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  if (key === groundLastKey) return groundLastResult;

  const penumbraSample = samples[0] ?? DEFAULT_PENUMBRA_SAMPLE;
  const umbraSample = samples[1] ?? samples[0] ?? DEFAULT_UMBRA_SAMPLE;

  const shadowSamples =
    algorithm === 'soft'
      ? computeSoftSamples(tiers, umbraSample.color, penumbraSample.color, latitude, longitude, equinoxDate, hourFraction, method)
      : computeLegacySamples(tiers, samples, latitude, longitude, equinoxDate, hourFraction, method);

  const result: MasterplanShadowRenderResult = { algorithm, samples: shadowSamples };
  groundLastKey = key;
  groundLastResult = result;
  return result;
}

/**
 * Cache cieni dachowych (ΔH) Masterplanu, per kondygnacja odbierająca cień (currentTierKey).
 */
const roofCache = new Map<string, { key: string; result: MasterplanShadowRenderResult }>();

export function getCachedRoofShadowSamples(
  algorithm: MasterplanShadowAlgorithm,
  currentTierKey: string,
  currentH: number,
  higherTiers: MasterplanStoryTier[],
  samples: MasterplanColorSample[],
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): MasterplanShadowRenderResult {
  const key = `${algorithm}|${method}|${currentH.toFixed(2)}|${higherTiers.map(tierFingerprint).join(',')}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  const cached = roofCache.get(currentTierKey);
  if (cached && cached.key === key) return cached.result;
  if (roofCache.size > 5000) roofCache.clear();

  let shadowSamples: MasterplanShadowSample[] = [];

  if (algorithm === 'soft') {
    const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0, method);
    const penumbraPolys: PolygonWithHoles[] = [];
    const umbraPolys: PolygonWithHoles[] = [];

    for (const higherTier of higherTiers) {
      const deltaHTop = higherTier.hTop - currentH;
      const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
      if (deltaHTop <= 0.05) continue;

      const extra = `roof:${currentH.toFixed(2)}`;
      const umbraKey = makeSunBucketKey(higherTier.storyIndex, 'soft', method, latitude, longitude, equinoxDate, hourFraction, 0, `${extra}:umbra`);
      const penumbraKey = makeSunBucketKey(higherTier.storyIndex, 'soft', method, latitude, longitude, equinoxDate, hourFraction, 0, `${extra}:penumbra`);
      const { umbra, penumbra } = getOrComputeBuildingSoftShadow(higherTier.bldgRef, umbraKey, penumbraKey, () =>
        computeSoftShadowEnvelopeWithHoles(higherTier.polygon, higherTier.holes, angles, deltaHTop, deltaHBase)
      );
      umbraPolys.push(...umbra);
      penumbraPolys.push(...penumbra);
    }

    const penumbraColor = samples[0]?.color ?? DEFAULT_PENUMBRA_SAMPLE.color;
    const umbraColor = samples[1]?.color ?? samples[0]?.color ?? DEFAULT_UMBRA_SAMPLE.color;

    const mergedPenumbra: PolygonWithHoles[] = [];
    const mergedUmbra: PolygonWithHoles[] = [];
    accumulatePolygons(mergedPenumbra, penumbraPolys);
    accumulatePolygons(mergedUmbra, umbraPolys);

    if (mergedPenumbra.length > 0) shadowSamples.push({ color: penumbraColor, polys: mergedPenumbra });
    if (mergedUmbra.length > 0) shadowSamples.push({ color: umbraColor, polys: mergedUmbra });
  } else {
    for (const sample of samples) {
      const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, sample.offsetMin, method);
      const samplePolys: PolygonWithHoles[] = [];

      for (const higherTier of higherTiers) {
        const deltaHTop = higherTier.hTop - currentH;
        const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
        if (deltaHTop <= 0.05) continue;

        const extra = `roof:${currentH.toFixed(2)}`;
        const key = makeSunBucketKey(higherTier.storyIndex, 'legacy', method, latitude, longitude, equinoxDate, hourFraction, sample.offsetMin, extra);
        const shadowRoofPolys = getOrComputeBuildingShadow(higherTier.bldgRef, key, () =>
          computeStoryShadowPolygonWithHoles(higherTier.polygon, higherTier.holes, angles, deltaHTop, deltaHBase)
        );
        samplePolys.push(...shadowRoofPolys);
      }

      const mergedSample: PolygonWithHoles[] = [];
      accumulatePolygons(mergedSample, samplePolys);
      if (mergedSample.length > 0) shadowSamples.push({ color: sample.color, polys: mergedSample });
    }
  }

  const result: MasterplanShadowRenderResult = { algorithm, samples: shadowSamples };
  roofCache.set(currentTierKey, { key, result });
  return result;
}
