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
  targetBuildingId: string
): ShadowingResult {
  const normal = segment.normal;
  const normalAngleRad = Math.atan2(normal.y, normal.x);

  const rays: ShadowingResult['rays'] = [];
  const angleStepDeg = 0.5; // High resolution angular ray marching
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
export function analyzeSunlightAtPoint(
  point: Point2D,
  segment: FacadeSegment,
  offsetRatio: number,
  allBuildings: BuildingLoop[],
  targetBuildingId: string,
  settings: ProjectSettings
): SunlightResult {
  const normal = segment.normal;
  const normalAngleRad = Math.atan2(normal.y, normal.x);

  // Time window: T_peak +- 5h (or +-4h for childcare)
  const isChildcare = segment.buildingType === 'childcare';
  const hoursRadius = isChildcare ? 4 : 5;

  // Find solar noon on March 21
  const month = settings.equinoxDate === 'autumn' ? 9 : 3;
  const day = settings.equinoxDate === 'autumn' ? 23 : 21;

  const noonPos = calculateSolarPosition(settings.latitude, settings.longitude, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;

  const startHour = Math.max(5.0, noonHour - hoursRadius);
  const endHour = Math.min(19.0, noonHour + hoursRadius);

  const stepMinutes = 5; // 5-minute time integration steps
  const totalSteps = Math.round(((endHour - startHour) * 60) / stepMinutes);

  const timeSlots: SunlightTimeSlot[] = [];
  let totalMinutesSunlight = 0;

  for (let s = 0; s <= totalSteps; s++) {
    const currentHourDec = startHour + (s * stepMinutes) / 60;
    const hourInt = Math.floor(currentHourDec);
    const minInt = Math.round((currentHourDec - hourInt) * 60);
    const timeStr = `${String(hourInt).padStart(2, '0')}:${String(minInt).padStart(2, '0')}`;

    const pos = calculateSolarPosition(settings.latitude, settings.longitude, month, day, currentHourDec);

    // If sun is below horizon
    if (pos.elevationDeg <= 0) {
      timeSlots.push({
        time: timeStr,
        azimuthDeg: pos.azimuthDeg,
        elevationDeg: pos.elevationDeg,
        isSunAboveHorizon: false,
        isAngleAbove12Deg: false,
        isDirectSunlight: false,
      });
      continue;
    }

    // Solar ray incoming vector (from Sun to Point, or from Point to Sun)
    // Azimuth: 0=N (+Y), 90=E (+X), 180=S (-Y), 270=W (-X)
    // Mathematical angle: theta = (90 - Azimuth) * DEG2RAD
    const sunAzimuthMathRad = ((90 - pos.azimuthDeg + 360) % 360) * DEG2RAD;
    const sunDir: Vector2D = {
      x: Math.cos(sunAzimuthMathRad),
      y: Math.sin(sunAzimuthMathRad),
    };

    // Check angle between sun ray and facade normal
    // Dot product: normal . sunDir
    const dot = normal.x * sunDir.x + normal.y * sunDir.y;
    // Angle in plane relative to normal
    const angleWithNormalRad = Math.acos(Math.max(-1, Math.min(1, dot)));
    const angleWithNormalDeg = angleWithNormalRad * RAD2DEG;

    // § 56 ust. 5: Angle on plan >= 12 deg from wall surface => <= 78 deg from normal
    const isAngleAbove12Deg = angleWithNormalDeg <= 78.0;

    if (!isAngleAbove12Deg) {
      timeSlots.push({
        time: timeStr,
        azimuthDeg: pos.azimuthDeg,
        elevationDeg: pos.elevationDeg,
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
      for (const seg of bldg.segments) {
        if (bldg.id === targetBuildingId && seg.id === segment.id) continue;

        const hit = raySegmentIntersection(point, sunDir, seg.p1, seg.p2);
        if (hit.hit && hit.distance > 0.05) {
          // Calculate obstruction elevation angle beta = arctan( (H_top - H_window_bottom) / distance )
          const deltaH = Math.max(0, seg.hTop - segment.hWindowBottom);
          const betaDeg = Math.atan2(deltaH, hit.distance) * RAD2DEG;

          if (betaDeg > maxObstacleAngleDeg) {
            maxObstacleAngleDeg = betaDeg;
          }

          // If sun elevation gamma <= beta, sunlight is blocked
          if (pos.elevationDeg <= betaDeg) {
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
      time: timeStr,
      azimuthDeg: pos.azimuthDeg,
      elevationDeg: pos.elevationDeg,
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

/**
 * Runs full batch analysis on all facade segments of tested building(s).
 */
export function runFullAnalysis(
  buildings: BuildingLoop[],
  settings: ProjectSettings
): AnalysisPointResult[] {
  const results: AnalysisPointResult[] = [];

  const testedBuildings = buildings.filter((b) => b.isTested);

  for (const bldg of testedBuildings) {
    for (const seg of bldg.segments) {
      const sampled = sampleSegmentPoints(seg.p1, seg.p2, settings.samplingInterval);

      sampled.forEach((sample, idx) => {
        const shadowing = analyzeShadowingAtPoint(
          sample.point,
          seg,
          sample.ratio,
          buildings,
          bldg.id
        );

        const sunlight = analyzeSunlightAtPoint(
          sample.point,
          seg,
          sample.ratio,
          buildings,
          bldg.id,
          settings
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
