import { Point2D, BuildingLoop } from '../../types/geometry';
import { closestPointOnSegment } from './segments';

export interface LinearDimensionResult {
  p1: Point2D;
  p2: Point2D;
  distance: number;
  isParallel: boolean;
}

/**
 * Computes linear dimension between two line segments S1=[A1, B1] and S2=[A2, B2].
 * If segments are parallel, connects mutually projected overlapping points.
 * If segments are non-parallel, connects the pair of closest points on the segments.
 */
export function computeLinearDimension(
  a1: Point2D,
  b1: Point2D,
  a2: Point2D,
  b2: Point2D
): LinearDimensionResult {
  const v1 = { x: b1.x - a1.x, y: b1.y - a1.y };
  const v2 = { x: b2.x - a2.x, y: b2.y - a2.y };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 < 1e-5 || len2 < 1e-5) {
    return { p1: a1, p2: a2, distance: Math.hypot(a2.x - a1.x, a2.y - a1.y), isParallel: false };
  }

  const cross = Math.abs(v1.x * v2.y - v1.y * v2.x) / (len1 * len2);
  const isParallel = cross < 0.05; // ~3 degrees tolerance

  if (isParallel) {
    // Project midpoint of s1 onto s2
    const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    const proj1 = closestPointOnSegment(mid1, a2, b2);
    // Project midpoint of s2 onto s1
    const mid2 = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
    const proj2 = closestPointOnSegment(mid2, a1, b1);

    const d1 = Math.hypot(mid1.x - proj1.x, mid1.y - proj1.y);
    const d2 = Math.hypot(proj2.x - mid2.x, proj2.y - mid2.y);

    const u1 = ((mid1.x - a2.x) * v2.x + (mid1.y - a2.y) * v2.y) / (len2 * len2);
    const u2 = ((mid2.x - a1.x) * v1.x + (mid2.y - a1.y) * v1.y) / (len1 * len1);

    if (u1 >= 0.02 && u1 <= 0.98) {
      return { p1: closestPointOnSegment(proj1, a1, b1), p2: proj1, distance: d1, isParallel: true };
    }
    if (u2 >= 0.02 && u2 <= 0.98) {
      return { p1: proj2, p2: closestPointOnSegment(proj2, a2, b2), distance: d2, isParallel: true };
    }
  }

  // Non-parallel or non-overlapping: test all endpoint pairings to find closest distance
  const candidates: { p1: Point2D; p2: Point2D; d: number }[] = [];

  const c1_a1 = closestPointOnSegment(a1, a2, b2);
  candidates.push({ p1: a1, p2: c1_a1, d: Math.hypot(a1.x - c1_a1.x, a1.y - c1_a1.y) });

  const c1_b1 = closestPointOnSegment(b1, a2, b2);
  candidates.push({ p1: b1, p2: c1_b1, d: Math.hypot(b1.x - c1_b1.x, b1.y - c1_b1.y) });

  const c2_a2 = closestPointOnSegment(a2, a1, b1);
  candidates.push({ p1: c2_a2, p2: a2, d: Math.hypot(c2_a2.x - a2.x, c2_a2.y - a2.y) });

  const c2_b2 = closestPointOnSegment(b2, a1, b1);
  candidates.push({ p1: c2_b2, p2: b2, d: Math.hypot(c2_b2.x - b2.x, c2_b2.y - b2.y) });

  const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const c_mid1 = closestPointOnSegment(mid1, a2, b2);
  candidates.push({ p1: mid1, p2: c_mid1, d: Math.hypot(mid1.x - c_mid1.x, mid1.y - c_mid1.y) });

  const mid2 = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
  const c_mid2 = closestPointOnSegment(mid2, a1, b1);
  candidates.push({ p1: c_mid2, p2: mid2, d: Math.hypot(c_mid2.x - mid2.x, c_mid2.y - mid2.y) });

  candidates.sort((a, b) => a.d - b.d);
  return { p1: candidates[0].p1, p2: candidates[0].p2, distance: candidates[0].d, isParallel };
}

export interface AngularDimensionResult {
  angleDeg: number;
  intersection: Point2D;
  mid1: Point2D;
  mid2: Point2D;
  ang1: number;
  ang2: number;
  isParallel: boolean;
  touchRadiusWorld: number;
  touchPoint1: Point2D;
  touchPoint2: Point2D;
}

/**
 * Computes angular dimension between two line segments S1=[A1, B1] and S2=[A2, B2].
 */
export function computeAngularDimension(
  a1: Point2D,
  b1: Point2D,
  a2: Point2D,
  b2: Point2D
): AngularDimensionResult {
  const v1 = { x: b1.x - a1.x, y: b1.y - a1.y };
  const v2 = { x: b2.x - a2.x, y: b2.y - a2.y };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 < 1e-5 || len2 < 1e-5) {
    return {
      angleDeg: 0,
      intersection: a1,
      mid1: a1,
      mid2: a2,
      ang1: 0,
      ang2: 0,
      isParallel: true,
      touchRadiusWorld: 2.0,
      touchPoint1: a1,
      touchPoint2: a2,
    };
  }

  const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const rawAngleRad = Math.acos(clampedDot);
  let angleDeg = (rawAngleRad * 180) / Math.PI;
  if (angleDeg > 90) angleDeg = 180 - angleDeg; // Standard acute angle between two lines

  const denom = v1.x * v2.y - v1.y * v2.x;
  const isParallel = Math.abs(denom) < 1e-5 || angleDeg < 0.2;

  let intersection: Point2D;
  if (isParallel) {
    intersection = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
  } else {
    const t = ((a2.x - a1.x) * v2.y - (a2.y - a1.y) * v2.x) / denom;
    intersection = { x: a1.x + t * v1.x, y: a1.y + t * v1.y };
  }

  const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const mid2 = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };

  const ang1 = Math.atan2(mid1.y - intersection.y, mid1.x - intersection.x);
  const ang2 = Math.atan2(mid2.y - intersection.y, mid2.x - intersection.x);

  const dMid1 = Math.hypot(mid1.x - intersection.x, mid1.y - intersection.y);
  const dMid2 = Math.hypot(mid2.x - intersection.x, mid2.y - intersection.y);
  const touchRadiusWorld = Math.max((dMid1 + dMid2) / 2, 1.5);

  const touchPoint1 = {
    x: intersection.x + Math.cos(ang1) * touchRadiusWorld,
    y: intersection.y + Math.sin(ang1) * touchRadiusWorld,
  };
  const touchPoint2 = {
    x: intersection.x + Math.cos(ang2) * touchRadiusWorld,
    y: intersection.y + Math.sin(ang2) * touchRadiusWorld,
  };

  return {
    angleDeg,
    intersection,
    mid1,
    mid2,
    ang1,
    ang2,
    isParallel,
    touchRadiusWorld,
    touchPoint1,
    touchPoint2,
  };
}

export interface BoundaryDistanceResult {
  boundaryId: string;
  boundaryName: string;
  minDistance: number;
  closestBuildingPoint: Point2D;
  closestBoundaryPoint: Point2D;
  buildingSegmentId?: string;
  boundarySegmentId?: string;
}

/**
 * Oblicza minimalne odległości krawędzi budynku od krawędzi granic (działek).
 */
export function computeDistancesToBoundaries(
  building: BuildingLoop,
  boundaries: BuildingLoop[]
): BoundaryDistanceResult[] {
  if (!building || !building.segments || building.segments.length === 0) return [];
  const results: BoundaryDistanceResult[] = [];

  for (const bnd of boundaries) {
    if (!bnd || !bnd.segments || bnd.segments.length === 0) continue;

    let minDistance = Infinity;
    let closestBldgPt: Point2D = building.vertices[0] || { x: 0, y: 0 };
    let closestBndPt: Point2D = bnd.vertices[0] || { x: 0, y: 0 };
    let bestBldgSegId: string | undefined;
    let bestBndSegId: string | undefined;

    for (const bldgSeg of building.segments) {
      for (const bndSeg of bnd.segments) {
        const dim = computeLinearDimension(bldgSeg.p1, bldgSeg.p2, bndSeg.p1, bndSeg.p2);
        if (dim.distance < minDistance) {
          minDistance = dim.distance;
          closestBldgPt = dim.p1;
          closestBndPt = dim.p2;
          bestBldgSegId = bldgSeg.id;
          bestBndSegId = bndSeg.id;
        }
      }
    }

    if (Number.isFinite(minDistance)) {
      results.push({
        boundaryId: bnd.id,
        boundaryName: bnd.plotNumber ? `Działka ${bnd.plotNumber}` : (bnd.name || 'Granica działki'),
        minDistance,
        closestBuildingPoint: closestBldgPt,
        closestBoundaryPoint: closestBndPt,
        buildingSegmentId: bestBldgSegId,
        boundarySegmentId: bestBndSegId,
      });
    }
  }

  return results;
}
