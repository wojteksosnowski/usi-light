import { Point2D, Vector2D } from '../types/geometry';

/**
 * Calculates the signed area of a 2D polygon using the Shoelace formula / Green's theorem.
 * Positive => Counter-Clockwise (CCW)
 * Negative => Clockwise (CW)
 */
export function calculateSignedArea(points: Point2D[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

export function isPolygonCCW(points: Point2D[]): boolean {
  return calculateSignedArea(points) > 0;
}

/**
 * Calculates the outward unit normal vector for segment P1->P2.
 * For a CCW polygon, the outward normal is ( (y2-y1)/L, -(x2-x1)/L ).
 * For a CW polygon, we flip the normal to keep it pointing outward.
 */
export function calculateOutwardNormal(
  p1: Point2D,
  p2: Point2D,
  polygonIsCCW: boolean = true
): Vector2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return { x: 0, y: 1 };
  }

  // Base normal for CCW: (dy / L, -dx / L)
  let nx = dy / length;
  let ny = -dx / length;

  if (!polygonIsCCW) {
    nx = -nx;
    ny = -ny;
  }

  return { x: nx, y: ny };
}

/**
 * Checks if a point is inside a polygon using ray casting algorithm.
 */
export function isPointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  let inside = false;
  const { x, y } = point;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x,
      yi = vertices[i].y;
    const xj = vertices[j].x,
      yj = vertices[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-10) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

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
 * Distance from point P to line segment AB.
 */
export function distancePointToSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
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
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (len === 0) return [{ point: p1, ratio: 0.5 }];

  const count = Math.max(1, Math.round(len / interval));
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
