import { Point2D, BuildingLoop } from '../../types/geometry';
import polygonClipping from 'polygon-clipping';
import { calculateOutwardNormal } from './vec2';

/**
 * Calculates the signed area of a 2D polygon using the Shoelace formula / Green's theorem.
 * Positive => Counter-Clockwise (CCW)
 * Negative => Clockwise (CW)
 */
export function calculateSignedArea(points: Point2D[]): number {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
      continue;
    }
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
}

export function isPolygonCCW(points: Point2D[]): boolean {
  if (!points || points.length < 3) return true;
  return calculateSignedArea(points) > 0;
}

/**
 * Checks if a point is inside a polygon using ray casting algorithm.
 */
export function isPointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !vertices || vertices.length < 3) {
    return false;
  }
  let inside = false;
  const { x, y } = point;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    if (!vi || !vj || !Number.isFinite(vi.x) || !Number.isFinite(vi.y) || !Number.isFinite(vj.x) || !Number.isFinite(vj.y)) {
      continue;
    }
    const xi = vi.x,
      yi = vi.y;
    const xj = vj.x,
      yj = vj.y;

    const denom = yj - yi;
    if (Math.abs(denom) < 1e-9) {
      continue;
    }

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Computes the 2D convex hull of a set of 2D points using Andrew's monotone chain algorithm.
 * Time complexity: O(n log n).
 * Returns vertices in counter-clockwise order.
 */
export function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  // Lower hull
  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove the last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

/**
 * Sprawdza czy wielokąt 2D jest ściśle wypukły (Convex).
 */
export function isPolygonConvex(polygon: Point2D[]): boolean {
  const n = polygon?.length || 0;
  if (n < 3) return false;
  let prevCross = 0;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const p3 = polygon[(i + 2) % n];
    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x;
    const dy2 = p3.y - p2.y;
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) > 1e-7) {
      if (prevCross === 0) {
        prevCross = cross;
      } else if ((cross > 0 && prevCross < 0) || (cross < 0 && prevCross > 0)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Pomocnicza funkcja łącząca poligony za pomocą polygonClipping.union
 */
export function unionPolygonLoops(polygons: Point2D[][]): Point2D[][] {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return polygons;

  const clippingPolys: [number, number][][][] = [];
  for (const poly of polygons) {
    if (poly.length >= 3) {
      const ring: [number, number][] = poly.map((p) => [p.x, p.y]);
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
    return polygons;
  }
}

export interface BooleanUnionResult {
  success: boolean;
  building?: BuildingLoop;
  error?: string;
}

/**
 * Wykonuje operację sumy boolowskiej (Boolean Union) na dwóch bryłach budynków.
 * Wymaga, aby obiekty się stykały (wspólna krawędź) lub przenikały (nachodzenie powierzchni).
 */
export function booleanUnionBuildings(
  bldgA: BuildingLoop,
  bldgB: BuildingLoop
): BooleanUnionResult {
  if (!bldgA || !bldgB || !bldgA.vertices || !bldgB.vertices) {
    return { success: false, error: 'Nieprawidłowe obiekty wejściowe.' };
  }
  if (bldgA.vertices.length < 3 || bldgB.vertices.length < 3) {
    return { success: false, error: 'Obiekty muszą posiadać co najmniej 3 wierzchołki.' };
  }

  const polyA: [number, number][] = bldgA.vertices.map((v) => [v.x, v.y]);
  const polyB: [number, number][] = bldgB.vertices.map((v) => [v.x, v.y]);

  if (polyA[0][0] !== polyA[polyA.length - 1][0] || polyA[0][1] !== polyA[polyA.length - 1][1]) {
    polyA.push([polyA[0][0], polyA[0][1]]);
  }
  if (polyB[0][0] !== polyB[polyB.length - 1][0] || polyB[0][1] !== polyB[polyB.length - 1][1]) {
    polyB.push([polyB[0][0], polyB[0][1]]);
  }

  try {
    const unionRes = polygonClipping.union([[polyA]], [[polyB]]);
    if (!unionRes || unionRes.length === 0) {
      return { success: false, error: 'Nie udało się połączyć obiektów.' };
    }

    if (unionRes.length > 1) {
      return {
        success: false,
        error: 'Obiekty muszą się stykać lub przenikać, aby wykonać sumę.',
      };
    }

    const outerRing = unionRes[0][0];
    if (!outerRing || outerRing.length < 4) {
      return { success: false, error: 'Wynik sumy nie tworzy poprawnego wielokąta.' };
    }

    const isClosed =
      outerRing[0][0] === outerRing[outerRing.length - 1][0] &&
      outerRing[0][1] === outerRing[outerRing.length - 1][1];
    const pointsRaw = isClosed ? outerRing.slice(0, -1) : outerRing;
    const vertices: Point2D[] = pointsRaw.map(([x, y]) => ({ x, y }));

    const isCCW = isPolygonCCW(vertices);
    const finalVertices = isCCW ? vertices : [...vertices].reverse();

    const newId = `bldg-union-${Date.now().toString(36)}`;
    const maxHeight = Math.max(bldgA.defaultHeight || 15, bldgB.defaultHeight || 15);
    const mergedName = `${bldgA.name || 'Obiekt'} + ${bldgB.name || 'Obiekt'}`;

    const segments: import('../../types/geometry').FacadeSegment[] = [];

    const n = finalVertices.length;
    for (let i = 0; i < n; i++) {
      const p1 = finalVertices[i];
      const p2 = finalVertices[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      const normal = calculateOutwardNormal(p1, p2, isCCW);
      segments.push({
        id: `${newId}-seg-${i + 1}`,
        p1,
        p2,
        normal,
        length: len,
        angleRad: Math.atan2(dy, dx),
        hTop: maxHeight,
        hWindowBottom: bldgA.hWindowBottom ?? 0.85,
        isCityCentre: bldgA.isCityCentre || bldgB.isCityCentre || false,
        buildingType: bldgA.buildingType || 'residential',
      });
    }

    const mergedBuilding: BuildingLoop = {
      id: newId,
      name: mergedName,
      layer: bldgA.layer || 'Domyślna (0)',
      isTested: bldgA.isTested || bldgB.isTested || false,
      isIncluded: true,
      isCityCentre: bldgA.isCityCentre || bldgB.isCityCentre || false,
      buildingType: bldgA.buildingType || 'residential',
      defaultHeight: maxHeight,
      hWindowBottom: bldgA.hWindowBottom ?? 0.85,
      vertices: finalVertices,
      segments,
      isClockwise: !isCCW,
      transform: {
        tx: 0,
        ty: 0,
        rotationDeg: 0,
      },
    };

    return {
      success: true,
      building: mergedBuilding,
    };

  } catch (err: any) {
    return {
      success: false,
      error: `Błąd podczas łączenia wielokątów: ${err?.message || 'Nieznany błąd'}`,
    };
  }
}

/**
 * Oblicza pole powierzchni wielokąta 2D (wzór Gaussa / Shoelace formula).
 */
export function computePolygonArea(vertices: Point2D[]): number {
  if (!vertices || vertices.length < 3) return 0;
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Oblicza łączną powierzchnię 2D zbioru obiektów / wielokątów z uwzględnieniem sumy boolowskiej
 * (nakładające się fragmenty nie są liczone podwójnie, otwory są odejmowane).
 */
export function computeBuildingsUnionArea(buildings: Array<{ vertices: Point2D[] }>): number {
  if (!buildings || buildings.length === 0) return 0;

  const validPolys = buildings
    .map((b) => b.vertices)
    .filter((v) => Array.isArray(v) && v.length >= 3);

  if (validPolys.length === 0) return 0;
  if (validPolys.length === 1) return computePolygonArea(validPolys[0]);

  const clippingPolys: [number, number][][][] = [];
  for (const poly of validPolys) {
    const ring: [number, number][] = poly.map((p) => [p.x, p.y]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    clippingPolys.push([ring]);
  }

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    let totalArea = 0;

    for (const polygon of unionResult) {
      if (!Array.isArray(polygon) || polygon.length === 0) continue;
      const outerRing = polygon[0];
      totalArea += computePolygonArea(outerRing.map(([x, y]) => ({ x, y })));

      for (let i = 1; i < polygon.length; i++) {
        const holeRing = polygon[i];
        totalArea -= computePolygonArea(holeRing.map(([x, y]) => ({ x, y })));
      }
    }
    return Math.max(0, totalArea);
  } catch {
    return validPolys.reduce((sum, p) => sum + computePolygonArea(p), 0);
  }
}
