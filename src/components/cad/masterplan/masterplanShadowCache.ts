import { Point2D, BuildingLoop } from '@/types/geometry';
import {
  PolygonWithHoles,
} from '@/utils/math2d/polygons';
import {
  getMasterplanSolarAngles,
  computeStoryShadowPolygonWithHoles,
  polygonFingerprint,
  MasterplanStoryTier,
} from './masterplanGeometry';
import { clusterTiersByShadowOverlap, unionPolygonsWithHolesHierarchical, Bounds, polygonsWithHolesBounds } from './masterplanSpatial';
import { getCachedBuildingShadow, makeSunBucketKey, getOrComputeBuildingShadow } from '@/engine/buildingGeometryCache';

export interface MasterplanColorSample {
  color: string;
  offsetMin: number;
}

export interface MasterplanShadowSample {
  color: string;
  polys: PolygonWithHoles[];
}

export interface MasterplanShadowRenderResult {
  samples: MasterplanShadowSample[];
}

/**
 * Cache cieni gruntowych Masterplanu: computeStoryShadowPolygon/unionPolygonsWithHoles są kosztowne
 * (polygon-clipping), a wynik nie zależy od viewState (pan/zoom/rotacja) — tylko od geometrii
 * tierów i pozycji słońca. Bez cache renderer przeliczałby je na każdej klatce, w tym podczas
 * czystego pan/zoom.
 */
const DEFAULT_UMBRA_SAMPLE: MasterplanColorSample = { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 };

let groundLastKey: string | null = null;
let groundLastResult: MasterplanShadowRenderResult = { samples: [] };

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
 * Algorytm A456 (pojedynczy surowy obrys cienia podstawowego — umbra):
 * Generuje 1 warstwę cienia podstawowego dla aktualnej pozycji słońca (offset 0).
 * Używa unii hierarchicznej per klaster AABB i bufora per obiekt.
 */
function computeSoftSamples(
  tiers: MasterplanStoryTier[],
  umbraColor: string,
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): MasterplanShadowSample[] {
  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0, method);
  const validTiers = tiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
  const clusters = clusterTiersByShadowOverlap(validTiers, angles);

  const umbraPolysAll: PolygonWithHoles[] = [];

  for (const cluster of clusters) {
    const cUmbra: PolygonWithHoles[] = [];

    for (const tier of cluster) {
      const umbraKey = makeSunBucketKey(tier.storyIndex, 'soft', method, latitude, longitude, equinoxDate, hourFraction, 0);
      const polys = getOrComputeBuildingShadow(tier.bldgRef, umbraKey, () =>
        computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, angles, tier.hTop, tier.hBottom)
      );
      cUmbra.push(...polys);
    }

    accumulatePolygons(umbraPolysAll, cUmbra);
  }

  const samples: MasterplanShadowSample[] = [];
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
  method: 'raycasting' | 'segments' | 'astro' | 'linijka',
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number
): (bldg: BuildingLoop) => Bounds | null {
  const key = makeSunBucketKey(0, 'soft', method, latitude, longitude, equinoxDate, hourFraction, 0);
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
  tiers: MasterplanStoryTier[],
  samples: MasterplanColorSample[],
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): MasterplanShadowRenderResult {
  const key = `soft|${method}|${tiers.map(tierFingerprint).join(',')}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  if (key === groundLastKey) return groundLastResult;

  const umbraSample = samples.find((s) => s.offsetMin === 0) ?? DEFAULT_UMBRA_SAMPLE;

  const shadowSamples = computeSoftSamples(tiers, umbraSample.color, latitude, longitude, equinoxDate, hourFraction, method);

  const result: MasterplanShadowRenderResult = { samples: shadowSamples };
  groundLastKey = key;
  groundLastResult = result;
  return result;
}

/**
 * Cache cieni dachowych (ΔH) Masterplanu, per kondygnacja odbierająca cień (currentTierKey).
 */
const roofCache = new Map<string, { key: string; result: MasterplanShadowRenderResult }>();

export function getCachedRoofShadowSamples(
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
  const key = `soft|${method}|${currentH.toFixed(2)}|${higherTiers.map(tierFingerprint).join(',')}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  const cached = roofCache.get(currentTierKey);
  if (cached && cached.key === key) return cached.result;
  if (roofCache.size > 5000) roofCache.clear();

  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0, method);
  const umbraPolys: PolygonWithHoles[] = [];

  for (const higherTier of higherTiers) {
    const deltaHTop = higherTier.hTop - currentH;
    const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
    if (deltaHTop <= 0.05) continue;

    const extra = `roof:${currentH.toFixed(2)}`;
    const key = makeSunBucketKey(higherTier.storyIndex, 'soft', method, latitude, longitude, equinoxDate, hourFraction, 0, extra);
    const shadowRoofPolys = getOrComputeBuildingShadow(higherTier.bldgRef, key, () =>
      computeStoryShadowPolygonWithHoles(higherTier.polygon, higherTier.holes, angles, deltaHTop, deltaHBase)
    );
    umbraPolys.push(...shadowRoofPolys);
  }

  const umbraColor = samples.find((s) => s.offsetMin === 0)?.color ?? DEFAULT_UMBRA_SAMPLE.color;
  const mergedUmbra: PolygonWithHoles[] = [];
  accumulatePolygons(mergedUmbra, umbraPolys);

  const shadowSamples: MasterplanShadowSample[] = [];
  if (mergedUmbra.length > 0) shadowSamples.push({ color: umbraColor, polys: mergedUmbra });

  const result: MasterplanShadowRenderResult = { samples: shadowSamples };
  roofCache.set(currentTierKey, { key, result });
  return result;
}
