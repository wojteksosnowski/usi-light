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
  distancePointToSegment,
} from '../utils/math2d';
import { calculateSolarPosition } from '../utils/solar';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Evaluates § 12 shadowing for a single point P on a facade.
 *
 * Two-phase algorithm:
 *
 * Phase 1 — Pre-filter obstacle segments (dramatically reduces candidate count):
 *   A. Skip segments whose INTERIOR side faces the test point — rays from
 *      outside always hit the exterior of a closed building first.
 *   B. Skip segments where BOTH endpoints project behind the tested facade
 *      plane — no ray in the ±78° forward arc can reach them.
 *   C. Skip segments whose minimum distance to the test point is ≥ dReq —
 *      the entire segment is outside the required-clearance circle.
 *      distancePointToSegment handles long segments correctly: even if both
 *      endpoints are far, the perpendicular foot on a long segment can be
 *      within range.
 *   Then use circle–segment intersection to clip each candidate to the
 *   portion actually within the dReq radius.
 *
 * Phase 2 — Cast rays only against the small candidate list.
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

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1 – Build pre-filtered candidate list
  // ─────────────────────────────────────────────────────────────────────────

  interface Candidate {
    seg: FacadeSegment;
    bldgId: string;
    dReq: number;
    /** Clipped endpoints — the portion of the segment inside the dReq circle. */
    clipP1: Point2D;
    clipP2: Point2D;
  }

  const candidates: Candidate[] = [];

  for (const bldg of allBuildings) {
    if (bldg.isIncluded === false) continue;

    for (const seg of bldg.segments) {
      // Self-segment skip
      if (bldg.id === targetBuildingId && seg.id === segment.id) continue;

      // ── Filter A: test point must be on the EXTERIOR side of the obstacle. ──
      // dot(testPoint − seg.p1, seg.outwardNormal) > 0.
      // If negative, any ray from the test point hits the interior face of the
      // obstacle, which is always shielded by the building's own exterior walls.
      const dotExt =
        (point.x - seg.p1.x) * seg.normal.x +
        (point.y - seg.p1.y) * seg.normal.y;
      if (dotExt <= 0) continue;

      // ── Filter B: both obstacle endpoints behind the tested facade plane. ──
      // Rays in the ±78° arc travel into the outward half-plane of the tested
      // facade. If both obstacle endpoints project negatively onto the tested
      // facade normal, no forward ray can reach either of them.
      const dp1 = (seg.p1.x - point.x) * normal.x + (seg.p1.y - point.y) * normal.y;
      const dp2 = (seg.p2.x - point.x) * normal.x + (seg.p2.y - point.y) * normal.y;
      if (dp1 < 0 && dp2 < 0) continue;

      // ── Required clearance for this obstacle ──
      // H of building/segment is directly the shadowing height (no window bottom subtraction)
      const deltaH = Math.max(0, seg.hTop);
      const dBase  = Math.min(deltaH, 35.0);
      const dReq   = segment.isCityCentre || bldg.isCityCentre
        ? 0.5 * dBase
        : dBase;
      if (dReq <= 0) continue;

      // ── Filter C: minimum distance from test point to segment < dReq. ──
      // distancePointToSegment returns the distance to the closest point on
      // the finite segment (not its infinite extension), so it correctly
      // handles long segments: if both endpoints are beyond dReq but the
      // perpendicular foot is within the segment bounds and closer than dReq,
      // the segment is kept as a candidate.
      const closestDist = distancePointToSegment(point, seg.p1, seg.p2);
      if (closestDist >= dReq) continue;

      // ── Circle–segment intersection ──────────────────────────────────────
      // Clip the segment to the circle of radius dReq centred at `point`.
      // Only the clipped portion can produce a blocked ray.
      //
      // Parametric segment: P(t) = p1 + t·(p2−p1),  t ∈ [0, 1]
      const dx      = seg.p2.x - seg.p1.x;
      const dy      = seg.p2.y - seg.p1.y;
      const segLen2 = dx * dx + dy * dy;
      if (segLen2 < 1e-9) continue;

      const ox    = seg.p1.x - point.x;
      const oy    = seg.p1.y - point.y;
      const B_c   = 2 * (ox * dx + oy * dy);
      const C_c   = ox * ox + oy * oy - dReq * dReq;
      const disc  = B_c * B_c - 4 * segLen2 * C_c;

      const dist1Sq = ox * ox + oy * oy;
      const dist2Sq = (seg.p2.x - point.x) ** 2 + (seg.p2.y - point.y) ** 2;
      const dReqSq  = dReq * dReq;

      let tStart = 0;
      let tEnd   = 1;

      if (dist1Sq <= dReqSq + 1e-4 && dist2Sq <= dReqSq + 1e-4) {
        // Entire segment is inside circle
        tStart = 0;
        tEnd   = 1;
      } else if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-B_c - sq) / (2 * segLen2);
        const t2 = (-B_c + sq) / (2 * segLen2);
        const tMin = Math.min(t1, t2);
        const tMax = Math.max(t1, t2);

        tStart = Math.max(0, tMin);
        tEnd   = Math.min(1, tMax);
        if (tEnd < tStart - 1e-6) continue;
      } else {
        // Outside circle entirely
        continue;
      }

      candidates.push({
        seg,
        bldgId: bldg.id,
        dReq,
        clipP1: { x: seg.p1.x + tStart * dx, y: seg.p1.y + tStart * dy },
        clipP2: { x: seg.p1.x + tEnd   * dx, y: seg.p1.y + tEnd   * dy },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2 & 3 – Exact geometric angular sector partition
  // ─────────────────────────────────────────────────────────────────────────

  // 1. Gather all critical transition angles (exact obstacle vertices & clipping points)
  const criticalAnglesSet = new Set<number>();
  criticalAnglesSet.add(-78.0);
  criticalAnglesSet.add(78.0);

  // Helper to get relative angle (-180 to 180) from point P to target point Q w.r.t normalAngleRad
  const getRelAngleDeg = (q: Point2D): number => {
    const worldAngle = Math.atan2(q.y - point.y, q.x - point.x);
    let diffRad = worldAngle - normalAngleRad;
    // Normalize to [-PI, PI]
    while (diffRad > Math.PI) diffRad -= 2 * Math.PI;
    while (diffRad < -Math.PI) diffRad += 2 * Math.PI;
    return diffRad * RAD2DEG;
  };

  for (const cand of candidates) {
    const a1 = getRelAngleDeg(cand.clipP1);
    const a2 = getRelAngleDeg(cand.clipP2);

    if (a1 >= -78.0 && a1 <= 78.0) criticalAnglesSet.add(a1);
    if (a2 >= -78.0 && a2 <= 78.0) criticalAnglesSet.add(a2);
  }

  // Also insert uniform subdivision steps so fine curves/sampling are smooth
  for (let a = -78.0; a <= 78.0; a += 0.5) {
    criticalAnglesSet.add(a);
  }

  const sortedAngles = Array.from(criticalAnglesSet).sort((a, b) => a - b);

  // Filter out duplicate or near-identical angles (< 0.001 deg)
  const distinctAngles: number[] = [sortedAngles[0]];
  for (let i = 1; i < sortedAngles.length; i++) {
    if (sortedAngles[i] - distinctAngles[distinctAngles.length - 1] > 1e-4) {
      distinctAngles.push(sortedAngles[i]);
    }
  }

  // 2. Evaluate each angular interval [distinctAngles[i], distinctAngles[i+1]]
  interface IntervalResult {
    startAngleDeg: number;
    endAngleDeg: number;
    spanDeg: number;
    isFree: boolean;
    reqDistance: number;
    hitDist: number;
  }

  const intervals: IntervalResult[] = [];

  for (let i = 0; i < distinctAngles.length - 1; i++) {
    const aStart = distinctAngles[i];
    const aEnd = distinctAngles[i + 1];
    const midAngleDeg = (aStart + aEnd) / 2;
    const worldAngleRad = normalAngleRad + midAngleDeg * DEG2RAD;

    const rayDir: Vector2D = {
      x: Math.cos(worldAngleRad),
      y: Math.sin(worldAngleRad),
    };

    let closestHitDist = Infinity;
    let hitObstacleH = 0;
    let hitObstacleReqDist = 0;

    for (const cand of candidates) {
      const seg = cand.seg;
      const hit = raySegmentIntersection(point, rayDir, seg.p1, seg.p2);
      if (!hit.hit) continue;

      const t = hit.distance;
      if (t < 0.001 || t > cand.dReq + 0.001) continue;

      const dotWithNormal = rayDir.x * seg.normal.x + rayDir.y * seg.normal.y;
      if (dotWithNormal >= -1e-4) continue;

      if (t < closestHitDist) {
        closestHitDist = t;
        hitObstacleH = cand.dReq;
        hitObstacleReqDist = cand.dReq;
      }
    }

    const isFree = closestHitDist === Infinity;
    const hitDistance = isFree ? 35.0 : closestHitDist;
    const reqDistance = isFree ? 0 : hitObstacleReqDist;

    intervals.push({
      startAngleDeg: aStart,
      endAngleDeg: aEnd,
      spanDeg: aEnd - aStart,
      isFree,
      reqDistance,
      hitDist: hitDistance,
    });
  }

  // Also build standard discrete rays (-78 to +78 with angleStepDeg)
  const rays: ShadowingResult['rays'] = [];
  for (let aDeg = -78.0; aDeg <= 78.0 + 1e-4; aDeg += angleStepDeg) {
    const worldAngleRad = normalAngleRad + aDeg * DEG2RAD;
    const rayDir: Vector2D = {
      x: Math.cos(worldAngleRad),
      y: Math.sin(worldAngleRad),
    };

    let closestHitDist = Infinity;
    let hitObstacleReqDist = 0;

    for (const cand of candidates) {
      const seg = cand.seg;
      const hit = raySegmentIntersection(point, rayDir, seg.p1, seg.p2);
      if (!hit.hit) continue;

      const t = hit.distance;
      if (t < 0.001 || t > cand.dReq + 0.001) continue;

      const dotWithNormal = rayDir.x * seg.normal.x + rayDir.y * seg.normal.y;
      if (dotWithNormal >= -1e-4) continue;

      if (t < closestHitDist) {
        closestHitDist = t;
        hitObstacleReqDist = cand.dReq;
      }
    }

    const isFree = closestHitDist === Infinity;
    rays.push({
      angleDeg: aDeg,
      worldAngleDeg: (worldAngleRad * RAD2DEG + 360) % 360,
      isFree,
      hitDistance: isFree ? 35.0 : closestHitDist,
      reqDistance: isFree ? 0 : hitObstacleReqDist,
    });
  }

  // 3. Merge contiguous intervals with identical isFree state into final exact sectors
  const sectors: ShadowingSector[] = [];
  let curSec: ShadowingSector | null = null;

  for (const interval of intervals) {
    if (!curSec || curSec.isFree !== interval.isFree) {
      if (curSec) {
        sectors.push(curSec);
      }
      curSec = {
        startAngleDeg: interval.startAngleDeg,
        endAngleDeg: interval.endAngleDeg,
        spanDeg: interval.spanDeg,
        isFree: interval.isFree,
        requiredDistance: interval.reqDistance,
      };
    } else {
      curSec.endAngleDeg = interval.endAngleDeg;
      curSec.spanDeg = curSec.endAngleDeg - curSec.startAngleDeg;
      if (interval.reqDistance > (curSec.requiredDistance ?? 0)) {
        curSec.requiredDistance = interval.reqDistance;
      }
    }
  }
  if (curSec) sectors.push(curSec);

  // Guarantee exact seamless boundary alignment: start of sector[i] is EXACTLY end of sector[i-1]
  if (sectors.length > 0) {
    sectors[0].startAngleDeg = -78.0;
    sectors[sectors.length - 1].endAngleDeg = 78.0;
    for (let i = 0; i < sectors.length; i++) {
      if (i > 0) {
        sectors[i].startAngleDeg = sectors[i - 1].endAngleDeg;
      }
      sectors[i].spanDeg = sectors[i].endAngleDeg - sectors[i].startAngleDeg;
    }
  }

  // Calculate maximum continuous free span and total free span
  let maxContinuousFreeSpanDeg = 0;
  let totalFreeSpanDeg = 0;

  for (const s of sectors) {
    if (s.isFree) {
      totalFreeSpanDeg += s.spanDeg;
      if (s.spanDeg > maxContinuousFreeSpanDeg) maxContinuousFreeSpanDeg = s.spanDeg;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // § 12 Compliance Evaluation:
  // 1) Primary rule (§ 12 ust. 1 pkt 1): Continuous unshadowed sector >= 60°
  // 2) Secondary rule (§ 12 ust. 2): Two unshadowed sectors separated by
  //    an obstacle sector OF AT MOST 15°, where the combined span (free1 + obst + free2)
  //    is >= 75° (meaning free1 + free2 >= 60° and obst <= 15°).
  //    (Any obstacle > 15° cannot be bridged!).
  // ─────────────────────────────────────────────────────────────────────────
  const hasContinuous60 = maxContinuousFreeSpanDeg >= 60.0;

  let hasComposite75 = false;
  let maxBridgedFreeSpanDeg = maxContinuousFreeSpanDeg;
  let maxCompositeWindowDeg = maxContinuousFreeSpanDeg;

  // Search across adjacent sector triplets [Free, Blocked, Free]
  for (let i = 0; i < sectors.length - 2; i++) {
    const s1 = sectors[i];
    const sObst = sectors[i + 1];
    const s2 = sectors[i + 2];

    if (s1.isFree && !sObst.isFree && s2.isFree) {
      if (sObst.spanDeg <= 15.0) {
        const totalWindow = s1.spanDeg + sObst.spanDeg + s2.spanDeg;
        const totalFree = s1.spanDeg + s2.spanDeg;

        if (totalWindow > maxCompositeWindowDeg) {
          maxCompositeWindowDeg = totalWindow;
        }
        if (totalFree > maxBridgedFreeSpanDeg) {
          maxBridgedFreeSpanDeg = totalFree;
        }

        // Secondary rule satisfied if total composite span >= 75° and obstacle <= 15° (free >= 60°)
        if (totalWindow >= 75.0 && totalFree >= 60.0) {
          hasComposite75 = true;
          sObst.isTolerated = true;
        }
      }
    }
  }

  const isCompliant = hasContinuous60 || hasComposite75;

  return {
    point,
    segmentId: segment.id,
    offsetRatio,
    isCompliant,
    maxContinuousFreeSpanDeg,
    totalFreeSpanDeg: maxBridgedFreeSpanDeg, // Bridged sum of valid sectors (never summing across >15° gaps)
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
          const deltaH = Math.max(0, seg.hTop);
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
