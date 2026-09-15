import { Point2D } from '@/types/geometry';
import { unionPolygonLoops, differencePolygonLoops } from '@/utils/math2d/polygons';
import {
  getMasterplanSolarAngles,
  computeStoryShadowPolygon,
  computeSoftStoryShadowPolygon,
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
  polys: Point2D[][];
}

export type MasterplanShadowRenderResult =
  | { algorithm: 'legacy'; samples: MasterplanShadowSample[] }
  | { algorithm: 'soft'; umbraColor: string; umbraPolys: Point2D[][]; bandColor: string; bandPolys: Point2D[][] };

/**
 * Cache cieni gruntowych Masterplanu: computeStoryShadowPolygon/unionPolygonLoops są kosztowne
 * (polygon-clipping), a wynik nie zależy od viewState (pan/zoom/rotacja) — tylko od geometrii
 * tierów i pozycji słońca. Bez cache renderer przeliczałby je na każdej klatce, w tym podczas
 * czystego pan/zoom.
 */
let groundLastKey: string | null = null;
let groundLastResult: MasterplanShadowRenderResult = { algorithm: 'legacy', samples: [] };

function tierFingerprint(t: MasterplanStoryTier): string {
  // Suma współrzędnych jako tani składnik pozycyjny: przesunięcie/rotacja budynku zmienia sumę,
  // więc cache poprawnie się unieważnia. Bez tego (tylko id/wysokości/liczba wierzchołków)
  // przesunięty budynek dostawał "wypalony" (baked) cień z poprzedniej pozycji.
  let sx = 0;
  let sy = 0;
  for (const p of t.polygon) {
    sx += p.x;
    sy += p.y;
  }
  return `${t.buildingId}:${t.storyIndex}:${t.hTop.toFixed(2)}:${t.hBottom.toFixed(2)}:${t.polygon.length}:${sx.toFixed(1)}:${sy.toFixed(1)}`;
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
    const mergedPolys: Point2D[][] = [];

    for (const cluster of clusters) {
      const clusterPolys: Point2D[][] = [];
      for (const tier of cluster) {
        const poly = computeStoryShadowPolygon(tier.polygon, angles, tier.hTop, tier.hBottom);
        if (poly.length >= 3) clusterPolys.push(poly);
      }
      if (clusterPolys.length === 1) mergedPolys.push(clusterPolys[0]);
      else if (clusterPolys.length > 1) mergedPolys.push(...unionPolygonLoops(clusterPolys));
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

  const mergedUmbra: Point2D[][] = [];
  const bandPolys: Point2D[][] = [];

  for (const cluster of clusters) {
    const umbraPolys: Point2D[][] = [];
    const outerPolys: Point2D[][] = [];
    for (const tier of cluster) {
      const { umbra, penumbraOuter } = computeSoftStoryShadowPolygon(tier.polygon, angles, tier.hTop, tier.hBottom);
      umbraPolys.push(...umbra);
      outerPolys.push(...penumbraOuter);
    }

    const clusterUmbra = umbraPolys.length > 1 ? unionPolygonLoops(umbraPolys) : umbraPolys;
    const clusterOuter = outerPolys.length > 1 ? unionPolygonLoops(outerPolys) : outerPolys;
    mergedUmbra.push(...clusterUmbra);
    if (clusterOuter.length > 0) {
      bandPolys.push(...differencePolygonLoops(clusterOuter, clusterUmbra));
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
 * Ścieżka "coarse": podczas aktywnego przeciągania budynku geometria zmienia się co klatkę,
 * więc cache musi się unieważniać — a surowy koszt unii/przecięcia wielu poligonów (~1.9s CPU
 * w profilu, zdominowany przez wewnętrzne sweep-line polygon-clipping) jest zbyt wysoki na klatkę.
 * Wzorem `accuracyStage: 'live'` w głównym silniku analizy: podczas interakcji pokazujemy tylko
 * pojedynczy hard-shadow per tier, bez unii (nakładające się poligony mogą się wizualnie zsumować
 * ciemniej — akceptowalne na czas przeciągania) i bez penumbry — dociążenie do pełnego wyniku
 * następuje automatycznie, gdy `isInteracting` wróci na `false`.
 */
function computeCoarseSamples(
  tiers: MasterplanStoryTier[],
  midColor: string,
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number
): MasterplanShadowSample[] {
  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0);
  const polys: Point2D[][] = [];
  for (const tier of tiers) {
    if (!tier.polygon || tier.polygon.length < 3 || tier.hTop <= 0) continue;
    const poly = computeStoryShadowPolygon(tier.polygon, angles, tier.hTop, tier.hBottom);
    if (poly.length >= 3) polys.push(poly);
  }
  return polys.length > 0 ? [{ color: midColor, polys }] : [];
}

function fillPolys(ctx: CanvasRenderingContext2D, polys: Point2D[][], color: string): void {
  ctx.fillStyle = color;
  for (const poly of polys) {
    if (poly.length < 3) continue;
    ctx.beginPath();
    poly.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fill();
  }
}

/** Rysuje wynik cienia (legacy: próbki penumbry; soft: pełny rdzeń + pas penumbry) na podanym kontekście. */
export function drawMasterplanShadowResult(ctx: CanvasRenderingContext2D, result: MasterplanShadowRenderResult): void {
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
  hourFraction: number,
  isInteracting: boolean = false
): MasterplanShadowRenderResult {
  const mode = isInteracting ? 'coarse' : algorithm;
  const key = `${mode}|${tiers.map(tierFingerprint).join(',')}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  if (key === groundLastKey) return groundLastResult;

  const midSample = samples[Math.floor(samples.length / 2)] ?? samples[0];
  const result: MasterplanShadowRenderResult = isInteracting
    ? { algorithm: 'legacy', samples: computeCoarseSamples(tiers, midSample.color, latitude, longitude, equinoxDate, hourFraction) }
    : algorithm === 'soft'
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
  hourFraction: number,
  isInteracting: boolean = false
): MasterplanShadowRenderResult {
  const mode = isInteracting ? 'coarse' : algorithm;
  const key = `${mode}|${currentH.toFixed(2)}|${higherTiers.map(tierFingerprint).join(',')}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  const cached = roofCache.get(currentTierKey);
  if (cached && cached.key === key) return cached.result;
  if (roofCache.size > 5000) roofCache.clear();

  let result: MasterplanShadowRenderResult;

  if (isInteracting) {
    // Podczas przeciągania: cień ΔH liczony bezpośrednio (deltaH per higherTier), bez unii —
    // ta sama filozofia co computeCoarseSamples dla cieni gruntowych.
    const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0);
    const polys: Point2D[][] = [];
    for (const higherTier of higherTiers) {
      const deltaHTop = higherTier.hTop - currentH;
      const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
      if (deltaHTop <= 0.05) continue;
      const poly = computeStoryShadowPolygon(higherTier.polygon, angles, deltaHTop, deltaHBase);
      if (poly.length >= 3) polys.push(poly);
    }
    const midColor = samples[Math.floor(samples.length / 2)]?.color ?? samples[0]?.color ?? 'rgba(30, 41, 59, 0.14)';
    result = { algorithm: 'legacy', samples: polys.length > 0 ? [{ color: midColor, polys }] : [] };
  } else if (algorithm === 'soft') {
    const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0);
    const umbraPolys: Point2D[][] = [];
    const outerPolys: Point2D[][] = [];

    for (const higherTier of higherTiers) {
      const deltaHTop = higherTier.hTop - currentH;
      const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
      if (deltaHTop <= 0.05) continue;

      const { umbra, penumbraOuter } = computeSoftStoryShadowPolygon(higherTier.polygon, angles, deltaHTop, deltaHBase);
      umbraPolys.push(...umbra);
      outerPolys.push(...penumbraOuter);
    }

    const mergedUmbra = umbraPolys.length > 0 ? unionPolygonLoops(umbraPolys) : [];
    const mergedOuter = outerPolys.length > 0 ? unionPolygonLoops(outerPolys) : [];
    const bandPolys = mergedOuter.length > 0 ? differencePolygonLoops(mergedOuter, mergedUmbra) : [];
    const midColor = samples[Math.floor(samples.length / 2)]?.color ?? samples[0]?.color ?? 'rgba(30, 41, 59, 0.14)';

    result = { algorithm: 'soft', umbraColor: midColor, umbraPolys: mergedUmbra, bandColor: midColor, bandPolys };
  } else {
    const legacySamples: MasterplanShadowSample[] = [];
    for (const sample of samples) {
      const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, sample.offsetMin);
      const samplePolys: Point2D[][] = [];

      for (const higherTier of higherTiers) {
        const deltaHTop = higherTier.hTop - currentH;
        const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
        if (deltaHTop <= 0.05) continue;

        const shadowRoofPoly = computeStoryShadowPolygon(higherTier.polygon, angles, deltaHTop, deltaHBase);
        if (shadowRoofPoly.length >= 3) samplePolys.push(shadowRoofPoly);
      }

      if (samplePolys.length > 0) {
        legacySamples.push({ color: sample.color, polys: unionPolygonLoops(samplePolys) });
      }
    }
    result = { algorithm: 'legacy', samples: legacySamples };
  }

  roofCache.set(currentTierKey, { key, result });
  return result;
}
