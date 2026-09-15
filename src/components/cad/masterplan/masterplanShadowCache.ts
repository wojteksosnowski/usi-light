import { Point2D } from '@/types/geometry';
import {
  PolygonWithHoles,
  unionPolygonsWithHoles,
  differencePolygonsWithHoles,
} from '@/utils/math2d/polygons';
import {
  getMasterplanSolarAngles,
  computeStoryShadowPolygonWithHoles,
  computeSoftStoryShadowPolygonWithHoles,
  polygonFingerprint,
  MasterplanStoryTier,
} from './masterplanGeometry';
import { clusterTiersByShadowOverlap } from './masterplanSpatial';

export type MasterplanShadowAlgorithm = 'legacy' | 'soft';

export interface MasterplanColorSample {
  color: string;
  offsetMin: number;
}

export interface MasterplanShadowSample {
  color: string;
  polys: PolygonWithHoles[];
}

export type MasterplanShadowRenderResult =
  | { algorithm: 'legacy'; samples: MasterplanShadowSample[] }
  | { algorithm: 'soft'; umbraColor: string; umbraPolys: PolygonWithHoles[]; bandColor: string; bandPolys: PolygonWithHoles[] };

/**
 * Cache cieni gruntowych Masterplanu: computeStoryShadowPolygon/unionPolygonsWithHoles są kosztowne
 * (polygon-clipping), a wynik nie zależy od viewState (pan/zoom/rotacja) — tylko od geometrii
 * tierów i pozycji słońca. Bez cache renderer przeliczałby je na każdej klatce, w tym podczas
 * czystego pan/zoom.
 */
let groundLastKey: string | null = null;
let groundLastResult: MasterplanShadowRenderResult = { algorithm: 'legacy', samples: [] };

function tierFingerprint(t: MasterplanStoryTier): string {
  // polygonFingerprint (pełna lista współrzędnych, nie suma) jako składnik pozycyjny: przesunięcie/
  // rotacja/deformacja budynku zmienia fingerprint, więc cache poprawnie się unieważnia. Suma
  // współrzędnych (Σx, Σy) jest niezmiennikiem obrotu wokół centroidu — powodowała brak
  // odświeżania cienia przy obrocie budynku. Dziury wchodzą też do odcisku — od nich zależy wynik
  // cienia (computeStoryShadowPolygonWithHoles), więc zmiana dziury musi też unieważniać cache.
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
  hourFraction: number
): MasterplanShadowSample[] {
  const baseAngles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0);
  const clusters = clusterTiersByShadowOverlap(
    tiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0),
    baseAngles
  );

  const result: MasterplanShadowSample[] = [];
  for (const sample of samples) {
    const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, sample.offsetMin);
    const mergedPolys: PolygonWithHoles[] = [];

    for (const cluster of clusters) {
      const clusterPolys: PolygonWithHoles[] = [];
      for (const tier of cluster) {
        const polys = computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, angles, tier.hTop, tier.hBottom);
        clusterPolys.push(...polys);
      }
      if (clusterPolys.length === 1) mergedPolys.push(clusterPolys[0]);
      else if (clusterPolys.length > 1) mergedPolys.push(...unionPolygonsWithHoles(clusterPolys));
    }

    if (mergedPolys.length > 0) {
      result.push({ color: sample.color, polys: mergedPolys });
    }
  }
  return result;
}

function computeSoftResult(
  tiers: MasterplanStoryTier[],
  midColor: string,
  outerColor: string,
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number
): MasterplanShadowRenderResult {
  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0);
  const clusters = clusterTiersByShadowOverlap(
    tiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0),
    angles
  );

  const mergedUmbra: PolygonWithHoles[] = [];
  const bandPolys: PolygonWithHoles[] = [];

  for (const cluster of clusters) {
    const umbraPolys: PolygonWithHoles[] = [];
    const outerPolys: PolygonWithHoles[] = [];
    for (const tier of cluster) {
      const { umbra, penumbraOuter } = computeSoftStoryShadowPolygonWithHoles(tier.polygon, tier.holes, angles, tier.hTop, tier.hBottom);
      umbraPolys.push(...umbra);
      outerPolys.push(...penumbraOuter);
    }

    const clusterUmbra = umbraPolys.length > 1 ? unionPolygonsWithHoles(umbraPolys) : umbraPolys;
    const clusterOuter = outerPolys.length > 1 ? unionPolygonsWithHoles(outerPolys) : outerPolys;
    mergedUmbra.push(...clusterUmbra);
    if (clusterOuter.length > 0) {
      bandPolys.push(...differencePolygonsWithHoles(clusterOuter, clusterUmbra));
    }
  }

  return {
    algorithm: 'soft',
    umbraColor: midColor,
    umbraPolys: mergedUmbra,
    bandColor: outerColor,
    bandPolys,
  };
}

/**
 * Wypełnia wielokąty z otworami na Canvas 2D.
 * Każdy PolygonWithHoles rysowany jest w osobnym ctx.beginPath() z obrysem i otworami,
 * a następnie wypełniany regułą 'evenodd', co zapobiega zakłóceniom parzystości
 * między niezależnymi wyspami geometrii.
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

/** Rysuje wynik cienia (legacy: próbki penumbry; soft: pełny rdzeń + pas penumbry) na podanym kontekście. */
export function drawMasterplanShadowResult(
  ctx: CanvasRenderingContext2D,
  result: MasterplanShadowRenderResult
): void {
  if (result.algorithm === 'legacy') {
    for (const sample of result.samples) {
      fillPolys(ctx, sample.polys, sample.color);
    }
    return;
  }

  fillPolys(ctx, result.bandPolys, result.bandColor);
  fillPolys(ctx, result.umbraPolys, result.umbraColor);
}

export function getCachedGroundShadowSamples(
  algorithm: MasterplanShadowAlgorithm,
  tiers: MasterplanStoryTier[],
  samples: MasterplanColorSample[],
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number
): MasterplanShadowRenderResult {
  const key = `${algorithm}|${tiers.map(tierFingerprint).join(',')}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  if (key === groundLastKey) return groundLastResult;

  const midSample = samples[Math.floor(samples.length / 2)] ?? samples[0];
  const result: MasterplanShadowRenderResult =
    algorithm === 'soft'
      ? computeSoftResult(tiers, midSample.color, midSample.color, latitude, longitude, equinoxDate, hourFraction)
      : { algorithm: 'legacy', samples: computeLegacySamples(tiers, samples, latitude, longitude, equinoxDate, hourFraction) };

  groundLastKey = key;
  groundLastResult = result;
  return result;
}

/**
 * Cache cieni dachowych (ΔH) Masterplanu, per kondygnacja odbierająca cień (currentTierKey).
 * Wynik zależy od zestawu wyższych tierów i currentH, więc jest keyowany osobno per bieżący tier.
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
  hourFraction: number
): MasterplanShadowRenderResult {
  const key = `${algorithm}|${currentH.toFixed(2)}|${higherTiers.map(tierFingerprint).join(',')}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  const cached = roofCache.get(currentTierKey);
  if (cached && cached.key === key) return cached.result;
  if (roofCache.size > 5000) roofCache.clear();

  let result: MasterplanShadowRenderResult;

  if (algorithm === 'soft') {
    const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0);
    const umbraPolys: PolygonWithHoles[] = [];
    const outerPolys: PolygonWithHoles[] = [];

    for (const higherTier of higherTiers) {
      const deltaHTop = higherTier.hTop - currentH;
      const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
      if (deltaHTop <= 0.05) continue;

      const { umbra, penumbraOuter } = computeSoftStoryShadowPolygonWithHoles(higherTier.polygon, higherTier.holes, angles, deltaHTop, deltaHBase);
      umbraPolys.push(...umbra);
      outerPolys.push(...penumbraOuter);
    }

    const mergedUmbra = umbraPolys.length > 1 ? unionPolygonsWithHoles(umbraPolys) : umbraPolys;
    const mergedOuter = outerPolys.length > 1 ? unionPolygonsWithHoles(outerPolys) : outerPolys;
    const bandPolys = mergedOuter.length > 0 ? differencePolygonsWithHoles(mergedOuter, mergedUmbra) : [];
    const midColor = samples[Math.floor(samples.length / 2)]?.color ?? samples[0]?.color ?? 'rgba(30, 41, 59, 0.14)';

    result = { algorithm: 'soft', umbraColor: midColor, umbraPolys: mergedUmbra, bandColor: midColor, bandPolys };
  } else {
    const legacySamples: MasterplanShadowSample[] = [];
    for (const sample of samples) {
      const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, sample.offsetMin);
      const samplePolys: PolygonWithHoles[] = [];

      for (const higherTier of higherTiers) {
        const deltaHTop = higherTier.hTop - currentH;
        const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
        if (deltaHTop <= 0.05) continue;

        const shadowRoofPolys = computeStoryShadowPolygonWithHoles(higherTier.polygon, higherTier.holes, angles, deltaHTop, deltaHBase);
        samplePolys.push(...shadowRoofPolys);
      }

      if (samplePolys.length === 1) {
        legacySamples.push({ color: sample.color, polys: samplePolys });
      } else if (samplePolys.length > 1) {
        legacySamples.push({ color: sample.color, polys: unionPolygonsWithHoles(samplePolys) });
      }
    }
    result = { algorithm: 'legacy', samples: legacySamples };
  }

  roofCache.set(currentTierKey, { key, result });
  return result;
}
