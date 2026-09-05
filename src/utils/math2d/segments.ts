import { Point2D, Vector2D } from '../../types/geometry';

/**
 * Ray-segment intersection in 2D.
 * Ray: R(t) = origin + t * dir, t >= 0
 * Segment: S(u) = p1 + u * (p2 - p1), u in [0, 1]
 */
export function raySegmentIntersection(
  origin: Point2D,
  dir: Vector2D,
  p1: Point2D,
  p2: Point2D
): { hit: boolean; distance: number; point?: Point2D } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const cross = dir.x * dy - dir.y * dx;
  if (Math.abs(cross) < 1e-9) {
    return { hit: false, distance: Infinity }; // Parallel
  }

  const ox = p1.x - origin.x;
  const oy = p1.y - origin.y;

  const t = (ox * dy - oy * dx) / cross;
  const u = (ox * dir.y - oy * dir.x) / cross;

  if (t >= 1e-5 && u >= 0 && u <= 1) {
    return {
      hit: true,
      distance: t,
      point: {
        x: origin.x + t * dir.x,
        y: origin.y + t * dir.y,
      },
    };
  }

  return { hit: false, distance: Infinity };
}

/**
 * Zero-allocation ray-segment intersection distance in 2D.
 * Returns positive distance t if hit, or Infinity if no intersection.
 * Uses pure primitive numbers without creating temporary Point2D or hit objects.
 */
export function raySegmentDistance2D(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): number {
  const segDx = p2x - p1x;
  const segDy = p2y - p1y;

  const cross = dx * segDy - dy * segDx;
  if (Math.abs(cross) < 1e-9) {
    return Infinity;
  }

  const vOriginX = p1x - ox;
  const vOriginY = p1y - oy;

  const t = (vOriginX * segDy - vOriginY * segDx) / cross;
  if (t < 1e-5) {
    return Infinity;
  }

  const u = (vOriginX * dy - vOriginY * dx) / cross;
  if (u >= 0 && u <= 1) {
    return t;
  }

  return Infinity;
}

/**
 * Distance from point P to line segment AB.
 */
export function distancePointToSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): number {
  if (!p || !a || !b || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    return Infinity;
  }
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/**
 * Generates sampled test points along a segment with a given interval in meters.
 */
export function sampleSegmentPoints(
  p1: Point2D,
  p2: Point2D,
  interval: number = 0.5
): { point: Point2D; ratio: number }[] {
  if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
    return [{ point: p1 || { x: 0, y: 0 }, ratio: 0.5 }];
  }
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (len < 1e-6) return [{ point: p1, ratio: 0.5 }];

  const safeInterval = Math.max(0.01, interval);
  const count = Math.max(1, Math.round(len / safeInterval));
  const points: { point: Point2D; ratio: number }[] = [];

  // Sample interior points along the segment (avoiding degenerate 0.0 and 1.0 exact corner vertices)
  for (let i = 0; i < count; i++) {
    const ratio = (i + 0.5) / count;
    points.push({
      point: {
        x: p1.x + ratio * (p2.x - p1.x),
        y: p1.y + ratio * (p2.y - p1.y),
      },
      ratio,
    });
  }

  return points;
}

/**
 * Analityczne przecięcie odcinka AB z kołem o środku w punkcie P i promieniu R.
 * Zwraca część odcinka znajdującą się wewnątrz koła [p1, p2] lub null jeśli odcinek jest w całości na zewnątrz.
 */
export function clipSegmentToCircle(
  center: Point2D,
  radius: number,
  a: Point2D,
  b: Point2D
): { p1: Point2D; p2: Point2D; t1: number; t2: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) {
    const d = Math.hypot(a.x - center.x, a.y - center.y);
    return d <= radius + 1e-4 ? { p1: a, p2: a, t1: 0, t2: 0 } : null;
  }

  const ox = a.x - center.x;
  const oy = a.y - center.y;
  const B = 2 * (ox * dx + oy * dy);
  const C = ox * ox + oy * oy - radius * radius;
  const disc = B * B - 4 * len2 * C;

  const daSq = ox * ox + oy * oy;
  const dbSq = (b.x - center.x) ** 2 + (b.y - center.y) ** 2;
  const rSq = radius * radius;

  let tMin = 0;
  let tMax = 1;

  if (daSq <= rSq + 1e-4 && dbSq <= rSq + 1e-4) {
    // Przypadek 1: Oba wierzchołki wewnątrz okręgu
    tMin = 0;
    tMax = 1;
  } else if (disc >= 0) {
    const sq = Math.sqrt(disc);
    const root1 = (-B - sq) / (2 * len2);
    const root2 = (-B + sq) / (2 * len2);
    const rA = Math.min(root1, root2);
    const rB = Math.max(root1, root2);

    // Część wspólna [0, 1] oraz [rA, rB]
    tMin = Math.max(0, rA);
    tMax = Math.min(1, rB);

    if (tMax < tMin - 1e-6) return null; // Całkowicie poza
  } else {
    // Brak przecięcia
    return null;
  }

  return {
    p1: { x: a.x + tMin * dx, y: a.y + tMin * dy },
    p2: { x: a.x + tMax * dx, y: a.y + tMax * dy },
    t1: tMin,
    t2: tMax,
  };
}

/**
 * Czysto analityczne sprawdzenie czy wektor kierunkowy 'dir' leży w stożku kątowym
 * wyznaczonym przez odcinek C1-C2 względem punktu obserwacji 'origin' (bez raycastingu).
 */
export function isDirectionInSegmentCone(
  origin: Point2D,
  dir: Vector2D,
  c1: Point2D,
  c2: Point2D
): boolean {
  const v1x = c1.x - origin.x;
  const v1y = c1.y - origin.y;
  const v2x = c2.x - origin.x;
  const v2y = c2.y - origin.y;

  // Sprawdzenie zwrotu (kierunek musi być skierowany w stronę odcinka)
  if (dir.x * (v1x + v2x) + dir.y * (v1y + v2y) <= 0) {
    return false;
  }

  const cross12 = v1x * v2y - v1y * v2x;

  if (cross12 > 1e-9) {
    // v1 -> v2 jest CCW
    const c1d = v1x * dir.y - v1y * dir.x;
    const dv2 = dir.x * v2y - dir.y * v2x;
    return c1d >= -1e-7 && dv2 >= -1e-7;
  } else if (cross12 < -1e-9) {
    // v1 -> v2 jest CW
    const c2d = v2x * dir.y - v2y * dir.x;
    const dv1 = dir.x * v1y - dir.y * v1x;
    return c2d >= -1e-7 && dv1 >= -1e-7;
  } else {
    // Punkty c1 i c2 są współliniowe z origin
    const dot1 = dir.x * v1x + dir.y * v1y;
    return dot1 > 0;
  }
}

/**
 * Computes closest point on line segment AB to point P.
 */
export function closestPointOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return { ...a };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

/**
 * Zwraca parametr t in [0, 1] na odcinku S1(t) = a1 + t*(a2 - a1)
 * w punkcie przecięcia z odcinkiem S2(u) = b1 + u*(b2 - b1), lub null jeśli brak przecięcia.
 */
export function segmentSegmentIntersectionParam(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D
): number | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;

  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-9) {
    return null; // Równoległe lub współliniowe
  }

  const ox = b1.x - a1.x;
  const oy = b1.y - a1.y;

  const t = (ox * d2y - oy * d2x) / cross;
  const u = (ox * d1y - oy * d1x) / cross;

  if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) {
    return Math.max(0, Math.min(1, t));
  }

  return null;
}

export interface SegmentOcclusionPart {
  p1: Point2D;
  p2: Point2D;
  isOccluded: boolean;
}

/**
 * Analitycznie dzieli odcinek [p1, p2] na pododcinki w punktach przecięcia z wielokątami
 * wyższych obiektów oraz klasyfikuje każdy pododcinek jako zasłonięty (wewnątrz) lub widoczny (na zewnątrz).
 */
export function splitSegmentByOccludingPolygons(
  p1: Point2D,
  p2: Point2D,
  higherPolygons: Point2D[][],
  isPointInsidePoly: (pt: Point2D, poly: Point2D[]) => boolean
): SegmentOcclusionPart[] {
  if (!p1 || !p2 || !higherPolygons || higherPolygons.length === 0) {
    return [{ p1: { ...p1 }, p2: { ...p2 }, isOccluded: false }];
  }

  const validPolys = higherPolygons.filter((poly) => Array.isArray(poly) && poly.length >= 3);
  if (validPolys.length === 0) {
    return [{ p1: { ...p1 }, p2: { ...p2 }, isOccluded: false }];
  }

  const tSet = new Set<number>();
  tSet.add(0);
  tSet.add(1);

  // Znajdź wszystkie parametry t przecięć odcinka p1-p2 z krawędziami każdego wielokąta
  for (const poly of validPolys) {
    const m = poly.length;
    for (let i = 0; i < m; i++) {
      const v1 = poly[i];
      const v2 = poly[(i + 1) % m];
      const t = segmentSegmentIntersectionParam(p1, p2, v1, v2);
      if (t !== null && t > 1e-4 && t < 1 - 1e-4) {
        tSet.add(t);
      }
    }
  }

  const sortedT = Array.from(tSet).sort((a, b) => a - b);
  const result: SegmentOcclusionPart[] = [];

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  for (let i = 0; i < sortedT.length - 1; i++) {
    const tA = sortedT[i];
    const tB = sortedT[i + 1];
    if (tB - tA < 1e-5) continue;

    const subP1: Point2D = {
      x: p1.x + tA * dx,
      y: p1.y + tA * dy,
    };
    const subP2: Point2D = {
      x: p1.x + tB * dx,
      y: p1.y + tB * dy,
    };

    // Test punktu środkowego pododcinka
    const midT = (tA + tB) / 2;
    const midPt: Point2D = {
      x: p1.x + midT * dx,
      y: p1.y + midT * dy,
    };

    let isOccluded = false;
    for (const poly of validPolys) {
      if (isPointInsidePoly(midPt, poly)) {
        isOccluded = true;
        break;
      }
    }

    result.push({
      p1: subP1,
      p2: subP2,
      isOccluded,
    });
  }

  return result.length > 0 ? result : [{ p1: { ...p1 }, p2: { ...p2 }, isOccluded: false }];
}

