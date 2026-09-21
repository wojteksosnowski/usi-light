import { BuildingLoop, Point2D } from '../types/geometry';
import { isPolygonCCW } from '@/utils/math2d';
import { isBuildingVariantActive } from './geometrySelectors';
import { buildRingSegments, computeLineEquation, ensureOppositeWinding } from './ringSegments';

export { computeLineEquation };

/**
 * Rebuilds building loop segments, outward normals, line equations and CCW winding for updated vertices.
 * Also regenerates segments for `bldg.holes` (interior rings, e.g. courtyards or parcel enclaves),
 * forcing their winding opposite to the outer ring so normals point into the void.
 */
export function rebuildBuildingSegments(bldg: BuildingLoop, newVertices: Point2D[]): BuildingLoop {
  if (newVertices.length < 3) {
    return {
      ...bldg,
      vertices: [...newVertices],
      segments: [],
    };
  }

  const isCCW = isPolygonCCW(newVertices);
  const segments = buildRingSegments(bldg, newVertices, isCCW, `${bldg.id}-seg`, 0);

  const holes = bldg.holes;
  if (holes && holes.length > 0) {
    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h];
      if (hole.length < 3) continue;
      const ring = ensureOppositeWinding(hole, isPolygonCCW(hole), isCCW);
      segments.push(...buildRingSegments(bldg, ring, isCCW, `${bldg.id}-hole${h}-seg`, h + 1));
    }
  }

  return {
    ...bldg,
    vertices: newVertices.map((v) => ({ x: v.x, y: v.y })),
    segments,
    isClockwise: !isCCW,
    cachedLineEquations: undefined,
  };
}

export interface AngleBin {
  binStartDeg: number;
  binEndDeg: number;
  label: string;
  count: number;
  totalLength: number;
  percentage: number;
  isTrackingActive?: boolean; // true jeśli koszyk jest aktywnie wykorzystywany przez śledzenie
}

export interface DominantDirection {
  angleDeg: number; // e.g. 24.5°
  orthogonalDeg: number; // e.g. 114.5°
  totalLength: number; // Total length aligned with this axis (within ±7.5°)
  percentage: number;
  isTrackingActive?: boolean;
}

export interface AnalyzeSegmentsOptions {
  noisePercentileCutoff?: number; // np. 20 dla 20. percentylu
  minLengthMeters?: number; // np. 0.2m
  /** Kąt bazowy aktywnego widoku (WORLDUCS/USERUCS) w stopniach, do reguły separacji EDGE_UCS/OTRACK. */
  viewAngleDeg?: number;
  /** Próg separacji kątowej wobec widoku (domyślnie 2.0°) — poniżej tego progu EDGE_UCS jest odrzucany
   *  jako nierozróżnialny od widoku, zapobiegając nakładaniu się osi śledzenia i migotaniu UI. */
  edgeUcsSeparationDeg?: number;
}

/**
 * Domyślny próg deadbandu EDGE_UCS/OTRACK (spec §2.2): poniżej tej różnicy kątowej wobec
 * ACTIVE_UCS, EDGE_UCS jest uznawany za nierozróżnialny od widoku i odrzucany, by uniknąć
 * niestabilności numerycznej i niemal równoległych osi śledzenia.
 */
export const EDGE_UCS_DEADBAND_DEG = 2.0;
export const EDGE_UCS_DEADBAND_RAD = (EDGE_UCS_DEADBAND_DEG * Math.PI) / 180;

/**
 * Minimalny kąt różnicy między dwoma kątami modulo 90°, wg reguły separacji OTRACK (spec §2.2):
 * Δθ = min_k |θ_edge - θ_view - k*90°|
 */
export function angularSeparationMod90Deg(angleDeg: number, viewAngleDeg: number): number {
  const raw = ((angleDeg - viewAngleDeg) % 90 + 90) % 90;
  return Math.min(raw, 90 - raw);
}

export interface SegmentStatistics {
  totalSegments: number;
  totalLength: number;
  averageLength: number;
  testedSegmentsCount: number;
  testedLength: number;
  obstacleSegmentsCount: number;
  obstacleLength: number;
  dominantDirections: DominantDirection[];
  angleBins: AngleBin[];
  lengthCutoffMeters: number; // wyliczony próg odcięcia długości
  noisePercentileCutoff: number; // zastosowany percentyl
}

/**
 * Performs comprehensive statistical and geometric analysis of all facade segments across buildings,
 * with noise percentile cut-off to eliminate short/noisy DXF fragments from dominant tracking directions.
 *
 * OTROfiltr: mechanizm filtrowania krawędzi używany wyłącznie do wyznaczenia dominującego kierunku
 * siatki projektu (EDGE_UCS / OTRACK "Siatka projektu"), niezależny od SNAPfiltra w
 * src/engine/snapping/strategies/EdgeSnapStrategy.ts (ten działa na kandydatach węzłów OSNAP,
 * inny algorytm — mediana edgeScore zamiast percentyla długości).
 */
export function analyzeSegmentsStatistics(
  buildings: BuildingLoop[],
  options?: AnalyzeSegmentsOptions
): SegmentStatistics {
    // OTROfiltr: odcięcie percentylowe długości segmentów (domyślnie dolne 20%) + twardy próg minimalny,
    // eliminujące szumowe/krótkie fragmenty przed wyznaczeniem kierunku dominującego siatki OTRACK.
    const noisePercentileCutoff = options?.noisePercentileCutoff ?? 20; // Domyślnie 20%
  const minLengthThreshold = options?.minLengthMeters ?? 0.30; // OTROfiltr: próg minimalny, 0.30m

  let totalSegments = 0;
  let totalLength = 0;
  let testedSegmentsCount = 0;
  let testedLength = 0;
  let obstacleSegmentsCount = 0;
  let obstacleLength = 0;

  // 1. OTROfiltr, krok 1: zbieranie wszystkich długości do wyznaczenia percentylu odcięcia
  const allLengths: number[] = [];

  for (const bldg of buildings) {
    if (bldg.isIncluded === false || bldg.category === 'boundary') continue;
    if (!isBuildingVariantActive(bldg)) continue;
    for (const seg of bldg.segments) {
      const len = seg.length;
      if (Number.isFinite(len) && len >= 1e-4) {
        allLengths.push(len);
      }
    }
  }

  // OTROfiltr, krok 2: obliczenie wartości długości dla percentylu (lengthCutoffMeters)
  allLengths.sort((a, b) => a - b);
  let lengthCutoffMeters = minLengthThreshold;
  if (allLengths.length > 0 && noisePercentileCutoff > 0) {
    const idx = Math.min(
      allLengths.length - 1,
      Math.max(0, Math.floor((allLengths.length * noisePercentileCutoff) / 100))
    );
    lengthCutoffMeters = Math.max(minLengthThreshold, allLengths[idx]);
  }

  // 12 angle bins of 15 degrees each: 0-15, 15-30, ..., 165-180
  const binStep = 15;
  const numBins = 180 / binStep;
  const bins: { count: number; length: number }[] = Array.from({ length: numBins }, () => ({
    count: 0,
    length: 0,
  }));

  // Fine-grained 1-degree histogram for dominant axis detection (tylko segmenty przechodzące OTROfiltr)
  const fineHistogram = new Float64Array(180);

  for (const bldg of buildings) {
    if (bldg.isIncluded === false || bldg.category === 'boundary') continue;
    if (!isBuildingVariantActive(bldg)) continue;

    for (const seg of bldg.segments) {
      const len = seg.length;
      if (!Number.isFinite(len) || len < 1e-4) continue;

      totalSegments++;
      totalLength += len;

      if (bldg.isTested) {
        testedSegmentsCount++;
        testedLength += len;
      } else {
        obstacleSegmentsCount++;
        obstacleLength += len;
      }

      // Line angle in [0, 180)
      const lineEq = seg.lineEquation ?? computeLineEquation(seg.p1, seg.p2, seg.normal);
      const angle = lineEq.angleDeg;

      // Add to bin (dla pełnej statystyki)
      const bIdx = Math.min(numBins - 1, Math.max(0, Math.floor(angle / binStep)));
      bins[bIdx].count++;
      bins[bIdx].length += len;

      // Add to fine histogram tylko dla segmentów istotnych (powyżej odcięcia OTROfiltra)
      if (len >= lengthCutoffMeters) {
        const centerDeg = Math.round(angle) % 180;
        for (let offset = -3; offset <= 3; offset++) {
          const d = (centerDeg + offset + 180) % 180;
          const weight = Math.exp(-(offset * offset) / 4);
          fineHistogram[d] += len * weight;
        }
      }
    }
  }

  const averageLength = totalSegments > 0 ? totalLength / totalSegments : 0;

  // Detect dominant orthogonal pair (angle and angle + 90) - wzajemne wzmacnianie par prostopadłych
  const dominantDirections: DominantDirection[] = [];
  if (totalLength > 0) {
    let bestAngle = 0;
    let bestScore = 0;

    for (let a = 0; a < 90; a++) {
      const ortho = a + 90;
      // Wzmocnienie ortogonalne: kierunki prostopadłe nie rywalizują, lecz wspólnie tworzą nośnik siatki
      const combinedScore = fineHistogram[a] + fineHistogram[ortho];
      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestAngle = a;
      }
    }

    // Wyznaczenie dokładnego, rzeczywistego kąta siatki dominującej (średnia ważona rzeczywistych kątów segmentów)
    let weightedAngleSum = 0;
    let totalDominantWeight = 0;
    let dominantLength = 0;

    for (const bldg of buildings) {
      if (bldg.isIncluded === false || bldg.category === 'boundary') continue;
      for (const seg of bldg.segments) {
        const lineEq = seg.lineEquation ?? computeLineEquation(seg.p1, seg.p2, seg.normal);
        let offset = ((lineEq.angleDeg - bestAngle) % 90 + 90) % 90;
        if (offset > 45) offset -= 90;

        if (Math.abs(offset) <= 7.5) {
          dominantLength += seg.length;
          weightedAngleSum += (bestAngle + offset) * seg.length;
          totalDominantWeight += seg.length;
        }
      }
    }

    const exactAngle = totalDominantWeight > 0 ? ((((weightedAngleSum / totalDominantWeight) % 180) + 180) % 180) : bestAngle;
    const percentage = totalLength > 0 ? (dominantLength / totalLength) * 100 : 0;

    // Reguła separacji EDGE_UCS/OTRACK (spec §2.2): jeśli kąt dominujący jest nierozróżnialny
    // od kąta widoku (Δθ < próg, domyślnie 2.0°), EDGE_UCS jest ignorowany — zapobiega to
    // nakładaniu się niemal równoległych osi śledzenia i migotaniu interfejsu.
    const viewAngleDeg = options?.viewAngleDeg ?? 0;
    const separationDeg = options?.edgeUcsSeparationDeg ?? EDGE_UCS_DEADBAND_DEG;
    const isIndistinctFromView = angularSeparationMod90Deg(exactAngle, viewAngleDeg) < separationDeg;

    if (percentage >= 15.0 || totalSegments <= 4) {
      // isTrackingActive=false gdy EDGE_UCS pokrywa się z widokiem (reguła separacji §2.2):
      // konsumenci (DirectionSnapStrategy, OtrackManager) powinni w tym przypadku pominąć tę oś,
      // pozostawiając wyłącznie domyślną siatkę kartezjańską 0°/90°, by uniknąć duplikatu.
      dominantDirections.push({
        angleDeg: exactAngle,
        orthogonalDeg: (exactAngle + 90) % 180,
        totalLength: dominantLength,
        percentage,
        isTrackingActive: !isIndistinctFromView,
      });
    } else {
      // Fallback: standardowa siatka kartezjańska 0°/90°
      dominantDirections.push({
        angleDeg: 0,
        orthogonalDeg: 90,
        totalLength: dominantLength,
        percentage,
        isTrackingActive: false,
      });
    }
  }

  // Zbuduj koszyki kątowe z oznaczeniem aktywności dla śledzenia
  const angleBins: AngleBin[] = bins.map((b, idx) => {
    const start = idx * binStep;
    const end = start + binStep;
    const binCenter = (start + end) / 2;
    const percentage = totalLength > 0 ? (b.length / totalLength) * 100 : 0;

    let isTrackingActive = false;
    if (dominantDirections.length > 0) {
      const dom = dominantDirections[0];
      const diff1 = Math.abs(binCenter - dom.angleDeg);
      const diff2 = Math.abs(binCenter - dom.orthogonalDeg);
      if (diff1 <= 10 || diff1 >= 170 || diff2 <= 10 || diff2 >= 170) {
        isTrackingActive = true;
      }
    }

    return {
      binStartDeg: start,
      binEndDeg: end,
      label: `${start}° - ${end}°`,
      count: b.count,
      totalLength: b.length,
      percentage,
      isTrackingActive,
    };
  });

  return {
    totalSegments,
    totalLength,
    averageLength,
    testedSegmentsCount,
    testedLength,
    obstacleSegmentsCount,
    obstacleLength,
    dominantDirections,
    angleBins,
    lengthCutoffMeters,
    noisePercentileCutoff,
  };
}
