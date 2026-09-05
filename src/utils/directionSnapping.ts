import { Point2D, BuildingLoop } from '../types/geometry';
import { DominantDirection } from './segmentStatistics';
import { APP_CONFIG } from '../config/appConfig';


export interface DirectionSnapResult {
  snappedPoint: Point2D;
  originPoint: Point2D;
  guideAngleDeg: number;
  relationType: 'parallel' | 'perpendicular' | 'dominant' | 'guide_intersection';
  isStatistical?: boolean; // true dla siatek głównych i statystycznych, false dla konkretnych krawędzi
  guideLine: { p1: Point2D; p2: Point2D };
  secondGuideLine?: { p1: Point2D; p2: Point2D; originPoint?: Point2D; angleDeg?: number; label?: string };
  intersectedSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number; buildingName?: string };
  distanceFromOrigin: number;
  diffAngleDeg: number;
  sourceLabel?: string;
  sourceSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number };
}

export interface CalculateDirectionSnapOptions {
  currentMouseWorld: Point2D;
  originPoint: Point2D;
  secondaryOriginPoints?: Point2D[];
  buildings?: BuildingLoop[];
  dominantDirections?: DominantDirection[];
  polylineVertices?: Point2D[];
  staticReferenceSegments?: { p1: Point2D; p2: Point2D; label?: string; buildingId?: string; edgeIndex?: number }[];
  worldToScreen?: (wx: number, wy: number) => { sx: number; sy: number };
  angleToleranceDeg?: number;
  screenSnapThresholdPx?: number;
  minDistanceMeters?: number;
  hoveredBuildingId?: string;
  selectedBuildingId?: string;
  excludeBuildingId?: string;
  excludeSegmentIndices?: number[];
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

export interface DirectionCandidate {
  angleDeg: number;
  relationType: 'parallel' | 'perpendicular' | 'dominant';
  sourceLabel?: string;
  priority: number;
  sourceSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number };
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

/**
 * Gathers candidate target direction axes (in degrees [0, 180)) with strict spatial and hierarchy prioritization:
 * 1. Active polyline segments (0° parallel and 90° exact perpendicular).
 * 2. Static reference segments (e.g. from currently edited polygon/sweep).
 * 3. Currently hovered / intersected building walls and selected building static walls.
 * 4. Nearest neighbouring building walls (sorted by spatial proximity).
 * 5. Dominant orthogonal axes from global facade statistics (theta and theta + 90°).
 * 6. Default Cartesian Ortho axes (0° / 90°).
 */
export function collectTargetDirections(
  origin: Point2D,
  currentMouse: Point2D,
  buildings: BuildingLoop[] = [],
  dominantDirections: DominantDirection[] = [],
  polylineVertices: Point2D[] = [],
  hoveredBuildingId?: string,
  selectedBuildingId?: string,
  excludeBuildingId?: string,
  excludeSegmentIndices?: number[],
  staticReferenceSegments: { p1: Point2D; p2: Point2D; label?: string; buildingId?: string; edgeIndex?: number }[] = []
): DirectionCandidate[] {
  const candidates: DirectionCandidate[] = [];
  const seenAngles: number[] = [];

  const addCandidate = (
    angleDeg: number,
    relationType: 'parallel' | 'perpendicular' | 'dominant',
    sourceLabel?: string,
    priority = 10,
    sourceSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number }
  ) => {
    const norm = normalizeAngle180(angleDeg);
    const dedupThreshold = relationType === 'dominant' ? 1.5 : 2.5;
    for (const sa of seenAngles) {
      if (angleDiff180(sa, norm) < dedupThreshold) return;
    }
    seenAngles.push(norm);
    candidates.push({ angleDeg: norm, relationType, sourceLabel, priority, sourceSegment });
  };

  // 1. Dominant scene axes from statistics (Siatka główna)
  const domPair: { angle: number; ortho: number } | null =
    dominantDirections && dominantDirections.length > 0
      ? { angle: dominantDirections[0].angleDeg, ortho: dominantDirections[0].orthogonalDeg }
      : null;

  if (domPair) {
    addCandidate(domPair.angle, 'dominant', `Siatka główna (${domPair.angle.toFixed(1)}°)`, 2);
    addCandidate(domPair.ortho, 'dominant', `Siatka poprzeczna (${domPair.ortho.toFixed(1)}°)`, 2);
  }

  const isNearDominant = (ang: number) => {
    if (!domPair) return false;
    const d1 = angleDiff180(ang, domPair.angle);
    const d2 = angleDiff180(ang, domPair.ortho);
    return d1 <= 4.0 || d2 <= 4.0;
  };

  // 2. All segments of active Polyline history (0° Parallel & 90° Perpendicular ONLY)
  const nPoly = polylineVertices.length;
  if (nPoly >= 2) {
    for (let i = nPoly - 2; i >= 0; i--) {
      const pA = polylineVertices[i];
      const pB = polylineVertices[i + 1];
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.05) continue;

      const segIdx = i + 1;
      const isLastSeg = i === nPoly - 2;
      const basePri = isLastSeg ? 1 : 3;
      const segAngle = normalizeAngle180((Math.atan2(dy, dx) * 180) / Math.PI);
      const perpAngle = normalizeAngle180(segAngle + 90);

      const effectiveSegAngle = isNearDominant(segAngle) && domPair ? domPair.angle : segAngle;
      const effectivePerpAngle = isNearDominant(perpAngle) && domPair ? domPair.ortho : perpAngle;

      addCandidate(
        effectiveSegAngle,
        'parallel',
        isLastSeg ? 'Polilinia (Równoległy)' : `Polilinia (Równoległy do seg. ${segIdx})`,
        basePri,
        { p1: pA, p2: pB }
      );
      addCandidate(
        effectivePerpAngle,
        'perpendicular',
        isLastSeg ? 'Polilinia (Prostopadły 90°)' : `Polilinia (Prostopadły 90° do seg. ${segIdx})`,
        basePri,
        { p1: pA, p2: pB }
      );
    }
  }

  // 2. Static reference segments (np. pozostałe stałe krawędzie edytowanego wielokąta/wstęgi)
  if (Array.isArray(staticReferenceSegments) && staticReferenceSegments.length > 0) {
    for (const refSeg of staticReferenceSegments) {
      const sdx = refSeg.p2.x - refSeg.p1.x;
      const sdy = refSeg.p2.y - refSeg.p1.y;
      if (Math.hypot(sdx, sdy) >= 0.05) {
        const rawSegAng = normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
        const segAng = isNearDominant(rawSegAng) && domPair
          ? (angleDiff180(rawSegAng, domPair.angle) <= 4.0 ? domPair.angle : domPair.ortho)
          : rawSegAng;
        const sLabel = refSeg.label || 'Krawędź (Równoległy)';
        const pLabel = refSeg.label ? refSeg.label.replace('Równoległy', 'Prostopadły 90°') : 'Krawędź (Prostopadły 90°)';
        addCandidate(segAng, 'parallel', sLabel, 3, refSeg);
        addCandidate(normalizeAngle180(segAng + 90), 'perpendicular', pLabel, 3, refSeg);
      }
    }
  }

  // 3. Priorytetyzacja wskazanego/najechanego obiektu
  const prioritizedBuildingIds = new Set<string>();
  if (hoveredBuildingId && hoveredBuildingId !== excludeBuildingId) {
    prioritizedBuildingIds.add(hoveredBuildingId);
  }
  if (selectedBuildingId && selectedBuildingId !== excludeBuildingId) {
    prioritizedBuildingIds.add(selectedBuildingId);
  }

  const prioBuildings = buildings.filter((b) => prioritizedBuildingIds.has(b.id) && b.isIncluded !== false);
  for (const bldg of prioBuildings) {
    if (Array.isArray(bldg.segments)) {
      for (let sIdx = 0; sIdx < bldg.segments.length; sIdx++) {
        if (bldg.id === excludeBuildingId && excludeSegmentIndices?.includes(sIdx)) continue;
        const seg = bldg.segments[sIdx];
        const sdx = seg.p2.x - seg.p1.x;
        const sdy = seg.p2.y - seg.p1.y;
        if (Math.hypot(sdx, sdy) >= 0.05) {
          const rawSegAng = normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
          const segAng = isNearDominant(rawSegAng) && domPair
            ? (angleDiff180(rawSegAng, domPair.angle) <= 4.0 ? domPair.angle : domPair.ortho)
            : rawSegAng;

          const bLabel = bldg.id === hoveredBuildingId ? `Obiekt wskazany (${bldg.name})` : `${bldg.name}`;
          const sourceSeg = { p1: seg.p1, p2: seg.p2, buildingId: bldg.id, edgeIndex: sIdx };
          addCandidate(segAng, 'parallel', `${bLabel} (Równoległy)`, 4, sourceSeg);
          addCandidate(normalizeAngle180(segAng + 90), 'perpendicular', `${bLabel} (Prostopadły 90°)`, 4, sourceSeg);
        }
      }
    }

    if (Array.isArray(bldg.zonePolygons)) {
      bldg.zonePolygons.forEach((zf) => {
        if (!zf.polygon || zf.polygon.length < 2) return;
        const nZ = zf.polygon.length;
        for (let i = 0; i < nZ; i++) {
          const p1 = zf.polygon[i];
          const p2 = zf.polygon[(i + 1) % nZ];
          const sdx = p2.x - p1.x;
          const sdy = p2.y - p1.y;
          if (Math.hypot(sdx, sdy) >= 0.05) {
            const rawSegAng = normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
            const segAng = isNearDominant(rawSegAng) && domPair
              ? (angleDiff180(rawSegAng, domPair.angle) <= 4.0 ? domPair.angle : domPair.ortho)
              : rawSegAng;
            const sourceSeg = { p1, p2, buildingId: bldg.id };
            addCandidate(segAng, 'parallel', `Strefa (${bldg.name}) (Równoległy)`, 4, sourceSeg);
            addCandidate(normalizeAngle180(segAng + 90), 'perpendicular', `Strefa (${bldg.name}) (Prostopadły 90°)`, 4, sourceSeg);
          }
        }
      });
    }
  }

  // 4. Pozostałe pobliskie budynki posortowane według odległości
  const maxSegments = APP_CONFIG.directionSnapping.maxNearbySegments;
  const otherNearbySegs: {
    angleDeg: number;
    dist: number;
    buildingName: string;
    seg: { p1: Point2D; p2: Point2D };
    buildingId: string;
    edgeIndex: number;
  }[] = [];

  for (const bldg of buildings) {
    if (bldg.isIncluded === false || bldg.category === 'boundary' || prioritizedBuildingIds.has(bldg.id) || !Array.isArray(bldg.segments)) continue;
    for (let sIdx = 0; sIdx < bldg.segments.length; sIdx++) {
      if (bldg.id === excludeBuildingId && excludeSegmentIndices?.includes(sIdx)) continue;
      const seg = bldg.segments[sIdx];
      const midX = (seg.p1.x + seg.p2.x) / 2;
      const midY = (seg.p1.y + seg.p2.y) / 2;
      const distToMid = Math.hypot(currentMouse.x - midX, currentMouse.y - midY);
      const dist = Math.min(
        Math.hypot(origin.x - midX, origin.y - midY),
        distToMid
      );
      const sdx = seg.p2.x - seg.p1.x;
      const sdy = seg.p2.y - seg.p1.y;
      const segLen = Math.hypot(sdx, sdy);
      if (segLen >= 0.05) {
        const segAng = normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
        if (isNearDominant(segAng)) continue;

        otherNearbySegs.push({
          angleDeg: segAng,
          dist,
          buildingName: bldg.name,
          seg: { p1: seg.p1, p2: seg.p2 },
          buildingId: bldg.id,
          edgeIndex: sIdx,
        });
      }
    }
  }

  otherNearbySegs.sort((a, b) => a.dist - b.dist);
  for (const item of otherNearbySegs.slice(0, maxSegments)) {
    const sourceSeg = { p1: item.seg.p1, p2: item.seg.p2, buildingId: item.buildingId, edgeIndex: item.edgeIndex };
    addCandidate(item.angleDeg, 'parallel', `${item.buildingName} (Równoległy)`, 6, sourceSeg);
    addCandidate(normalizeAngle180(item.angleDeg + 90), 'perpendicular', `${item.buildingName} (Prostopadły 90°)`, 6, sourceSeg);
  }

  // 5. Domyślne osie kartezjańskie Ortho (0° / 90°)
  addCandidate(0, 'dominant', 'Oś X (0.0°)', 8);
  addCandidate(90, 'dominant', 'Oś Y (90.0°)', 8);

  return candidates;
}

/**
 * Calculates direction snapping for cursor relative to an origin point,
 * with support for Dual-Guide Intersection Snapping when secondary origins are available.
 */
export function calculateDirectionSnap(options: CalculateDirectionSnapOptions): DirectionSnapResult | null {
  const {
    currentMouseWorld,
    originPoint,
    secondaryOriginPoints = [],
    buildings = [],
    dominantDirections = [],
    polylineVertices = [],
    staticReferenceSegments = [],
    worldToScreen,
    angleToleranceDeg = APP_CONFIG.directionSnapping.angleToleranceDeg,
    screenSnapThresholdPx = APP_CONFIG.directionSnapping.screenSnapThresholdPx,
    minDistanceMeters = APP_CONFIG.directionSnapping.minDistanceMeters,
    hoveredBuildingId,
    selectedBuildingId,
    excludeBuildingId,
    excludeSegmentIndices,
  } = options;

  if (!currentMouseWorld || !originPoint) return null;

  const dx = currentMouseWorld.x - originPoint.x;
  const dy = currentMouseWorld.y - originPoint.y;
  const dist = Math.hypot(dx, dy);

  if (dist < minDistanceMeters && secondaryOriginPoints.length === 0) {
    return null;
  }

  const rawMouseAngleDeg = normalizeAngle360((Math.atan2(dy, dx) * 180) / Math.PI);
  const rawMouseAxisDeg = normalizeAngle180(rawMouseAngleDeg);

  const primaryCandidates = collectTargetDirections(
    originPoint,
    currentMouseWorld,
    buildings,
    dominantDirections,
    polylineVertices,
    hoveredBuildingId,
    selectedBuildingId,
    excludeBuildingId,
    excludeSegmentIndices,
    staticReferenceSegments
  );

  const guideHalfLength = APP_CONFIG.directionSnapping.guideLineLengthMeters;

  // 1. Sprawdzenie przecięć prowadnic (Dual-Guide oraz Guide ✕ Edge Intersections)
  let bestIntersection: DirectionSnapResult | null = null;
  let bestIntScore = 999999;

  // 1a. Przecięcie dwóch prowadnic (Dual-Guide Intersection Snapping)
  if (secondaryOriginPoints && secondaryOriginPoints.length > 0) {
    for (const secOrigin of secondaryOriginPoints) {
      if (Math.hypot(secOrigin.x - originPoint.x, secOrigin.y - originPoint.y) < 0.05) continue;

      const secCandidates = collectTargetDirections(
        secOrigin,
        currentMouseWorld,
        buildings,
        dominantDirections,
        polylineVertices,
        hoveredBuildingId,
        selectedBuildingId,
        excludeBuildingId,
        excludeSegmentIndices,
        staticReferenceSegments
      );

      for (const cand1 of primaryCandidates) {
        const rad1 = (cand1.angleDeg * Math.PI) / 180;
        for (const cand2 of secCandidates) {
          // Odrzucamy proste prawie równoległe (kąt < 10° lub > 170°)
          const aDiff = angleDiff180(cand1.angleDeg, cand2.angleDeg);
          if (aDiff < 10 || aDiff > 170) continue;

          const rad2 = (cand2.angleDeg * Math.PI) / 180;
          const intPt = lineIntersection2D(originPoint, rad1, secOrigin, rad2);
          if (!intPt) continue;

          // Odległość punktu przecięcia od kursora
          const intDist = Math.hypot(currentMouseWorld.x - intPt.x, currentMouseWorld.y - intPt.y);
          let screenDistPx = intDist * 25; // fallback gdy brak worldToScreen
          let matchScreen = true;

          if (worldToScreen) {
            const sMouse = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
            const sInt = worldToScreen(intPt.x, intPt.y);
            screenDistPx = Math.hypot(sMouse.sx - sInt.sx, sMouse.sy - sInt.sy);
            if (screenDistPx > (screenSnapThresholdPx || 14) * 1.5) {
              matchScreen = false;
            }
          } else if (intDist > 1.5) {
            matchScreen = false;
          }

          if (matchScreen) {
            const score = screenDistPx + (cand1.priority + cand2.priority) * 0.4;
            if (score < bestIntScore) {
              bestIntScore = score;
              const cos1 = Math.cos(rad1);
              const sin1 = Math.sin(rad1);
              const cos2 = Math.cos(rad2);
              const sin2 = Math.sin(rad2);

              bestIntersection = {
                snappedPoint: intPt,
                originPoint: { x: originPoint.x, y: originPoint.y },
                guideAngleDeg: cand1.angleDeg,
                relationType: 'guide_intersection',
                isStatistical: false,
                guideLine: {
                  p1: { x: originPoint.x - guideHalfLength * cos1, y: originPoint.y - guideHalfLength * sin1 },
                  p2: { x: originPoint.x + guideHalfLength * cos1, y: originPoint.y + guideHalfLength * sin1 },
                },
                secondGuideLine: {
                  originPoint: secOrigin,
                  angleDeg: cand2.angleDeg,
                  label: cand2.sourceLabel,
                  p1: { x: secOrigin.x - guideHalfLength * cos2, y: secOrigin.y - guideHalfLength * sin2 },
                  p2: { x: secOrigin.x + guideHalfLength * cos2, y: secOrigin.y + guideHalfLength * sin2 },
                },
                distanceFromOrigin: Math.hypot(intPt.x - originPoint.x, intPt.y - originPoint.y),
                diffAngleDeg: 0,
                sourceLabel: `Przecięcie prowadnic (${cand1.sourceLabel || `${cand1.angleDeg.toFixed(1)}°`} ✕ ${cand2.sourceLabel || `${cand2.angleDeg.toFixed(1)}°`})`,
                sourceSegment: cand1.sourceSegment,
              };
            }
          }
        }
      }
    }
  }

  // 1b. Przecięcie prowadnicy z krawędzią obiektu w scenie (Guide ✕ Edge Intersection)
  const intersectableSegments: {
    p1: Point2D;
    p2: Point2D;
    buildingId?: string;
    buildingName?: string;
    edgeIndex?: number;
    label?: string;
  }[] = [];

  if (Array.isArray(staticReferenceSegments)) {
    for (const sSeg of staticReferenceSegments) {
      intersectableSegments.push({
        p1: sSeg.p1,
        p2: sSeg.p2,
        buildingId: sSeg.buildingId,
        edgeIndex: sSeg.edgeIndex,
        label: sSeg.label || 'Krawędź obiektu',
      });
    }
  }

  for (const bldg of buildings) {
    if (bldg.isIncluded === false || bldg.category === 'boundary') continue;
    if (Array.isArray(bldg.segments)) {
      for (let sIdx = 0; sIdx < bldg.segments.length; sIdx++) {
        if (bldg.id === excludeBuildingId && excludeSegmentIndices?.includes(sIdx)) continue;
        const seg = bldg.segments[sIdx];
        intersectableSegments.push({
          p1: seg.p1,
          p2: seg.p2,
          buildingId: bldg.id,
          buildingName: bldg.name,
          edgeIndex: sIdx,
          label: bldg.name,
        });
      }
    }
  }

  for (const cand of primaryCandidates) {
    const rad = (cand.angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    for (const seg of intersectableSegments) {
      if (
        cand.sourceSegment &&
        cand.sourceSegment.buildingId === seg.buildingId &&
        cand.sourceSegment.edgeIndex === seg.edgeIndex
      ) {
        continue;
      }
      if (Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y) < 0.05) continue;
      if (
        Math.hypot(seg.p1.x - originPoint.x, seg.p1.y - originPoint.y) < 0.05 &&
        Math.hypot(seg.p2.x - originPoint.x, seg.p2.y - originPoint.y) < 0.05
      ) {
        continue;
      }

      const intRes = lineSegmentIntersection2D(originPoint, rad, seg.p1, seg.p2);
      if (!intRes) continue;

      const intPt = intRes.point;
      const intDist = Math.hypot(currentMouseWorld.x - intPt.x, currentMouseWorld.y - intPt.y);
      let screenDistPx = intDist * 25;
      let matchScreen = true;

      if (worldToScreen) {
        const sMouse = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
        const sInt = worldToScreen(intPt.x, intPt.y);
        screenDistPx = Math.hypot(sMouse.sx - sInt.sx, sMouse.sy - sInt.sy);
        if (screenDistPx > (screenSnapThresholdPx || 14) * 1.5) {
          matchScreen = false;
        }
      } else if (intDist > 1.5) {
        matchScreen = false;
      }

      if (matchScreen) {
        const projOntoRay = (intPt.x - originPoint.x) * cosA + (intPt.y - originPoint.y) * sinA;
        const mouseProj = dx * cosA + dy * sinA;
        if (
          projOntoRay * mouseProj < -0.1 &&
          Math.hypot(currentMouseWorld.x - originPoint.x, currentMouseWorld.y - originPoint.y) > 0.5
        ) {
          continue;
        }

        const score = screenDistPx + (cand.priority || 10) * 0.3;
        if (score < bestIntScore) {
          bestIntScore = score;
          const segDx = seg.p2.x - seg.p1.x;
          const segDy = seg.p2.y - seg.p1.y;
          const segAngle = normalizeAngle180((Math.atan2(segDy, segDx) * 180) / Math.PI);
          const segLabel = seg.buildingName ? `${seg.buildingName}` : seg.label || 'Krawędź';

          bestIntersection = {
            snappedPoint: intPt,
            originPoint: { x: originPoint.x, y: originPoint.y },
            guideAngleDeg: cand.angleDeg,
            relationType: 'guide_intersection',
            isStatistical: false,
            guideLine: {
              p1: { x: originPoint.x - guideHalfLength * cosA, y: originPoint.y - guideHalfLength * sinA },
              p2: { x: originPoint.x + guideHalfLength * cosA, y: originPoint.y + guideHalfLength * sinA },
            },
            secondGuideLine: {
              originPoint: seg.p1,
              angleDeg: segAngle,
              label: segLabel,
              p1: seg.p1,
              p2: seg.p2,
            },
            intersectedSegment: {
              p1: seg.p1,
              p2: seg.p2,
              buildingId: seg.buildingId,
              edgeIndex: seg.edgeIndex,
              buildingName: seg.buildingName,
            },
            distanceFromOrigin: Math.hypot(intPt.x - originPoint.x, intPt.y - originPoint.y),
            diffAngleDeg: 0,
            sourceLabel: `✕ Przecięcie z krawędzią (${segLabel})`,
            sourceSegment: cand.sourceSegment,
          };
        }
      }
    }
  }

  if (bestIntersection) {
    return bestIntersection;
  }

  // 2. Standardowe dociąganie pojedynczej osi
  let bestSnap: DirectionSnapResult | null = null;
  let bestScore = 99999;

  for (const cand of primaryCandidates) {
    const diff = angleDiff180(cand.angleDeg, rawMouseAxisDeg);
    if (diff <= angleToleranceDeg) {
      const dominantBonus = cand.relationType === 'dominant' ? -0.5 : 0.0;
      const score = diff + (cand.priority || 10) * 0.12 + dominantBonus;
      if (score >= bestScore) continue;

      const diff1 = Math.abs(normalizeAngle360(cand.angleDeg) - rawMouseAngleDeg);
      const altDiff1 = Math.min(diff1, 360 - diff1);
      const forwardAngleDeg = altDiff1 <= 90 ? cand.angleDeg : cand.angleDeg + 180;
      const forwardRad = (forwardAngleDeg * Math.PI) / 180;

      const cosA = Math.cos(forwardRad);
      const sinA = Math.sin(forwardRad);

      const projectedDist = dx * cosA + dy * sinA;
      if (projectedDist <= 0 && dist >= minDistanceMeters) continue;

      const snappedX = originPoint.x + projectedDist * cosA;
      const snappedY = originPoint.y + projectedDist * sinA;

      if (worldToScreen) {
        const sMouse = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
        const sSnapped = worldToScreen(snappedX, snappedY);
        const screenDistPx = Math.hypot(sMouse.sx - sSnapped.sx, sMouse.sy - sSnapped.sy);
        if (screenDistPx > screenSnapThresholdPx) {
          continue;
        }
      }

      bestScore = score;
      bestSnap = {
        snappedPoint: { x: snappedX, y: snappedY },
        originPoint: { x: originPoint.x, y: originPoint.y },
        guideAngleDeg: forwardAngleDeg,
        relationType: cand.relationType,
        isStatistical: cand.relationType === 'dominant',
        guideLine: {
          p1: { x: originPoint.x - guideHalfLength * cosA, y: originPoint.y - guideHalfLength * sinA },
          p2: { x: originPoint.x + guideHalfLength * cosA, y: originPoint.y + guideHalfLength * sinA },
        },
        distanceFromOrigin: Math.max(0, projectedDist),
        diffAngleDeg: diff,
        sourceLabel: cand.sourceLabel,
        sourceSegment: cand.sourceSegment,
      };
    }
  }

  return bestSnap;
}

