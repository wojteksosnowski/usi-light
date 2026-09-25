import { Point2D, BuildingLoop } from '@/types/geometry';
import {
  PolygonWithHoles,
  computePointsBoundingBox,
} from '@/utils/math2d/polygons';
import { fastIntersectTwoSimpleLoops, arePolygonsDefinitelyDisjoint } from '@/utils/math2d/polygonBooleanTwo';
import {
  getMasterplanSolarAngles,
  computeShadowOffsetVector,
  computeStoryShadowPolygonWithHoles,
  polygonFingerprint,
  MasterplanStoryTier,
} from './masterplanGeometry';
import {
  clusterTiersByShadowOverlap,
  unionPolygonsWithHolesHierarchical,
  fastUnionPair,
  extendBoundsByOffset,
  Bounds,
  polygonsWithHolesBounds,
  boundsOverlap,
} from './masterplanSpatial';
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

/** Scala listę poligonów klastra do wyniku: bez unii dla rozłącznych elementów, hierarchicznie dla nachodzących. */
function accumulatePolygons(dest: PolygonWithHoles[], src: PolygonWithHoles[]): void {
  if (src.length === 0) return;
  if (src.length === 1) {
    dest.push(src[0]);
    return;
  }
  if (src.length === 2) {
    dest.push(...fastUnionPair(src[0], src[1]));
    return;
  }

  // Szybki test rozłączności AABB dla wszystkich par
  let hasAnyOverlap = false;
  const boxes = src.map((p) => computePointsBoundingBox(p.outer));
  for (let i = 0; i < boxes.length && !hasAnyOverlap; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boundsOverlap(boxes[i], boxes[j])) {
        hasAnyOverlap = true;
        break;
      }
    }
  }

  if (!hasAnyOverlap) {
    dest.push(...src);
    return;
  }

  dest.push(...unionPolygonsWithHolesHierarchical(src));
}

const tierFingerprintCache = new WeakMap<object, string>();

function tierFingerprint(t: MasterplanStoryTier): string {
  if (t.bldgRef?.computed?.geometryHash) {
    return `${t.bldgRef.computed.geometryHash}:${t.storyIndex}:${t.hTop.toFixed(2)}:${t.hBottom.toFixed(2)}`;
  }
  if (t.geomFingerprint) {
    return `${t.buildingId}:${t.geomFingerprint}:${t.storyIndex}:${t.hTop.toFixed(2)}:${t.hBottom.toFixed(2)}`;
  }
  if (t.bldgRef) {
    const cached = tierFingerprintCache.get(t.bldgRef);
    if (cached) return `${cached}:${t.storyIndex}:${t.hTop.toFixed(2)}:${t.hBottom.toFixed(2)}`;
  }
  const holesFingerprint = (t.holes && t.holes.length > 0) ? t.holes.map(polygonFingerprint).join(';') : '';
  const baseFp = `${t.buildingId}:${polygonFingerprint(t.polygon)}#${holesFingerprint}`;
  if (t.bldgRef) {
    tierFingerprintCache.set(t.bldgRef, baseFp);
  }
  return `${baseFp}:${t.storyIndex}:${t.hTop.toFixed(2)}:${t.hBottom.toFixed(2)}`;
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
        computeStoryShadowPolygonWithHoles(
          tier.polygon,
          tier.holes,
          angles,
          tier.hTop,
          tier.hBottom,
          tier.geomFingerprint,
          tier.isConvex
        )
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

/** Rysuje wynik cienia (warstwy próbek) na podanym kontekście z opcjonalnym szybkim cullingiem AABB. */
export function drawMasterplanShadowResult(
  ctx: CanvasRenderingContext2D,
  result: MasterplanShadowRenderResult,
  viewport?: Bounds
): void {
  for (const sample of result.samples) {
    if (!viewport) {
      fillPolys(ctx, sample.polys, sample.color);
    } else {
      const visiblePolys = sample.polys.filter((p) => {
        const b = polygonsWithHolesBounds([p]);
        return b ? boundsOverlap(b, viewport) : true;
      });
      fillPolys(ctx, visiblePolys, sample.color);
    }
  }
}

const tiersArraySigMap = new WeakMap<MasterplanStoryTier[], string>();

export function getTiersArraySignature(tiers: MasterplanStoryTier[]): string {
  const cached = tiersArraySigMap.get(tiers);
  if (cached) return cached;
  let sig = `${tiers.length}:`;
  for (let i = 0; i < tiers.length; i++) {
    sig += tierFingerprint(tiers[i]) + ',';
  }
  tiersArraySigMap.set(tiers, sig);
  return sig;
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
  const tiersSig = getTiersArraySignature(tiers);
  const key = `soft|${method}|${tiersSig}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  if (key === groundLastKey) return groundLastResult;

  const umbraSample = samples.find((s) => s.offsetMin === 0) ?? DEFAULT_UMBRA_SAMPLE;

  const shadowSamples = computeSoftSamples(tiers, umbraSample.color, latitude, longitude, equinoxDate, hourFraction, method);

  const result: MasterplanShadowRenderResult = { samples: shadowSamples };
  groundLastKey = key;
  groundLastResult = result;
  return result;
}

/**
 * Oblicza kolor cienia z delikatnym wzrostem przeźroczystości (spadkiem alpha)
 * wraz z wysokością płaszczyzny odbiorczej (H).
 * Na poziomie gruntu (H <= 0): pełne krycie bazowe (np. alpha = 0.14).
 * Dla wyższych dachów (np. H = 15m, 30m, 60m): delikatne, płynne rozjaśnienie cienia,
 * oddające zjawisko większego rozproszenia światła nieboskłonu (ambient skylight scatter).
 */
export function getElevationAdjustedShadowColor(baseColor: string, receivingElevation: number): string {
  if (receivingElevation <= 0) return baseColor;
  const rgbaMatch = baseColor.match(/^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i);
  if (!rgbaMatch) return baseColor;

  const r = parseInt(rgbaMatch[1], 10);
  const g = parseInt(rgbaMatch[2], 10);
  const b = parseInt(rgbaMatch[3], 10);
  const baseAlpha = parseFloat(rgbaMatch[4]);

  // Łagodny współczynnik tłumienia z bezpieczną dolną granicą 60% bazowego krycia
  const attenuationFactor = Math.max(0.60, 1 - (0.40 * receivingElevation) / (receivingElevation + 30));
  const adjustedAlpha = Number((baseAlpha * attenuationFactor).toFixed(4));

  return `rgba(${r}, ${g}, ${b}, ${adjustedAlpha})`;
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
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting',
  receivingRoofPolygon?: Point2D[]
): MasterplanShadowRenderResult {
  if (!higherTiers || higherTiers.length === 0) {
    return { samples: [] };
  }
  const higherSig = getTiersArraySignature(higherTiers);
  const key = `soft|${method}|${currentH.toFixed(2)}|${higherSig}|${latitude}|${longitude}|${equinoxDate}|${hourFraction}`;
  const cached = roofCache.get(currentTierKey);
  if (cached && cached.key === key) return cached.result;
  if (roofCache.size > 5000) roofCache.clear();

  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, 0, method);
  const umbraPolys: PolygonWithHoles[] = [];
  const roofPoly = receivingRoofPolygon && receivingRoofPolygon.length >= 3 ? receivingRoofPolygon : null;
  const roofBox = roofPoly ? computePointsBoundingBox(roofPoly) : null;

  for (const higherTier of higherTiers) {
    const deltaHTop = higherTier.hTop - currentH;
    const deltaHBase = Math.max(0, higherTier.hBottom - currentH);
    if (deltaHTop <= 0.05) continue;

    // Szybki AABB reach check przed rzutowaniem cienia bryły wyższej
    if (roofBox) {
      const htOffset = computeShadowOffsetVector(deltaHTop, angles);
      const htBounds = higherTier.bounds2D || computePointsBoundingBox(higherTier.polygon);
      const htReachBounds = extendBoundsByOffset(htBounds, htOffset.dx * 1.05, htOffset.dy * 1.05);
      if (!boundsOverlap(roofBox, htReachBounds)) {
        continue;
      }
    }

    const extra = `roof:${currentH.toFixed(2)}`;
    const key = makeSunBucketKey(higherTier.storyIndex, 'soft', method, latitude, longitude, equinoxDate, hourFraction, 0, extra);
    const shadowRoofPolys = getOrComputeBuildingShadow(higherTier.bldgRef, key, () =>
      computeStoryShadowPolygonWithHoles(
        higherTier.polygon,
        higherTier.holes,
        angles,
        deltaHTop,
        deltaHBase,
        higherTier.geomFingerprint,
        higherTier.isConvex
      )
    );

    if (roofPoly && roofBox) {
      // Dla pojedynczego cienia na dachu docinanie CPU jest zbędne,
      // bo renderer wykonuje sprzętowe ctx.clip('evenodd') do obrysu dachu
      const singleShadow = higherTiers.length === 1 && shadowRoofPolys.length === 1;
      for (const sp of shadowRoofPolys) {
        const spBox = computePointsBoundingBox(sp.outer);
        if (!boundsOverlap(roofBox, spBox)) continue;
        if (arePolygonsDefinitelyDisjoint(sp.outer, roofPoly)) continue;
        if (singleShadow) {
          umbraPolys.push(sp);
        } else {
          for (const c of fastIntersectTwoSimpleLoops(sp.outer, roofPoly)) {
            if (c.length >= 3) umbraPolys.push({ outer: c, holes: [] });
          }
        }
      }
    } else {
      umbraPolys.push(...shadowRoofPolys);
    }
  }

  const rawUmbraColor = samples.find((s) => s.offsetMin === 0)?.color ?? DEFAULT_UMBRA_SAMPLE.color;
  const umbraColor = getElevationAdjustedShadowColor(rawUmbraColor, currentH);
  const mergedUmbra: PolygonWithHoles[] = [];
  accumulatePolygons(mergedUmbra, umbraPolys);

  const shadowSamples: MasterplanShadowSample[] = [];
  if (mergedUmbra.length > 0) shadowSamples.push({ color: umbraColor, polys: mergedUmbra });

  const result: MasterplanShadowRenderResult = { samples: shadowSamples };
  roofCache.set(currentTierKey, { key, result });
  return result;
}

/**
 * Czyści wszystkie bufory pamięci podręcznej cieni Masterplanu (ground, roof).
 */
export function clearMasterplanShadowCache(): void {
  groundLastKey = null;
  groundLastResult = { samples: [] };
  roofCache.clear();
}
