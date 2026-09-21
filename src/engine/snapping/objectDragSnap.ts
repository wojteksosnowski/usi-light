import { Point2D } from '../../types/geometry';
import {
  CachedLineEquation,
  createCachedLineEquation,
  projectPointToLine,
  normalizeAnglePi,
  angleDiffPi,
} from '../../utils/lineBufferEngine';
import { isIdExcluded } from './strategies/snapExclusionUtils';
import { SpatialLineIndex } from './SpatialLineIndex';

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
  excludeBuildingIds?: string[];
  referenceBuffer: CachedLineEquation[];
  distanceThresholdMeters?: number;
  angleToleranceRad?: number;
  guidelineLengthMeters?: number;
  dragAnchorVertex?: Point2D;
  viewportBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  /** Opcjonalny indeks przestrzenny (rbush) nad referenceBuffer — gdy podany, zastępuje ręczny
   *  O(n) skan AABB (linia 130-164) zapytaniem queryBBox, przyspieszając duże sceny. Brak
   *  wpływu na wynik (te same kryteria filtrowania są stosowane po zapytaniu). */
  spatialIndex?: SpatialLineIndex;
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
    excludeBuildingIds,
    referenceBuffer,
    distanceThresholdMeters = 0.35,
    angleToleranceRad = (0.8 * Math.PI) / 180,
    guidelineLengthMeters = 100,
    viewportBounds,
    spatialIndex,
  } = options;

  const n = movingVertices.length;
  if (n < 2) return null;

  const excludedSet = new Set<string>(excludeBuildingIds || []);
  excludedSet.add(movingBuildingId);

  const isExcludedEdge = (e: CachedLineEquation) => isIdExcluded(e.objectId, excludedSet);
  const withinViewport = (e: CachedLineEquation) => {
    if (!viewportBounds) return true;
    const eMinX = Math.min(e.p1.x, e.p2.x);
    const eMaxX = Math.max(e.p1.x, e.p2.x);
    const eMinY = Math.min(e.p1.y, e.p2.y);
    const eMaxY = Math.max(e.p1.y, e.p2.y);
    return eMaxX >= viewportBounds.minX && eMinX <= viewportBounds.maxX && eMaxY >= viewportBounds.minY && eMinY <= viewportBounds.maxY;
  };

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

  // otherBuffer: pełny zbiór kandydatów (wykluczenia + viewport), używany tam gdzie odległość
  // do krawędzi liczona jest wzdłuż nośnika prostej (collinear lock, linia ~233) i realna
  // odległość przestrzenna segmentu może przekraczać AABB przemieszczanej bryły.
  const otherBuffer = referenceBuffer.filter((e) => !isExcludedEdge(e) && withinViewport(e));
  if (otherBuffer.length === 0) return null;

  let nearbyRefBuffer: CachedLineEquation[];
  if (spatialIndex) {
    // Zapytanie przestrzenne (rbush) zamiast pełnego O(n) skanu referenceBuffer — patrz
    // EvaluateBuildingDragSnapOptions.spatialIndex. Kryteria wykluczania/viewportu identyczne
    // jak w ścieżce fallback poniżej.
    const queried = spatialIndex.queryBBox(aabb.minX, aabb.minY, aabb.maxX, aabb.maxY);
    nearbyRefBuffer = queried.filter((e) => !isExcludedEdge(e) && withinViewport(e));
  } else {
    nearbyRefBuffer = otherBuffer.filter((e) => {
      const eMinX = Math.min(e.p1.x, e.p2.x);
      const eMaxX = Math.max(e.p1.x, e.p2.x);
      const eMinY = Math.min(e.p1.y, e.p2.y);
      const eMaxY = Math.max(e.p1.y, e.p2.y);
      return eMaxX >= aabb.minX && eMinX <= aabb.maxX && eMaxY >= aabb.minY && eMinY <= aabb.maxY;
    });
  }

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

  // 6. Punkt do Krawędzi (Vertex-to-Edge)
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

  // 7. Krawędź przesuwanego obiektu do Punktu referencyjnego (Edge-to-Vertex)
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
}

export interface EvaluateEdgeDragSnapOptions {
  edgeP1: Point2D;
  edgeP2: Point2D;
  normal: { x: number; y: number };
  buildingId: string;
  excludeBuildingIds?: string[];
  edgeIndex: number;
  tentativeDelta: { dx: number; dy: number };
  referenceBuffer: CachedLineEquation[];
  distanceThresholdMeters?: number;
  angleToleranceRad?: number;
  guidelineLengthMeters?: number;
  previousSnap?: EdgeDragSnapResult | null;
  viewportBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  /** Opcjonalny indeks przestrzenny (rbush). Ponieważ dopasowanie kolinearne/wierzchołkowe
   *  jest tu celowo nieograniczone przestrzennie wzdłuż nośnika prostej (np. odległy narożnik
   *  leżący dokładnie na tej samej linii), zapytanie ogranicza się do promienia
   *  `guidelineLengthMeters` wokół przesuwanej krawędzi — tego samego zasięgu, w jakim i tak
   *  rysowana jest linia prowadząca — a nie do ciasnego `distanceThresholdMeters`. */
  spatialIndex?: SpatialLineIndex;
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
 * 1. Collinear snap with other edges in the scene (referenceBuffer)
 * 2. Vertex alignment snap (edge passing through vertices of other buildings)
 */
export function evaluateEdgeDragSnap(
  options: EvaluateEdgeDragSnapOptions
): EdgeDragSnapResult | null {
  const {
    edgeP1,
    edgeP2,
    normal,
    buildingId,
    excludeBuildingIds,
    edgeIndex,
    tentativeDelta,
    referenceBuffer,
    distanceThresholdMeters = 0.35,
    angleToleranceRad = (1.5 * Math.PI) / 180,
    guidelineLengthMeters = 100,
    previousSnap,
    viewportBounds,
    spatialIndex,
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

  // Tentative points of shifted edge
  const tentP1 = { x: edgeP1.x + rawD * normal.x, y: edgeP1.y + rawD * normal.y };
  const tentP2 = { x: edgeP2.x + rawD * normal.x, y: edgeP2.y + rawD * normal.y };

  const excludedSet = new Set<string>(excludeBuildingIds || []);
  excludedSet.add(buildingId);

  const isExcludedEdge = (e: CachedLineEquation) => isIdExcluded(e.objectId, excludedSet);
  const withinViewport = (e: CachedLineEquation) => {
    if (!viewportBounds) return true;
    const eMinX = Math.min(e.p1.x, e.p2.x);
    const eMaxX = Math.max(e.p1.x, e.p2.x);
    const eMinY = Math.min(e.p1.y, e.p2.y);
    const eMaxY = Math.max(e.p1.y, e.p2.y);
    return eMaxX >= viewportBounds.minX && eMinX <= viewportBounds.maxX && eMaxY >= viewportBounds.minY && eMinY <= viewportBounds.maxY;
  };

  let otherBuffer: CachedLineEquation[];
  if (spatialIndex) {
    const pad = guidelineLengthMeters;
    const minX = Math.min(edgeP1.x, edgeP2.x) - pad;
    const maxX = Math.max(edgeP1.x, edgeP2.x) + pad;
    const minY = Math.min(edgeP1.y, edgeP2.y) - pad;
    const maxY = Math.max(edgeP1.y, edgeP2.y) + pad;
    const queried = spatialIndex.queryBBox(minX, minY, maxX, maxY);
    otherBuffer = queried.filter((e) => !isExcludedEdge(e) && withinViewport(e));
  } else {
    otherBuffer = referenceBuffer.filter((e) => !isExcludedEdge(e) && withinViewport(e));
  }
  if (otherBuffer.length === 0) return null;

  const edgeAngle = normalizeAnglePi(Math.atan2(dy, dx));

  let bestSnap: EdgeDragSnapResult | null = null;
  let minDiff = distanceThresholdMeters;

  // 1. Collinear snap with other edges (parallel / extension alignment)
  for (const refEdge of otherBuffer) {
    const angleDiff = angleDiffPi(edgeAngle, refEdge.angle);
    if (angleDiff <= angleToleranceRad) {
      // Distance from tentative edge line to refEdge line
      // refEdge equation: refEdge.A * x + refEdge.B * y + refEdge.C = 0
      const signedDist = refEdge.A * tentP1.x + refEdge.B * tentP1.y + refEdge.C;
      let absDist = Math.abs(signedDist);

      const isPrev = previousSnap && previousSnap.referenceEdge?.id === refEdge.id;
      const maxAllowed = isPrev ? distanceThresholdMeters * 1.5 : distanceThresholdMeters;
      if (isPrev) {
        absDist = Math.max(0, absDist - distanceThresholdMeters * 0.4);
      }

      if (absDist <= minDiff && absDist <= maxAllowed) {
        // Project onto normal to find required change in d:
        // We want refEdge.A * (edgeP1.x + targetD * normal.x) + refEdge.B * (edgeP1.y + targetD * normal.y) + refEdge.C = 0
        const denom = refEdge.A * normal.x + refEdge.B * normal.y;
        if (Math.abs(denom) > 1e-4) {
          const originalSignedDist = refEdge.A * edgeP1.x + refEdge.B * edgeP1.y + refEdge.C;
          const targetD = -originalSignedDist / denom;
          const correctionD = targetD - rawD;

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

  // 2. Snap to vertices of other buildings (Edge line passing through corner / midpoint of other building)
  for (const refEdge of otherBuffer) {
    for (const vRef of [refEdge.p1, refEdge.p2]) {
      // Distance from vRef to tentative line through tentP1 with direction u = (uX, uY)
      // Normal to edge line is (-uY, uX)
      const distToLine = Math.abs((vRef.x - tentP1.x) * (-uY) + (vRef.y - tentP1.y) * uX);
      if (distToLine <= minDiff) {
        // Find targetD such that (vRef - (edgeP1 + targetD * normal)) . (-uY, uX) = 0
        // (vRef.x - edgeP1.x - targetD * normal.x) * (-uY) + (vRef.y - edgeP1.y - targetD * normal.y) * uX = 0
        const num = (vRef.x - edgeP1.x) * (-uY) + (vRef.y - edgeP1.y) * uX;
        const den = normal.x * (-uY) + normal.y * uX;
        if (Math.abs(den) > 1e-4) {
          const targetD = num / den;
          minDiff = distToLine;
          bestSnap = {
            deltaOffset: { dx: targetD * normal.x, dy: targetD * normal.y },
            relation: 'edge_to_vertex',
            distanceMeters: distToLine,
            label: 'Ściana do narożnika',
            targetPoint: { ...vRef },
            referenceEdge: refEdge,
            guideline: {
              p1: { x: vRef.x - guidelineLengthMeters * uX, y: vRef.y - guidelineLengthMeters * uY },
              p2: { x: vRef.x + guidelineLengthMeters * uX, y: vRef.y + guidelineLengthMeters * uY },
            },
          };
        }
      }
    }
  }

  return bestSnap;
}

