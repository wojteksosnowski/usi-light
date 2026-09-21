import { Point2D, BuildingLoop, ObjectCategory } from '../../../types/geometry';
import { APP_CONFIG } from '../../../config/appConfig';
import { DominantDirection } from '../../../utils/segmentStatistics';
import {
  normalizeAngle360,
  normalizeAngle180,
  angleDiff180,
  lineIntersection2D,
  lineSegmentIntersection2D,
} from '../../../utils/math2d';
import {
  SnapContext,
  SnapResult,
  SnapStrategy,
  DirectionSnapResult,
  CalculateDirectionSnapOptions,
  DirectionCandidate,
} from '../types';
import { isIdExcluded } from './snapExclusionUtils';
import { buildCenteredGuideline } from '../guidelineUtils';

const getDisplayName = (bldg: BuildingLoop): string =>
  bldg.name || (bldg.plotNumber ? `Działka ${bldg.plotNumber}` : (bldg.category === 'boundary' ? 'Obszar' : 'Obiekt'));

// Kąt [0,180) krawędzi p1->p2, lub null gdy krawędź jest zbyt krótka (< 0.05 m) by liczyć się jako oś.
const angleOfSegment = (p1: Point2D, p2: Point2D): number | null => {
  const sdx = p2.x - p1.x;
  const sdy = p2.y - p1.y;
  if (Math.hypot(sdx, sdy) < 0.05) return null;
  return normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
};

/**
 * Gathers candidate target direction axes (in degrees [0, 180)) with strict spatial and hierarchy prioritization:
 * 1. Dominant scene axes from statistics (Siatka główna)
 * 2. Active polyline segments (0° parallel and 90° exact perpendicular).
 * 3. Static reference segments (e.g. from currently edited polygon/sweep).
 * 4. Currently hovered / intersected building walls and selected building static walls.
 * 5. Nearest neighbouring building walls (sorted by spatial proximity and category affinity).
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
  excludeBuildingIds?: string[],
  excludeSegmentIndices?: number[],
  staticReferenceSegments: { p1: Point2D; p2: Point2D; label?: string; buildingId?: string; edgeIndex?: number }[] = [],
  activeCategory?: ObjectCategory,
  maxNearbySegments: number = APP_CONFIG.directionSnapping.maxNearbySegments
): DirectionCandidate[] {
  const excludedSet = new Set<string>(excludeBuildingIds || []);
  if (excludeBuildingId) excludedSet.add(excludeBuildingId);

  const isBldgExcluded = (id: string) => isIdExcluded(id, excludedSet);
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
    // Próg separacji kątowej ujednolicony ze spec §2.2 (2.0°) oraz z regułą separacji EDGE_UCS
    // w segmentStatistics.ts (angularSeparationMod90Deg), zapobiegając duplikatom osi śledzenia.
    const dedupThreshold = relationType === 'dominant' ? 2.0 : 2.5;
    for (const sa of seenAngles) {
      if (angleDiff180(sa, norm) < dedupThreshold) return;
    }
    seenAngles.push(norm);
    candidates.push({ angleDeg: norm, relationType, sourceLabel, priority, sourceSegment });
  };

  // Dodaje parę kandydatów (Równoległy + Prostopadły 90°) dla jednej krawędzi źródłowej —
  // eliminuje powtórzenie dwóch wywołań addCandidate() w każdym miejscu iteracji po segmentach.
  const addParallelPerp = (
    segAngle: number,
    label: string,
    priority: number,
    sourceSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number }
  ) => {
    addCandidate(segAngle, 'parallel', `${label} (Równoległy)`, priority, sourceSegment);
    addCandidate(normalizeAngle180(segAngle + 90), 'perpendicular', `${label} (Prostopadły 90°)`, priority, sourceSegment);
  };

  // 1. Dominant scene axes from statistics (Siatka główna)
  const domPair: { angle: number; ortho: number } | null =
    dominantDirections && dominantDirections.length > 0 && dominantDirections[0].isTrackingActive !== false
      ? { angle: dominantDirections[0].angleDeg, ortho: dominantDirections[0].orthogonalDeg }
      : null;

  if (domPair) {
    addCandidate(domPair.angle, 'dominant', `Siatka główna (${domPair.angle.toFixed(1)}°)`, 2);
    addCandidate(domPair.ortho, 'dominant', `Siatka poprzeczna (${domPair.ortho.toFixed(1)}°)`, 2);
  }

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

      addCandidate(
        segAngle,
        'parallel',
        isLastSeg ? 'Polilinia (Równoległy)' : `Polilinia (Równoległy do seg. ${segIdx})`,
        basePri,
        { p1: pA, p2: pB }
      );
      addCandidate(
        perpAngle,
        'perpendicular',
        isLastSeg ? 'Polilinia (Prostopadły 90°)' : `Polilinia (Prostopadły 90° do seg. ${segIdx})`,
        basePri,
        { p1: pA, p2: pB }
      );
    }
  }

  // 3. Static reference segments (np. pozostałe stałe krawędzie edytowanego wielokąta/wstęgi)
  if (Array.isArray(staticReferenceSegments) && staticReferenceSegments.length > 0) {
    for (const refSeg of staticReferenceSegments) {
      const sdx = refSeg.p2.x - refSeg.p1.x;
      const sdy = refSeg.p2.y - refSeg.p1.y;
      if (Math.hypot(sdx, sdy) >= 0.05) {
        const segAng = normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
        const sLabel = refSeg.label || 'Krawędź (Równoległy)';
        const pLabel = refSeg.label ? refSeg.label.replace('Równoległy', 'Prostopadły 90°') : 'Krawędź (Prostopadły 90°)';
        addCandidate(segAng, 'parallel', sLabel, 3, refSeg);
        addCandidate(normalizeAngle180(segAng + 90), 'perpendicular', pLabel, 3, refSeg);
      }
    }
  }

  // 4. Priorytetyzacja wskazanego/najechanego obiektu
  const prioritizedBuildingIds = new Set<string>();
  if (hoveredBuildingId && !isBldgExcluded(hoveredBuildingId)) {
    prioritizedBuildingIds.add(hoveredBuildingId);
  }
  if (selectedBuildingId && !isBldgExcluded(selectedBuildingId)) {
    prioritizedBuildingIds.add(selectedBuildingId);
  }

  const prioBuildings = buildings.filter((b) => prioritizedBuildingIds.has(b.id) && b.isIncluded !== false);
  for (const bldg of prioBuildings) {
    if (isBldgExcluded(bldg.id) && (!excludeSegmentIndices || excludeSegmentIndices.length === 0)) continue;
    if (Array.isArray(bldg.segments)) {
      for (let sIdx = 0; sIdx < bldg.segments.length; sIdx++) {
        if (isBldgExcluded(bldg.id) && excludeSegmentIndices?.includes(sIdx)) continue;
        const seg = bldg.segments[sIdx];
        const segAng = angleOfSegment(seg.p1, seg.p2);
        if (segAng === null) continue;
        const bLabel = bldg.id === hoveredBuildingId ? `Obiekt wskazany (${bldg.name})` : `${bldg.name}`;
        addParallelPerp(segAng, bLabel, 4, { p1: seg.p1, p2: seg.p2, buildingId: bldg.id, edgeIndex: sIdx });
      }
    }

    if (Array.isArray(bldg.zonePolygons)) {
      if (isBldgExcluded(bldg.id) && (!excludeSegmentIndices || excludeSegmentIndices.length === 0)) continue;
      const zoneLabel = `Bufor (${getDisplayName(bldg)})`;
      bldg.zonePolygons.forEach((zf, zIdx) => {
        if (!zf.polygon || zf.polygon.length < 2) return;
        const nZ = zf.polygon.length;
        for (let i = 0; i < nZ; i++) {
          const p1 = zf.polygon[i];
          const p2 = zf.polygon[(i + 1) % nZ];
          const segAng = angleOfSegment(p1, p2);
          if (segAng === null) continue;
          addParallelPerp(segAng, zoneLabel, 4, { p1, p2, buildingId: `${bldg.id}_zone_${zIdx}`, edgeIndex: i });
        }
      });
    }
  }

  // 5. Pozostałe pobliskie budynki posortowane według odległości
  {
    const maxSegments = maxNearbySegments;
    const otherNearbySegs: {
      angleDeg: number;
      dist: number;
      buildingName: string;
      seg: { p1: Point2D; p2: Point2D };
      buildingId: string;
      edgeIndex: number;
    }[] = [];

    // Odległość efektywna: mniejsza z (origin, mysz) do środka krawędzi, przepołowiona
    // dla obiektów tej samej kategorii co aktywna (priorytet spójności kategorii).
    const effDistToMid = (p1: Point2D, p2: Point2D, bldg: BuildingLoop): number => {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dist = Math.min(
        Math.hypot(origin.x - midX, origin.y - midY),
        Math.hypot(currentMouse.x - midX, currentMouse.y - midY)
      );
      return activeCategory && bldg.category === activeCategory ? dist * 0.5 : dist;
    };

    for (const bldg of buildings) {
      if (bldg.isIncluded === false || prioritizedBuildingIds.has(bldg.id)) continue;
      if (isBldgExcluded(bldg.id) && (!excludeSegmentIndices || excludeSegmentIndices.length === 0)) continue;
      const displayName = getDisplayName(bldg);
      if (Array.isArray(bldg.segments)) {
        for (let sIdx = 0; sIdx < bldg.segments.length; sIdx++) {
          if (isBldgExcluded(bldg.id) && excludeSegmentIndices?.includes(sIdx)) continue;
          const seg = bldg.segments[sIdx];
          const segAng = angleOfSegment(seg.p1, seg.p2);
          if (segAng === null) continue;
          otherNearbySegs.push({
            angleDeg: segAng,
            dist: effDistToMid(seg.p1, seg.p2, bldg),
            buildingName: displayName,
            seg: { p1: seg.p1, p2: seg.p2 },
            buildingId: bldg.id,
            edgeIndex: sIdx,
          });
        }
      }

      if (Array.isArray(bldg.zonePolygons)) {
        if (isBldgExcluded(bldg.id) && (!excludeSegmentIndices || excludeSegmentIndices.length === 0)) continue;
        bldg.zonePolygons.forEach((zf, zIdx) => {
          if (!zf.polygon || zf.polygon.length < 2) return;
          const nZ = zf.polygon.length;
          for (let i = 0; i < nZ; i++) {
            const p1 = zf.polygon[i];
            const p2 = zf.polygon[(i + 1) % nZ];
            const segAng = angleOfSegment(p1, p2);
            if (segAng === null) continue;
            otherNearbySegs.push({
              angleDeg: segAng,
              dist: effDistToMid(p1, p2, bldg),
              buildingName: `Bufor (${displayName})`,
              seg: { p1, p2 },
              buildingId: `${bldg.id}_zone_${zIdx}`,
              edgeIndex: i,
            });
          }
        });
      }
    }

    otherNearbySegs.sort((a, b) => a.dist - b.dist);
    for (const item of otherNearbySegs.slice(0, maxSegments)) {
      const sourceSeg = { p1: item.seg.p1, p2: item.seg.p2, buildingId: item.buildingId, edgeIndex: item.edgeIndex };
      addParallelPerp(item.angleDeg, item.buildingName, 6, sourceSeg);
    }
  }

  // 6. Domyślne osie kartezjańskie Ortho (0° / 90°)
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
    maxNearbySegments = APP_CONFIG.directionSnapping.maxNearbySegments,
    guideLineLengthMeters = APP_CONFIG.directionSnapping.guideLineLengthMeters,
    hoveredBuildingId,
    selectedBuildingId,
    activeCategory,
    excludeBuildingId,
    excludeBuildingIds,
    excludeSegmentIndices,
  } = options;

  if (!currentMouseWorld || !originPoint) return null;

  const excludedSet = new Set<string>(excludeBuildingIds || []);
  if (excludeBuildingId) excludedSet.add(excludeBuildingId);

  const isBldgExcluded = (id: string) => isIdExcluded(id, excludedSet);

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
    excludeBuildingIds,
    excludeSegmentIndices,
    staticReferenceSegments,
    activeCategory,
    maxNearbySegments
  );

  const guideHalfLength = guideLineLengthMeters;

  // Odległość ekranowa (px) między myszą a punktem przecięcia, oraz czy mieści się w progu
  // (wspólne dla 1a Dual-Guide i 1b Guide✕Edge, z tolerancją *1.5 i fallbackiem bez worldToScreen).
  const screenDistToMouse = (intPt: Point2D): { screenDistPx: number; withinThreshold: boolean } => {
    const intDist = Math.hypot(currentMouseWorld.x - intPt.x, currentMouseWorld.y - intPt.y);
    if (worldToScreen) {
      const sMouse = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
      const sInt = worldToScreen(intPt.x, intPt.y);
      const screenDistPx = Math.hypot(sMouse.sx - sInt.sx, sMouse.sy - sInt.sy);
      return { screenDistPx, withinThreshold: screenDistPx <= (screenSnapThresholdPx || 14) * 1.5 };
    }
    return { screenDistPx: intDist * 25, withinThreshold: intDist <= 1.5 };
  };

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
        excludeBuildingIds,
        excludeSegmentIndices,
        staticReferenceSegments,
        activeCategory,
        maxNearbySegments
      );

      for (const cand1 of primaryCandidates) {
        const rad1 = (cand1.angleDeg * Math.PI) / 180;
        for (const cand2 of secCandidates) {
          const aDiff = angleDiff180(cand1.angleDeg, cand2.angleDeg);
          if (aDiff < 10 || aDiff > 170) continue;

          const rad2 = (cand2.angleDeg * Math.PI) / 180;
          const intPt = lineIntersection2D(originPoint, rad1, secOrigin, rad2);
          if (!intPt) continue;

          const { screenDistPx, withinThreshold } = screenDistToMouse(intPt);

          if (withinThreshold) {
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
                guideLine: buildCenteredGuideline(originPoint, { x: cos1, y: sin1 }, guideHalfLength),
                secondGuideLine: {
                  originPoint: secOrigin,
                  angleDeg: cand2.angleDeg,
                  label: cand2.sourceLabel,
                  ...buildCenteredGuideline(secOrigin, { x: cos2, y: sin2 }, guideHalfLength),
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

  for (const bldg of buildings) {
    if (bldg.isIncluded === false) continue;
    if (isBldgExcluded(bldg.id) && (!excludeSegmentIndices || excludeSegmentIndices.length === 0)) continue;
    const displayName = getDisplayName(bldg);
    if (Array.isArray(bldg.segments)) {
      for (let sIdx = 0; sIdx < bldg.segments.length; sIdx++) {
        if (isBldgExcluded(bldg.id) && excludeSegmentIndices?.includes(sIdx)) continue;
        const seg = bldg.segments[sIdx];
        intersectableSegments.push({
          p1: seg.p1,
          p2: seg.p2,
          buildingId: bldg.id,
          edgeIndex: sIdx,
          buildingName: displayName,
          label: displayName,
        });
      }
    }

    if (Array.isArray(bldg.zonePolygons)) {
      if (isBldgExcluded(bldg.id) && (!excludeSegmentIndices || excludeSegmentIndices.length === 0)) continue;
      bldg.zonePolygons.forEach((zf, zIdx) => {
        if (!zf.polygon || zf.polygon.length < 2) return;
        const nZ = zf.polygon.length;
        for (let i = 0; i < nZ; i++) {
          const p1 = zf.polygon[i];
          const p2 = zf.polygon[(i + 1) % nZ];
          if (angleOfSegment(p1, p2) === null) continue;
          intersectableSegments.push({
            p1,
            p2,
            buildingId: `${bldg.id}_zone_${zIdx}`,
            edgeIndex: i,
            buildingName: `Bufor (${displayName})`,
            label: `Bufor (${displayName})`,
          });
        }
      });
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
      const { screenDistPx, withinThreshold } = screenDistToMouse(intPt);

      if (withinThreshold) {
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
            guideLine: buildCenteredGuideline(originPoint, { x: cosA, y: sinA }, guideHalfLength),
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
        guideLine: buildCenteredGuideline(originPoint, { x: cosA, y: sinA }, guideHalfLength),
        distanceFromOrigin: Math.max(0, projectedDist),
        diffAngleDeg: diff,
        sourceLabel: cand.sourceLabel,
        sourceSegment: cand.sourceSegment,
      };
    }
  }

  return bestSnap;
}

export class DirectionSnapStrategy implements SnapStrategy {
  readonly name = 'DirectionSnapStrategy';
  readonly priority = 60; // Działa na promieniach kątowych przy rysowaniu / edycji

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    if (!context.isDirectionSnappingActive || !context.originPoint) {
      return null;
    }

    const dirSnap: DirectionSnapResult | null = calculateDirectionSnap({
      currentMouseWorld: point,
      originPoint: context.originPoint,
      buildings: context.buildings,
      dominantDirections: context.dominantDirections,
      polylineVertices: context.polylineVertices,
      worldToScreen: context.worldToScreen,
      hoveredBuildingId: context.hoveredBuildingId,
      selectedBuildingId: context.selectedBuildingId,
      excludeBuildingId: context.excludeBuildingId,
      excludeBuildingIds: context.excludeBuildingIds,
      excludeSegmentIndices: context.excludeSegmentIndices,
      activeCategory: context.activeCategory,
      // Ujednolicenie apertury px<->world ze wspólnym progiem strategii (zamiast osobnego
      // APP_CONFIG.directionSnapping.screenSnapThresholdPx), by OTRACK/kierunki nie miały
      // odrębnej, nieskoordynowanej strefy przechwytywania.
      screenSnapThresholdPx: context.thresholdPx ?? APP_CONFIG.directionSnapping.screenSnapThresholdPx,
    });

    if (!dirSnap) return null;

    const label = dirSnap.sourceLabel || `${dirSnap.guideAngleDeg.toFixed(1)}°`;
    const screenPt = context.worldToScreen(dirSnap.snappedPoint.x, dirSnap.snappedPoint.y);
    const screenDistancePx = Math.hypot(context.mouseScreen.sx - screenPt.sx, context.mouseScreen.sy - screenPt.sy);

    return {
      point: dirSnap.snappedPoint,
      snapped: true,
      type: 'direction',
      label,
      description: `Kierunek ${dirSnap.relationType} (${label})`,
      screenDistancePx,
      guideLines: [
        {
          p1: dirSnap.guideLine.p1,
          p2: dirSnap.guideLine.p2,
          type: dirSnap.relationType,
          isStatistical: dirSnap.isStatistical,
        },
      ],
      metadata: {
        rawDirection: dirSnap,
        guideAngleDeg: dirSnap.guideAngleDeg,
        relationType: dirSnap.relationType,
        effDistPx: screenDistancePx,
      },
    };
  }
}
