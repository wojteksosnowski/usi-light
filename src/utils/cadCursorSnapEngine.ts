import { Point2D } from '../types/geometry';
import {
  CachedLineEquation,
  projectPointToLine,
  intersectLines,
  normalizeAnglePi,
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
  isStatistical?: boolean; // true dla osi ortho / statystycznych, false dla konkretnych krawędzi
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
  | 'perpendicular'
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
  isStatisticalGuide?: boolean;
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
  previousSnapResult?: OsnapSnapResult | null;
  hysteresisBonusPx?: number;
  minEdgeLengthMeters?: number;
  hoveredBuildingId?: string;
  selectedBuildingId?: string;
}

/**
 * Generyczny ekstraktor najbliższego punktu na ekranie (z obsługą histerezy).
 */
export function findClosestScreenPoint<T>(
  items: T[],
  getPoint: (item: T) => Point2D,
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  mouseScreen: { sx: number; sy: number },
  thresholdPx: number,
  getEffectiveDist?: (rawDistPx: number, item: T, pt: Point2D) => number
): { item: T; point: Point2D; distPx: number; effectiveDistPx: number } | null {
  let best: { item: T; point: Point2D; distPx: number; effectiveDistPx: number } | null = null;
  let minEffectiveDist = thresholdPx;

  for (const item of items) {
    const pt = getPoint(item);
    const s = worldToScreen(pt.x, pt.y);
    const distPx = Math.hypot(mouseScreen.sx - s.sx, mouseScreen.sy - s.sy);

    if (distPx <= thresholdPx) {
      const effDist = getEffectiveDist ? getEffectiveDist(distPx, item, pt) : distPx;
      if (effDist <= minEffectiveDist) {
        minEffectiveDist = effDist;
        best = { item, point: pt, distPx, effectiveDistPx: effDist };
      }
    }
  }

  return best;
}

/**
 * Generuje wiązkę promieni śledzących (Rays) dla zadanego nabytego punktu bazowego K(x0, y0).
 * Odrzuca promienie równoległe/prostopadłe jeśli pokrywają się z osiami ortogonalnymi (martwa strefa 2°).
 */
export function generateTrackingRaysForAnchor(
  anchor: AnchorPoint,
  rayLengthMeters = 80
): TrackingRay[] {
  const x0 = anchor.point.x;
  const y0 = anchor.point.y;
  const rays: TrackingRay[] = [];

  // 1. Oś pozioma: A = 0, B = 1, C = -y0 (y = y0) - Prowadnica bazowa/statystyczna
  rays.push({
    anchorId: anchor.id,
    origin: anchor.point,
    type: 'horizontal',
    isStatistical: true,
    label: 'Pozioma (0°)',
    A: 0,
    B: 1,
    C: -y0,
    angleRad: 0,
    p1: { x: x0 - rayLengthMeters, y: y0 },
    p2: { x: x0 + rayLengthMeters, y: y0 },
  });

  // 2. Oś pionowa: A = 1, B = 0, C = -x0 (x = x0) - Prowadnica bazowa/statystyczna
  rays.push({
    anchorId: anchor.id,
    origin: anchor.point,
    type: 'vertical',
    isStatistical: true,
    label: 'Pionowa (90°)',
    A: 1,
    B: 0,
    C: -x0,
    angleRad: Math.PI / 2,
    p1: { x: x0, y: y0 - rayLengthMeters },
    p2: { x: x0 + rayLengthMeters, y: y0 },
  });

  // 3. Równoległa i prostopadła do źródłowej krawędzi (z filtrowaniem martwej strefy 2°) - Prowadnice od konkretnej krawędzi
  if (anchor.sourceEdgeAngle !== undefined) {
    const angle = normalizeAnglePi(anchor.sourceEdgeAngle);
    const EPS_ANGLE = (2.0 * Math.PI) / 180; // 2 stopnie martwej strefy

    const isNearHorizontal = angle < EPS_ANGLE || Math.abs(angle - Math.PI) < EPS_ANGLE;
    const isNearVertical = Math.abs(angle - Math.PI / 2) < EPS_ANGLE;

    if (!isNearHorizontal && !isNearVertical) {
      const A_par = -Math.sin(angle);
      const B_par = Math.cos(angle);
      const C_par = -(A_par * x0 + B_par * y0);
      const uX_par = Math.cos(angle);
      const uY_par = Math.sin(angle);

      rays.push({
        anchorId: anchor.id,
        origin: anchor.point,
        type: 'parallel',
        isStatistical: false,
        label: `Równoległa (${((angle * 180) / Math.PI).toFixed(1)}°)`,
        A: A_par,
        B: B_par,
        C: C_par,
        angleRad: angle,
        p1: { x: x0 - rayLengthMeters * uX_par, y: y0 - rayLengthMeters * uY_par },
        p2: { x: x0 + rayLengthMeters * uX_par, y: y0 + rayLengthMeters * uY_par },
      });

      const perpAngle = normalizeAnglePi(angle + Math.PI / 2);
      const A_perp = Math.cos(angle);
      const B_perp = Math.sin(angle);
      const C_perp = -(A_perp * x0 + B_perp * y0);
      const uX_perp = -Math.sin(angle);
      const uY_perp = Math.cos(angle);

      rays.push({
        anchorId: anchor.id,
        origin: anchor.point,
        type: 'perpendicular',
        isStatistical: false,
        label: `Prostopadła (${((perpAngle * 180) / Math.PI).toFixed(1)}°)`,
        A: A_perp,
        B: B_perp,
        C: C_perp,
        angleRad: perpAngle,
        p1: { x: x0 - rayLengthMeters * uX_perp, y: y0 - rayLengthMeters * uY_perp },
        p2: { x: x0 + rayLengthMeters * uX_perp, y: y0 + rayLengthMeters * uY_perp },
      });
    }
  }

  return rays;
}

/**
 * Wyznacza wszystkie bezpieczne punkty przecięcia promieni dla 2 punktów bazowych K1 i K2.
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
      const det = Math.abs(r1.A * r2.B - r1.B * r2.A);
      if (det < 0.173) continue; // sin(10°) ≈ 0.1736 -> odrzuć kąty < 10°

      const pt = intersectLines(r1, r2, 1e-4);
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        const d1 = Math.hypot(pt.x - k1.point.x, pt.y - k1.point.y);
        const d2 = Math.hypot(pt.x - k2.point.x, pt.y - k2.point.y);
        if (d1 > rayLengthMeters || d2 > rayLengthMeters) continue;

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
 * Silnik ewaluacji OSNAP & OTRACK dla wskaźnika myszy.
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
    previousSnapResult = null,
    hysteresisBonusPx = 3.5,
    minEdgeLengthMeters = 0.05,
    hoveredBuildingId,
    selectedBuildingId,
  } = options;

  const isEnabled = (type: OsnapSnapType) => activeSnapTypes[type] !== false;
  const mouseScreen = worldToScreen(mouseWorld.x, mouseWorld.y);

  // Filtrowanie wykluczonego obiektu
  const activeEdges = excludeBuildingId
    ? lineBuffer.filter((e) => e.objectId !== excludeBuildingId)
    : lineBuffer;

  if (activeEdges.length === 0 && acquiredPoints.length === 0) {
    return null;
  }

  // Obliczenie promienia selekcji w świecie dla AABB culling
  const sRef = worldToScreen(mouseWorld.x + 1, mouseWorld.y);
  const pxPerMeter = Math.hypot(sRef.sx - mouseScreen.sx, sRef.sy - mouseScreen.sy) || 20;
  const snapRadiusWorld = (screenSnapThresholdPx * 2) / pxPerMeter + 0.5;

  // Funkcja histerezy i priorytetyzacji przestrzennej obiektów najechanego / wybranego
  const getEffectiveDist = (
    rawDistPx: number,
    snapType: OsnapSnapType,
    pt: Point2D,
    objectId?: string
  ): number => {
    let eff = rawDistPx;
    // Priorytetyzacja obiektu wskazanego/najechanego (bonus 2.0px)
    if (objectId && (objectId === hoveredBuildingId || objectId === selectedBuildingId)) {
      eff -= 2.0;
    }
    if (previousSnapResult && previousSnapResult.type === snapType) {
      const prevPt = previousSnapResult.snappedPoint;
      if (Math.hypot(prevPt.x - pt.x, prevPt.y - pt.y) < 1e-3 || previousSnapResult.sourceBuildingId === objectId) {
        eff -= hysteresisBonusPx;
      }
    }
    return Math.max(0, eff);
  };

  // =========================================================================
  // PRIORYTET 1: Wierzchołek (Endpoint / Corner)
  // =========================================================================
  if (isEnabled('endpoint')) {
    const endpointsList: { point: Point2D; edge: CachedLineEquation }[] = [];
    for (const edge of activeEdges) {
      // Szybki test AABB
      const minX = Math.min(edge.p1.x, edge.p2.x) - snapRadiusWorld;
      const maxX = Math.max(edge.p1.x, edge.p2.x) + snapRadiusWorld;
      const minY = Math.min(edge.p1.y, edge.p2.y) - snapRadiusWorld;
      const maxY = Math.max(edge.p1.y, edge.p2.y) + snapRadiusWorld;

      if (mouseWorld.x >= minX && mouseWorld.x <= maxX && mouseWorld.y >= minY && mouseWorld.y <= maxY) {
        endpointsList.push({ point: edge.p1, edge });
        endpointsList.push({ point: edge.p2, edge });
      }
    }

    const bestEndpoint = findClosestScreenPoint(
      endpointsList,
      (item) => item.point,
      worldToScreen,
      mouseScreen,
      screenSnapThresholdPx,
      (distPx, item, pt) => getEffectiveDist(distPx, 'endpoint', pt, item.edge.objectId)
    );

    if (bestEndpoint) {
      return {
        priority: 1,
        type: 'endpoint',
        snappedPoint: { ...bestEndpoint.point },
        screenDistancePx: bestEndpoint.distPx,
        label: 'Wierzchołek (Endpoint)',
        description: `Wierzchołek polilinii (${bestEndpoint.item.edge.objectId})`,
        sourcePoint: bestEndpoint.point,
        sourceBuildingId: bestEndpoint.item.edge.objectId,
        sourceEdgeIndex: bestEndpoint.item.edge.edgeIndex,
      };
    }
  }

  // =========================================================================
  // PRIORYTET 2: Przecięcie OTRACK (Tracking Intersection)
  // =========================================================================
  if (isEnabled('otrack_intersection') && acquiredPoints.length >= 2) {
    const intersections = calculateOtrackIntersections(acquiredPoints, rayLengthMeters);
    const bestInt = findClosestScreenPoint(
      intersections,
      (item) => item.point,
      worldToScreen,
      mouseScreen,
      screenSnapThresholdPx,
      (distPx, _item, pt) => getEffectiveDist(distPx, 'otrack_intersection', pt)
    );

    if (bestInt) {
      return {
        priority: 2,
        type: 'otrack_intersection',
        snappedPoint: { ...bestInt.point },
        screenDistancePx: bestInt.distPx,
        label: 'Przecięcie OTRACK',
        description: `Przecięcie promieni ${bestInt.item.ray1.label} × ${bestInt.item.ray2.label}`,
        sourcePoint: bestInt.point,
        activeRays: [bestInt.item.ray1, bestInt.item.ray2],
        isStatisticalGuide: bestInt.item.ray1.isStatistical && bestInt.item.ray2.isStatistical,
        intersectingAnchors: [bestInt.item.anchor1, bestInt.item.anchor2],
      };
    }
  }

  // Odfiltrowanie zbyt krótkich odcinków dla perpendicular / midpoint / nearest / extension
  const significantEdges = minEdgeLengthMeters > 0
    ? activeEdges.filter((e) => {
        const dx = e.p2.x - e.p1.x;
        const dy = e.p2.y - e.p1.y;
        return Math.hypot(dx, dy) >= minEdgeLengthMeters;
      })
    : activeEdges;

  // =========================================================================
  // PRIORYTET 2: Środek odcinka (Midpoint) - dyskretny punkt charakterystyczny
  // =========================================================================
  if (isEnabled('midpoint')) {
    const midpointsList: { point: Point2D; edge: CachedLineEquation }[] = [];
    for (const edge of significantEdges) {
      const midX = (edge.p1.x + edge.p2.x) / 2;
      const midY = (edge.p1.y + edge.p2.y) / 2;
      if (
        Math.abs(mouseWorld.x - midX) <= snapRadiusWorld &&
        Math.abs(mouseWorld.y - midY) <= snapRadiusWorld
      ) {
        midpointsList.push({ point: { x: midX, y: midY }, edge });
      }
    }

    const bestMidpoint = findClosestScreenPoint(
      midpointsList,
      (item) => item.point,
      worldToScreen,
      mouseScreen,
      screenSnapThresholdPx,
      (distPx, item, pt) => getEffectiveDist(distPx, 'midpoint', pt, item.edge.objectId)
    );

    if (bestMidpoint) {
      return {
        priority: 2,
        type: 'midpoint',
        snappedPoint: bestMidpoint.point,
        screenDistancePx: bestMidpoint.distPx,
        label: 'Środek odcinka (Midpoint)',
        description: `Środek krawędzi ${bestMidpoint.item.edge.objectId}`,
        sourcePoint: bestMidpoint.point,
        sourceBuildingId: bestMidpoint.item.edge.objectId,
        sourceEdgeIndex: bestMidpoint.item.edge.edgeIndex,
      };
    }
  }

  // =========================================================================
  // PRIORYTET 2.5: Rzut prostopadły z punktu bazowego (Perpendicular Drop Snap)
  // Aktywuje się TYLKO gdy:
  // 1. Rzut leży w fizycznych granicach odcinka (lub jego bezpośredniego lica)
  // 2. Kursor myszy faktycznie zbliża się do samej krawędzi lub w bezpośrednie otoczenie punktu rzutu
  // =========================================================================
  if (isEnabled('perpendicular') && acquiredPoints.length > 0) {
    let bestPerp: {
      point: Point2D;
      anchor: AnchorPoint;
      edge: CachedLineEquation;
      distPx: number;
      effectiveDistPx: number;
    } | null = null;
    let minPerpDist = screenSnapThresholdPx;

    for (const anchor of acquiredPoints) {
      for (const edge of significantEdges) {
        const proj = projectPointToLine(anchor.point, edge);

        // 1. Wymagaj, aby rzut padał w odcinek (z minimalną tolerancją 0.05m)
        if (proj.t < -0.05 || proj.t > edge.length + 0.05) continue;

        // 2. Kursor myszy musi znajdować się blisko samej krawędzi (odległość w rzucie na krawędź)
        const mouseProj = projectPointToLine(mouseWorld, edge);
        const sMouseProj = worldToScreen(mouseProj.projectedPoint.x, mouseProj.projectedPoint.y);
        const distMouseToEdgePx = Math.hypot(mouseScreen.sx - sMouseProj.sx, mouseScreen.sy - sMouseProj.sy);
        if (distMouseToEdgePx > screenSnapThresholdPx * 1.5) continue;

        const sProj = worldToScreen(proj.projectedPoint.x, proj.projectedPoint.y);
        const distPx = Math.hypot(mouseScreen.sx - sProj.sx, mouseScreen.sy - sProj.sy);
        const effDist = getEffectiveDist(distPx, 'perpendicular', proj.projectedPoint, edge.objectId);

        if (distPx <= screenSnapThresholdPx && effDist <= minPerpDist) {
          minPerpDist = effDist;
          bestPerp = {
            point: proj.projectedPoint,
            anchor,
            edge,
            distPx,
            effectiveDistPx: effDist,
          };
        }
      }
    }

    if (bestPerp) {
      return {
        priority: 2,
        type: 'perpendicular',
        snappedPoint: bestPerp.point,
        screenDistancePx: bestPerp.distPx,
        label: '⟂ Rzut prostopadły (Perpendicular Snap)',
        description: `Rzut prostopadły z punktu K na krawędź (${bestPerp.edge.objectId})`,
        sourcePoint: bestPerp.anchor.point,
        sourceBuildingId: bestPerp.edge.objectId,
        sourceEdgeIndex: bestPerp.edge.edgeIndex,
        cachedEdge: bestPerp.edge,
        rayLine: { p1: bestPerp.anchor.point, p2: bestPerp.point },
        isStatisticalGuide: false,
      };
    }
  }

  // =========================================================================
  // PRIORYTET 3: Promień pojedynczy OTRACK (Tracking Ray)
  // =========================================================================
  if (isEnabled('otrack_ray') && acquiredPoints.length > 0) {
    let bestRay: {
      ray: TrackingRay;
      projPoint: Point2D;
      distPx: number;
      effectiveDistPx: number;
      anchor: AnchorPoint;
    } | null = null;
    let minRayDist = screenSnapThresholdPx;

    for (const anchor of acquiredPoints) {
      const rays = generateTrackingRaysForAnchor(anchor, rayLengthMeters);
      for (const ray of rays) {
        const signedDist = ray.A * mouseWorld.x + ray.B * mouseWorld.y + ray.C;
        const projWorld: Point2D = {
          x: mouseWorld.x - signedDist * ray.A,
          y: mouseWorld.y - signedDist * ray.B,
        };

        const sProj = worldToScreen(projWorld.x, projWorld.y);
        const distPx = Math.hypot(mouseScreen.sx - sProj.sx, mouseScreen.sy - sProj.sy);
        const effDist = getEffectiveDist(distPx, 'otrack_ray', projWorld, ray.anchorId);

        if (distPx <= screenSnapThresholdPx && effDist <= minRayDist) {
          minRayDist = effDist;
          bestRay = {
            ray,
            projPoint: projWorld,
            distPx,
            effectiveDistPx: effDist,
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
        isStatisticalGuide: bestRay.ray.isStatistical ?? (bestRay.ray.type === 'horizontal' || bestRay.ray.type === 'vertical'),
      };
    }
  }

  // =========================================================================
  // PRIORYTET 5: Krawędź / Przedłużenie (Nearest / Extension Snap)
  // Z surową karą odległościową (+5px) oraz strefą martwą wokół wierzchołków i środków
  // =========================================================================
  if (isEnabled('nearest') || isEnabled('extension')) {
    let bestEdgeSnap: {
      point: Point2D;
      distPx: number;
      effectiveDistPx: number;
      edge: CachedLineEquation;
      isOnSegment: boolean;
      t: number;
    } | null = null;
    let minEdgeDist = screenSnapThresholdPx;

    for (const edge of significantEdges) {
      // Wczesne odrzucenie krawędzi odległych prostopadle
      const signedLineDist = edge.A * mouseWorld.x + edge.B * mouseWorld.y + edge.C;
      if (Math.abs(signedLineDist) > snapRadiusWorld) continue;

      const proj = projectPointToLine(mouseWorld, edge);
      const sProj = worldToScreen(proj.projectedPoint.x, proj.projectedPoint.y);
      const distPx = Math.hypot(mouseScreen.sx - sProj.sx, mouseScreen.sy - sProj.sy);

      if (distPx <= screenSnapThresholdPx) {
        if (proj.isOnSegment && !isEnabled('nearest')) continue;
        if (!proj.isOnSegment && !isEnabled('extension')) continue;

        // Jeśli kursor jest w pobliżu wierzchołków lub środka tej krawędzi (promień 14px),
        // wygaszamy 'nearest', aby nie blokować dyskretnego przyciągania do wierzchołka/środka
        if (proj.isOnSegment && isEnabled('nearest')) {
          const sP1 = worldToScreen(edge.p1.x, edge.p1.y);
          const sP2 = worldToScreen(edge.p2.x, edge.p2.y);
          const sMid = worldToScreen((edge.p1.x + edge.p2.x) / 2, (edge.p1.y + edge.p2.y) / 2);
          const dP1 = Math.hypot(mouseScreen.sx - sP1.sx, mouseScreen.sy - sP1.sy);
          const dP2 = Math.hypot(mouseScreen.sx - sP2.sx, mouseScreen.sy - sP2.sy);
          const dMid = Math.hypot(mouseScreen.sx - sMid.sx, mouseScreen.sy - sMid.sy);

          if (dP1 <= screenSnapThresholdPx || dP2 <= screenSnapThresholdPx || dMid <= screenSnapThresholdPx) {
            // Ustąp pierwszeństwa punktom charakterystycznym
            continue;
          }
        }

        const snapType: OsnapSnapType = proj.isOnSegment ? 'nearest' : 'extension';
        // Kara odległościowa dla ciągłej krawędzi (+4 px), by preferować punkty dyskretne
        const priorityPenalty = snapType === 'nearest' ? 4.0 : 0.0;
        const effDist = getEffectiveDist(distPx, snapType, proj.projectedPoint, edge.objectId) + priorityPenalty;

        if (effDist <= minEdgeDist) {
          minEdgeDist = effDist;
          bestEdgeSnap = {
            point: proj.projectedPoint,
            distPx,
            effectiveDistPx: effDist,
            edge,
            isOnSegment: proj.isOnSegment,
            t: proj.t,
          };
        }
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
        isStatisticalGuide: false,
      };
    }
  }

  return null;
}
