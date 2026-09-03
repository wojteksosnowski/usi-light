import { Point2D, Vector2D } from '../../types/geometry';

/**
 * 2D squared Euclidean distance between two points.
 * Speed is king: avoids Math.sqrt whenever comparing thresholds or finding nearest points.
 */
export function squaredDistance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy;
}

/**
 * 2D Euclidean distance between two points.
 */
export function distance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * 2D Dot product of two vectors.
 */
export function dotProduct2D(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y;
}

/**
 * 2D Cross product (z-component) of vectors (P1 - Origin) and (P2 - Origin).
 * Positive => P2 is to the left of P1 (CCW) relative to Origin.
 * Negative => P2 is to the right of P1 (CW) relative to Origin.
 * Zero => Collinear with Origin.
 */
export function crossProduct2D(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  ox: number,
  oy: number
): number {
  return (p1x - ox) * (p2y - oy) - (p1y - oy) * (p2x - ox);
}

/**
 * Calculates the outward unit normal vector for segment P1->P2.
 * For a CCW polygon, the outward normal is ( (y2-y1)/L, -(x2-x1)/L ).
 * For a CW polygon, we flip the normal to keep it pointing outward.
 * Uses direct perpendicular coordinate swap without trigonometry.
 */
export function calculateOutwardNormal(
  p1: Point2D,
  p2: Point2D,
  polygonIsCCW: boolean = true
): Vector2D {
  if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
    return { x: 0, y: 1 };
  }
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);

  if (length < 1e-9) {
    return { x: 0, y: 1 };
  }

  let nx = dy / length;
  let ny = -dx / length;

  if (!polygonIsCCW) {
    nx = -nx;
    ny = -ny;
  }

  return { x: nx, y: ny };
}
