import { Point2D } from '../../types/geometry';

/**
 * Przycina wielokąt wypukły `poly` półpłaszczyzną określoną przez punkt `pA` i wektor normalny `normal`
 * (zwraca część leżącą po stronie: (P - pA) · normal >= 0).
 * Algorytm Sutherland-Hodgmana dla pojedynczej linii tnącej.
 */
export function clipConvexPolygonByHalfplane(
  poly: Point2D[],
  pA: Point2D,
  normal: Point2D
): Point2D[] {
  if (!poly || poly.length === 0) return [];
  const output: Point2D[] = [];

  const isInside = (pt: Point2D): boolean => {
    return (pt.x - pA.x) * normal.x + (pt.y - pA.y) * normal.y >= -1e-7;
  };

  const computeIntersection = (s: Point2D, e: Point2D): Point2D => {
    const dcX = e.x - s.x;
    const dcY = e.y - s.y;
    const sDot = (s.x - pA.x) * normal.x + (s.y - pA.y) * normal.y;
    const dDot = dcX * normal.x + dcY * normal.y;
    if (Math.abs(dDot) < 1e-9) return s;
    const t = -sDot / dDot;
    return {
      x: s.x + t * dcX,
      y: s.y + t * dcY,
    };
  };

  let s = poly[poly.length - 1];
  for (let i = 0; i < poly.length; i++) {
    const e = poly[i];
    const sIn = isInside(s);
    const eIn = isInside(e);

    if (eIn) {
      if (!sIn) {
        output.push(computeIntersection(s, e));
      }
      output.push(e);
    } else if (sIn) {
      output.push(computeIntersection(s, e));
    }
    s = e;
  }

  return output;
}

export interface VoronoiCell {
  site: Point2D;
  polygon: Point2D[];
}

/**
 * Generuje komórki diagramu Voronoi dla zadanego zbioru punktów (sites)
 * przycięte do obwiedni wielokąta bazowego `boundary`.
 */
export function generatePolygonalVoronoiCells(
  sites: Point2D[],
  boundary: Point2D[]
): VoronoiCell[] {
  if (!sites || sites.length === 0 || !boundary || boundary.length < 3) {
    return [];
  }

  // 1. Wyznacz Bounding Box obwiedni i powiększ go dla bezpieczeństwa
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of boundary) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  const margin = Math.max(maxX - minX, maxY - minY, 10.0) * 0.5;
  const initialBox: Point2D[] = [
    { x: minX - margin, y: minY - margin },
    { x: maxX + margin, y: minY - margin },
    { x: maxX + margin, y: maxY + margin },
    { x: minX - margin, y: maxY + margin },
  ];

  const n = sites.length;
  const cells: VoronoiCell[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = sites[i];
    let cellPoly = [...initialBox];

    // Przycinanie komórki dwusiecznymi ze wszystkimi innymi punktami
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const p2 = sites[j];

      // Środek odcinka p1-p2
      const mid: Point2D = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };

      // Wektor normalny skierowany od p2 do p1 (strona p1 jest wnętrzem)
      const nx = p1.x - p2.x;
      const ny = p1.y - p2.y;
      const len = Math.hypot(nx, ny);
      if (len < 1e-6) continue;

      const norm: Point2D = { x: nx / len, y: ny / len };

      cellPoly = clipConvexPolygonByHalfplane(cellPoly, mid, norm);
      if (cellPoly.length < 3) break;
    }

    if (cellPoly.length >= 3) {
      cells.push({
        site: p1,
        polygon: cellPoly,
      });
    }
  }

  return cells;
}
