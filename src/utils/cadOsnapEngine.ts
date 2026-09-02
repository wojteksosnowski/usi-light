import { Point2D } from '../types/geometry';
import {
  CachedLineEquation,
  distancePointToLine,
  projectPointToLine,
  intersectLines,
  normalizeAnglePi,
  angleDiffPi,
} from './lineBufferEngine';

export interface AnchorPoint {
  id: string;
  point: Point2D;
  sourceType: 'vertex' | 'midpoint' | 'intersection' | 'custom';
  sourceBuildingId?: string;
  sourceEdgeId?: string;
  sourceEdgeAngle?: number; // kąt w radianach [0, PI)
  acquiredAt: number;
}

export interface TrackingRay {
  anchorId: string;
  origin: Point2D;
  type: 'horizontal' | 'vertical' | 'parallel' | 'perpendicular';
  label: string;
  A: number;
  B: number;
  C: number;
  angleRad: number; // Kąt promienia w radianach
  p1: Point2D;
  p2: Point2D;
}

export type OsnapSnapType =
  | 'endpoint'
  | 'otrack_intersection'
  | 'otrack_ray'
  | 'midpoint'
  | 'nearest'
  | 'extension'
  | 'parallel_lock'
  | 'collinear_lock';

export interface OsnapSnapResult {
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  type: OsnapSnapType;
  snappedPoint: Point2D;
  screenDistancePx: number;
  label: string;
  description: string;
  sourcePoint?: Point2D;
  sourceBuildingId?: string;
  sourceEdgeIndex?: number;
  rayLine?: { p1: Point2D; p2: Point2D };
  activeRays?: TrackingRay[];
  intersectingAnchors?: [AnchorPoint, AnchorPoint];
  cachedEdge?: CachedLineEquation;
  parallelAngleDeg?: number;
  collinearDistance?: number;
}

export interface EvaluateOsnapOptions {
  mouseWorld: Point2D;
  lineBuffer: CachedLineEquation[];
  acquiredPoints?: AnchorPoint[];
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  screenSnapThresholdPx?: number;
  rayLengthMeters?: number;
  excludeBuildingId?: string;
  activeSnapTypes?: Partial<Record<OsnapSnapType, boolean>>;
}

/**
 * Generuje wiązkę promieni śledzących (Rays) dla zadanego nabytego punktu bazowego K(x0, y0)
 */
export function generateTrackingRaysForAnchor(
  anchor: AnchorPoint,
  rayLengthMeters = 80
): TrackingRay[] {
  const x0 = anchor.point.x;
  const y0 = anchor.point.y;
  const rays: TrackingRay[] = [];

  // 1. Oś pozioma: A = 0, B = 1, C = -y0 (y = y0)
  rays.push({
    anchorId: anchor.id,
    origin: anchor.point,
    type: 'horizontal',
    label: 'Pozioma (0°)',
    A: 0,
    B: 1,
    C: -y0,
    angleRad: 0,
    p1: { x: x0 - rayLengthMeters, y: y0 },
    p2: { x: x0 + rayLengthMeters, y: y0 },
  });

  // 2. Oś pionowa: A = 1, B = 0, C = -x0 (x = x0)
  rays.push({
    anchorId: anchor.id,
    origin: anchor.point,
    type: 'vertical',
    label: 'Pionowa (90°)',
    A: 1,
    B: 0,
    C: -x0,
    angleRad: Math.PI / 2,
    p1: { x: x0, y: y0 - rayLengthMeters },
    p2: { x: x0, y: y0 + rayLengthMeters },
  });

  // 3. Równoległa i prostopadła do źródłowej krawędzi, jeśli punkt pochodzi z krawędzi
  if (anchor.sourceEdgeAngle !== undefined) {
    const angle = anchor.sourceEdgeAngle;
    // Równoległa: normalna (-sin(angle), cos(angle))
    const A_par = -Math.sin(angle);
    const B_par = Math.cos(angle);
    const C_par = -(A_par * x0 + B_par * y0);
    const uX_par = Math.cos(angle);
    const uY_par = Math.sin(angle);

    rays.push({
      anchorId: anchor.id,
      origin: anchor.point,
      type: 'parallel',
      label: `Równoległa (${((angle * 180) / Math.PI).toFixed(1)}°)`,
      A: A_par,
      B: B_par,
      C: C_par,
      angleRad: angle,
      p1: { x: x0 - rayLengthMeters * uX_par, y: y0 - rayLengthMeters * uY_par },
      p2: { x: x0 + rayLengthMeters * uX_par, y: y0 + rayLengthMeters * uY_par },
    });

    // Prostopadła: normalna (cos(angle), sin(angle))
    const A_perp = Math.cos(angle);
    const B_perp = Math.sin(angle);
    const C_perp = -(A_perp * x0 + B_perp * y0);
    const uX_perp = -Math.sin(angle);
    const uY_perp = Math.cos(angle);

    rays.push({
      anchorId: anchor.id,
      origin: anchor.point,
      type: 'perpendicular',
      label: `Prostopadła (${(((angle + Math.PI / 2) * 180) / Math.PI).toFixed(1)}°)`,
      A: A_perp,
      B: B_perp,
      C: C_perp,
      angleRad: normalizeAnglePi(angle + Math.PI / 2),
      p1: { x: x0 - rayLengthMeters * uX_perp, y: y0 - rayLengthMeters * uY_perp },
      p2: { x: x0 + rayLengthMeters * uX_perp, y: y0 + rayLengthMeters * uY_perp },
    });
  }

  return rays;
}

/**
 * Wyznacza wszystkie punkty przecięcia promieni dla 2 nabytych punktów bazowych K1 i K2
 */
export function calculateOtrackIntersections(
  anchors: AnchorPoint[],
  rayLengthMeters = 80
): { point: Point2D; ray1: TrackingRay; ray2: TrackingRay; anchor1: AnchorPoint; anchor2: AnchorPoint }[] {
  if (anchors.length < 2) return [];

  const k1 = anchors[0];
  const k2 = anchors[1];
  const rays1 = generateTrackingRaysForAnchor(k1, rayLengthMeters);
  const rays2 = generateTrackingRaysForAnchor(k2, rayLengthMeters);

  const results: { point: Point2D; ray1: TrackingRay; ray2: TrackingRay; anchor1: AnchorPoint; anchor2: AnchorPoint }[] = [];

  for (const r1 of rays1) {
    for (const r2 of rays2) {
      const pt = intersectLines(r1, r2, 1e-4);
      if (pt) {
        results.push({
          point: pt,
          ray1: r1,
          ray2: r2,
          anchor1: k1,
          anchor2: k2,
        });
      }
    }
  }

  return results;
}

/**
 * Główny silnik ewaluacji OSNAP realizujący ścisłą hierarchię priorytetów 1 - 6
 */
export function evaluateOsnapSnap(options: EvaluateOsnapOptions): OsnapSnapResult | null {
  const {
    mouseWorld,
    lineBuffer,
    acquiredPoints = [],
    worldToScreen,
    screenSnapThresholdPx = 12,
    rayLengthMeters = 80,
    excludeBuildingId,
    activeSnapTypes = {},
  } = options;

  const isEnabled = (type: OsnapSnapType) => activeSnapTypes[type] !== false;
  const mouseScreen = worldToScreen(mouseWorld.x, mouseWorld.y);

  // Filtruj bufor krawędzi
  const activeEdges = excludeBuildingId
    ? lineBuffer.filter((e) => e.objectId !== excludeBuildingId)
    : lineBuffer;

  // =========================================================================
  // PRIORYTET 1: Wierzchołek (Endpoint / Corner)
  // ||M - Vi|| <= R_snap
  // =========================================================================
  if (isEnabled('endpoint')) {
    let bestEndpoint: { point: Point2D; distPx: number; edge: CachedLineEquation } | null = null;
    let minEndpointDist = screenSnapThresholdPx;

    for (const edge of activeEdges) {
      for (const pt of [edge.p1, edge.p2]) {
        const s = worldToScreen(pt.x, pt.y);
        const distPx = Math.hypot(mouseScreen.sx - s.sx, mouseScreen.sy - s.sy);
        if (distPx <= minEndpointDist) {
          minEndpointDist = distPx;
          bestEndpoint = { point: pt, distPx, edge };
        }
      }
    }

    if (bestEndpoint) {
      return {
        priority: 1,
        type: 'endpoint',
        snappedPoint: { ...bestEndpoint.point },
        screenDistancePx: bestEndpoint.distPx,
        label: 'Wierzchołek (Endpoint)',
        description: `Wierzchołek polilinii (${bestEndpoint.edge.objectId})`,
        sourcePoint: bestEndpoint.point,
        sourceBuildingId: bestEndpoint.edge.objectId,
        sourceEdgeIndex: bestEndpoint.edge.edgeIndex,
      };
    }
  }

  // =========================================================================
  // PRIORYTET 2: Przecięcie OTRACK (Tracking Intersection)
  // ||M - P_int|| <= R_snap z promieni K1 i K2
  // =========================================================================
  if (isEnabled('otrack_intersection') && acquiredPoints.length >= 2) {
    const intersections = calculateOtrackIntersections(acquiredPoints, rayLengthMeters);
    let bestInt: {
      point: Point2D;
      distPx: number;
      ray1: TrackingRay;
      ray2: TrackingRay;
      anchor1: AnchorPoint;
      anchor2: AnchorPoint;
    } | null = null;
    let minIntDist = screenSnapThresholdPx;

    for (const item of intersections) {
      const s = worldToScreen(item.point.x, item.point.y);
      const distPx = Math.hypot(mouseScreen.sx - s.sx, mouseScreen.sy - s.sy);
      if (distPx <= minIntDist) {
        minIntDist = distPx;
        bestInt = { ...item, distPx };
      }
    }

    if (bestInt) {
      return {
        priority: 2,
        type: 'otrack_intersection',
        snappedPoint: { ...bestInt.point },
        screenDistancePx: bestInt.distPx,
        label: 'Przecięcie OTRACK',
        description: `Przecięcie promieni ${bestInt.ray1.label} × ${bestInt.ray2.label}`,
        sourcePoint: bestInt.point,
        activeRays: [bestInt.ray1, bestInt.ray2],
        intersectingAnchors: [bestInt.anchor1, bestInt.anchor2],
      };
    }
  }

  // =========================================================================
  // PRIORYTET 3: Promień pojedynczy OTRACK (Tracking Ray)
  // |A_ray*Mx + B_ray*My + C_ray| <= R_snap
  // =========================================================================
  if (isEnabled('otrack_ray') && acquiredPoints.length > 0) {
    let bestRay: {
      ray: TrackingRay;
      projPoint: Point2D;
      distPx: number;
      anchor: AnchorPoint;
    } | null = null;
    let minRayDist = screenSnapThresholdPx;

    for (const anchor of acquiredPoints) {
      const rays = generateTrackingRaysForAnchor(anchor, rayLengthMeters);
      for (const ray of rays) {
        // Oblicz rzut punktu kursora na promień
        const signedDist = ray.A * mouseWorld.x + ray.B * mouseWorld.y + ray.C;
        const projWorld: Point2D = {
          x: mouseWorld.x - signedDist * ray.A,
          y: mouseWorld.y - signedDist * ray.B,
        };

        const sProj = worldToScreen(projWorld.x, projWorld.y);
        const distPx = Math.hypot(mouseScreen.sx - sProj.sx, mouseScreen.sy - sProj.sy);

        if (distPx <= minRayDist) {
          minRayDist = distPx;
          bestRay = {
            ray,
            projPoint: projWorld,
            distPx,
            anchor,
          };
        }
      }
    }

    if (bestRay) {
      return {
        priority: 3,
        type: 'otrack_ray',
        snappedPoint: bestRay.projPoint,
        screenDistancePx: bestRay.distPx,
        label: `Śledzenie OTRACK (${bestRay.ray.label})`,
        description: `Wiązka naprowadzająca z punktu K (${bestRay.ray.label})`,
        sourcePoint: bestRay.anchor.point,
        rayLine: { p1: bestRay.ray.p1, p2: bestRay.ray.p2 },
        activeRays: [bestRay.ray],
      };
    }
  }

  // =========================================================================
  // PRIORYTET 4: Środek odcinka (Midpoint)
  // ||M - M_edge|| <= R_snap
  // =========================================================================
  if (isEnabled('midpoint')) {
    let bestMidpoint: { point: Point2D; distPx: number; edge: CachedLineEquation } | null = null;
    let minMidDist = screenSnapThresholdPx;

    for (const edge of activeEdges) {
      const midX = (edge.p1.x + edge.p2.x) / 2;
      const midY = (edge.p1.y + edge.p2.y) / 2;
      const s = worldToScreen(midX, midY);
      const distPx = Math.hypot(mouseScreen.sx - s.sx, mouseScreen.sy - s.sy);
      if (distPx <= minMidDist) {
        minMidDist = distPx;
        bestMidpoint = { point: { x: midX, y: midY }, distPx, edge };
      }
    }

    if (bestMidpoint) {
      return {
        priority: 4,
        type: 'midpoint',
        snappedPoint: bestMidpoint.point,
        screenDistancePx: bestMidpoint.distPx,
        label: 'Środek odcinka (Midpoint)',
        description: `Środek krawędzi ${bestMidpoint.edge.objectId}`,
        sourcePoint: bestMidpoint.point,
        sourceBuildingId: bestMidpoint.edge.objectId,
        sourceEdgeIndex: bestMidpoint.edge.edgeIndex,
      };
    }
  }

  // =========================================================================
  // PRIORYTET 5: Krawędź / Przedłużenie (Nearest / Extension Snap)
  // |A*Mx + B*My + C| <= R_snap
  // =========================================================================
  if (isEnabled('nearest') || isEnabled('extension')) {
    let bestEdgeSnap: {
      point: Point2D;
      distPx: number;
      edge: CachedLineEquation;
      isOnSegment: boolean;
      t: number;
    } | null = null;
    let minEdgeDist = screenSnapThresholdPx;

    for (const edge of activeEdges) {
      const proj = projectPointToLine(mouseWorld, edge);
      const sProj = worldToScreen(proj.projectedPoint.x, proj.projectedPoint.y);
      const distPx = Math.hypot(mouseScreen.sx - sProj.sx, mouseScreen.sy - sProj.sy);

      if (distPx <= minEdgeDist) {
        if (proj.isOnSegment && !isEnabled('nearest')) continue;
        if (!proj.isOnSegment && !isEnabled('extension')) continue;

        minEdgeDist = distPx;
        bestEdgeSnap = {
          point: proj.projectedPoint,
          distPx,
          edge,
          isOnSegment: proj.isOnSegment,
          t: proj.t,
        };
      }
    }

    if (bestEdgeSnap) {
      const isExt = !bestEdgeSnap.isOnSegment;
      const guideExtLength = 50;
      const rayLine = isExt
        ? {
            p1: {
              x: bestEdgeSnap.edge.p1.x - guideExtLength * bestEdgeSnap.edge.uX,
              y: bestEdgeSnap.edge.p1.y - guideExtLength * bestEdgeSnap.edge.uY,
            },
            p2: {
              x: bestEdgeSnap.edge.p2.x + guideExtLength * bestEdgeSnap.edge.uX,
              y: bestEdgeSnap.edge.p2.y + guideExtLength * bestEdgeSnap.edge.uY,
            },
          }
        : undefined;

      return {
        priority: 5,
        type: isExt ? 'extension' : 'nearest',
        snappedPoint: bestEdgeSnap.point,
        screenDistancePx: bestEdgeSnap.distPx,
        label: isExt ? 'Przedłużenie (Extension)' : 'Punkt na krawędzi (Nearest)',
        description: isExt
          ? `Przedłużenie krawędzi (${bestEdgeSnap.edge.objectId})`
          : `Rzut prostopadły na krawędź (${bestEdgeSnap.edge.objectId})`,
        sourceBuildingId: bestEdgeSnap.edge.objectId,
        sourceEdgeIndex: bestEdgeSnap.edge.edgeIndex,
        cachedEdge: bestEdgeSnap.edge,
        rayLine,
      };
    }
  }

  return null;
}

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
      // Odległość prostych równoległych: |C_drag - C_cached|
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

  // -------------------------------------------------------------------------
  // 1. Punkt do Punktu (Vertex-to-Vertex / Corner Lock) - Najwyższy priorytet
  // -------------------------------------------------------------------------
  let bestV2V: BuildingDragSnapResult | null = null;
  let minV2VDist = distanceThresholdMeters;

  for (const vMove of movingVertices) {
    for (const refEdge of otherBuffer) {
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
    for (const refEdge of otherBuffer) {
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
  // -------------------------------------------------------------------------
  const n = movingVertices.length;
  let bestE2V: BuildingDragSnapResult | null = null;
  let minE2VDist = distanceThresholdMeters;

  for (let i = 0; i < n; i++) {
    const p1 = movingVertices[i];
    const p2 = movingVertices[(i + 1) % n];
    const movingEdge = {
      p1,
      p2,
      A: -(p2.y - p1.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y || 1),
      B: (p2.x - p1.x) / Math.hypot(p2.x - p1.x, p2.y - p1.y || 1),
      C: 0,
    };
    movingEdge.C = -(movingEdge.A * p1.x + movingEdge.B * p1.y);

    for (const refEdge of otherBuffer) {
      for (const vRef of [refEdge.p1, refEdge.p2]) {
        const signedDist = movingEdge.A * vRef.x + movingEdge.B * vRef.y + movingEdge.C;
        const dist = Math.abs(signedDist);
        if (dist <= minE2VDist) {
          // Sprawdź czy rzut punktu vRef leży na segmencie p1..p2
          const t =
            (vRef.x - p1.x) * (movingEdge.B) + (vRef.y - p1.y) * (-movingEdge.A);
          const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (t >= -0.05 && t <= len + 0.05) {
            minE2VDist = dist;
            bestE2V = {
              relation: 'edge_to_vertex',
              deltaX: signedDist * movingEdge.A,
              deltaY: signedDist * movingEdge.B,
              distanceMeters: dist,
              label: 'Ściana do punktu',
              sourcePoint: { x: vRef.x - signedDist * movingEdge.A, y: vRef.y - signedDist * movingEdge.B },
              targetPoint: { ...vRef },
              referenceEdge: refEdge,
            };
          }
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
        // Oblicz odległość punktu p1 od nośnika prostej referencyjnej
        const signedDist = refEdge.A * p1.x + refEdge.B * p1.y + refEdge.C;
        const lineDist = Math.abs(signedDist);

        if (lineDist <= minCollinearDist) {
          minCollinearDist = lineDist;

          // Sprawdź czy krawędzie nachodzą na siebie, czy to przedłużenie (extension)
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

