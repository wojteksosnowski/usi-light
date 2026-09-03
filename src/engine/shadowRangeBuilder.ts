// src/engine/shadowRangeBuilder.ts
import { ShadowRangeLut, ShadowVectorRay } from './shadowRangeLut';
import polygonClipping from 'polygon-clipping';
import { isPolygonConvex, computeConvexHull } from '../utils/math2d/polygons';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Generuje wielokąt rzutu wierzchołków dachu dla pojedynczej godziny t_i
 */
export function projectFootprint(points: Point2D[], height: number, unitStepX: number, unitStepY: number): Point2D[] {
  const dx = height * unitStepX;
  const dy = height * unitStepY;
  return points.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * Tworzy pełny wielokąt cienia budynku dla pojedynczej godziny t_i (obrys bryły + rzut dachu + ściany boczne)
 */
export function buildSingleHourShadowPolygon(footprint: Point2D[], height: number, ray: ShadowVectorRay): Point2D[] {
  if (!footprint || footprint.length < 3 || height <= 0) {
    return footprint ? [...footprint] : [];
  }

  const projected = projectFootprint(footprint, height, ray.unitStepX, ray.unitStepY);

  // Dla wielokąta wypukłego: szybka i odporna na błędy otoczka wypukła sumy punktów podstawy i dachu
  if (isPolygonConvex(footprint)) {
    return computeConvexHull([...footprint, ...projected]);
  }

  // Dla wielokątów wklęsłych: unia podstawy, dachu i ścian bocznych
  const clippingPolys: [number, number][][][] = [];

  const baseRing: [number, number][] = footprint.map(p => [p.x, p.y]);
  baseRing.push([footprint[0].x, footprint[0].y]);
  clippingPolys.push([baseRing]);

  const roofRing: [number, number][] = projected.map(p => [p.x, p.y]);
  roofRing.push([projected[0].x, projected[0].y]);
  clippingPolys.push([roofRing]);

  const n = footprint.length;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const quad: [number, number][] = [
      [footprint[i].x, footprint[i].y],
      [footprint[next].x, footprint[next].y],
      [projected[next].x, projected[next].y],
      [projected[i].x, projected[i].y],
      [footprint[i].x, footprint[i].y],
    ];
    clippingPolys.push([quad]);
  }

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    if (unionResult.length > 0 && unionResult[0].length > 0) {
      const ring = unionResult[0][0];
      const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
      const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
      return ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y }));
    }
  } catch {
    // Fallback do otoczki w razie błędu numerycznego geometrii
  }

  return computeConvexHull([...footprint, ...projected]);
}

/**
 * Tworzy obwiednię pasmową (envelope) cienia w przedziale godzinowym [t_i, t_{i+1}]
 */
export function buildHourlyShadowBand(
  footprint: Point2D[],
  height: number,
  rayA: ShadowVectorRay,
  rayB: ShadowVectorRay
): Point2D[][] {
  const projA = projectFootprint(footprint, height, rayA.unitStepX, rayA.unitStepY);
  const projB = projectFootprint(footprint, height, rayB.unitStepX, rayB.unitStepY);

  const bands: Point2D[][] = [];
  const n = footprint.length;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    bands.push([
      footprint[i],
      footprint[next],
      projB[next],
      projB[i]
    ]);
    bands.push([
      projA[i],
      projA[next],
      projB[next],
      projB[i]
    ]);
  }
  return bands;
}

/**
 * Generuje tablicę 11 pojedynczych obrysów cienia budynku dla pełnego zakresu godzin
 * (11 promieni z LUT: od -5h do +5h, krok 1h).
 */
export function buildAllHourlyShadowPolygons(
  footprint: Point2D[],
  height: number,
  lut: ShadowRangeLut
): Point2D[][] {
  if (!footprint || footprint.length < 3 || height <= 0) return [];
  return lut.rays.map(ray => buildSingleHourShadowPolygon(footprint, height, ray));
}

/**
 * Sumuje obrysy cienia z pełnego zakresu 11 godzin (co 1h) dla pojedynczego budynku.
 * Wyznacza sumę boolowską (Boolean Union) 11 obrysów godzinowych (oraz opcjonalnie pasm pośrednich).
 * Dla brył wypukłych wykorzystuje zoptymalizowaną otoczkę wypukłą, dla wklęsłych precyzyjny polygon-clipping.
 */
export function buildBuildingFullShadowRange(
  footprint: Point2D[],
  height: number,
  lut: ShadowRangeLut
): Point2D[][] {
  if (!footprint || footprint.length < 3 || height <= 0) return [];

  // Dla wielokąta wypukłego: suma 11 obrysów oraz przestrzeni pomiędzy nimi to otoczka wypukła
  // wszystkich zrzutowanych wierzchołków ze wszystkich 11 godzin oraz footprintu.
  if (isPolygonConvex(footprint)) {
    const allPoints: Point2D[] = [...footprint];
    for (const ray of lut.rays) {
      const proj = projectFootprint(footprint, height, ray.unitStepX, ray.unitStepY);
      allPoints.push(...proj);
    }
    return [computeConvexHull(allPoints)];
  }

  // Dla wielokątów wklęsłych: generujemy 11 obrysów cienia i łączymy je sumą boolowską
  const hourlyPolys = buildAllHourlyShadowPolygons(footprint, height, lut);

  // Dodatkowo dołączamy pasma trapezoidów łączące kolejne godziny, aby pokryć ciągły ruch cienia
  const intermediateBands: Point2D[][] = [];
  for (let i = 0; i < lut.rays.length - 1; i++) {
    const bands = buildHourlyShadowBand(footprint, height, lut.rays[i], lut.rays[i + 1]);
    intermediateBands.push(...bands);
  }

  const allPolysToUnion = [...hourlyPolys, ...intermediateBands];

  // Przygotowanie do polygon-clipping
  const clippingPolys: [number, number][][][] = [];
  for (const poly of allPolysToUnion) {
    if (poly.length >= 3) {
      const ring: [number, number][] = poly.map(p => [p.x, p.y]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      clippingPolys.push([ring]);
    }
  }

  if (clippingPolys.length === 0) return [];

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    const resultLoops: Point2D[][] = [];

    for (const polygon of unionResult) {
      for (const ring of polygon) {
        if (ring.length >= 3) {
          const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
          const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
          resultLoops.push(ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y })));
        }
      }
    }
    return resultLoops;
  } catch {
    // Fallback w razie błędu numerycznego
    const fallbackPoints: Point2D[] = [...footprint];
    for (const ray of lut.rays) {
      fallbackPoints.push(...projectFootprint(footprint, height, ray.unitStepX, ray.unitStepY));
    }
    return [computeConvexHull(fallbackPoints)];
  }
}

/**
 * Łączy zakresy cienia dla wielu budynków (Multi-building Boolean Union).
 */
export function buildCombinedShadowRange(
  buildings: Array<{ footprint: Point2D[]; height: number }>,
  lut: ShadowRangeLut
): Point2D[][] {
  const allBuildingRanges: Point2D[][] = [];

  for (const bldg of buildings) {
    const ranges = buildBuildingFullShadowRange(bldg.footprint, bldg.height, lut);
    allBuildingRanges.push(...ranges);
  }

  if (allBuildingRanges.length === 0) return [];
  if (allBuildingRanges.length === 1) return allBuildingRanges;

  const clippingPolys: [number, number][][][] = [];
  for (const poly of allBuildingRanges) {
    if (poly.length >= 3) {
      const ring: [number, number][] = poly.map(p => [p.x, p.y]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      clippingPolys.push([ring]);
    }
  }

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    const resultLoops: Point2D[][] = [];

    for (const polygon of unionResult) {
      for (const ring of polygon) {
        if (ring.length >= 3) {
          const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
          const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
          resultLoops.push(ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y })));
        }
      }
    }
    return resultLoops;
  } catch {
    return allBuildingRanges;
  }
}
