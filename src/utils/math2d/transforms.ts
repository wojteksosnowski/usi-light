import { Point2D, BuildingLoop } from '../../types/geometry';
import { calculateOutwardNormal } from './vec2';
import { isPolygonCCW } from './polygons';

/**
 * Offsets a single polygon edge parallel to itself while preserving adjacent edge directions.
 * @param vertices Cyclic vertices of the polygon
 * @param edgeIndex Index of edge to offset (from vertices[edgeIndex] to vertices[(edgeIndex+1)%n])
 * @param delta Vector displacement { x, y } in world units (meters)
 */
export function offsetPolygonEdge(
  vertices: Point2D[],
  edgeIndex: number,
  delta: Point2D
): Point2D[] {
  const n = vertices.length;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n) return vertices;

  const isCCW = isPolygonCCW(vertices);
  const v1 = vertices[edgeIndex];
  const v2 = vertices[(edgeIndex + 1) % n];
  const normal = calculateOutwardNormal(v1, v2, isCCW);

  // Normal displacement (projection of mouse delta onto edge normal)
  const d = delta.x * normal.x + delta.y * normal.y;
  if (Math.abs(d) < 1e-6) return vertices;

  // Previous edge V0 -> V1
  const prevIdx = (edgeIndex - 1 + n) % n;
  const v0 = vertices[prevIdx];
  const dPrev = { x: v1.x - v0.x, y: v1.y - v0.y };
  const denomPrev = dPrev.x * normal.x + dPrev.y * normal.y;

  let newV1: Point2D;
  if (Math.abs(denomPrev) > 1e-4) {
    const factor = d / denomPrev;
    newV1 = { x: v1.x + factor * dPrev.x, y: v1.y + factor * dPrev.y };
  } else {
    newV1 = { x: v1.x + d * normal.x, y: v1.y + d * normal.y };
  }

  // Next edge V2 -> V3
  const nextIdx = (edgeIndex + 2) % n;
  const v3 = vertices[nextIdx];
  const dNext = { x: v3.x - v2.x, y: v3.y - v2.y };
  const denomNext = dNext.x * normal.x + dNext.y * normal.y;

  let newV2: Point2D;
  if (Math.abs(denomNext) > 1e-4) {
    const factor = d / denomNext;
    newV2 = { x: v2.x + factor * dNext.x, y: v2.y + factor * dNext.y };
  } else {
    newV2 = { x: v2.x + d * normal.x, y: v2.y + d * normal.y };
  }

  // Sanity check: minimum edge length
  const newEdgeLen = Math.hypot(newV2.x - newV1.x, newV2.y - newV1.y);
  if (newEdgeLen < 0.1) return vertices;

  const newVerts = [...vertices];
  newVerts[edgeIndex] = newV1;
  newVerts[(edgeIndex + 1) % n] = newV2;

  // Verify non-zero area
  let area = 0;
  for (let i = 0; i < n; i++) {
    const pA = newVerts[i];
    const pB = newVerts[(i + 1) % n];
    area += pA.x * pB.y - pB.x * pA.y;
  }
  if (Math.abs(area) < 0.2) return vertices;

  return newVerts;
}

/**
 * Updates a BuildingLoop's segments and winding when its vertices change.
 */
export function updateBuildingWithNewVertices(
  building: BuildingLoop,
  newVertices: Point2D[]
): BuildingLoop {
  const isCCW = isPolygonCCW(newVertices);
  const updatedSegments = newVertices.map((p1, idx) => {
    const p2 = newVertices[(idx + 1) % newVertices.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const normal = calculateOutwardNormal(p1, p2, isCCW);
    const existingSeg = building.segments[idx] || building.segments[0];

    return {
      ...existingSeg,
      id: existingSeg ? existingSeg.id : `${building.id}-seg-${idx + 1}`,
      p1,
      p2,
      normal,
      length: len,
      angleRad: Math.atan2(dy, dx),
    };
  });

  return {
    ...building,
    vertices: newVertices,
    segments: updatedSegments,
    isClockwise: !isCCW,
  };
}

/**
 * Zmienia długość wybranej krawędzi wielokąta z zachowaniem stałego początku (V_i)
 * oraz bez zmiany kierunków (kątów) żadnego z pozostałych odcinków wielokąta.
 * Nowy wierzchołek doczepiony wyznaczany jest poprzez geometryczne przecięcie
 * prostych kierunkowych sąsiednich krawędzi.
 */
export function adjustEdgeLength(
  vertices: Point2D[],
  edgeIndex: number,
  newLength: number
): Point2D[] {
  const n = vertices.length;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n || newLength <= 0.01) {
    return vertices;
  }

  const p1 = vertices[edgeIndex]; // Fixed start V_i
  const nextIdx = (edgeIndex + 1) % n;
  const p2 = vertices[nextIdx];   // Old end V_{i+1}

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const currentLen = Math.hypot(dx, dy);
  if (currentLen < 1e-4) return vertices;

  const ux = dx / currentLen;
  const uy = dy / currentLen;

  // New end point of edgeIndex
  const newP2: Point2D = {
    x: p1.x + ux * newLength,
    y: p1.y + uy * newLength,
  };

  const shiftX = newP2.x - p2.x;
  const shiftY = newP2.y - p2.y;

  // Clone vertices
  const result = vertices.map((v) => ({ ...v }));
  result[nextIdx] = newP2;

  const afterNextIdx = (edgeIndex + 2) % n;
  const vNext = vertices[afterNextIdx]; // V_{i+2}
  const vAfterNext = vertices[(edgeIndex + 3) % n]; // V_{i+3}

  // Direction of edge (i+1): from old V_{i+1} to V_{i+2}
  const d1x = vNext.x - p2.x;
  const d1y = vNext.y - p2.y;

  // Direction of edge (i+2): from V_{i+2} to V_{i+3}
  const d2x = vAfterNext.x - vNext.x;
  const d2y = vAfterNext.y - vNext.y;

  // Line 1: through newP2 with direction (d1x, d1y)
  // Line 2: through vAfterNext with direction (d2x, d2y)
  const det = d1x * d2y - d1y * d2x;

  if (Math.abs(det) > 1e-6) {
    // Non-parallel lines: compute exact intersection to strictly preserve directions
    const t = ((vAfterNext.x - newP2.x) * d2y - (vAfterNext.y - newP2.y) * d2x) / det;
    const newVNext: Point2D = {
      x: newP2.x + t * d1x,
      y: newP2.y + t * d1y,
    };

    if (Number.isFinite(newVNext.x) && Number.isFinite(newVNext.y)) {
      result[afterNextIdx] = newVNext;
      return result;
    }
  }

  // Fallback if lines are parallel / collinear
  result[afterNextIdx] = {
    x: vNext.x + shiftX,
    y: vNext.y + shiftY,
  };

  return result;
}

/**
 * Normalizes an angle in degrees to [0, 360)
 */
export function normalizeAngle360(angleDeg: number): number {
  let a = angleDeg % 360;
  if (a < 0) a += 360;
  return a;
}

/**
 * Normalizes an axial direction angle in degrees to [0, 180)
 */
export function normalizeAngle180(angleDeg: number): number {
  let a = angleDeg % 180;
  if (a < 0) a += 180;
  return a;
}

/**
 * Computes angular difference between two directions in [0, 180)
 */
export function angleDiff180(a1: number, a2: number): number {
  const norm1 = normalizeAngle180(a1);
  const norm2 = normalizeAngle180(a2);
  let diff = Math.abs(norm1 - norm2);
  if (diff > 90) diff = 180 - diff;
  return diff;
}

/**
 * Helper to compute intersection point of two 2D lines defined by (p1, dir1) and (p2, dir2).
 */
export function lineIntersection2D(
  p1: Point2D,
  angleRad1: number,
  p2: Point2D,
  angleRad2: number
): Point2D | null {
  const cos1 = Math.cos(angleRad1);
  const sin1 = Math.sin(angleRad1);
  const cos2 = Math.cos(angleRad2);
  const sin2 = Math.sin(angleRad2);

  // Determinant
  const det = cos1 * sin2 - sin1 * cos2;
  if (Math.abs(det) < 1e-4) {
    return null; // Lines are parallel or coincident
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const t1 = (dx * sin2 - dy * cos2) / det;
  return {
    x: p1.x + t1 * cos1,
    y: p1.y + t1 * sin1,
  };
}

/**
 * Helper to compute intersection point of a 2D line (pOrigin, angleRad) and a segment [segP1, segP2].
 */
export function lineSegmentIntersection2D(
  pOrigin: Point2D,
  angleRad: number,
  segP1: Point2D,
  segP2: Point2D
): { point: Point2D; t: number; s: number } | null {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const vx = segP2.x - segP1.x;
  const vy = segP2.y - segP1.y;

  // Determinant
  const det = sinA * vx - cosA * vy;
  if (Math.abs(det) < 1e-4) {
    return null; // Line and segment are parallel
  }

  const dx = segP1.x - pOrigin.x;
  const dy = segP1.y - pOrigin.y;

  // s: parameter along segment segP1 -> segP2
  const s = (cosA * dy - sinA * dx) / det;
  if (s < -0.01 || s > 1.01) {
    return null;
  }

  // t: parameter along line from pOrigin
  const t = (dx * vy - dy * vx) / det;

  const clampedS = Math.max(0, Math.min(1, s));
  return {
    point: {
      x: segP1.x + clampedS * vx,
      y: segP1.y + clampedS * vy,
    },
    t,
    s: clampedS,
  };
}
