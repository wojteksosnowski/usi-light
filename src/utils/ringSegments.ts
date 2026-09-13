import { BuildingLoop, FacadeSegment, LineEquation2D, Point2D } from '../types/geometry';
import { calculateOutwardNormal } from './math2d/vec2';

/**
 * Dependency-free home for the low-level ring/segment math shared by `segmentStatistics.ts`
 * (single-building segment rebuilds) and `math2d/polygons.ts` (boolean union results). Kept
 * separate from both — and importing only from `math2d/vec2` directly, never the `math2d`
 * barrel — so neither of those two modules needs to import the other and risk a cycle
 * (`segmentStatistics.ts` already imports from the `@/utils/math2d` barrel, which re-exports
 * `polygons.ts`).
 */

/**
 * Computes general (Ax + By + C = 0) and slope-intercept (y = ax + b) line equations for a segment.
 */
export function computeLineEquation(p1: Point2D, p2: Point2D, normal?: { x: number; y: number }): LineEquation2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1e-6;

  // Normalized general equation coefficients where A^2 + B^2 = 1
  let A = -dy / len;
  let B = dx / len;
  if (normal) {
    const dot = A * normal.x + B * normal.y;
    if (dot < 0) {
      A = -A;
      B = -B;
    }
  }
  const C = -(A * p1.x + B * p1.y);

  const isVertical = Math.abs(dx) < 1e-4;
  const slope = isVertical ? undefined : dy / dx;
  const intercept = isVertical ? undefined : p1.y - slope! * p1.x;

  // Line orientation angle in [0, 180) degrees
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 180;
  if (angleDeg >= 180) angleDeg -= 180;

  // Outward normal azimuth in [0, 360) degrees
  const nx = normal ? normal.x : A;
  const ny = normal ? normal.y : B;
  const azimuthDeg = ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360;

  return {
    A,
    B,
    C,
    slope,
    intercept,
    isVertical,
    angleDeg,
    azimuthDeg,
  };
}

/**
 * Builds facade segments for a single closed ring (outer contour or a hole boundary).
 * For holes, `isCCW` should reflect the OUTER ring's winding, not the hole's own (reversed)
 * winding: `calculateOutwardNormal` returns the direction away from a ring's own interior when
 * given its true winding, but a hole's boundary wall is physically exposed on the inside (facing
 * the void) — so passing the outer ring's winding deliberately yields the complement, pointing
 * the normal INTO the hole.
 */
export function buildRingSegments(
  bldg: Pick<BuildingLoop, 'id' | 'elevation' | 'defaultHeight' | 'hWindowBottom' | 'isCityCentre' | 'buildingType'>,
  ring: Point2D[],
  isCCW: boolean,
  idPrefix: string,
  ringIndex: number
): FacadeSegment[] {
  const segments: FacadeSegment[] = [];
  const hBase = bldg.elevation ?? 0.0;
  const hTop = hBase + bldg.defaultHeight;

  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % ring.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const normal = calculateOutwardNormal(p1, p2, isCCW);
    const lineEq = computeLineEquation(p1, p2, normal);

    segments.push({
      id: `${idPrefix}-${i + 1}`,
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      normal,
      length: len,
      angleRad: Math.atan2(dy, dx),
      hTop,
      hBase,
      hWindowBottom: bldg.hWindowBottom || 0.85,
      isCityCentre: bldg.isCityCentre,
      buildingType: bldg.buildingType,
      lineEquation: lineEq,
      ringIndex,
    });
  }

  return segments;
}

/**
 * Returns `ring` unchanged if it already winds opposite to the outer ring, otherwise a reversed
 * copy. Interior hole rings (courtyards, parcel enclaves) must wind opposite to their outer ring
 * both for the canvas `evenodd` fill rule and for `buildRingSegments` to derive a correct normal.
 */
export function ensureOppositeWinding(ring: Point2D[], ringIsCCW: boolean, outerIsCCW: boolean): Point2D[] {
  return ringIsCCW === outerIsCCW ? [...ring].reverse() : ring;
}
