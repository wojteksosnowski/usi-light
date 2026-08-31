import { Point2D, BuildingLoop } from '../types/geometry';
import { DominantDirection } from './segmentStatistics';
import { APP_CONFIG } from '../config/appConfig';


export interface DirectionSnapResult {
  snappedPoint: Point2D;
  originPoint: Point2D;
  guideAngleDeg: number;
  relationType: 'parallel' | 'perpendicular' | 'dominant';
  guideLine: { p1: Point2D; p2: Point2D };
  distanceFromOrigin: number;
  diffAngleDeg: number;
  sourceLabel?: string;
}

export interface CalculateDirectionSnapOptions {
  currentMouseWorld: Point2D;
  originPoint: Point2D;
  buildings?: BuildingLoop[];
  dominantDirections?: DominantDirection[];
  polylineVertices?: Point2D[];
  worldToScreen?: (wx: number, wy: number) => { sx: number; sy: number };
  angleToleranceDeg?: number;
  screenSnapThresholdPx?: number;
  minDistanceMeters?: number;
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
 * Gathers candidate target direction axes (in degrees [0, 180)) from:
 * 1. Previously drawn segments of the active polyline.
 * 2. Dominant orthogonal axes from global scene segment statistics.
 * 3. Segments of nearby buildings around origin and mouse.
 */
export function collectTargetDirections(
  origin: Point2D,
  currentMouse: Point2D,
  buildings: BuildingLoop[] = [],
  dominantDirections: DominantDirection[] = [],
  polylineVertices: Point2D[] = []
): { angleDeg: number; relationType: 'parallel' | 'perpendicular' | 'dominant'; sourceLabel?: string }[] {
  const candidates: { angleDeg: number; relationType: 'parallel' | 'perpendicular' | 'dominant'; sourceLabel?: string }[] = [];
  const seenAngles: number[] = [];

  const addCandidate = (angleDeg: number, relationType: 'parallel' | 'perpendicular' | 'dominant', sourceLabel?: string) => {
    const norm = normalizeAngle180(angleDeg);
    // Avoid duplicate candidates within 0.5 degrees
    for (const sa of seenAngles) {
      if (angleDiff180(sa, norm) < 0.5) return;
    }
    seenAngles.push(norm);
    candidates.push({ angleDeg: norm, relationType, sourceLabel });
  };

  // 1. Current Polyline history (Highest Priority)
  if (polylineVertices.length >= 2) {
    const lastP = polylineVertices[polylineVertices.length - 1];
    const prevP = polylineVertices[polylineVertices.length - 2];
    const dx = lastP.x - prevP.x;
    const dy = lastP.y - prevP.y;
    const len = Math.hypot(dx, dy);
    if (len >= 0.05) {
      const segAngle = normalizeAngle180((Math.atan2(dy, dx) * 180) / Math.PI);
      const perpAngle = normalizeAngle180(segAngle + 90);
      addCandidate(segAngle, 'parallel', 'Polilinia (Równoległy)');
      addCandidate(perpAngle, 'perpendicular', 'Polilinia (Prostopadły 90°)');
    }

    // Also consider earlier segments if any
    for (let i = polylineVertices.length - 3; i >= 0 && i >= polylineVertices.length - 5; i--) {
      const pA = polylineVertices[i];
      const pB = polylineVertices[i + 1];
      const sdx = pB.x - pA.x;
      const sdy = pB.y - pA.y;
      if (Math.hypot(sdx, sdy) >= 0.05) {
        const a = normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
        addCandidate(a, 'parallel', 'Polilinia (Segment)');
        addCandidate(normalizeAngle180(a + 90), 'perpendicular', 'Polilinia (Prostopadły)');
      }
    }
  }

  // 2. Dominant scene axes from statistics (e.g. 0°/90° or main building orientations)
  if (dominantDirections && dominantDirections.length > 0) {
    for (const dom of dominantDirections.slice(0, 2)) {
      addCandidate(dom.angleDeg, 'dominant', `Siatka główna (${dom.angleDeg.toFixed(1)}°)`);
      addCandidate(dom.orthogonalDeg, 'dominant', `Siatka poprzeczna (${dom.orthogonalDeg.toFixed(1)}°)`);
    }
  }

  // Default Cartesian Ortho axes if nothing added yet
  addCandidate(0, 'dominant', 'Oś X (0.0°)');
  addCandidate(90, 'dominant', 'Oś Y (90.0°)');

  // 3. Nearby Building Segments
  const maxSegments = APP_CONFIG.directionSnapping.maxNearbySegments;
  const nearbySegs: { angleDeg: number; dist: number; buildingName: string }[] = [];

  for (const bldg of buildings) {
    if (bldg.isIncluded === false || !Array.isArray(bldg.segments)) continue;
    for (const seg of bldg.segments) {
      const midX = (seg.p1.x + seg.p2.x) / 2;
      const midY = (seg.p1.y + seg.p2.y) / 2;
      const dist = Math.min(
        Math.hypot(origin.x - midX, origin.y - midY),
        Math.hypot(currentMouse.x - midX, currentMouse.y - midY)
      );
      const sdx = seg.p2.x - seg.p1.x;
      const sdy = seg.p2.y - seg.p1.y;
      if (Math.hypot(sdx, sdy) >= 0.05) {
        const segAng = normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
        nearbySegs.push({ angleDeg: segAng, dist, buildingName: bldg.name });
      }
    }
  }

  // Sort nearby segments by proximity and add top ones
  nearbySegs.sort((a, b) => a.dist - b.dist);
  for (const item of nearbySegs.slice(0, maxSegments)) {
    addCandidate(item.angleDeg, 'parallel', `${item.buildingName} (Równoległy)`);
    addCandidate(normalizeAngle180(item.angleDeg + 90), 'perpendicular', `${item.buildingName} (Prostopadły)`);
  }

  return candidates;
}

/**
 * Calculates direction snapping for cursor relative to an origin point.
 */
export function calculateDirectionSnap(options: CalculateDirectionSnapOptions): DirectionSnapResult | null {
  const {
    currentMouseWorld,
    originPoint,
    buildings = [],
    dominantDirections = [],
    polylineVertices = [],
    worldToScreen,
    angleToleranceDeg = APP_CONFIG.directionSnapping.angleToleranceDeg,
    screenSnapThresholdPx = APP_CONFIG.directionSnapping.screenSnapThresholdPx,
    minDistanceMeters = APP_CONFIG.directionSnapping.minDistanceMeters,
  } = options;

  if (!currentMouseWorld || !originPoint) return null;

  const dx = currentMouseWorld.x - originPoint.x;
  const dy = currentMouseWorld.y - originPoint.y;
  const dist = Math.hypot(dx, dy);

  if (dist < minDistanceMeters) {
    return null;
  }

  const rawMouseAngleDeg = normalizeAngle360((Math.atan2(dy, dx) * 180) / Math.PI);
  const rawMouseAxisDeg = normalizeAngle180(rawMouseAngleDeg);

  const candidates = collectTargetDirections(
    originPoint,
    currentMouseWorld,
    buildings,
    dominantDirections,
    polylineVertices
  );

  let bestSnap: DirectionSnapResult | null = null;
  let minDiff = 99999;

  const guideHalfLength = APP_CONFIG.directionSnapping.guideLineLengthMeters;

  for (const cand of candidates) {
    const diff = angleDiff180(cand.angleDeg, rawMouseAxisDeg);
    if (diff <= angleToleranceDeg && diff < minDiff) {
      // Determine ray forward angle (either cand.angleDeg or cand.angleDeg + 180)
      const diff1 = Math.abs(normalizeAngle360(cand.angleDeg) - rawMouseAngleDeg);
      const altDiff1 = Math.min(diff1, 360 - diff1);
      const forwardAngleDeg = altDiff1 <= 90 ? cand.angleDeg : cand.angleDeg + 180;
      const forwardRad = (forwardAngleDeg * Math.PI) / 180;

      const cosA = Math.cos(forwardRad);
      const sinA = Math.sin(forwardRad);

      // Project current mouse onto this forward ray
      const projectedDist = dx * cosA + dy * sinA;
      if (projectedDist <= 0) continue; // Snap along the ray facing cursor

      const snappedX = originPoint.x + projectedDist * cosA;
      const snappedY = originPoint.y + projectedDist * sinA;

      // Verify screen pixel threshold if worldToScreen is provided
      if (worldToScreen) {
        const sMouse = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
        const sSnapped = worldToScreen(snappedX, snappedY);
        const screenDistPx = Math.hypot(sMouse.sx - sSnapped.sx, sMouse.sy - sSnapped.sy);
        if (screenDistPx > screenSnapThresholdPx) {
          continue;
        }
      }

      minDiff = diff;
      bestSnap = {
        snappedPoint: { x: snappedX, y: snappedY },
        originPoint: { x: originPoint.x, y: originPoint.y },
        guideAngleDeg: forwardAngleDeg,
        relationType: cand.relationType,
        guideLine: {
          p1: { x: originPoint.x - guideHalfLength * cosA, y: originPoint.y - guideHalfLength * sinA },
          p2: { x: originPoint.x + guideHalfLength * cosA, y: originPoint.y + guideHalfLength * sinA },
        },
        distanceFromOrigin: projectedDist,
        diffAngleDeg: diff,
        sourceLabel: cand.sourceLabel,
      };
    }
  }

  return bestSnap;
}
