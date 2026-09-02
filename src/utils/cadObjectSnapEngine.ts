import { Point2D } from '../types/geometry';
import {
  CachedLineEquation,
  createCachedLineEquation,
  projectPointToLine,
  normalizeAnglePi,
  angleDiffPi,
} from './lineBufferEngine';

/**
 * Wykrywa równoległość i kolinearność przy transformacji krawędzi lub obiektu
 * (Priorytet 6: Parallel Snap & Collinear Lock)
 */
export function evaluateCollinearAndParallelLock(
  draggedEdge: CachedLineEquation,
  referenceBuffer: CachedLineEquation[],
  angleToleranceRad = (0.5 * Math.PI) / 180,
  collinearDistThreshold = 0.25 // np. 25 cm w świecie CAD
): {
  isParallel: boolean;
  isCollinear: boolean;
  targetAngleRad?: number;
  correctedC?: number;
  referenceEdge?: CachedLineEquation;
  deltaOffset?: { dx: number; dy: number };
} | null {
  let bestMatch: {
    referenceEdge: CachedLineEquation;
    angleDiff: number;
    lineDist: number;
  } | null = null;

  let minAngleDiff = angleToleranceRad;

  for (const ref of referenceBuffer) {
    if (ref.objectId === draggedEdge.objectId) continue;

    const diff = angleDiffPi(draggedEdge.angle, ref.angle);
    if (diff <= angleToleranceRad && diff < minAngleDiff) {
      const lineDist = Math.abs(draggedEdge.C - ref.C);
      minAngleDiff = diff;
      bestMatch = {
        referenceEdge: ref,
        angleDiff: diff,
        lineDist,
      };
    }
  }

  if (!bestMatch) return null;

  const isCollinear = bestMatch.lineDist <= collinearDistThreshold;

  return {
    isParallel: true,
    isCollinear,
    targetAngleRad: bestMatch.referenceEdge.angle,
    correctedC: isCollinear ? bestMatch.referenceEdge.C : undefined,
    referenceEdge: bestMatch.referenceEdge,
  };
}

export type BuildingDragSnapRelation =
  | 'vertex_to_vertex'
  | 'vertex_to_edge'
  | 'edge_to_vertex'
  | 'edge_to_edge_collinear'
  | 'edge_to_edge_parallel';

export interface BuildingDragSnapResult {
  relation: BuildingDragSnapRelation;
  deltaX: number; // korekta przesunięcia obiektu dx w metrach
  deltaY: number; // korekta przesunięcia obiektu dy w metrach
  distanceMeters: number;
  label: string;
  sourcePoint?: Point2D;
  targetPoint?: Point2D;
  referenceEdge?: CachedLineEquation;
  movingEdge?: CachedLineEquation;
  guideline?: { p1: Point2D; p2: Point2D };
  isExtension?: boolean;
}

export interface EvaluateBuildingDragSnapOptions {
  movingVertices: Point2D[];
  movingBuildingId: string;
  referenceBuffer: CachedLineEquation[];
  distanceThresholdMeters?: number;
  angleToleranceRad?: number;
  guidelineLengthMeters?: number;
}

/**
 * Wielorelacyjne dociąganie podczas przesuwania obiektów CAD:
 * 1. Punkt do punktu (Vertex-to-Vertex / Corner lock)
 * 2. Punkt do krawędzi (Vertex-to-Edge projection)
 * 3. Krawędź do punktu (Edge-to-Vertex projection)
 * 4. Krawędź do krawędzi / przedłużenie kolinearne (Collinear Extension & Parallel Lock)
 */
export function evaluateBuildingDragMultiSnap(
  options: EvaluateBuildingDragSnapOptions
): BuildingDragSnapResult | null {
  const {
    movingVertices,
    movingBuildingId,
    referenceBuffer,
    distanceThresholdMeters = 0.35,
    angleToleranceRad = (0.8 * Math.PI) / 180,
    guidelineLengthMeters = 100,
  } = options;

  if (movingVertices.length < 2) return null;

  const otherBuffer = referenceBuffer.filter((e) => e.objectId !== movingBuildingId);
  if (otherBuffer.length === 0) return null;

  // AABB Culling: Wyznacz bounding box przemieszczanej bryły rozszerzony o próg snapowania
  let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
  for (const v of movingVertices) {
    if (v.x < bMinX) bMinX = v.x;
    if (v.x > bMaxX) bMaxX = v.x;
    if (v.y < bMinY) bMinY = v.y;
    if (v.y > bMaxY) bMaxY = v.y;
  }
  const pad = distanceThresholdMeters + 0.1;
  const aabb = {
    minX: bMinX - pad,
    maxX: bMaxX + pad,
    minY: bMinY - pad,
    maxY: bMaxY + pad,
  };

  // Krawędzie referencyjne przecinające AABB przemieszczanej bryły (dla V2V, V2E, E2V)
  const nearbyRefBuffer = otherBuffer.filter((e) => {
    const eMinX = Math.min(e.p1.x, e.p2.x);
    const eMaxX = Math.max(e.p1.x, e.p2.x);
    const eMinY = Math.min(e.p1.y, e.p2.y);
    const eMaxY = Math.max(e.p1.y, e.p2.y);
    return eMaxX >= aabb.minX && eMinX <= aabb.maxX && eMaxY >= aabb.minY && eMinY <= aabb.maxY;
  });

  // -------------------------------------------------------------------------
  // 1. Punkt do Punktu (Vertex-to-Vertex / Corner Lock) - Najwyższy priorytet
  // -------------------------------------------------------------------------
  let bestV2V: BuildingDragSnapResult | null = null;
  let minV2VDist = distanceThresholdMeters;

  for (const vMove of movingVertices) {
    for (const refEdge of nearbyRefBuffer) {
      for (const vRef of [refEdge.p1, refEdge.p2]) {
        const dist = Math.hypot(vMove.x - vRef.x, vMove.y - vRef.y);
        if (dist <= minV2VDist) {
          minV2VDist = dist;
          bestV2V = {
            relation: 'vertex_to_vertex',
            deltaX: vRef.x - vMove.x,
            deltaY: vRef.y - vMove.y,
            distanceMeters: dist,
            label: 'Narożnik do narożnika',
            sourcePoint: { ...vMove },
            targetPoint: { ...vRef },
            referenceEdge: refEdge,
          };
        }
      }
    }
  }

  if (bestV2V) {
    return bestV2V;
  }

  // -------------------------------------------------------------------------
  // 2. Punkt do Krawędzi (Vertex-to-Edge)
  // -------------------------------------------------------------------------
  let bestV2E: BuildingDragSnapResult | null = null;
  let minV2EDist = distanceThresholdMeters;

  for (const vMove of movingVertices) {
    for (const refEdge of nearbyRefBuffer) {
      const proj = projectPointToLine(vMove, refEdge);
      if (proj.isOnSegment && proj.distance <= minV2EDist) {
        minV2EDist = proj.distance;
        bestV2E = {
          relation: 'vertex_to_edge',
          deltaX: proj.projectedPoint.x - vMove.x,
          deltaY: proj.projectedPoint.y - vMove.y,
          distanceMeters: proj.distance,
          label: 'Punkt do ściany',
          sourcePoint: { ...vMove },
          targetPoint: proj.projectedPoint,
          referenceEdge: refEdge,
        };
      }
    }
  }

  if (bestV2E) {
    return bestV2E;
  }

  // -------------------------------------------------------------------------
  // 3. Krawędź przesuwanego obiektu do Punktu referencyjnego (Edge-to-Vertex)
  // Wykorzystuje standardowe rzutowanie analityczne z lineBufferEngine
  // -------------------------------------------------------------------------
  const n = movingVertices.length;
  let bestE2V: BuildingDragSnapResult | null = null;
  let minE2VDist = distanceThresholdMeters;

  for (let i = 0; i < n; i++) {
    const p1 = movingVertices[i];
    const p2 = movingVertices[(i + 1) % n];
    const movingEdge = createCachedLineEquation(`moving-${i}`, movingBuildingId, i, p1, p2);

    for (const refEdge of nearbyRefBuffer) {
      for (const vRef of [refEdge.p1, refEdge.p2]) {
        const proj = projectPointToLine(vRef, movingEdge);
        if (proj.isOnSegment && proj.distance <= minE2VDist) {
          minE2VDist = proj.distance;
          bestE2V = {
            relation: 'edge_to_vertex',
            deltaX: vRef.x - proj.projectedPoint.x,
            deltaY: vRef.y - proj.projectedPoint.y,
            distanceMeters: proj.distance,
            label: 'Ściana do punktu',
            sourcePoint: { ...proj.projectedPoint },
            targetPoint: { ...vRef },
            referenceEdge: refEdge,
            movingEdge,
          };
        }
      }
    }
  }

  if (bestE2V) {
    return bestE2V;
  }

  // -------------------------------------------------------------------------
  // 4. Krawędź do Krawędzi / Przedłużenie Kolinearne (Collinear Extension Tracking)
  // -------------------------------------------------------------------------
  let bestCollinear: BuildingDragSnapResult | null = null;
  let minCollinearDist = distanceThresholdMeters;

  for (let i = 0; i < n; i++) {
    const p1 = movingVertices[i];
    const p2 = movingVertices[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const movingAngle = normalizeAnglePi(Math.atan2(dy, dx));

    for (const refEdge of otherBuffer) {
      const angleDiff = angleDiffPi(movingAngle, refEdge.angle);
      if (angleDiff <= angleToleranceRad) {
        const signedDist = refEdge.A * p1.x + refEdge.B * p1.y + refEdge.C;
        const lineDist = Math.abs(signedDist);

        if (lineDist <= minCollinearDist) {
          minCollinearDist = lineDist;

          const t1 = (p1.x - refEdge.p1.x) * refEdge.uX + (p1.y - refEdge.p1.y) * refEdge.uY;
          const t2 = (p2.x - refEdge.p1.x) * refEdge.uX + (p2.y - refEdge.p1.y) * refEdge.uY;
          const isExtension = (t1 < 0 && t2 < 0) || (t1 > refEdge.length && t2 > refEdge.length);

          const guideline = {
            p1: {
              x: refEdge.p1.x - guidelineLengthMeters * refEdge.uX,
              y: refEdge.p1.y - guidelineLengthMeters * refEdge.uY,
            },
            p2: {
              x: refEdge.p2.x + guidelineLengthMeters * refEdge.uX,
              y: refEdge.p2.y + guidelineLengthMeters * refEdge.uY,
            },
          };

          bestCollinear = {
            relation: 'edge_to_edge_collinear',
            deltaX: -signedDist * refEdge.A,
            deltaY: -signedDist * refEdge.B,
            distanceMeters: lineDist,
            label: isExtension ? 'Przedłużenie ściany (Kolinearny)' : 'Wyrównanie ścian (Kolinearny)',
            referenceEdge: refEdge,
            guideline,
            isExtension,
          };
        }
      }
    }
  }

  return bestCollinear;
}
