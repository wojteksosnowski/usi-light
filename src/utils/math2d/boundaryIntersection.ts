import { Point2D } from '../../types/geometry';
import polygonClipping from 'polygon-clipping';
import { computePolygonArea } from './polygons';

/**
 * Oblicza pole przecięcia wielokąta (np. budynku) ze zbiorem działek (boundary).
 * Zwraca łączną powierzchnię części wielokąta leżących wewnątrz działek.
 */
export function computePolygonIntersectionWithBoundaries(
  polygonVertices: Point2D[],
  boundaries: Array<{ vertices: Point2D[] }>
): number {
  if (!polygonVertices || polygonVertices.length < 3 || !boundaries || boundaries.length === 0) {
    return 0;
  }

  const validBoundaries = boundaries
    .map((b) => b.vertices)
    .filter((v) => Array.isArray(v) && v.length >= 3);

  if (validBoundaries.length === 0) return 0;

  // Przygotuj wielokąt obiektu
  const subjectRing: [number, number][] = polygonVertices.map((p) => [p.x, p.y]);
  if (
    subjectRing[0][0] !== subjectRing[subjectRing.length - 1][0] ||
    subjectRing[0][1] !== subjectRing[subjectRing.length - 1][1]
  ) {
    subjectRing.push([subjectRing[0][0], subjectRing[0][1]]);
  }
  const subjectPoly: [number, number][][][] = [[subjectRing]];

  // Przygotuj wielokąty granic
  const clipPolys: [number, number][][][] = [];
  for (const bVerts of validBoundaries) {
    const ring: [number, number][] = bVerts.map((p) => [p.x, p.y]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    clipPolys.push([ring]);
  }

  try {
    // Łączymy wszystkie działki w jedną geometrię (MultiPolygon)
    const boundariesUnion =
      clipPolys.length === 1
        ? clipPolys[0]
        : polygonClipping.union(clipPolys[0], ...clipPolys.slice(1));

    // Przecięcie wielokąta z granicami działek
    const intersectionResult = polygonClipping.intersection(subjectPoly, boundariesUnion);

    let totalArea = 0;
    for (const polygon of intersectionResult) {
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
    // W przypadku błędu numerycznego polygon-clipping zwracamy 0 lub pełną powierzchnię
    return 0;
  }
}
