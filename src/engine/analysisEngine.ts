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
  ShadowAnalysisResult,
} from '../types/geometry';
import {
  raySegmentIntersection,
  raySegmentDistance2D,
  crossProduct2D,
  sampleSegmentPoints,
  distancePointToSegment,
  clipSegmentToCircle,
  isDirectionInSegmentCone,
  computeFullShadowAnalysis,
} from '@/utils/math2d';


import {
  calculateSolarPosition,
  getHourAtSolarAzimuth,
  getSolarElevationAtAzimuth,
  AstroSolarSystem,
  LinijkaSolarSystem,
  ISolarHourSystem,
  HourLine2D,
  createLineEquationFromAzimuth,
} from '../utils/solar';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// Precompute cos(78 deg) - minimal dot product for incidence angle >= 12 deg from wall surface
const COS_78_DEG = Math.cos(78.0 * DEG2RAD);

export interface PrefilteredObstacle {
  seg: FacadeSegment;
  bldgId: string;
}

/**
 * UNIWERSALNY PRE-FILTR ODCINKÓW DLA § 12 (Przesłanianie), § 56 (Astro) i § 56 (Linijka Słońca).
 *
 * Filtruje wszystkie odcinki sceny w oparciu o kryteria geometryczne:
 * 1. Prosta odchylona o +12° od lica badanego odcinka (zgodnie z ruchem wskazówek, +78° od normalnej).
 * 2. Odrzucenie odcinków, których OBA wierzchołki są po przeciwnej stronie tej prostej niż normalna.
 * 3. Prosta odchylona o -12° od lica badanego odcinka (-78° od normalnej).
 * 4. Odrzucenie odcinków, których OBA wierzchołki są po przeciwnej stronie tej prostej niż normalna.
 * 5. Backface culling: odrzucenie odcinków, których normalna jest zwrócona od badanego punktu P
 *    (dot(P - seg.p1, seg.normal) <= 0). Ponieważ bryły są wielokątami zamkniętymi, odcinek
 *    „tyłem” do punktu P i tak jest zasłonięty przez ścianę przednią tej samej bryły.
 * 6. Wykluczenie własnego badanego odcinka oraz obiektów wyłączonych z analizy.
 */
// Szybki cache AABB budynków w pamięci silnika analitycznego
interface BuildingAABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
const buildingAabbCache = new WeakMap<object, BuildingAABB>();

function getBuildingAABB(bldg: BuildingLoop): BuildingAABB | null {
  if (!bldg.vertices || bldg.vertices.length < 3) return null;
  const cached = buildingAabbCache.get(bldg);
  if (cached) return cached;

  let minX = bldg.vertices[0].x;
  let maxX = minX;
  let minY = bldg.vertices[0].y;
  let maxY = minY;
  for (let vi = 1; vi < bldg.vertices.length; vi++) {
    const vx = bldg.vertices[vi].x;
    const vy = bldg.vertices[vi].y;
    if (vx < minX) minX = vx;
    if (vx > maxX) maxX = vx;
    if (vy < minY) minY = vy;
    if (vy > maxY) maxY = vy;
  }
  const aabb: BuildingAABB = { minX, maxX, minY, maxY };
  buildingAabbCache.set(bldg, aabb);
  return aabb;
}

/**
 * PRE-FILTR ODCINKÓW DLA § 12 (Przesłanianie).
 * 
 * Filtruje odcinki sceny w oparciu o:
 * 1. Zasięg przestrzenny AABB o promieniu maxReach = 35.0m (lub 17.5m w śródmieściu),
 *    zgodnie z maksymalną wymaganą odległością przesłaniania w § 12 WT.
 * 2. Backface culling: odrzucenie odcinków odwróconych „plecami” do punktu P.
 * 3. Kąty graniczne ±12° od lica (stożek widzenia ±78° od normalnej).
 */
export function prefilterShadowingObstacles(
  point: Point2D,
  segment: FacadeSegment,
  allBuildings: BuildingLoop[],
  targetBuildingId: string
): PrefilteredObstacle[] {
  const normal = segment.normal;
  const normalAngleRad = Math.atan2(normal.y, normal.x);

  // Kąty prostych granicznych ±12° od lica (±78° od normalnej)
  const a1 = normalAngleRad + 78.0 * DEG2RAD;
  const a2 = normalAngleRad - 78.0 * DEG2RAD;

  // Wektory normalne skierowane w stronę normalnej fasady (do wnętrza stożka widzenia ±78°)
  const n1 = { x: Math.sin(a1), y: -Math.cos(a1) };
  const n2 = { x: -Math.sin(a2), y: Math.cos(a2) };

  const filtered: PrefilteredObstacle[] = [];

  for (const bldg of allBuildings) {
    if (bldg.isIncluded === false || bldg.category === 'boundary') continue;

    // Szybkie odrzucenie przestrzenne AABB: jeśli budynek jest w całości dalej niż 35m od punktu P (§ 12)
    const aabb = getBuildingAABB(bldg);
    if (aabb) {
      const maxReach = bldg.isCityCentre ? 17.5 : 35.0;
      if (
        point.x < aabb.minX - maxReach ||
        point.x > aabb.maxX + maxReach ||
        point.y < aabb.minY - maxReach ||
        point.y > aabb.maxY + maxReach
      ) {
        continue;
      }
    }

    for (const seg of bldg.segments) {
      // Pomiń sam badany odcinek
      if (bldg.id === targetBuildingId && seg.id === segment.id) continue;

      // Backface culling: normalna odcinka przeszkody musi być zwrócona w stronę punktu P
      const dotExt =
        (point.x - seg.p1.x) * seg.normal.x +
        (point.y - seg.p1.y) * seg.normal.y;
      if (dotExt <= 0) continue;

      // Wektory od punktu badanego do obu wierzchołków przeszkody
      const v1x = seg.p1.x - point.x;
      const v1y = seg.p1.y - point.y;
      const v2x = seg.p2.x - point.x;
      const v2y = seg.p2.y - point.y;

      // Krok 1 & 2: Prosta +12° od lica (+78° od normalnej)
      const d1_p1 = v1x * n1.x + v1y * n1.y;
      const d1_p2 = v2x * n1.x + v2y * n1.y;
      if (d1_p1 < -0.01 && d1_p2 < -0.01) continue;

      // Krok 3 & 4: Prosta -12° od lica (-78° od normalnej)
      const d2_p1 = v1x * n2.x + v1y * n2.y;
      const d2_p2 = v2x * n2.x + v2y * n2.y;
      if (d2_p1 < -0.01 && d2_p2 < -0.01) continue;

      filtered.push({ seg, bldgId: bldg.id });
    }
  }

  return filtered;
}

/**
 * PRE-FILTR ODCINKÓW DLA § 56 (Nasłonecznienie - Linijka Słońca & Astro).
 * 
 * Wykorzystuje wyłącznie szybką algebrę liniową O(1) bez trygonometrii:
 * 1. Korytarz boczny N-S: odrzuca przeszkody leżące w całości na zewnątrz linii pionowych
 *    odsuniętych na lewo i prawo od punktu badanego o L = H * 5 (L_boczne).
 * 2. Linia pozioma E-W (południowa): odrzuca przeszkody leżące w całości na południe od
 *    poziomej linii odsuniętej o L = H * 1.5 od punktu badanego (maksymalny zasięg cienia
 *    w równonoc dla szerokości geograficznej Polski).
 * 3. Backface culling: odrzucenie ścian odwróconych od punktu P.
 * 4. Kąty graniczne ±12° od lica badanego odcinka (stożek widzenia fasady).
 */
export function prefilterSunlightObstacles(
  point: Point2D,
  segment: FacadeSegment,
  allBuildings: BuildingLoop[],
  targetBuildingId: string
): PrefilteredObstacle[] {
  const normal = segment.normal;
  const normalAngleRad = Math.atan2(normal.y, normal.x);

  // Kąty prostych granicznych ±12° od lica (±78° od normalnej)
  const a1 = normalAngleRad + 78.0 * DEG2RAD;
  const a2 = normalAngleRad - 78.0 * DEG2RAD;

  // Wektory normalne skierowane do wnętrza stożka widzenia ±78°
  const n1 = { x: Math.sin(a1), y: -Math.cos(a1) };
  const n2 = { x: -Math.sin(a2), y: Math.cos(a2) };

  const filtered: PrefilteredObstacle[] = [];

  for (const bldg of allBuildings) {
    if (bldg.isIncluded === false || bldg.category === 'boundary') continue;

    // Szybkie odrzucenie AABB z korytarzem bazującym na wysokości budynku H
    const aabb = getBuildingAABB(bldg);
    const bldgH = Math.max(0, bldg.defaultHeight ?? 15);
    if (aabb && bldgH > 0) {
      const maxL = bldgH * 5.0;
      // Jeśli cały budynek jest na zewnątrz korytarza bocznego L = H * 5:
      if (point.x < aabb.minX - maxL || point.x > aabb.maxX + maxL) {
        continue;
      }
      // Jeśli cały budynek jest na południe od linii L = H * 1.5:
      const maxSouthL = bldgH * 1.5;
      if (aabb.maxY < point.y - maxSouthL) {
        continue;
      }
    }

    for (const seg of bldg.segments) {
      // Pomiń sam badany odcinek
      if (bldg.id === targetBuildingId && seg.id === segment.id) continue;

      const deltaH = Math.max(0, seg.hTop);
      if (deltaH <= 0) continue;

      // 1. Filtr boczny N-S: L = H * 5 (odrzucenie odcinków leżących w całości poza korytarzem)
      const latReach = deltaH * 5.0;
      if (seg.p1.x < point.x - latReach && seg.p2.x < point.x - latReach) continue;
      if (seg.p1.x > point.x + latReach && seg.p2.x > point.x + latReach) continue;

      // 2. Filtr poziomy E-W: L = H * 1.5 na południe od punktu P
      const southLimit = point.y - deltaH * 1.5;
      if (seg.p1.y < southLimit && seg.p2.y < southLimit) continue;

      // Wektory od punktu badanego do obu wierzchołków przeszkody
      const v1x = seg.p1.x - point.x;
      const v1y = seg.p1.y - point.y;
      const v2x = seg.p2.x - point.x;
      const v2y = seg.p2.y - point.y;

      // 4. Krok 1 & 2: Prosta +12° od lica (+78° od normalnej)
      const d1_p1 = v1x * n1.x + v1y * n1.y;
      const d1_p2 = v2x * n1.x + v2y * n1.y;
      if (d1_p1 < -0.01 && d1_p2 < -0.01) continue;

      // Krok 3 & 4: Prosta -12° od lica (-78° od normalnej)
      const d2_p1 = v1x * n2.x + v1y * n2.y;
      const d2_p2 = v2x * n2.x + v2y * n2.y;
      if (d2_p1 < -0.01 && d2_p2 < -0.01) continue;

      filtered.push({ seg, bldgId: bldg.id });
    }
  }

  return filtered;
}

/**
 * Fasada zachowująca wsteczną kompatybilność (deleguje domyślnie do prefilterShadowingObstacles).
 */
export function prefilterObstacleSegments(
  point: Point2D,
  segment: FacadeSegment,
  allBuildings: BuildingLoop[],
  targetBuildingId: string
): PrefilteredObstacle[] {
  return prefilterShadowingObstacles(point, segment, allBuildings, targetBuildingId);
}

/**
 * Evaluates § 12 shadowing for a single point P on a facade.
 */
export function analyzeShadowingAtPoint(
  point: Point2D,
  segment: FacadeSegment,
  offsetRatio: number,
  allBuildings: BuildingLoop[],
  targetBuildingId: string,
  angleStepDeg: number = 0.5,
  prefilteredObstacles?: PrefilteredObstacle[],
  buildingMap?: Map<string, BuildingLoop>
): ShadowingResult {
  const normal = segment.normal;
  const normalAngleRad = Math.atan2(normal.y, normal.x);

  interface Candidate {
    seg: FacadeSegment;
    bldgId: string;
    dReq: number;
    clipP1: Point2D;
    clipP2: Point2D;
  }

  const baseObstacles =
    prefilteredObstacles ?? prefilterObstacleSegments(point, segment, allBuildings, targetBuildingId);

  const candidates: Candidate[] = [];

  const bldgMap = buildingMap ?? new Map<string, BuildingLoop>(allBuildings.map((b) => [b.id, b]));

  for (const { seg, bldgId } of baseObstacles) {
    const bldg = bldgMap.get(bldgId);
    if (!bldg) continue;
    // § 12 ust. 6: balkony i elementy drugorzędne są ignorowane w analizie przesłaniania
    if (bldg.category === 'balcony') continue;

    // Required clearance for this obstacle (§ 12)
    const deltaH = Math.max(0, seg.hTop);
    const dBase  = Math.min(deltaH, 35.0);
    const dReq   = segment.isCityCentre || bldg.isCityCentre
      ? 0.5 * dBase
      : dBase;
    if (dReq <= 0) continue;

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

  // Guarantee exact seamless boundary alignment: start of sector[i] is EXACTLY end of sector[i-1]
  sectors[0].startAngleDeg = -78.0;
  sectors[sectors.length - 1].endAngleDeg = 78.0;
  for (let i = 0; i < sectors.length; i++) {
    if (i > 0) {
      sectors[i].startAngleDeg = sectors[i - 1].endAngleDeg;
    }
    sectors[i].spanDeg = sectors[i].endAngleDeg - sectors[i].startAngleDeg;
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
    rays: [],
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

export interface SolarWindowInfo {
  startHour: number;
  endHour: number;
  azSolarMin: number;
  azSolarMax: number;
  // Wektory normalne prostych granicznych skierowane ku południowi (do wnętrza okna 10h)
  nStart: Vector2D;
  nEnd: Vector2D;
}

/**
 * Jednorazowe wyznaczenie parametrów geometrycznych okna 10h (azymuty i proste graniczne)
 * dla danej lokalizacji geograficznej (niezmienne podczas nawigacji CAD).
 */
export function precomputeSolarWindow(
  settings: ProjectSettings,
  isChildcare: boolean = false,
  hourSystem?: ISolarHourSystem
): SolarWindowInfo {
  const sys = hourSystem ?? new AstroSolarSystem(settings.latitude, settings.longitude, settings.equinoxDate);
  const noonHour = sys.solarNoonDecimal;
  const hoursRadius = isChildcare ? 4 : 5;

  const startHour = Math.max(5.0, noonHour - hoursRadius);
  const endHour = Math.min(19.0, noonHour + hoursRadius);

  const azStart = sys.getAzimuthForHour(startHour);
  const azEnd = sys.getAzimuthForHour(endHour);

  const azSolarMin = Math.min(azStart, azEnd);
  const azSolarMax = Math.max(azStart, azEnd);

  const az1Rad = azSolarMin * DEG2RAD;
  const az2Rad = azSolarMax * DEG2RAD;

  return {
    startHour,
    endHour,
    azSolarMin,
    azSolarMax,
    nStart: { x: Math.cos(az1Rad), y: -Math.sin(az1Rad) },
    nEnd: { x: -Math.cos(az2Rad), y: Math.sin(az2Rad) },
  };
}

/**
 * Computes and caches daily solar path trajectory for the equinox analysis window.
 */
export function computeDailySolarTrajectory(
  settings: ProjectSettings,
  stepMinutes: number = 5,
  isChildcare: boolean = false,
  hourSystem?: ISolarHourSystem
): SolarTrajectorySlot[] {
  const sys = hourSystem ?? new AstroSolarSystem(settings.latitude, settings.longitude, settings.equinoxDate);
  const noonHour = sys.solarNoonDecimal;
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

    const az = sys.getAzimuthForHour(currentHourDec);
    const elev = sys.getElevationForAzimuth(az);
    const isAbove = elev > 0;

    const sunAzimuthMathRad = ((90 - az + 360) % 360) * DEG2RAD;
    const sunDir: Vector2D = {
      x: Math.cos(sunAzimuthMathRad),
      y: Math.sin(sunAzimuthMathRad),
    };

    trajectory.push({
      timeStr,
      hourDec: currentHourDec,
      azimuthDeg: az,
      elevationDeg: elev,
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
  precomputedTrajectory?: SolarTrajectorySlot[],
  prefilteredObstacles?: PrefilteredObstacle[],
  precomputedWindow?: SolarWindowInfo,
  hourSystem?: ISolarHourSystem
): SunlightResult {
  const normal = segment.normal;
  const isChildcare = segment.buildingType === 'childcare';
  const sys = hourSystem ?? new AstroSolarSystem(settings.latitude, settings.longitude, settings.equinoxDate);

  const trajectory =
    precomputedTrajectory ??
    computeDailySolarTrajectory(settings, stepMinutes, isChildcare, sys);

  // 1. Orientation culling check:
  // Find which slots actually strike this facade at an angle >= 12 deg (relative to wall plane, <= 78 deg from normal)
  const activeIndices: number[] = [];
  for (let sIdx = 0; sIdx < trajectory.length; sIdx++) {
    const slot = trajectory[sIdx];
    if (slot.isSunAboveHorizon && slot.elevationDeg > 0) {
      const dot = normal.x * slot.sunDir.x + normal.y * slot.sunDir.y;
      if (dot >= COS_78_DEG) {
        activeIndices.push(sIdx);
      }
    }
  }

  // Fast-path: If no solar slots can hit this wall at >= 12 deg (e.g. North facades or shaded orientations),
  // return immediately without running ANY ray-casts.
  if (activeIndices.length === 0) {
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

  const rawObstacles =
    prefilteredObstacles ?? prefilterSunlightObstacles(point, segment, allBuildings, targetBuildingId);

  const windowInfo =
    precomputedWindow ?? precomputeSolarWindow(settings, isChildcare, sys);
  const { nStart, nEnd } = windowInfo;

  // Liniowy filtr okna 10h dla kandydatów
  const obstacleCandidates: PrefilteredObstacle[] = [];
  for (const item of rawObstacles) {
    const seg = item.seg;
    const v1x = seg.p1.x - point.x;
    const v1y = seg.p1.y - point.y;
    const v2x = seg.p2.x - point.x;
    const v2y = seg.p2.y - point.y;

    const dStart1 = v1x * nStart.x + v1y * nStart.y;
    const dStart2 = v2x * nStart.x + v2y * nStart.y;
    if (dStart1 < -0.01 && dStart2 < -0.01) continue;

    const dEnd1 = v1x * nEnd.x + v1y * nEnd.y;
    const dEnd2 = v2x * nEnd.x + v2y * nEnd.y;
    if (dEnd1 < -0.01 && dEnd2 < -0.01) continue;

    obstacleCandidates.push(item);
  }

  // Initialize flat timeSlots directly
  const timeSlots: SunlightTimeSlot[] = new Array(trajectory.length);
  for (let i = 0; i < trajectory.length; i++) {
    const slot = trajectory[i];
    timeSlots[i] = {
      time: slot.timeStr,
      azimuthDeg: slot.azimuthDeg,
      elevationDeg: slot.elevationDeg,
      isSunAboveHorizon: slot.isSunAboveHorizon,
      isAngleAbove12Deg: false,
      isDirectSunlight: false,
    };
  }

  let totalMinutesSunlight = 0;

  // 2. Perform raycast analysis ONLY for valid slots that meet the >= 12 deg criterion
  for (const sIdx of activeIndices) {
    const slot = trajectory[sIdx];
    const sunDir = slot.sunDir;
    let isBlocked = false;
    let blockingObstacleId: string | undefined = undefined;
    let maxObstacleAngleDeg = 0;

    for (const cand of obstacleCandidates) {
      const seg = cand.seg;

      const hitDist = raySegmentDistance2D(
        point.x,
        point.y,
        sunDir.x,
        sunDir.y,
        seg.p1.x,
        seg.p1.y,
        seg.p2.x,
        seg.p2.y
      );

      if (hitDist > 0.05 && hitDist < Infinity) {
        const deltaH = Math.max(0, seg.hTop);
        const deltaHbase = Math.max(0, seg.hBase ?? 0.0);
        const betaTopDeg = Math.atan2(deltaH, hitDist) * RAD2DEG;
        const betaBaseDeg = Math.atan2(deltaHbase, hitDist) * RAD2DEG;

        if (betaTopDeg > maxObstacleAngleDeg) {
          maxObstacleAngleDeg = betaTopDeg;
        }

        // Cień występuje, gdy promień słoneczny trafia w ścianę: betaBaseDeg <= elevationDeg <= betaTopDeg
        if (slot.elevationDeg <= betaTopDeg && slot.elevationDeg >= betaBaseDeg) {
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

    timeSlots[sIdx] = {
      time: slot.timeStr,
      azimuthDeg: slot.azimuthDeg,
      elevationDeg: slot.elevationDeg,
      isSunAboveHorizon: true,
      isAngleAbove12Deg: true,
      isDirectSunlight: isDirect,
      blockingObstacleId,
      blockingAngleDeg: maxObstacleAngleDeg,
    };
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

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Analityczna metoda § 56 (Nasłonecznienie) — Metoda Linijki Słońca (Segment-Intersection).
 * Zgodna z metoda_przeciec_odcinkow.md i wykreślną geometrią Linijki Słońca Twarowskiego.
 *
 * Czysto analityczna metoda bez dyskretyzacji czasowej i bez raycastingu.
 * Wyznacza ciągły przedział azymutów słońca [azActiveMin, azActiveMax] na fasadzie,
 * analitycznie rzutuje kierunki słońca z płaszczyzny słońca na płaszczyznę XY 2D,
 * przycina odcinki przeszkód do linii granicznej i scalamy przedziały cienia w ciągłe sektory.
 * Granice sektorów kątowych są mapowane bezpośrednio na czas za pomocą analitycznego systemu Linijki Słońca O(1).
 */
export function analyzeSunlightAtPointSegments(
  point: Point2D,
  segment: FacadeSegment,
  offsetRatio: number,
  allBuildings: BuildingLoop[],
  targetBuildingId: string,
  settings: ProjectSettings,
  prefilteredObstacles?: PrefilteredObstacle[],
  precomputedWindow?: SolarWindowInfo,
  hourSystem?: ISolarHourSystem
): SunlightResult & { _segMethodMs?: number } {
  const t0 = performance.now();
  const normal = segment.normal;
  const isChildcare = segment.buildingType === 'childcare';
  const sys = hourSystem ?? new LinijkaSolarSystem(settings.latitude, settings.longitude, settings.equinoxDate);

  // 1. Solar equinox analysis window (niezmienne dla lokalizacji)
  const windowInfo =
    precomputedWindow ?? precomputeSolarWindow(settings, isChildcare, sys);

  const azSolarMin = windowInfo.azSolarMin;
  const azSolarMax = windowInfo.azSolarMax;

  // Facade normal azimuth (geographic degrees)
  const normalAzimuth = ((Math.atan2(normal.x, normal.y) * RAD2DEG + 360) % 360);

  // Active facade view range (normalAzimuth ± 78°, incidence angle >= 12°)
  const azActiveMin = Math.max(azSolarMin, normalAzimuth - 78.0);
  const azActiveMax = Math.min(azSolarMax, normalAzimuth + 78.0);

  if (azActiveMax <= azActiveMin + 0.1) {
    return {
      point,
      segmentId: segment.id,
      offsetRatio,
      totalMinutes: 0,
      totalHours: 0,
      isCompliant: false,
      timeSlots: [],
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

  const obstacles =
    prefilteredObstacles ?? prefilterSunlightObstacles(point, segment, allBuildings, targetBuildingId);

  const { nStart, nEnd } = windowInfo;

  for (const { seg, bldgId } of obstacles) {
    // Wysokość przeszkody H
    const deltaH = Math.max(0, seg.hTop);
    if (deltaH <= 0) continue;

    // ── LINIOWY FILTR OKNA 10H (bez trygonometrii) ──
    // Krok A: Sprawdzenie prostej granicznej porannej (-5h)
    const v1x = seg.p1.x - point.x;
    const v1y = seg.p1.y - point.y;
    const v2x = seg.p2.x - point.x;
    const v2y = seg.p2.y - point.y;

    const dStart1 = v1x * nStart.x + v1y * nStart.y;
    const dStart2 = v2x * nStart.x + v2y * nStart.y;
    if (dStart1 < -0.01 && dStart2 < -0.01) continue;

    // Krok B: Sprawdzenie prostej granicznej popołudniowej (+5h)
    const dEnd1 = v1x * nEnd.x + v1y * nEnd.y;
    const dEnd2 = v2x * nEnd.x + v2y * nEnd.y;
    if (dEnd1 < -0.01 && dEnd2 < -0.01) continue;

    // Filtr 2 (Twarowski, uproszczenie trygonometryczne): odrzuć odcinki, których
    // OBA wierzchołki leżą na południe od poziomej linii E-W oddalonej o L = H × 1,5
    // od punktu badanego. Linia jest zawsze E-W (geograficzne południe), niezależnie
    // od orientacji fasady badanej — wynika to z geometrii metody Twarowskiego.
    if (seg.p1.y < point.y - deltaH * 1.5 && seg.p2.y < point.y - deltaH * 1.5) continue;

    // L_total = H_total × tan(lat), L_base = H_base × tan(lat)
    const deltaHbase = Math.max(0, seg.hBase ?? 0.0);
    const Ltotal = deltaH * k;
    const Lbase = deltaHbase * k;

    const yTotal = point.y - Ltotal; // Granica zewnętrzna cienia (najdalej na południe)
    const yBase = point.y - Lbase;   // Granica wewnętrzna cienia (bliżej P, powyżej brak cienia)

    let p1 = { x: seg.p1.x, y: seg.p1.y };
    let p2 = { x: seg.p2.x, y: seg.p2.y };

    // 1. Odrzucenie: oba wierzchołki na południe od linii Ltotal -> brak cienia
    if (p1.y < yTotal && p2.y < yTotal) continue;

    // 2. Przycięcie do linii Ltotal: odrzucamy część na południe od yTotal
    if (p1.y < yTotal) {
      const t = (yTotal - p1.y) / (p2.y - p1.y);
      p1 = { x: p1.x + t * (p2.x - p1.x), y: yTotal };
    } else if (p2.y < yTotal) {
      const t = (yTotal - p1.y) / (p2.y - p1.y);
      p2 = { x: p1.x + t * (p2.x - p1.x), y: yTotal };
    }

    // 3. Analiza względem linii Lbase:
    // A) Jeśli oba wierzchołki leżą powyżej (na północ od) yBase -> promienie przechodzą pod ścianą, brak cienia
    if (p1.y > yBase && p2.y > yBase) continue;

    // B) Jeśli odcinek przecina yBase -> przycinamy część na północ od yBase (zachowujemy odcinek w [yTotal, yBase])
    if (p1.y > yBase) {
      const t = (yBase - p1.y) / (p2.y - p1.y);
      p1 = { x: p1.x + t * (p2.x - p1.x), y: yBase };
    } else if (p2.y > yBase) {
      const t = (yBase - p1.y) / (p2.y - p1.y);
      p2 = { x: p1.x + t * (p2.x - p1.x), y: yBase };
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

    // Wykorzystaj znak iloczynu wektorowego 2D (Cross Product) do natychmiastowego ustalenia relacji kątowej
    // cross > 0 oznacza, że p2 leży na lewo (przeciwnie do ruchu wskazówek zegara) od p1 względem punktu P
    const cp = crossProduct2D(p1.x, p1.y, p2.x, p2.y, point.x, point.y);
    const startAzCandidate = cp >= 0 ? az1 : az2;
    const endAzCandidate = cp >= 0 ? az2 : az1;

    const intervals: [number, number][] = [];
    if (Math.abs(az1 - az2) > 180) {
      const minA = Math.min(az1, az2);
      const maxA = Math.max(az1, az2);
      intervals.push([maxA, 360]);
      intervals.push([0, minA]);
    } else {
      intervals.push([Math.min(az1, az2), Math.max(az1, az2)]);
    }

    // Zbieramy SUROWE przedziały bez obcinania do azActiveMin/azActiveMax.
    for (const [bStart, bEnd] of intervals) {
      if (bEnd > bStart + 0.01) {
        rawBlocked.push({ startAz: bStart, endAz: bEnd, bldgId });
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

  // 4. Wyznaczanie wolnych sektorów nasłonecznienia i obliczanie czasu (z użyciem szybkiego LUT Binary Search)
  const sectors: import('../types/geometry').SunlightSector[] = [];
  let cursor = azActiveMin;
  let totalHours = 0;

  const isFastLutSupported = typeof (sys as any).getHourForAzimuthFast === 'function';

  function addFreeSector(startAz: number, endAz: number) {
    const rawH1 = isFastLutSupported
      ? (sys as any).getHourForAzimuthFast(startAz)
      : sys.getHourForAzimuth(startAz);
    const rawH2 = isFastLutSupported
      ? (sys as any).getHourForAzimuthFast(endAz)
      : sys.getHourForAzimuth(endAz);
    const hStart = Math.min(rawH1, rawH2);
    const hEnd   = Math.max(rawH1, rawH2);
    const secHours = hEnd - hStart;

    let h1Int = Math.floor(hStart);
    let m1Int = Math.round((hStart - h1Int) * 60);
    if (m1Int >= 60) {
      h1Int += 1;
      m1Int = 0;
    }
    let h2Int = Math.floor(hEnd);
    let m2Int = Math.round((hEnd - h2Int) * 60);
    if (m2Int >= 60) {
      h2Int += 1;
      m2Int = 0;
    }

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
    if (cursor >= azActiveMax) break;
    const gapEnd = Math.min(b.startAz, azActiveMax);
    if (gapEnd > cursor + 0.01) {
      addFreeSector(cursor, gapEnd);
    }
    cursor = Math.max(cursor, b.endAz);
  }

  if (cursor < azActiveMax - 0.01) {
    addFreeSector(cursor, azActiveMax);
  }

  // Dokładne zaokrąglenie do pełnych minut, z uwzględnieniem tolerancji numerycznej O(1) dla pełnego okna
  let totalMinutes = Math.round(totalHours * 60);
  const maxAllowedHours = isChildcare ? 8.0 : 10.0;
  if (Math.abs(totalHours - maxAllowedHours) < 0.05) {
    totalHours = maxAllowedHours;
    totalMinutes = Math.round(maxAllowedHours * 60);
  }
  const reqHours = segment.isCityCentre ? 1.5 : 3.0;
  const isCompliant = totalHours >= reqHours;

  return {
    point,
    segmentId: segment.id,
    offsetRatio,
    totalMinutes,
    totalHours,
    isCompliant,
    timeSlots: [],
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
  totalShadowingTimeMs: number; // Całkowity czas analizy § 12 w danym cyklu
  totalSunlightTimeMs: number; // Całkowity czas analizy § 56 w danym cyklu
  shadowEnvelopeMs: number; // Czas obliczenia obrysów i koperty cienia
  shadowAnalysis?: ShadowAnalysisResult; // Wynik analizy obrysu cienia i godzinowych obrysów
  totalAnalysisMs: number; // Full wall-clock time for the active batch analysis
  totalPoints: number;
}


const analysisPointCache = new Map<string, AnalysisPointResult>();

const sameAnalysisResult = (a: AnalysisPointResult, b: AnalysisPointResult): boolean =>
  a.buildingId === b.buildingId &&
  a.segmentId === b.segmentId &&
  a.normal.x === b.normal.x &&
  a.normal.y === b.normal.y &&
  a.shadowing.isCompliant === b.shadowing.isCompliant &&
  a.shadowing.maxContinuousFreeSpanDeg === b.shadowing.maxContinuousFreeSpanDeg &&
  a.shadowing.totalFreeSpanDeg === b.shadowing.totalFreeSpanDeg &&
  a.sunlight.isCompliant === b.sunlight.isCompliant &&
  a.sunlight.totalMinutes === b.sunlight.totalMinutes &&
  a.sunlight.totalHours === b.sunlight.totalHours;

const makePointCacheKey = (
  cacheKey: string,
  buildingId: string,
  segmentId: string,
  ratio: number
) => `${cacheKey}|${buildingId}|${segmentId}|${ratio.toFixed(6)}`;

/**
 * Runs full batch analysis on all facade segments of tested building(s).
 * Runs BOTH sunlight methods in parallel for benchmarking.
 */
export interface EnabledAnalyses {
  shadowing?: boolean;
  sunlight?: boolean;
  shadowRange?: boolean;
}

export function runFullAnalysis(
  buildings: BuildingLoop[],
  settings: ProjectSettings,
  options?: AnalysisAccuracyOptions,
  sunlightMethod: 'raycasting' | 'segments' = 'raycasting',
  enabledAnalyses?: EnabledAnalyses
): AnalysisBatchOutput {
  const analysisStart = performance.now();
  const isShadowingEnabled = enabledAnalyses?.shadowing !== false;
  const isSunlightEnabled = enabledAnalyses?.sunlight !== false;
  const isShadowRangeEnabled = enabledAnalyses?.shadowRange !== false;

  // If all analytical layers are disabled, return immediately with zero calculations
  if (!isShadowingEnabled && !isSunlightEnabled && !isShadowRangeEnabled) {
    return {
      results: [],
      avgShadowingMs: 0,
      avgSunlightMs: 0,
      avgSunlightSegMs: 0,
      totalShadowingTimeMs: 0,
      totalSunlightTimeMs: 0,
      shadowEnvelopeMs: 0,
      shadowAnalysis: { hourlyShadows: [], envelopeLoops: [], calculationTimeMs: 0 },
      totalAnalysisMs: performance.now() - analysisStart,
      totalPoints: 0,
    };
  }

  if (analysisPointCache.size > 15000) {
    analysisPointCache.clear();
  }

  const results: AnalysisPointResult[] = [];
  const testedBuildings = buildings.filter((b) => b.isTested && b.isIncluded !== false && b.category !== 'boundary');
  const interval = options?.samplingInterval ?? settings.samplingInterval ?? 0.25;
  const angleStep = options?.angleStepDeg ?? 0.5;
  const sunlightStep = options?.sunlightStepMinutes ?? 5;
  const cacheKey = JSON.stringify({
    buildings: buildings.map((b) => ({
      id: b.id,
      h: b.defaultHeight,
      tested: b.isTested,
      included: b.isIncluded !== false,
      city: b.isCityCentre,
      type: b.buildingType,
      layer: b.layer,
      vertices: b.vertices.map((v) => [Number(v.x.toFixed(4)), Number(v.y.toFixed(4))]),
    })),
    settings: {
      latitude: Number(settings.latitude.toFixed(4)),
      longitude: Number(settings.longitude.toFixed(4)),
      city: settings.isCityCentreDefault,
      sampling: interval,
      equinox: settings.equinoxDate,
    },
    options: {
      angleStep,
      sunlightStep,
      sunlightMethod,
      isShadowingEnabled,
      isSunlightEnabled,
    },
  });

  // Precompute solar trajectories and 10h window lines once for standard residential and childcare segments
  const astroSystem = isSunlightEnabled ? new AstroSolarSystem(settings.latitude, settings.longitude, settings.equinoxDate) : null;
  const linijkaSystem = isSunlightEnabled ? new LinijkaSolarSystem(settings.latitude, settings.longitude, settings.equinoxDate) : null;
  const activeHourSystem = isSunlightEnabled ? (sunlightMethod === 'segments' ? linijkaSystem! : astroSystem!) : null;

  const standardTrajectory = (isSunlightEnabled && activeHourSystem)
    ? computeDailySolarTrajectory(settings, sunlightStep, false, activeHourSystem)
    : [];
  const childcareTrajectory = (isSunlightEnabled && activeHourSystem)
    ? computeDailySolarTrajectory(settings, sunlightStep, true, activeHourSystem)
    : [];
  const standardWindow = (isSunlightEnabled && activeHourSystem)
    ? precomputeSolarWindow(settings, false, activeHourSystem)
    : null;
  const childcareWindow = (isSunlightEnabled && activeHourSystem)
    ? precomputeSolarWindow(settings, true, activeHourSystem)
    : null;

  // Trajektorie referencyjne (Astro) dla benchmarku w trybie Linijki Słońca
  const refStandardTrajectory = (isSunlightEnabled && sunlightMethod === 'segments' && astroSystem)
    ? computeDailySolarTrajectory(settings, sunlightStep, false, astroSystem)
    : null;
  const refChildcareTrajectory = (isSunlightEnabled && sunlightMethod === 'segments' && astroSystem)
    ? computeDailySolarTrajectory(settings, sunlightStep, true, astroSystem)
    : null;
  const refStandardWindow = (isSunlightEnabled && sunlightMethod === 'segments' && astroSystem)
    ? precomputeSolarWindow(settings, false, astroSystem)
    : null;
  const refChildcareWindow = (isSunlightEnabled && sunlightMethod === 'segments' && astroSystem)
    ? precomputeSolarWindow(settings, true, astroSystem)
    : null;

  let totalShadowingTimeMs = 0;
  let totalSunlightTimeMs = 0;
  let totalSunlightSegTimeMs = 0;
  let pointCount = 0;

  // Akumulatory różnic do logowania zbiórczego
  let diffCount = 0;
  let maxHoursDiff = 0;
  let totalHoursDiffAbs = 0;

  if (isShadowingEnabled || isSunlightEnabled) {
    const batchBuildingMap = new Map<string, BuildingLoop>(buildings.map((b) => [b.id, b]));

    for (const bldg of testedBuildings) {
      for (const seg of bldg.segments) {
        const isChildcare = seg.buildingType === 'childcare';
        const sampled = sampleSegmentPoints(seg.p1, seg.p2, interval);
        const trajectory = isChildcare ? childcareTrajectory : standardTrajectory;
        const windowInfo = isChildcare ? childcareWindow : standardWindow;
        const refTrajectory = isChildcare ? refChildcareTrajectory : refStandardTrajectory;
        const refWindowInfo = isChildcare ? refChildcareWindow : refStandardWindow;
        const sampleKeys = sampled.map((sample) =>
          makePointCacheKey(cacheKey, bldg.id, seg.id, sample.ratio)
        );
        const sampleResults: Array<AnalysisPointResult | null> = new Array(sampled.length).fill(null);

        for (let i = 0; i < sampled.length; i++) {
          const cached = analysisPointCache.get(sampleKeys[i]);
          if (cached) {
            sampleResults[i] = cached;
          }
        }

        for (let i = 0; i < sampled.length; i++) {
          if (sampleResults[i]) continue;

          const leftKnown = i > 0 ? sampleResults[i - 1] : null;
          let rightKnownIndex = -1;
          for (let k = i + 1; k < sampled.length; k++) {
            if (sampleResults[k]) {
              rightKnownIndex = k;
              break;
            }
          }
          const rightKnown = rightKnownIndex >= 0 ? sampleResults[rightKnownIndex] : null;

          if (leftKnown && rightKnown && sameAnalysisResult(leftKnown, rightKnown)) {
            for (let j = i; j < rightKnownIndex; j++) {
              sampleResults[j] = leftKnown;
              analysisPointCache.set(sampleKeys[j], leftKnown);
            }
            i = rightKnownIndex - 1;
            continue;
          }

          const sample = sampled[i];

          let shadowing: ShadowingResult;
          let pointShadowMs = 0;
          if (isShadowingEnabled) {
            const prefilteredShadowing = prefilterShadowingObstacles(sample.point, seg, buildings, bldg.id);
            const tShadow0 = performance.now();
            shadowing = analyzeShadowingAtPoint(
              sample.point, seg, sample.ratio, buildings, bldg.id, angleStep, prefilteredShadowing, batchBuildingMap
            );
            pointShadowMs = performance.now() - tShadow0;
            totalShadowingTimeMs += pointShadowMs;
          } else {
            shadowing = {
              point: sample.point,
              segmentId: seg.id,
              offsetRatio: sample.ratio,
              isCompliant: true,
              maxContinuousFreeSpanDeg: 156,
              totalFreeSpanDeg: 156,
              sectors: [],
              rays: [],
            };
          }

          let sunlight: SunlightResult;
          let pointSunlightMs = 0;
          if (isSunlightEnabled) {
            const prefilteredSunlight = prefilterSunlightObstacles(sample.point, seg, buildings, bldg.id);
            const tSun0 = performance.now();
            sunlight =
              sunlightMethod === 'segments'
                ? analyzeSunlightAtPointSegments(
                    sample.point, seg, sample.ratio, buildings, bldg.id, settings, prefilteredSunlight, windowInfo || undefined, linijkaSystem!
                  )
                : analyzeSunlightAtPoint(
                    sample.point, seg, sample.ratio, buildings, bldg.id, settings, sunlightStep, trajectory, prefilteredSunlight, windowInfo || undefined, astroSystem!
                  );
            pointSunlightMs = performance.now() - tSun0;
            totalSunlightTimeMs += pointSunlightMs;

            let sunlightRay = sunlight;
            if (sunlightMethod === 'segments' && refTrajectory && refWindowInfo && astroSystem) {
              const tSunSeg0 = performance.now();
              sunlightRay = analyzeSunlightAtPoint(
                sample.point, seg, sample.ratio, buildings, bldg.id, settings, sunlightStep, refTrajectory, prefilteredSunlight, refWindowInfo || undefined, astroSystem
              );
              totalSunlightSegTimeMs += performance.now() - tSunSeg0;

              const hoursDiff = Math.abs(sunlight.totalHours - sunlightRay.totalHours);
              totalHoursDiffAbs += hoursDiff;
              if (hoursDiff > 0.01) {
                diffCount++;
                if (hoursDiff > maxHoursDiff) maxHoursDiff = hoursDiff;
              }
            }
          } else {
            sunlight = {
              point: sample.point,
              segmentId: seg.id,
              offsetRatio: sample.ratio,
              totalMinutes: 0,
              totalHours: 0,
              isCompliant: true,
              timeSlots: [],
              sectors: [],
            };
          }

          const result: AnalysisPointResult & { evalShadowMs?: number; evalSunlightMs?: number } = {
            id: `${bldg.id}-${seg.id}-p${i}`,
            point: sample.point,
            normal: seg.normal,
            segmentId: seg.id,
            buildingId: bldg.id,
            shadowing,
            sunlight,
            evalShadowMs: pointShadowMs,
            evalSunlightMs: pointSunlightMs,
          };
          sampleResults[i] = result;
          analysisPointCache.set(sampleKeys[i], result);
        }
        for (const res of sampleResults) {
          if (!res) continue;
          pointCount++;
          results.push(res);
        }
      }
    }
  }

  // Obliczenie sumarycznych czasów § 12 i § 56 obejmujących WSZYSTKIE punkty zbadanej siatki
  let allPointsShadowingTimeMs = 0;
  let allPointsSunlightTimeMs = 0;
  if (pointCount > 0) {
    let measuredShadowCount = 0;
    let measuredSunlightCount = 0;
    for (const res of results) {
      const customRes = res as AnalysisPointResult & { evalShadowMs?: number; evalSunlightMs?: number };
      if (customRes.evalShadowMs !== undefined && customRes.evalShadowMs > 0) {
        allPointsShadowingTimeMs += customRes.evalShadowMs;
        measuredShadowCount++;
      }
      if (customRes.evalSunlightMs !== undefined && customRes.evalSunlightMs > 0) {
        allPointsSunlightTimeMs += customRes.evalSunlightMs;
        measuredSunlightCount++;
      }
    }
    // Jeśli część punktów była zinterpolowana (nie mierzona bezpośrednio),
    // ekstrapolujemy średni koszt na wszystkie punkty fasady, aby reprezentować pełen koszt analizy 100% punktów
    if (measuredShadowCount > 0 && measuredShadowCount < pointCount && isShadowingEnabled) {
      const avgPointShadowMs = allPointsShadowingTimeMs / measuredShadowCount;
      allPointsShadowingTimeMs = avgPointShadowMs * pointCount;
    } else if (allPointsShadowingTimeMs === 0 && isShadowingEnabled && totalShadowingTimeMs > 0) {
      allPointsShadowingTimeMs = totalShadowingTimeMs;
    }

    if (measuredSunlightCount > 0 && measuredSunlightCount < pointCount && isSunlightEnabled) {
      const avgPointSunlightMs = allPointsSunlightTimeMs / measuredSunlightCount;
      allPointsSunlightTimeMs = avgPointSunlightMs * pointCount;
    } else if (allPointsSunlightTimeMs === 0 && isSunlightEnabled && totalSunlightTimeMs > 0) {
      allPointsSunlightTimeMs = totalSunlightTimeMs;
    }
  }

  const finalShadowingTimeMs = isShadowingEnabled ? Math.max(totalShadowingTimeMs, allPointsShadowingTimeMs) : 0;
  const finalSunlightTimeMs = isSunlightEnabled ? Math.max(totalSunlightTimeMs, allPointsSunlightTimeMs) : 0;

  const avgShadowingMs   = pointCount > 0 && isShadowingEnabled ? finalShadowingTimeMs  / pointCount : 0;
  const avgSunlightMs    = pointCount > 0 && isSunlightEnabled  ? finalSunlightTimeMs   / pointCount : 0;
  const avgSunlightSegMs = pointCount > 0 && isSunlightEnabled  ? totalSunlightSegTimeMs/ pointCount : 0;

  // ── Analiza obrysu cienia rzucanego (Silhouette Edges + Koperta + Godziny 0, +-1h..+-5h) ──
  let shadowAnalysis = { hourlyShadows: [] as any[], envelopeLoops: [] as any[], calculationTimeMs: 0 };
  if (isShadowRangeEnabled) {
    shadowAnalysis = computeFullShadowAnalysis(
      buildings,
      settings.latitude,
      settings.longitude,
      settings.equinoxDate,
      0.25,
      sunlightMethod
    );
  }
  const shadowEnvelopeMs = shadowAnalysis.calculationTimeMs;

  const totalAnalysisMs = performance.now() - analysisStart;

  // ── Log benchmark do DevTools Console (tylko gdy Metoda Linijki Słońca aktywna) ──
  if (isSunlightEnabled && sunlightMethod === 'segments' && pointCount > 0) {
    console.groupCollapsed(
      `%c§56 Benchmark [Metoda Linijki Słońca aktywna] — ${pointCount} pkt`,
      'color:#f59e0b;font-weight:bold'
    );
    console.log(`Linijka Słońca (aktywna):    avg ${avgSunlightMs.toFixed(3)} ms/pkt | total ${totalSunlightTimeMs.toFixed(1)} ms`);
    console.log(`Metoda Astronomiczna (ref):  avg ${avgSunlightSegMs.toFixed(3)} ms/pkt | total ${totalSunlightSegTimeMs.toFixed(1)} ms`);
    console.log(`Przyspieszenie Lin/Astro:    ${avgSunlightSegMs > 0 ? (avgSunlightMs / avgSunlightSegMs).toFixed(2) : '—'}×`);
    console.log(`Obrys cienia (koperta/godz): ${shadowEnvelopeMs.toFixed(2)} ms`);
    console.log(`Różnice wyników:             ${diffCount}/${pointCount} pkt z |Δh| > 0.01h | max Δ = ${maxHoursDiff.toFixed(3)}h | śr. |Δ| = ${(totalHoursDiffAbs / pointCount).toFixed(4)}h`);
    console.groupEnd();
  }

  return {
    results,
    avgShadowingMs,
    avgSunlightMs,
    avgSunlightSegMs,
    totalShadowingTimeMs: finalShadowingTimeMs,
    totalSunlightTimeMs: finalSunlightTimeMs,
    shadowEnvelopeMs,
    shadowAnalysis,
    totalAnalysisMs,
    totalPoints: pointCount,
  };
}

