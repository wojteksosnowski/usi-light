import { Point2D } from '../../types/geometry';
import {
  CachedLineEquation,
  createCachedLineEquation,
  projectPointToLine,
  normalizeAnglePi,
  angleDiffPi,
} from '../../utils/lineBufferEngine';

/**
 * Wykrywa równoległość i kolinearność przy transformacji krawędzi lub obiektu
 */
export function evaluateCollinearAndParallelLock(
  draggedEdge: CachedLineEquation,
  referenceBuffer: CachedLineEquation[],
  angleToleranceRad = (0.5 * Math.PI) / 180,
  collinearDistThreshold = 0.25
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
  | 'vertex_to_midpoint'
  | 'midpoint_to_vertex'
  | 'midpoint_to_midpoint'
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
  secondReferenceEdge?: CachedLineEquation;
  movingEdge?: CachedLineEquation;
  guideline?: { p1: Point2D; p2: Point2D };
  secondGuideline?: { p1: Point2D; p2: Point2D };
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

  const n = movingVertices.length;
  if (n < 2) return null;

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
  const pad = distanceThresholdMeters * 2 + 0.5;
  const aabb = {
    minX: bMinX - pad,
    maxX: bMaxX + pad,
    minY: bMinY - pad,
    maxY: bMaxY + pad,
  };

  const nearbyRefBuffer = otherBuffer.filter((e) => {
    const eMinX = Math.min(e.p1.x, e.p2.x);
    const eMaxX = Math.max(e.p1.x, e.p2.x);
    const eMinY = Math.min(e.p1.y, e.p2.y);
    const eMaxY = Math.max(e.p1.y, e.p2.y);
    return eMaxX >= aabb.minX && eMinX <= aabb.maxX && eMaxY >= aabb.minY && eMinY <= aabb.maxY;
  });

  // 1. Punkt do Punktu (Vertex-to-Vertex / Corner Lock)
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

  // 2. Krawędź do Krawędzi - zbieranie dopasowań kolinearnych i sprawdzenie Dual-Collinear Lock (2D)
  interface CollinearMatch {
    movingEdgeIdx: number;
    refEdge: CachedLineEquation;
    signedDist: number;
    lineDist: number;
    isExtension: boolean;
    guideline: { p1: Point2D; p2: Point2D };
  }

  const collinearMatches: CollinearMatch[] = [];

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

        if (lineDist <= distanceThresholdMeters) {
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

          collinearMatches.push({
            movingEdgeIdx: i,
            refEdge,
            signedDist,
            lineDist,
            isExtension,
            guideline,
          });
        }
      }
    }
  }

  // 2a. Sprawdzenie Dual-Collinear Lock (pełne 2D dociągnięcie narożnikowe do 2 przecinających się osi)
  if (collinearMatches.length >= 2) {
    for (let i = 0; i < collinearMatches.length; i++) {
      for (let j = i + 1; j < collinearMatches.length; j++) {
        const m1 = collinearMatches[i];
        const m2 = collinearMatches[j];
        const aDiff = angleDiffPi(m1.refEdge.angle, m2.refEdge.angle);
        if (aDiff > (15 * Math.PI) / 180) {
          const det = m1.refEdge.A * m2.refEdge.B - m2.refEdge.A * m1.refEdge.B;
          if (Math.abs(det) > 0.1) {
            const deltaX = (m2.signedDist * m1.refEdge.B - m1.signedDist * m2.refEdge.B) / det;
            const deltaY = (m1.signedDist * m2.refEdge.A - m2.signedDist * m1.refEdge.A) / det;
            const totalDist = Math.hypot(deltaX, deltaY);
            if (totalDist <= distanceThresholdMeters * 1.5) {
              return {
                relation: 'edge_to_edge_collinear',
                deltaX,
                deltaY,
                distanceMeters: totalDist,
                label: 'Podwójne wyrównanie ścian (Przecięcie osi)',
                referenceEdge: m1.refEdge,
                secondReferenceEdge: m2.refEdge,
                guideline: m1.guideline,
                secondGuideline: m2.guideline,
                isExtension: m1.isExtension || m2.isExtension,
              };
            }
          }
        }
      }
    }
  }

  // 3. Punkt do Środka Krawędzi (Vertex-to-Midpoint)
  let bestV2M: BuildingDragSnapResult | null = null;
  let minV2MDist = distanceThresholdMeters;

  for (const vMove of movingVertices) {
    for (const refEdge of nearbyRefBuffer) {
      const midRef = { x: (refEdge.p1.x + refEdge.p2.x) / 2, y: (refEdge.p1.y + refEdge.p2.y) / 2 };
      const dist = Math.hypot(vMove.x - midRef.x, vMove.y - midRef.y);
      if (dist <= minV2MDist) {
        minV2MDist = dist;
        bestV2M = {
          relation: 'vertex_to_midpoint',
          deltaX: midRef.x - vMove.x,
          deltaY: midRef.y - vMove.y,
          distanceMeters: dist,
          label: 'Narożnik do środka ściany',
          sourcePoint: { ...vMove },
          targetPoint: midRef,
          referenceEdge: refEdge,
        };
      }
    }
  }

  if (bestV2M) {
    return bestV2M;
  }

  // 4. Środek Krawędzi do Punktu (Midpoint-to-Vertex)
  let bestM2V: BuildingDragSnapResult | null = null;
  let minM2VDist = distanceThresholdMeters;

  for (let i = 0; i < n; i++) {
    const p1 = movingVertices[i];
    const p2 = movingVertices[(i + 1) % n];
    const midMove = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    for (const refEdge of nearbyRefBuffer) {
      for (const vRef of [refEdge.p1, refEdge.p2]) {
        const dist = Math.hypot(midMove.x - vRef.x, midMove.y - vRef.y);
        if (dist <= minM2VDist) {
          minM2VDist = dist;
          bestM2V = {
            relation: 'midpoint_to_vertex',
            deltaX: vRef.x - midMove.x,
            deltaY: vRef.y - midMove.y,
            distanceMeters: dist,
            label: 'Środek ściany do narożnika',
            sourcePoint: midMove,
            targetPoint: { ...vRef },
            referenceEdge: refEdge,
          };
        }
      }
    }
  }

  if (bestM2V) {
    return bestM2V;
  }

  // 5. Środek Krawędzi do Środka Krawędzi (Midpoint-to-Midpoint)
  let bestM2M: BuildingDragSnapResult | null = null;
  let minM2MDist = distanceThresholdMeters;

  for (let i = 0; i < n; i++) {
    const p1 = movingVertices[i];
    const p2 = movingVertices[(i + 1) % n];
    const midMove = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    for (const refEdge of nearbyRefBuffer) {
      const midRef = { x: (refEdge.p1.x + refEdge.p2.x) / 2, y: (refEdge.p1.y + refEdge.p2.y) / 2 };
      const dist = Math.hypot(midMove.x - midRef.x, midMove.y - midRef.y);
      if (dist <= minM2MDist) {
        minM2MDist = dist;
        bestM2M = {
          relation: 'midpoint_to_midpoint',
          deltaX: midRef.x - midMove.x,
          deltaY: midRef.y - midMove.y,
          distanceMeters: dist,
          label: 'Środek ściany do środka ściany',
          sourcePoint: midMove,
          targetPoint: midRef,
          referenceEdge: refEdge,
        };
      }
    }
  }

  if (bestM2M) {
    return bestM2M;
  }

  // 6. Punkt do Krawędzi (Vertex-to-Edge & Vertex-to-Edge Extension)
  let bestV2E: BuildingDragSnapResult | null = null;
  let minV2EDist = distanceThresholdMeters;

  for (const vMove of movingVertices) {
    for (const refEdge of otherBuffer) {
      const proj = projectPointToLine(vMove, refEdge);
      const t = (vMove.x - refEdge.p1.x) * refEdge.uX + (vMove.y - refEdge.p1.y) * refEdge.uY;
      const isExt = !proj.isOnSegment && t >= -guidelineLengthMeters && t <= refEdge.length + guidelineLengthMeters;

      if ((proj.isOnSegment || isExt) && proj.distance <= minV2EDist) {
        minV2EDist = proj.distance;
        bestV2E = {
          relation: 'vertex_to_edge',
          deltaX: proj.projectedPoint.x - vMove.x,
          deltaY: proj.projectedPoint.y - vMove.y,
          distanceMeters: proj.distance,
          label: isExt ? 'Punkt na przedłużeniu ściany' : 'Punkt do ściany',
          sourcePoint: { ...vMove },
          targetPoint: proj.projectedPoint,
          referenceEdge: refEdge,
          guideline: isExt
            ? {
                p1: {
                  x: refEdge.p1.x - guidelineLengthMeters * refEdge.uX,
                  y: refEdge.p1.y - guidelineLengthMeters * refEdge.uY,
                },
                p2: {
                  x: refEdge.p2.x + guidelineLengthMeters * refEdge.uX,
                  y: refEdge.p2.y + guidelineLengthMeters * refEdge.uY,
                },
              }
            : undefined,
          isExtension: isExt,
        };
      }
    }
  }

  if (bestV2E) {
    return bestV2E;
  }

  // 7. Krawędź przesuwanego obiektu do Punktu referencyjnego (Edge-to-Vertex & Edge Extension)
  let bestE2V: BuildingDragSnapResult | null = null;
  let minE2VDist = distanceThresholdMeters;

  for (let i = 0; i < n; i++) {
    const p1 = movingVertices[i];
    const p2 = movingVertices[(i + 1) % n];
    const movingEdge = createCachedLineEquation(`moving-${i}`, movingBuildingId, i, p1, p2);

    for (const refEdge of otherBuffer) {
      const midRef = { x: (refEdge.p1.x + refEdge.p2.x) / 2, y: (refEdge.p1.y + refEdge.p2.y) / 2 };
      for (const vRef of [refEdge.p1, refEdge.p2, midRef]) {
        const proj = projectPointToLine(vRef, movingEdge);
        const t = (vRef.x - movingEdge.p1.x) * movingEdge.uX + (vRef.y - movingEdge.p1.y) * movingEdge.uY;
        const isExt = !proj.isOnSegment && t >= -guidelineLengthMeters && t <= movingEdge.length + guidelineLengthMeters;
        const isMid = vRef === midRef;

        if ((proj.isOnSegment || isExt) && proj.distance <= minE2VDist) {
          minE2VDist = proj.distance;
          bestE2V = {
            relation: 'edge_to_vertex',
            deltaX: vRef.x - proj.projectedPoint.x,
            deltaY: vRef.y - proj.projectedPoint.y,
            distanceMeters: proj.distance,
            label: isExt
              ? (isMid ? 'Przedłużenie ściany do środka ściany' : 'Przedłużenie ściany do punktu')
              : (isMid ? 'Ściana do środka ściany' : 'Ściana do punktu'),
            sourcePoint: { ...proj.projectedPoint },
            targetPoint: { ...vRef },
            referenceEdge: refEdge,
            movingEdge,
            guideline: isExt
              ? {
                  p1: {
                    x: movingEdge.p1.x - guidelineLengthMeters * movingEdge.uX,
                    y: movingEdge.p1.y - guidelineLengthMeters * movingEdge.uY,
                  },
                  p2: {
                    x: movingEdge.p2.x + guidelineLengthMeters * movingEdge.uX,
                    y: movingEdge.p2.y + guidelineLengthMeters * movingEdge.uY,
                  },
                }
              : undefined,
            isExtension: isExt,
          };
        }
      }
    }
  }

  if (bestE2V) {
    return bestE2V;
  }

  // 8. Pojedyncze wyrównanie kolinearne (Single Collinear Snap)
  let bestCollinear: BuildingDragSnapResult | null = null;
  let minCollinearDist = distanceThresholdMeters;

  for (const m of collinearMatches) {
    if (m.lineDist <= minCollinearDist) {
      minCollinearDist = m.lineDist;
      bestCollinear = {
        relation: 'edge_to_edge_collinear',
        deltaX: -m.signedDist * m.refEdge.A,
        deltaY: -m.signedDist * m.refEdge.B,
        distanceMeters: m.lineDist,
        label: m.isExtension ? 'Przedłużenie ściany (Kolinearny)' : 'Wyrównanie ścian (Kolinearny)',
        referenceEdge: m.refEdge,
        guideline: m.guideline,
        isExtension: m.isExtension,
      };
    }
  }

  return bestCollinear;

  return bestCollinear;
}

export interface EvaluateEdgeDragSnapOptions {
  edgeP1: Point2D;
  edgeP2: Point2D;
  normal: { x: number; y: number };
  buildingId: string;
  edgeIndex: number;
  initialVertices?: Point2D[];
  initialSweepPath?: Point2D[];
  isSweep?: boolean;
  tentativeDelta: { dx: number; dy: number };
  referenceBuffer: CachedLineEquation[];
  distanceThresholdMeters?: number;
  angleToleranceRad?: number;
  guidelineLengthMeters?: number;
  previousSnap?: EdgeDragSnapResult | null;
}

export interface EdgeDragSnapResult {
  deltaOffset: { dx: number; dy: number };
  relation: BuildingDragSnapRelation;
  distanceMeters: number;
  label: string;
  targetPoint?: Point2D;
  referenceEdge?: CachedLineEquation;
  guideline?: { p1: Point2D; p2: Point2D };
  isExtension?: boolean;
}

/**
 * Calculates snapping for a single dragged edge of a polygon or sweep path along its normal axis:
 * 1. Collinear snap with parallel edges in the scene (referenceBuffer)
 * 2. Corner intersection snap with guidelines of non-parallel edges in the scene
 * 3. Corner snap to external vertices and midpoints
 * 4. Edge line passing through external vertices / midpoints (including extension guidelines)
 */
export function evaluateEdgeDragSnap(
  options: EvaluateEdgeDragSnapOptions
): EdgeDragSnapResult | null {
  const {
    edgeP1,
    edgeP2,
    normal,
    buildingId,
    edgeIndex,
    initialVertices,
    initialSweepPath,
    isSweep = false,
    tentativeDelta,
    referenceBuffer,
    distanceThresholdMeters = 0.35,
    angleToleranceRad = (1.5 * Math.PI) / 180,
    guidelineLengthMeters = 100,
    previousSnap,
  } = options;

  const dx = edgeP2.x - edgeP1.x;
  const dy = edgeP2.y - edgeP1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;

  // Unit vector of edge
  const uX = dx / len;
  const uY = dy / len;

  // Normal displacement requested by tentative mouse delta
  const rawD = tentativeDelta.dx * normal.x + tentativeDelta.dy * normal.y;

  // Motion direction of endpoints during polygon / polyline offset
  let vDir1 = { x: normal.x, y: normal.y };
  let vDir2 = { x: normal.x, y: normal.y };

  if (isSweep && initialSweepPath && initialSweepPath.length >= 2) {
    if (edgeIndex > 0) {
      const v0 = initialSweepPath[edgeIndex - 1];
      const dPrev = { x: edgeP1.x - v0.x, y: edgeP1.y - v0.y };
      const denomPrev = dPrev.x * normal.x + dPrev.y * normal.y;
      if (Math.abs(denomPrev) > 1e-4) {
        vDir1 = { x: dPrev.x / denomPrev, y: dPrev.y / denomPrev };
      }
    }
    if (edgeIndex < initialSweepPath.length - 2) {
      const v3 = initialSweepPath[edgeIndex + 2];
      const dNext = { x: v3.x - edgeP2.x, y: v3.y - edgeP2.y };
      const denomNext = dNext.x * normal.x + dNext.y * normal.y;
      if (Math.abs(denomNext) > 1e-4) {
        vDir2 = { x: dNext.x / denomNext, y: dNext.y / denomNext };
      }
    }
  } else if (initialVertices && initialVertices.length >= 3) {
    const n = initialVertices.length;
    const prevIdx = (edgeIndex - 1 + n) % n;
    const v0 = initialVertices[prevIdx];
    const dPrev = { x: edgeP1.x - v0.x, y: edgeP1.y - v0.y };
    const denomPrev = dPrev.x * normal.x + dPrev.y * normal.y;
    if (Math.abs(denomPrev) > 1e-4) {
      vDir1 = { x: dPrev.x / denomPrev, y: dPrev.y / denomPrev };
    }

    const nextIdx = (edgeIndex + 2) % n;
    const v3 = initialVertices[nextIdx];
    const dNext = { x: v3.x - edgeP2.x, y: v3.y - edgeP2.y };
    const denomNext = dNext.x * normal.x + dNext.y * normal.y;
    if (Math.abs(denomNext) > 1e-4) {
      vDir2 = { x: dNext.x / denomNext, y: dNext.y / denomNext };
    }
  }

  // Tentative points of shifted edge
  const tentP1 = { x: edgeP1.x + rawD * vDir1.x, y: edgeP1.y + rawD * vDir1.y };
  const tentP2 = { x: edgeP2.x + rawD * vDir2.x, y: edgeP2.y + rawD * vDir2.y };

  const otherBuffer = referenceBuffer.filter((e) => e.objectId !== buildingId);
  if (otherBuffer.length === 0) return null;

  const edgeAngle = normalizeAnglePi(Math.atan2(dy, dx));

  let bestSnap: EdgeDragSnapResult | null = null;
  let minDiff = distanceThresholdMeters;

  // 1. Collinear snap with other edges (parallel / extension alignment)
  for (const refEdge of otherBuffer) {
    const angleDiff = angleDiffPi(edgeAngle, refEdge.angle);
    if (angleDiff <= angleToleranceRad) {
      const signedDist = refEdge.A * tentP1.x + refEdge.B * tentP1.y + refEdge.C;
      let absDist = Math.abs(signedDist);

      const isPrev = previousSnap && previousSnap.referenceEdge?.id === refEdge.id;
      const maxAllowed = isPrev ? distanceThresholdMeters * 1.5 : distanceThresholdMeters;
      if (isPrev) {
        absDist = Math.max(0, absDist - distanceThresholdMeters * 0.4);
      }

      if (absDist <= minDiff && absDist <= maxAllowed) {
        const denom = refEdge.A * normal.x + refEdge.B * normal.y;
        if (Math.abs(denom) > 1e-4) {
          const originalSignedDist = refEdge.A * edgeP1.x + refEdge.B * edgeP1.y + refEdge.C;
          const targetD = -originalSignedDist / denom;

          const t1 = (tentP1.x - refEdge.p1.x) * refEdge.uX + (tentP1.y - refEdge.p1.y) * refEdge.uY;
          const t2 = (tentP2.x - refEdge.p1.x) * refEdge.uX + (tentP2.y - refEdge.p1.y) * refEdge.uY;
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

          minDiff = absDist;
          bestSnap = {
            deltaOffset: { dx: targetD * normal.x, dy: targetD * normal.y },
            relation: 'edge_to_edge_collinear',
            distanceMeters: Math.abs(signedDist),
            label: isExtension ? 'Przedłużenie ściany (Kolinearny)' : 'Wyrównanie ścian (Kolinearny)',
            referenceEdge: refEdge,
            guideline,
            isExtension,
          };
        }
      }
    }
  }

  if (bestSnap) {
    return bestSnap;
  }

  // 2. Corner intersection snap with guidelines of non-parallel edges (Non-parallel guideline extension)
  for (const refEdge of otherBuffer) {
    const angleDiff = angleDiffPi(edgeAngle, refEdge.angle);
    if (angleDiff > angleToleranceRad) {
      const isPrev = previousSnap && previousSnap.referenceEdge?.id === refEdge.id;
      const maxAllowed = isPrev ? distanceThresholdMeters * 1.5 : distanceThresholdMeters;

      // Test Corner 1
      const denom1 = refEdge.A * vDir1.x + refEdge.B * vDir1.y;
      if (Math.abs(denom1) > 1e-4) {
        const targetD1 = -(refEdge.A * edgeP1.x + refEdge.B * edgeP1.y + refEdge.C) / denom1;
        let diff1 = Math.abs(targetD1 - rawD);
        if (isPrev) diff1 = Math.max(0, diff1 - distanceThresholdMeters * 0.3);

        if (diff1 <= minDiff && diff1 <= maxAllowed) {
          const pt1 = { x: edgeP1.x + targetD1 * vDir1.x, y: edgeP1.y + targetD1 * vDir1.y };
          const t1 = (pt1.x - refEdge.p1.x) * refEdge.uX + (pt1.y - refEdge.p1.y) * refEdge.uY;
          if (t1 >= -guidelineLengthMeters && t1 <= refEdge.length + guidelineLengthMeters) {
            const isExt = t1 < 0 || t1 > refEdge.length;
            minDiff = diff1;
            bestSnap = {
              deltaOffset: { dx: targetD1 * normal.x, dy: targetD1 * normal.y },
              relation: 'vertex_to_edge',
              distanceMeters: Math.abs(targetD1 - rawD),
              label: isExt ? 'Narożnik na przedłużeniu ściany' : 'Narożnik do ściany',
              targetPoint: pt1,
              referenceEdge: refEdge,
              guideline: {
                p1: {
                  x: refEdge.p1.x - guidelineLengthMeters * refEdge.uX,
                  y: refEdge.p1.y - guidelineLengthMeters * refEdge.uY,
                },
                p2: {
                  x: refEdge.p2.x + guidelineLengthMeters * refEdge.uX,
                  y: refEdge.p2.y + guidelineLengthMeters * refEdge.uY,
                },
              },
              isExtension: isExt,
            };
          }
        }
      }

      // Test Corner 2
      const denom2 = refEdge.A * vDir2.x + refEdge.B * vDir2.y;
      if (Math.abs(denom2) > 1e-4) {
        const targetD2 = -(refEdge.A * edgeP2.x + refEdge.B * edgeP2.y + refEdge.C) / denom2;
        let diff2 = Math.abs(targetD2 - rawD);
        if (isPrev) diff2 = Math.max(0, diff2 - distanceThresholdMeters * 0.3);

        if (diff2 <= minDiff && diff2 <= maxAllowed) {
          const pt2 = { x: edgeP2.x + targetD2 * vDir2.x, y: edgeP2.y + targetD2 * vDir2.y };
          const t2 = (pt2.x - refEdge.p1.x) * refEdge.uX + (pt2.y - refEdge.p1.y) * refEdge.uY;
          if (t2 >= -guidelineLengthMeters && t2 <= refEdge.length + guidelineLengthMeters) {
            const isExt = t2 < 0 || t2 > refEdge.length;
            minDiff = diff2;
            bestSnap = {
              deltaOffset: { dx: targetD2 * normal.x, dy: targetD2 * normal.y },
              relation: 'vertex_to_edge',
              distanceMeters: Math.abs(targetD2 - rawD),
              label: isExt ? 'Narożnik na przedłużeniu ściany' : 'Narożnik do ściany',
              targetPoint: pt2,
              referenceEdge: refEdge,
              guideline: {
                p1: {
                  x: refEdge.p1.x - guidelineLengthMeters * refEdge.uX,
                  y: refEdge.p1.y - guidelineLengthMeters * refEdge.uY,
                },
                p2: {
                  x: refEdge.p2.x + guidelineLengthMeters * refEdge.uX,
                  y: refEdge.p2.y + guidelineLengthMeters * refEdge.uY,
                },
              },
              isExtension: isExt,
            };
          }
        }
      }
    }
  }

  if (bestSnap) {
    return bestSnap;
  }

  // 3. Corner snap to external vertices and midpoints
  for (const refEdge of otherBuffer) {
    const isPrev = previousSnap && previousSnap.referenceEdge?.id === refEdge.id;
    const maxAllowed = isPrev ? distanceThresholdMeters * 1.5 : distanceThresholdMeters;
    const midRef = { x: (refEdge.p1.x + refEdge.p2.x) / 2, y: (refEdge.p1.y + refEdge.p2.y) / 2 };

    for (const vRef of [refEdge.p1, refEdge.p2, midRef]) {
      const isMid = vRef === midRef;

      // Check Corner 1
      const vSq1 = vDir1.x * vDir1.x + vDir1.y * vDir1.y;
      if (vSq1 > 1e-6) {
        const targetD1 = ((vRef.x - edgeP1.x) * vDir1.x + (vRef.y - edgeP1.y) * vDir1.y) / vSq1;
        const pt1 = { x: edgeP1.x + targetD1 * vDir1.x, y: edgeP1.y + targetD1 * vDir1.y };
        const distPt = Math.hypot(pt1.x - vRef.x, pt1.y - vRef.y);
        let diff1 = Math.abs(targetD1 - rawD);
        if (isPrev) diff1 = Math.max(0, diff1 - distanceThresholdMeters * 0.3);

        if (distPt <= distanceThresholdMeters && diff1 <= minDiff && diff1 <= maxAllowed) {
          minDiff = diff1;
          bestSnap = {
            deltaOffset: { dx: targetD1 * normal.x, dy: targetD1 * normal.y },
            relation: isMid ? 'vertex_to_midpoint' : 'vertex_to_vertex',
            distanceMeters: Math.abs(targetD1 - rawD),
            label: isMid ? 'Narożnik do środka ściany' : 'Narożnik do narożnika',
            targetPoint: { ...vRef },
            referenceEdge: refEdge,
          };
        }
      }

      // Check Corner 2
      const vSq2 = vDir2.x * vDir2.x + vDir2.y * vDir2.y;
      if (vSq2 > 1e-6) {
        const targetD2 = ((vRef.x - edgeP2.x) * vDir2.x + (vRef.y - edgeP2.y) * vDir2.y) / vSq2;
        const pt2 = { x: edgeP2.x + targetD2 * vDir2.x, y: edgeP2.y + targetD2 * vDir2.y };
        const distPt = Math.hypot(pt2.x - vRef.x, pt2.y - vRef.y);
        let diff2 = Math.abs(targetD2 - rawD);
        if (isPrev) diff2 = Math.max(0, diff2 - distanceThresholdMeters * 0.3);

        if (distPt <= distanceThresholdMeters && diff2 <= minDiff && diff2 <= maxAllowed) {
          minDiff = diff2;
          bestSnap = {
            deltaOffset: { dx: targetD2 * normal.x, dy: targetD2 * normal.y },
            relation: isMid ? 'vertex_to_midpoint' : 'vertex_to_vertex',
            distanceMeters: Math.abs(targetD2 - rawD),
            label: isMid ? 'Narożnik do środka ściany' : 'Narożnik do narożnika',
            targetPoint: { ...vRef },
            referenceEdge: refEdge,
          };
        }
      }
    }
  }

  if (bestSnap) {
    return bestSnap;
  }

  // 4. Snap to vertices / midpoints of other buildings (Edge line passing through corner / midpoint)
  for (const refEdge of otherBuffer) {
    const isPrev = previousSnap && previousSnap.referenceEdge?.id === refEdge.id;
    const maxAllowed = isPrev ? distanceThresholdMeters * 1.5 : distanceThresholdMeters;
    const midRef = { x: (refEdge.p1.x + refEdge.p2.x) / 2, y: (refEdge.p1.y + refEdge.p2.y) / 2 };

    for (const vRef of [refEdge.p1, refEdge.p2, midRef]) {
      const isMid = vRef === midRef;
      const num = (vRef.x - edgeP1.x) * (-uY) + (vRef.y - edgeP1.y) * uX;
      const den = normal.x * (-uY) + normal.y * uX;
      if (Math.abs(den) > 1e-4) {
        const targetD = num / den;
        let diff = Math.abs(targetD - rawD);
        if (isPrev) diff = Math.max(0, diff - distanceThresholdMeters * 0.3);

        if (diff <= minDiff && diff <= maxAllowed) {
          const tentP1AtTarget = { x: edgeP1.x + targetD * normal.x, y: edgeP1.y + targetD * normal.y };
          const t = (vRef.x - tentP1AtTarget.x) * uX + (vRef.y - tentP1AtTarget.y) * uY;
          const isExt = t < 0 || t > len;

          minDiff = diff;
          bestSnap = {
            deltaOffset: { dx: targetD * normal.x, dy: targetD * normal.y },
            relation: 'edge_to_vertex',
            distanceMeters: Math.abs(targetD - rawD),
            label: isExt
              ? (isMid ? 'Przedłużenie ściany do środka ściany' : 'Przedłużenie ściany do narożnika')
              : (isMid ? 'Ściana do środka ściany' : 'Ściana do narożnika'),
            targetPoint: { ...vRef },
            referenceEdge: refEdge,
            guideline: {
              p1: { x: vRef.x - guidelineLengthMeters * uX, y: vRef.y - guidelineLengthMeters * uY },
              p2: { x: vRef.x + guidelineLengthMeters * uX, y: vRef.y + guidelineLengthMeters * uY },
            },
            isExtension: isExt,
          };
        }
      }
    }
  }

  return bestSnap;
}

