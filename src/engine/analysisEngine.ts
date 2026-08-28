import {
  BuildingLoop,
  FacadeSegment,
  Point2D,
  Vector2D,
  ShadowingResult,
  ShadowingSector,
  SunlightResult,
  SunlightTimeSlot,
  AnalysisPointResult,
  ProjectSettings,
} from '../types/geometry';
import {
  raySegmentIntersection,
  sampleSegmentPoints,
} from '../utils/math2d';
import { calculateSolarPosition } from '../utils/solar';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Evaluates § 12 shadowing for a single point P on a facade.
 */
export function analyzeShadowingAtPoint(
  point: Point2D,
  segment: FacadeSegment,
  offsetRatio: number,
  allBuildings: BuildingLoop[],
  targetBuildingId: string,
  angleStepDeg: number = 0.5
): ShadowingResult {
  const normal = segment.normal;
  const normalAngleRad = Math.atan2(normal.y, normal.x);

  const rays: ShadowingResult['rays'] = [];
  const minAngleDeg = -78; // 12 deg cutoff from wall plane on left
  const maxAngleDeg = 78; // 12 deg cutoff from wall plane on right

  for (let aDeg = minAngleDeg; aDeg <= maxAngleDeg; aDeg += angleStepDeg) {
    const worldAngleRad = normalAngleRad + aDeg * DEG2RAD;
    const rayDir: Vector2D = {
      x: Math.cos(worldAngleRad),
      y: Math.sin(worldAngleRad),
    };

    let closestHitDist = Infinity;
    let closestReqDist = 0;
    let hitPoint: Point2D | undefined = undefined;
    let hitObstacleId: string | undefined = undefined;

    // Check collision with every segment of every building
    for (const bldg of allBuildings) {
      if (bldg.isIncluded === false) continue;

      // Check if it's an obstacle
      for (const seg of bldg.segments) {
        // Skip self-segment
        if (bldg.id === targetBuildingId && seg.id === segment.id) continue;

        const hit = raySegmentIntersection(point, rayDir, seg.p1, seg.p2);
        if (hit.hit && hit.distance < closestHitDist) {
          // Calculate delta H = H_top - H_window_bottom
          const deltaH = Math.max(0, seg.hTop - segment.hWindowBottom);

          // § 12 ust. 1 pkt 1: D_base = deltaH (if <= 35m) or 35m (if > 35m)
          const dBase = Math.min(deltaH, 35.0);

          // § 12 ust. 5: Zabudowa śródmiejska - reduce by up to half (0.5 * D_base)
          const dReq = (segment.isCityCentre || bldg.isCityCentre) ? 0.5 * dBase : dBase;

          // § 12 ust. 6: Secondary elements <= 1.8m from the same wall
          if (bldg.id === targetBuildingId && hit.distance <= 1.8) {
            continue;
          }

          // § 12 ust. 4: Slender objects (width <= 3m at distance >= 10m)
          // Simplified for now - can be flagged per object
          closestHitDist = hit.distance;
          closestReqDist = dReq;
          hitPoint = hit.point;
          hitObstacleId = bldg.id;
        }
      }
    }

    const isFree = closestHitDist === Infinity || closestHitDist >= closestReqDist;

    rays.push({
      angleDeg: aDeg,
      worldAngleDeg: (worldAngleRad * RAD2DEG + 360) % 360,
      isFree,
      hitDistance: closestHitDist === Infinity ? 999 : closestHitDist,
      reqDistance: closestReqDist,
      hitPoint,
      obstacleId: hitObstacleId,
    });
  }

  // Aggregate rays into continuous sectors
  const sectors: ShadowingSector[] = [];
  let currentSector: ShadowingSector | null = null;

  for (let i = 0; i < rays.length; i++) {
    const ray = rays[i];
    if (!currentSector) {
      currentSector = {
        startAngleDeg: ray.angleDeg,
        endAngleDeg: ray.angleDeg,
        spanDeg: angleStepDeg,
        isFree: ray.isFree,
      };
    } else if (currentSector.isFree === ray.isFree) {
      currentSector.endAngleDeg = ray.angleDeg;
      currentSector.spanDeg = currentSector.endAngleDeg - currentSector.startAngleDeg;
    } else {
      sectors.push(currentSector);
      currentSector = {
        startAngleDeg: ray.angleDeg,
        endAngleDeg: ray.angleDeg,
        spanDeg: angleStepDeg,
        isFree: ray.isFree,
      };
    }
  }
  if (currentSector) {
    sectors.push(currentSector);
  }

  // Calculate maximum continuous free span and total free span
  let maxContinuousFreeSpanDeg = 0;
  let totalFreeSpanDeg = 0;

  for (const s of sectors) {
    if (s.isFree) {
      totalFreeSpanDeg += s.spanDeg;
      if (s.spanDeg > maxContinuousFreeSpanDeg) {
        maxContinuousFreeSpanDeg = s.spanDeg;
      }
    }
  }

  // § 12 ust. 1 pkt 1: Continuous >= 60°
  // § 12 ust. 2: Or sum of free sectors >= 75°
  const isCompliant = maxContinuousFreeSpanDeg >= 60.0 || totalFreeSpanDeg >= 75.0;

  return {
    point,
    segmentId: segment.id,
    offsetRatio,
    isCompliant,
    maxContinuousFreeSpanDeg,
    totalFreeSpanDeg,
    sectors,
    rays,
  };
}

/**
 * Evaluates § 56 sunlight duration at point P on equinox.
 */
export interface SolarTrajectorySlot {
  timeStr: string;
  hourDec: number;
  azimuthDeg: number;
  elevationDeg: number;
  sunDir: Vector2D;
  isSunAboveHorizon: boolean;
}

// Precompute cos(78 deg) - minimal dot product for incidence angle >= 12 deg from wall surface
const COS_78_DEG = Math.cos(78.0 * DEG2RAD);

/**
 * Computes and caches daily solar path trajectory for the equinox analysis window.
 */
export function computeDailySolarTrajectory(
  settings: ProjectSettings,
  stepMinutes: number = 5,
  isChildcare: boolean = false
): SolarTrajectorySlot[] {
  const month = settings.equinoxDate === 'autumn' ? 9 : 3;
  const day = settings.equinoxDate === 'autumn' ? 23 : 21;

  const noonPos = calculateSolarPosition(settings.latitude, settings.longitude, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;
  const hoursRadius = isChildcare ? 4 : 5;

  const startHour = Math.max(5.0, noonHour - hoursRadius);
  const endHour = Math.min(19.0, noonHour + hoursRadius);

  const totalSteps = Math.round(((endHour - startHour) * 60) / stepMinutes);
  const trajectory: SolarTrajectorySlot[] = [];

  for (let s = 0; s <= totalSteps; s++) {
    const currentHourDec = startHour + (s * stepMinutes) / 60;
    const hourInt = Math.floor(currentHourDec);
    const minInt = Math.round((currentHourDec - hourInt) * 60);
    const timeStr = `${String(hourInt).padStart(2, '0')}:${String(minInt).padStart(2, '0')}`;

    const pos = calculateSolarPosition(settings.latitude, settings.longitude, month, day, currentHourDec);
    const isAbove = pos.elevationDeg > 0;

    const sunAzimuthMathRad = ((90 - pos.azimuthDeg + 360) % 360) * DEG2RAD;
    const sunDir: Vector2D = {
      x: Math.cos(sunAzimuthMathRad),
      y: Math.sin(sunAzimuthMathRad),
    };

    trajectory.push({
      timeStr,
      hourDec: currentHourDec,
      azimuthDeg: pos.azimuthDeg,
      elevationDeg: pos.elevationDeg,
      sunDir,
      isSunAboveHorizon: isAbove,
    });
  }

  return trajectory;
}

/**
 * Evaluates § 56 sunlight duration at point P on equinox.
 * Uses orientation-aware culling to eliminate calculations for North-facing facades.
 */
export function analyzeSunlightAtPoint(
  point: Point2D,
  segment: FacadeSegment,
  offsetRatio: number,
  allBuildings: BuildingLoop[],
  targetBuildingId: string,
  settings: ProjectSettings,
  stepMinutes: number = 5,
  precomputedTrajectory?: SolarTrajectorySlot[]
): SunlightResult {
  const normal = segment.normal;
  const isChildcare = segment.buildingType === 'childcare';

  const trajectory =
    precomputedTrajectory ??
    computeDailySolarTrajectory(settings, stepMinutes, isChildcare);

  // 1. Orientation culling check:
  // Can this facade orientation EVER receive direct sunlight in the analysis window (noon +- 5h)?
  let canReceiveSunlight = false;
  for (const slot of trajectory) {
    if (slot.isSunAboveHorizon) {
      const dot = normal.x * slot.sunDir.x + normal.y * slot.sunDir.y;
      if (dot >= COS_78_DEG) {
        canReceiveSunlight = true;
        break;
      }
    }
  }

  // Fast-path: North-facing facades (or facades turned away from the entire solar arc)
  // receive 0 minutes of sunlight — skip 100% of raycasts!
  if (!canReceiveSunlight) {
    const emptySlots: SunlightTimeSlot[] = trajectory.map((slot) => ({
      time: slot.timeStr,
      azimuthDeg: slot.azimuthDeg,
      elevationDeg: slot.elevationDeg,
      isSunAboveHorizon: slot.isSunAboveHorizon,
      isAngleAbove12Deg: false,
      isDirectSunlight: false,
    }));

    return {
      point,
      segmentId: segment.id,
      offsetRatio,
      totalMinutes: 0,
      totalHours: 0,
      isCompliant: false,
      timeSlots: emptySlots,
    };
  }

  // 2. Perform raycast analysis only for active solar trajectory slots
  const timeSlots: SunlightTimeSlot[] = [];
  let totalMinutesSunlight = 0;

  for (const slot of trajectory) {
    if (!slot.isSunAboveHorizon) {
      timeSlots.push({
        time: slot.timeStr,
        azimuthDeg: slot.azimuthDeg,
        elevationDeg: slot.elevationDeg,
        isSunAboveHorizon: false,
        isAngleAbove12Deg: false,
        isDirectSunlight: false,
      });
      continue;
    }

    const dot = normal.x * slot.sunDir.x + normal.y * slot.sunDir.y;
    // Angle on plan >= 12 deg from wall surface => <= 78 deg from normal (dot >= COS_78_DEG)
    const isAngleAbove12Deg = dot >= COS_78_DEG;

    if (!isAngleAbove12Deg) {
      timeSlots.push({
        time: slot.timeStr,
        azimuthDeg: slot.azimuthDeg,
        elevationDeg: slot.elevationDeg,
        isSunAboveHorizon: true,
        isAngleAbove12Deg: false,
        isDirectSunlight: false,
      });
      continue;
    }

    // Raycast towards sun to find obstacles in 2.5D
    let isBlocked = false;
    let blockingObstacleId: string | undefined = undefined;
    let maxObstacleAngleDeg = 0;

    for (const bldg of allBuildings) {
      if (bldg.isIncluded === false) continue;

      for (const seg of bldg.segments) {
        if (bldg.id === targetBuildingId && seg.id === segment.id) continue;

        const hit = raySegmentIntersection(point, slot.sunDir, seg.p1, seg.p2);
        if (hit.hit && hit.distance > 0.05) {
          const deltaH = Math.max(0, seg.hTop - segment.hWindowBottom);
          const betaDeg = Math.atan2(deltaH, hit.distance) * RAD2DEG;

          if (betaDeg > maxObstacleAngleDeg) {
            maxObstacleAngleDeg = betaDeg;
          }

          if (slot.elevationDeg <= betaDeg) {
            isBlocked = true;
            blockingObstacleId = bldg.id;
            break;
          }
        }
      }
      if (isBlocked) break;
    }

    const isDirectSunlight = !isBlocked;
    if (isDirectSunlight) {
      totalMinutesSunlight += stepMinutes;
    }

    timeSlots.push({
      time: slot.timeStr,
      azimuthDeg: slot.azimuthDeg,
      elevationDeg: slot.elevationDeg,
      isSunAboveHorizon: true,
      isAngleAbove12Deg: true,
      isDirectSunlight,
      blockingObstacleId,
      blockingAngleDeg: maxObstacleAngleDeg,
    });
  }

  const totalHours = totalMinutesSunlight / 60;
  // Requirement: >= 3.0h (or 1.5h in city centre)
  const reqHours = segment.isCityCentre ? 1.5 : 3.0;
  const isCompliant = totalHours >= reqHours;

  return {
    point,
    segmentId: segment.id,
    offsetRatio,
    totalMinutes: totalMinutesSunlight,
    totalHours,
    isCompliant,
    timeSlots,
  };
}

export interface AnalysisAccuracyOptions {
  samplingInterval?: number; // Distance between test points along facade (e.g. 1.5m live -> 0.25m final)
  angleStepDeg?: number; // Angular ray resolution (e.g. 2.0 deg live -> 0.5 deg final)
  sunlightStepMinutes?: number; // Solar timeline resolution (e.g. 15 min live -> 5 min final)
}

/**
 * Runs full batch analysis on all facade segments of tested building(s).
 */
export function runFullAnalysis(
  buildings: BuildingLoop[],
  settings: ProjectSettings,
  options?: AnalysisAccuracyOptions
): AnalysisPointResult[] {
  const results: AnalysisPointResult[] = [];

  const testedBuildings = buildings.filter((b) => b.isTested && b.isIncluded !== false);
  const interval = options?.samplingInterval ?? settings.samplingInterval ?? 0.25;
  const angleStep = options?.angleStepDeg ?? 0.5;
  const sunlightStep = options?.sunlightStepMinutes ?? 5;

  // Precompute solar trajectories once for standard residential and childcare segments
  const standardTrajectory = computeDailySolarTrajectory(settings, sunlightStep, false);
  const childcareTrajectory = computeDailySolarTrajectory(settings, sunlightStep, true);

  for (const bldg of testedBuildings) {
    for (const seg of bldg.segments) {
      const sampled = sampleSegmentPoints(seg.p1, seg.p2, interval);
      const trajectory = seg.buildingType === 'childcare' ? childcareTrajectory : standardTrajectory;

      sampled.forEach((sample, idx) => {
        const shadowing = analyzeShadowingAtPoint(
          sample.point,
          seg,
          sample.ratio,
          buildings,
          bldg.id,
          angleStep
        );

        const sunlight = analyzeSunlightAtPoint(
          sample.point,
          seg,
          sample.ratio,
          buildings,
          bldg.id,
          settings,
          sunlightStep,
          trajectory
        );

        results.push({
          id: `${bldg.id}-${seg.id}-p${idx}`,
          point: sample.point,
          normal: seg.normal,
          segmentId: seg.id,
          buildingId: bldg.id,
          shadowing,
          sunlight,
        });
      });
    }
  }

  return results;
}
