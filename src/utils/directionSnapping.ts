import { Point2D, BuildingLoop } from '../types/geometry';
import { DominantDirection } from './segmentStatistics';
import { APP_CONFIG } from '../config/appConfig';


export interface DirectionSnapResult {
  snappedPoint: Point2D;
  originPoint: Point2D;
  guideAngleDeg: number;
  relationType: 'parallel' | 'perpendicular' | 'dominant';
  isStatistical?: boolean; // true dla siatek głównych i statystycznych, false dla konkretnych krawędzi
  guideLine: { p1: Point2D; p2: Point2D };
  distanceFromOrigin: number;
  diffAngleDeg: number;
  sourceLabel?: string;
  sourceSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number };
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
 * Gathers candidate target direction axes (in degrees [0, 180)) with strict spatial and hierarchy prioritization:
 * 1. Active polyline segments (0° parallel and 90° exact perpendicular).
 * 2. Currently hovered / intersected building walls and selected building static walls.
 * 3. Nearest neighbouring building walls (sorted by spatial proximity).
 * 4. Dominant orthogonal axes from global facade statistics (theta and theta + 90°).
 * 5. Default Cartesian Ortho axes (0° / 90°).
 *
 * NOTE: Secondary angle splits (45°, 30°, 60°) are explicitly excluded to keep CAD snapping clean and deterministic.
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
  excludeSegmentIndices?: number[]
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
    // Podwyższony próg deduplikacji z 1.2° do 3.0° dla eliminacji szumu mikro-odchyleń
    const dedupThreshold = relationType === 'dominant' ? 1.5 : 3.0;
    for (const sa of seenAngles) {
      if (angleDiff180(sa, norm) < dedupThreshold) return;
    }
    seenAngles.push(norm);
    candidates.push({ angleDeg: norm, relationType, sourceLabel, priority, sourceSegment });
  };

  // 1. Dominant scene axes from statistics (Siatka główna) - NAJWYŻSZA WAGA DLA SPÓJNOŚCI PROJEKTU
  // Silna promocja siatki głównej: dodajemy jako pierwsze z priorytetem 2
  const domPair: { angle: number; ortho: number } | null =
    dominantDirections && dominantDirections.length > 0
      ? { angle: dominantDirections[0].angleDeg, ortho: dominantDirections[0].orthogonalDeg }
      : null;

  if (domPair) {
    addCandidate(domPair.angle, 'dominant', `Siatka główna (${domPair.angle.toFixed(1)}°)`, 2);
    addCandidate(domPair.ortho, 'dominant', `Siatka poprzeczna (${domPair.ortho.toFixed(1)}°)`, 2);
  }

  // Pomocnicza funkcja: jeśli kąt leży w odległości <= 4.0° od siatki dominującej,
  // traktujemy go jako tożsamy z siatką dominującą i nie dodajemy nowego prawie zbieżnego kąta
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

      // Jeśli kąt pokrywa się z dominującym (np. różnica < 4.0°), pozwól dominującemu rządzić
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

  // 3. Priorytetyzacja wskazanego/najechanego obiektu (z pominięciem wykluczonych segmentów)
  const prioritizedBuildingIds = new Set<string>();
  if (hoveredBuildingId && hoveredBuildingId !== excludeBuildingId) {
    prioritizedBuildingIds.add(hoveredBuildingId);
  }
  if (selectedBuildingId && selectedBuildingId !== excludeBuildingId) {
    prioritizedBuildingIds.add(selectedBuildingId);
  }

  const prioBuildings = buildings.filter((b) => prioritizedBuildingIds.has(b.id) && b.isIncluded !== false);
  for (const bldg of prioBuildings) {
    // Segmenty bazowe obiektu (o ile nie jest to czysty boundary bez segmentów)
    if (Array.isArray(bldg.segments)) {
      for (let sIdx = 0; sIdx < bldg.segments.length; sIdx++) {
        if (bldg.id === excludeBuildingId && excludeSegmentIndices?.includes(sIdx)) continue;
        const seg = bldg.segments[sIdx];
        const sdx = seg.p2.x - seg.p1.x;
        const sdy = seg.p2.y - seg.p1.y;
        if (Math.hypot(sdx, sdy) >= 0.05) {
          const rawSegAng = normalizeAngle180((Math.atan2(sdy, sdx) * 180) / Math.PI);
          // Tłumienie szumu: jeśli kąt ściany różni się od siatki dominującej o <= 4.0°, przyciągamy do siatki
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

    // Krawędzie stref buforowych (zonePolygons)
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
    isCursorNearEdge: boolean;
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
        // Odrzuć jeśli to szum bliski dominującej siatki (różnica < 4.0°)
        if (isNearDominant(segAng)) continue;

        // Odległość prostopadła kursora do prostej krawędzi
        const uX = sdx / segLen;
        const uY = sdy / segLen;
        const perpDist = Math.abs((currentMouse.x - seg.p1.x) * (-uY) + (currentMouse.y - seg.p1.y) * uX);
        const isCursorNearEdge = perpDist <= 2.5 && distToMid <= segLen + 3.0;

        otherNearbySegs.push({
          angleDeg: segAng,
          dist,
          buildingName: bldg.name,
          seg: { p1: seg.p1, p2: seg.p2 },
          buildingId: bldg.id,
          edgeIndex: sIdx,
          isCursorNearEdge,
        });
      }
    }
  }

  otherNearbySegs.sort((a, b) => a.dist - b.dist);
  for (const item of otherNearbySegs.slice(0, maxSegments)) {
    const sourceSeg = { p1: item.seg.p1, p2: item.seg.p2, buildingId: item.buildingId, edgeIndex: item.edgeIndex };
    addCandidate(item.angleDeg, 'parallel', `${item.buildingName} (Równoległy)`, 6, sourceSeg);
    // Kąt prostopadły do odległych ścian uwzględniamy TYLKO wtedy, gdy kursor znajduje się blisko tej krawędzi/jej osi
    if (item.isCursorNearEdge) {
      addCandidate(normalizeAngle180(item.angleDeg + 90), 'perpendicular', `${item.buildingName} (Prostopadły 90°)`, 6, sourceSeg);
    }
  }

  // 5. Domyślne osie kartezjańskie Ortho (0° / 90°)
  addCandidate(0, 'dominant', 'Oś X (0.0°)', 8);
  addCandidate(90, 'dominant', 'Oś Y (90.0°)', 8);

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
    hoveredBuildingId,
    selectedBuildingId,
    excludeBuildingId,
    excludeSegmentIndices,
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
    polylineVertices,
    hoveredBuildingId,
    selectedBuildingId,
    excludeBuildingId,
    excludeSegmentIndices
  );

  let bestSnap: DirectionSnapResult | null = null;
  let bestScore = 99999;

  const guideHalfLength = APP_CONFIG.directionSnapping.guideLineLengthMeters;

  for (const cand of candidates) {
    const diff = angleDiff180(cand.angleDeg, rawMouseAxisDeg);
    if (diff <= angleToleranceDeg) {
      // Score: łączymy różnicę kątową z wagą priorytetu
      // Silna promocja kierunku dominującego (bonus -0.5 punktu w score)
      const dominantBonus = cand.relationType === 'dominant' ? -0.5 : 0.0;
      const score = diff + (cand.priority || 10) * 0.12 + dominantBonus;
      if (score >= bestScore) continue;

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
        distanceFromOrigin: projectedDist,
        diffAngleDeg: diff,
        sourceLabel: cand.sourceLabel,
        sourceSegment: cand.sourceSegment,
      };
    }
  }

  return bestSnap;
}
