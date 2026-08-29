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
  clipSegmentToCircle,
  isDirectionInSegmentCone,
} from '../utils/math2d';

import {
  calculateSolarPosition,
  getHourAtSolarAzimuth,
  getSolarElevationAtAzimuth,
} from '../utils/solar';

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
  // PHASE 2 & 3 – Exact geometric angular sector partition (metoda_przeciec_odcinkow.md)
  // ─────────────────────────────────────────────────────────────────────────

  // Helper to get relative angle (-180 to 180) from point P to target point Q w.r.t normalAngleRad
  const getRelAngleDeg = (q: Point2D): number => {
    const worldAngle = Math.atan2(q.y - point.y, q.x - point.x);
    let diffRad = worldAngle - normalAngleRad;
    while (diffRad > Math.PI) diffRad -= 2 * Math.PI;
    while (diffRad < -Math.PI) diffRad += 2 * Math.PI;
    return diffRad * RAD2DEG;
  };

  // 1. Z każdego wycinka przeszkody wewnątrz okręgu dReq wyznaczamy analityczny sektor kątowy [start, end]
  interface BlockedInterval {
    start: number;
    end: number;
    reqDistance: number;
  }

  const rawBlocked: BlockedInterval[] = [];

  for (const cand of candidates) {
    const a1 = getRelAngleDeg(cand.clipP1);
    const a2 = getRelAngleDeg(cand.clipP2);

    const minA = Math.min(a1, a2);
    const maxA = Math.max(a1, a2);

    // Przycięcie do kąta roboczego fasady [-78°, +78°] (§ 12 ust. 1 pkt 1)
    const start = Math.max(-78.0, minA);
    const end = Math.min(78.0, maxA);

    if (end > start + 1e-4) {
      rawBlocked.push({
        start,
        end,
        reqDistance: cand.dReq,
      });
    }
  }

  // 2. Sumowanie i scalanie przedziałów przesłoniętych: Ω_blocked = ⋃ [start_k, end_k]
  rawBlocked.sort((a, b) => a.start - b.start);

  const mergedBlocked: BlockedInterval[] = [];
  for (const blk of rawBlocked) {
    if (mergedBlocked.length === 0) {
      mergedBlocked.push({ ...blk });
    } else {
      const last = mergedBlocked[mergedBlocked.length - 1];
      if (blk.start <= last.end + 1e-4) {
        last.end = Math.max(last.end, blk.end);
        last.reqDistance = Math.max(last.reqDistance, blk.reqDistance);
      } else {
        mergedBlocked.push({ ...blk });
      }
    }
  }

  // 3. Budowa pełnych sektorów na przedziale [-78°, +78°] (dopełnienie Ω_free = [-78°, 78°] \ Ω_blocked)
  const sectors: ShadowingSector[] = [];
  let cursor = -78.0;

  for (const blk of mergedBlocked) {
    if (blk.start > cursor + 1e-4) {
      sectors.push({
        startAngleDeg: cursor,
        endAngleDeg: blk.start,
        spanDeg: blk.start - cursor,
        isFree: true,
        requiredDistance: 0,
      });
    }
    const bStart = Math.max(cursor, blk.start);
    const bEnd = Math.max(bStart, blk.end);
    if (bEnd > bStart + 1e-4) {
      sectors.push({
        startAngleDeg: bStart,
        endAngleDeg: bEnd,
        spanDeg: bEnd - bStart,
        isFree: false,
        requiredDistance: blk.reqDistance,
      });
      cursor = bEnd;
    }
  }

  if (cursor < 78.0 - 1e-4) {
    sectors.push({
      startAngleDeg: cursor,
      endAngleDeg: 78.0,
      spanDeg: 78.0 - cursor,
      isFree: true,
      requiredDistance: 0,
    });
  }

  if (sectors.length === 0) {
    sectors.push({
      startAngleDeg: -78.0,
      endAngleDeg: 78.0,
      spanDeg: 156.0,
      isFree: true,
      requiredDistance: 0,
    });
  }

  // Próbkowanie promieni dla celów wizualizacji (bez raycastingu w analizie, z analitycznych sektorów)
  const rays: ShadowingResult['rays'] = [];
  for (let aDeg = -78.0; aDeg <= 78.0 + 1e-4; aDeg += angleStepDeg) {
    const matchingSec = sectors.find(
      (s) => aDeg >= s.startAngleDeg - 1e-4 && aDeg <= s.endAngleDeg + 1e-4
    );
    const isFree = matchingSec ? matchingSec.isFree : true;
    const reqDistance = matchingSec?.requiredDistance ?? 0;
    const worldAngleRad = normalAngleRad + aDeg * DEG2RAD;
    const rayDir: Vector2D = {
      x: Math.cos(worldAngleRad),
      y: Math.sin(worldAngleRad),
    };

    let hitDistance = isFree ? 35.0 : reqDistance;
    if (!isFree) {
      let closestD = Infinity;
      for (const cand of candidates) {
        if (isDirectionInSegmentCone(point, rayDir, cand.clipP1, cand.clipP2)) {
          const dx = cand.seg.p2.x - cand.seg.p1.x;
          const dy = cand.seg.p2.y - cand.seg.p1.y;
          const cross = rayDir.x * dy - rayDir.y * dx;
          if (Math.abs(cross) > 1e-9) {
            const ox = cand.seg.p1.x - point.x;
            const oy = cand.seg.p1.y - point.y;
            const t = (ox * dy - oy * dx) / cross;
            if (t > 1e-4 && t < closestD) {
              closestD = t;
            }
          }
        }
      }
      if (closestD < Infinity) hitDistance = closestD;
    }

    rays.push({
      angleDeg: aDeg,
      worldAngleDeg: (worldAngleRad * RAD2DEG + 360) % 360,
      isFree,
      hitDistance,
      reqDistance,
    });
  }

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
  // Find which slots actually strike this facade at an angle >= 12 deg (relative to wall plane, <= 78 deg from normal)
  const activeSlots: { slot: SolarTrajectorySlot; dot: number }[] = [];
  for (const slot of trajectory) {
    if (slot.isSunAboveHorizon && slot.elevationDeg > 0) {
      const dot = normal.x * slot.sunDir.x + normal.y * slot.sunDir.y;
      if (dot >= COS_78_DEG) {
        activeSlots.push({ slot, dot });
      }
    }
  }

  // Fast-path: If no solar slots can hit this wall at >= 12 deg (e.g. North facades or shaded orientations),
  // return immediately without running ANY ray-casts.
  if (activeSlots.length === 0) {
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

  // Pre-filter obstacle segments: only keep segments that are in front of this wall plane
  // (at least one vertex has dot >= -0.01) and belong to included buildings
  interface ObstacleCandidate {
    seg: FacadeSegment;
    bldgId: string;
  }
  const obstacleCandidates: ObstacleCandidate[] = [];
  for (const bldg of allBuildings) {
    if (bldg.isIncluded === false) continue;
    for (const seg of bldg.segments) {
      if (bldg.id === targetBuildingId && seg.id === segment.id) continue;

      const v1x = seg.p1.x - point.x;
      const v1y = seg.p1.y - point.y;
      const v2x = seg.p2.x - point.x;
      const v2y = seg.p2.y - point.y;
      const dot1 = v1x * normal.x + v1y * normal.y;
      const dot2 = v2x * normal.x + v2y * normal.y;

      // If both endpoints are strictly behind the facade plane, rays with dot >= COS_78_DEG cannot hit it
      if (dot1 < -0.01 && dot2 < -0.01) continue;

      obstacleCandidates.push({ seg, bldgId: bldg.id });
    }
  }

  // 2. Perform raycast analysis ONLY for valid slots that meet the >= 12 deg criterion
  const activeResultsMap = new Map<
    string,
    { isDirect: boolean; blockingId?: string; maxAngle: number }
  >();
  let totalMinutesSunlight = 0;

  for (const { slot } of activeSlots) {
    const sunDir = slot.sunDir;
    let isBlocked = false;
    let blockingObstacleId: string | undefined = undefined;
    let maxObstacleAngleDeg = 0;

    for (const cand of obstacleCandidates) {
      const seg = cand.seg;

      // Quick backface check: skip obstacle segments whose outward normal points away from the ray
      const dotNormal = sunDir.x * seg.normal.x + sunDir.y * seg.normal.y;
      if (dotNormal >= -1e-4) continue;

      const hit = raySegmentIntersection(point, sunDir, seg.p1, seg.p2);
      if (hit.hit && hit.distance > 0.05) {
        const deltaH = Math.max(0, seg.hTop);
        const betaDeg = Math.atan2(deltaH, hit.distance) * RAD2DEG;

        if (betaDeg > maxObstacleAngleDeg) {
          maxObstacleAngleDeg = betaDeg;
        }

        if (slot.elevationDeg <= betaDeg) {
          isBlocked = true;
          blockingObstacleId = cand.bldgId;
          break;
        }
      }
    }

    const isDirect = !isBlocked;
    if (isDirect) {
      totalMinutesSunlight += stepMinutes;
    }

    activeResultsMap.set(slot.timeStr, {
      isDirect,
      blockingId: blockingObstacleId,
      maxAngle: maxObstacleAngleDeg,
    });
  }

  // Build complete timeSlots for inspection
  const timeSlots: SunlightTimeSlot[] = trajectory.map((slot) => {
    const activeRes = activeResultsMap.get(slot.timeStr);
    if (activeRes) {
      return {
        time: slot.timeStr,
        azimuthDeg: slot.azimuthDeg,
        elevationDeg: slot.elevationDeg,
        isSunAboveHorizon: true,
        isAngleAbove12Deg: true,
        isDirectSunlight: activeRes.isDirect,
        blockingObstacleId: activeRes.blockingId,
        blockingAngleDeg: activeRes.maxAngle,
      };
    }
    return {
      time: slot.timeStr,
      azimuthDeg: slot.azimuthDeg,
      elevationDeg: slot.elevationDeg,
      isSunAboveHorizon: slot.isSunAboveHorizon,
      isAngleAbove12Deg: false,
      isDirectSunlight: false,
    };
  });

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

// ─────────────────────────────────────────────────────────────────────────────
/**
 * ALTERNATYWNA metoda § 56 — Segment-Intersection (analogiczna do § 12)
 *
 * Zamiast rzucać promień dla każdego slotu czasowego, buduje geometryczny podział
 * zakresu azymutów słonecznych na sektory wolne / zablokowane przez przeszkody.
 * Kryterium blokowania: kąt elewacji przeszkody (atan2(hTop, dist)) > kąt elewacji słońca
 * w danym azymucie.
 *
 * Algorytm:
 * 1. Pre-filtracja kandydatów (identyczna jak w § 12 — fasada widoczna z P, przed płaszczyzną ściany).
 * 2. Zebranie krytycznych kątów (azymuty narożników kandydatów, wschodnie i zachodnie krańce
 *    trajektorii słonecznej) → gęsty podział na interwały.
 * 3. Dla środka każdego interwału: rzut promienia na kandydatów + porównanie elewacji słońca
 *    z kątem przeszkody → wolny / zablokowany.
 * 4. Scalenie interwałów w sektory. Mapowanie sektorów na czas przez interpolację trajektorii.
 *
 * @returns SunlightResult kompatybilny ze standardową metodą + pole `_segMethodMs` (czas obliczeń ms)
 */
/**
 * Analityczna metoda § 56 (Nasłonecznienie) — Metoda Przecięć Odcinków (Segment-Intersection).
 * Zgodna z metoda_przeciec_odcinkow.md.
 *
 * Czysto analityczna metoda bez dyskretyzacji czasowej i bez raycastingu.
 * Wyznacza ciągły przedział azymutów słońca [azActiveMin, azActiveMax] na fasadzie,
 * analitycznie oblicza zasięg cienia R(az) = deltaH / tan(elev(az)), przycina odcinki
 * przeszkód do okręgów o promieniu R i scalamy przedziały cienia w ciągłe sektory.
 * Granice sektorów kątowych są mapowane bezpośrednio na ciągły czas równonocy.
 */
export function analyzeSunlightAtPointSegments(
  point: Point2D,
  segment: FacadeSegment,
  offsetRatio: number,
  allBuildings: BuildingLoop[],
  targetBuildingId: string,
  settings: ProjectSettings,
  stepMinutes: number = 5,
  precomputedTrajectory?: SolarTrajectorySlot[]
): SunlightResult & { _segMethodMs: number } {
  const t0 = performance.now();
  const normal = segment.normal;
  const isChildcare = segment.buildingType === 'childcare';

  const month = settings.equinoxDate === 'autumn' ? 9 : 3;
  const day = settings.equinoxDate === 'autumn' ? 23 : 21;

  // 1. Solar equinox analysis window (azimuth limits)
  const noonPos = calculateSolarPosition(settings.latitude, settings.longitude, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;
  const hoursRadius = isChildcare ? 4 : 5;

  const startHour = Math.max(5.0, noonHour - hoursRadius);
  const endHour = Math.min(19.0, noonHour + hoursRadius);

  const startPos = calculateSolarPosition(settings.latitude, settings.longitude, month, day, startHour);
  const endPos = calculateSolarPosition(settings.latitude, settings.longitude, month, day, endHour);

  const azSolarMin = Math.min(startPos.azimuthDeg, endPos.azimuthDeg);
  const azSolarMax = Math.max(startPos.azimuthDeg, endPos.azimuthDeg);

  // Facade normal azimuth (geographic degrees)
  const normalAzimuth = ((Math.atan2(normal.x, normal.y) * RAD2DEG + 360) % 360);

  // Active facade view range (normalAzimuth ± 78°, incidence angle >= 12°)
  const azActiveMin = Math.max(azSolarMin, normalAzimuth - 78.0);
  const azActiveMax = Math.min(azSolarMax, normalAzimuth + 78.0);

  if (azActiveMax <= azActiveMin + 0.1) {
    const trajectory =
      precomputedTrajectory ?? computeDailySolarTrajectory(settings, stepMinutes, isChildcare);
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
      sectors: [],
      _segMethodMs: performance.now() - t0,
    };
  }

  // 2. Metoda Płaszczyzny Słonecznej E-W (współczynnik nachylenia płaszczyzny k = tan(latitude))
  const latRad = settings.latitude * DEG2RAD;
  const k = Math.tan(latRad);

  interface BlockedInterval {
    startAz: number;
    endAz: number;
    bldgId: string;
  }
  const rawBlocked: BlockedInterval[] = [];

  for (const bldg of allBuildings) {
    if (bldg.isIncluded === false) continue;
    for (const seg of bldg.segments) {
      if (bldg.id === targetBuildingId && seg.id === segment.id) continue;

      // Filtrowanie 1: punkt badany musi znajdować się po zewnętrznej stronie przeszkody
      const dotExt = (point.x - seg.p1.x) * seg.normal.x + (point.y - seg.p1.y) * seg.normal.y;
      if (dotExt <= 0) continue;

      // Filtrowanie 2: przynajmniej jeden wierzchołek musi leżeć przed płaszczyzną fasady badanej
      const v1x = seg.p1.x - point.x;
      const v1y = seg.p1.y - point.y;
      const v2x = seg.p2.x - point.x;
      const v2y = seg.p2.y - point.y;
      if (v1x * normal.x + v1y * normal.y < -0.01 && v2x * normal.x + v2y * normal.y < -0.01) continue;

      // Wysokość przeszkody H bezpośrednio
      const deltaH = Math.max(0, seg.hTop);
      if (deltaH <= 0) continue;

      // L = deltaH * tan(latitude) -> zasięg graniczny płaszczyzny cienia na południe
      const L = deltaH * k;
      const yLine = point.y - L; // Prosta graniczna E-W
      const yPoint = point.y;    // Linia punktu P

      let p1 = { x: seg.p1.x, y: seg.p1.y };
      let p2 = { x: seg.p2.x, y: seg.p2.y };

      // Zasada 1: oba punkty na południe od linii cienia (y < yLine) -> nie rzucają cienia
      if (p1.y < yLine && p2.y < yLine) continue;

      // Zasada 2: oba punkty na północ od punktu P (za plecami w osi Słońca) -> nie rzucają cienia
      if (p1.y > yPoint && p2.y > yPoint) continue;

      // Zasada 3: przycięcie do prostej E-W (yLine) – podział na część rzucającą cień i bez cienia
      if (p1.y < yLine) {
        const t = (yLine - p1.y) / (p2.y - p1.y);
        p1 = { x: p1.x + t * (p2.x - p1.x), y: yLine };
      } else if (p2.y < yLine) {
        const t = (yLine - p1.y) / (p2.y - p1.y);
        p2 = { x: p1.x + t * (p2.x - p1.x), y: yLine };
      }

      // Przycięcie do linii punktu P w osi Y
      if (p1.y > yPoint) {
        const t = (yPoint - p1.y) / (p2.y - p1.y);
        p1 = { x: p1.x + t * (p2.x - p1.x), y: yPoint };
      } else if (p2.y > yPoint) {
        const t = (yPoint - p1.y) / (p2.y - p1.y);
        p2 = { x: p1.x + t * (p2.x - p1.x), y: yPoint };
      }

      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.05) continue;

      // Zabezpieczenie przed osobliwością styku narożnika w odległości 0m od punktu P
      const d1 = Math.hypot(p1.x - point.x, p1.y - point.y);
      const d2 = Math.hypot(p2.x - point.x, p2.y - point.y);
      if (d1 < 0.05) {
        p1.x = p1.x + 0.05 * (p2.x - p1.x);
        p1.y = p1.y + 0.05 * (p2.y - p1.y);
      }
      if (d2 < 0.05) {
        p2.x = p2.x + 0.05 * (p1.x - p2.x);
        p2.y = p2.y + 0.05 * (p1.y - p2.y);
      }

      // Azymuty z punktu P do przyciętego odcinka rzucającego cień
      const az1 = ((Math.atan2(p1.x - point.x, p1.y - point.y) * RAD2DEG + 360) % 360);
      const az2 = ((Math.atan2(p2.x - point.x, p2.y - point.y) * RAD2DEG + 360) % 360);

      const intervals: [number, number][] = [];
      if (Math.abs(az1 - az2) > 180) {
        const minA = Math.min(az1, az2);
        const maxA = Math.max(az1, az2);
        intervals.push([maxA, 360]);
        intervals.push([0, minA]);
      } else {
        intervals.push([Math.min(az1, az2), Math.max(az1, az2)]);
      }

      for (const [bStart, bEnd] of intervals) {
        const candStart = Math.max(azActiveMin, bStart);
        const candEnd   = Math.min(azActiveMax, bEnd);
        if (candEnd > candStart + 0.01) {
          rawBlocked.push({ startAz: candStart, endAz: candEnd, bldgId: bldg.id });
        }
      }
    }
  }

  // 3. Scalanie przedziałów cienia
  rawBlocked.sort((a, b) => a.startAz - b.startAz);
  const mergedBlocked: { startAz: number; endAz: number }[] = [];
  for (const b of rawBlocked) {
    if (mergedBlocked.length === 0) {
      mergedBlocked.push({ startAz: b.startAz, endAz: b.endAz });
    } else {
      const last = mergedBlocked[mergedBlocked.length - 1];
      if (b.startAz <= last.endAz + 0.05) {
        last.endAz = Math.max(last.endAz, b.endAz);
      } else {
        mergedBlocked.push({ startAz: b.startAz, endAz: b.endAz });
      }
    }
  }

  // 4. Wyznaczanie wolnych sektorów nasłonecznienia i obliczanie czasu
  const sectors: import('../types/geometry').SunlightSector[] = [];
  let cursor = azActiveMin;
  let totalHours = 0;

  function addFreeSector(startAz: number, endAz: number) {
    const rawH1 = getHourAtSolarAzimuth(startAz, settings.latitude, settings.longitude, month, day);
    const rawH2 = getHourAtSolarAzimuth(endAz, settings.latitude, settings.longitude, month, day);
    const hStart = Math.min(rawH1, rawH2);
    const hEnd   = Math.max(rawH1, rawH2);
    const secHours = hEnd - hStart;

    const h1Int = Math.floor(hStart);
    const m1Int = Math.round((hStart - h1Int) * 60);
    const h2Int = Math.floor(hEnd);
    const m2Int = Math.round((hEnd - h2Int) * 60);

    sectors.push({
      startAzimuthDeg: startAz,
      endAzimuthDeg: endAz,
      spanDeg: Math.abs(endAz - startAz),
      isDirectSunlight: true,
      startTimeStr: `${String(h1Int).padStart(2, '0')}:${String(m1Int).padStart(2, '0')}`,
      endTimeStr: `${String(h2Int).padStart(2, '0')}:${String(m2Int).padStart(2, '0')}`,
      hours: secHours,
    });
    totalHours += secHours;
  }

  for (const b of mergedBlocked) {
    if (b.startAz > cursor + 0.01) {
      addFreeSector(cursor, b.startAz);
    }
    cursor = Math.max(cursor, b.endAz);
  }

  if (cursor < azActiveMax - 0.01) {
    addFreeSector(cursor, azActiveMax);
  }

  // Generowanie timeSlots dla osi timeline w UI (z sektorów geometrycznych)
  const trajectory =
    precomputedTrajectory ?? computeDailySolarTrajectory(settings, stepMinutes, isChildcare);

  const timeSlots: SunlightTimeSlot[] = trajectory.map((slot) => {
    const isAbove = slot.isSunAboveHorizon && slot.elevationDeg > 0;
    const dot = normal.x * slot.sunDir.x + normal.y * slot.sunDir.y;
    const isAngleAbove12Deg = isAbove && dot >= COS_78_DEG;

    let isDirect = false;
    if (isAngleAbove12Deg) {
      for (const sec of sectors) {
        if (slot.azimuthDeg >= sec.startAzimuthDeg - 0.05 && slot.azimuthDeg <= sec.endAzimuthDeg + 0.05) {
          isDirect = true;
          break;
        }
      }
    }

    return {
      time: slot.timeStr,
      azimuthDeg: slot.azimuthDeg,
      elevationDeg: slot.elevationDeg,
      isSunAboveHorizon: isAbove,
      isAngleAbove12Deg,
      isDirectSunlight: isDirect,
    };
  });

  const totalMinutes = Math.round(totalHours * 60);
  const reqHours = segment.isCityCentre ? 1.5 : 3.0;
  const isCompliant = totalHours >= reqHours;

  return {
    point,
    segmentId: segment.id,
    offsetRatio,
    totalMinutes,
    totalHours,
    isCompliant,
    timeSlots,
    sectors,
    _segMethodMs: performance.now() - t0,
  };
}






export interface AnalysisAccuracyOptions {
  samplingInterval?: number; // Distance between test points along facade (e.g. 1.5m live -> 0.25m final)
  angleStepDeg?: number; // Angular ray resolution (e.g. 2.0 deg live -> 0.5 deg final)
  sunlightStepMinutes?: number; // Solar timeline resolution (e.g. 15 min live -> 5 min final)
}

export interface AnalysisBatchOutput {
  results: AnalysisPointResult[];
  avgShadowingMs: number;
  avgSunlightMs: number;
  avgSunlightSegMs: number; // Czas metody segment-intersection (porównanie)
  totalPoints: number;
}

/**
 * Runs full batch analysis on all facade segments of tested building(s).
 * Runs BOTH sunlight methods in parallel for benchmarking.
 */
export function runFullAnalysis(
  buildings: BuildingLoop[],
  settings: ProjectSettings,
  options?: AnalysisAccuracyOptions,
  sunlightMethod: 'raycasting' | 'segments' = 'raycasting'
): AnalysisBatchOutput {
  const results: AnalysisPointResult[] = [];

  const testedBuildings = buildings.filter((b) => b.isTested && b.isIncluded !== false);
  const interval = options?.samplingInterval ?? settings.samplingInterval ?? 0.25;
  const angleStep = options?.angleStepDeg ?? 0.5;
  const sunlightStep = options?.sunlightStepMinutes ?? 5;

  // Precompute solar trajectories once for standard residential and childcare segments
  const standardTrajectory = computeDailySolarTrajectory(settings, sunlightStep, false);
  const childcareTrajectory = computeDailySolarTrajectory(settings, sunlightStep, true);

  let totalShadowingTimeMs = 0;
  let totalSunlightTimeMs = 0;
  let totalSunlightSegTimeMs = 0;
  let pointCount = 0;

  // Akumulatory różnic do logowania zbiórczego
  let diffCount = 0;
  let maxHoursDiff = 0;
  let totalHoursDiffAbs = 0;

  for (const bldg of testedBuildings) {
    for (const seg of bldg.segments) {
      const sampled = sampleSegmentPoints(seg.p1, seg.p2, interval);
      const trajectory = seg.buildingType === 'childcare' ? childcareTrajectory : standardTrajectory;

      sampled.forEach((sample, idx) => {
        pointCount++;

        // ── § 12 Shadowing ──
        const tShadow0 = performance.now();
        const shadowing = analyzeShadowingAtPoint(
          sample.point, seg, sample.ratio, buildings, bldg.id, angleStep
        );
        totalShadowingTimeMs += performance.now() - tShadow0;

        // ── § 56 Nasłonecznienie — wybrana metoda ──
        const tSun0 = performance.now();
        const sunlight =
          sunlightMethod === 'segments'
            ? analyzeSunlightAtPointSegments(
                sample.point, seg, sample.ratio, buildings, bldg.id, settings, sunlightStep, trajectory
              )
            : analyzeSunlightAtPoint(
                sample.point, seg, sample.ratio, buildings, bldg.id, settings, sunlightStep, trajectory
              );
        totalSunlightTimeMs += performance.now() - tSun0;

        // ── Benchmark porównawczy (tylko gdy metoda segment-intersection jest aktywna) ──
        if (sunlightMethod === 'segments') {
          const tSunSeg0 = performance.now();
          const sunlightRay = analyzeSunlightAtPoint(
            sample.point, seg, sample.ratio, buildings, bldg.id, settings, sunlightStep, trajectory
          );
          totalSunlightSegTimeMs += performance.now() - tSunSeg0;

          const hoursDiff = Math.abs(sunlight.totalHours - sunlightRay.totalHours);
          totalHoursDiffAbs += hoursDiff;
          if (hoursDiff > 0.01) {
            diffCount++;
            if (hoursDiff > maxHoursDiff) maxHoursDiff = hoursDiff;
          }
        }

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

  const avgShadowingMs   = pointCount > 0 ? totalShadowingTimeMs    / pointCount : 0;
  const avgSunlightMs    = pointCount > 0 ? totalSunlightTimeMs      / pointCount : 0;
  const avgSunlightSegMs = pointCount > 0 ? totalSunlightSegTimeMs   / pointCount : 0;

  // ── Log benchmark do DevTools Console (tylko gdy segment-intersection aktywna) ──
  if (sunlightMethod === 'segments' && pointCount > 0) {
    console.groupCollapsed(
      `%c§56 Benchmark [Segment-Intersection aktywna] — ${pointCount} pkt`,
      'color:#f59e0b;font-weight:bold'
    );
    console.log(`Seg-Intersection (aktywna): avg ${avgSunlightMs.toFixed(3)} ms/pkt | total ${totalSunlightTimeMs.toFixed(1)} ms`);
    console.log(`Raycasting (porównanie):    avg ${avgSunlightSegMs.toFixed(3)} ms/pkt | total ${totalSunlightSegTimeMs.toFixed(1)} ms`);
    console.log(`Przyspieszenie seg/ray:     ${avgSunlightSegMs > 0 ? (avgSunlightMs / avgSunlightSegMs).toFixed(2) : '—'}×`);
    console.log(`Różnice wyników:            ${diffCount}/${pointCount} pkt z |Δh| > 0.01h | max Δ = ${maxHoursDiff.toFixed(3)}h | śr. |Δ| = ${(totalHoursDiffAbs / pointCount).toFixed(4)}h`);
    console.groupEnd();
  }

  return {
    results,
    avgShadowingMs,
    avgSunlightMs,
    avgSunlightSegMs,
    totalPoints: pointCount,
  };
}
