import { BuildingLoop, FacadeSegment, LineEquation2D, Point2D } from '../types/geometry';
import { calculateOutwardNormal, isPolygonCCW } from './math2d';

/**
 * Computes general (Ax + By + C = 0) and slope-intercept (y = ax + b) line equations for a segment.
 */
export function computeLineEquation(p1: Point2D, p2: Point2D, normal?: { x: number; y: number }): LineEquation2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1e-6;

  // Normalized general equation coefficients where A^2 + B^2 = 1
  let A = -dy / len;
  let B = dx / len;
  if (normal) {
    const dot = A * normal.x + B * normal.y;
    if (dot < 0) {
      A = -A;
      B = -B;
    }
  }
  const C = -(A * p1.x + B * p1.y);

  const isVertical = Math.abs(dx) < 1e-4;
  const slope = isVertical ? undefined : dy / dx;
  const intercept = isVertical ? undefined : p1.y - slope! * p1.x;

  // Line orientation angle in [0, 180) degrees
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 180;
  if (angleDeg >= 180) angleDeg -= 180;

  // Outward normal azimuth in [0, 360) degrees
  const nx = normal ? normal.x : A;
  const ny = normal ? normal.y : B;
  const azimuthDeg = ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360;

  return {
    A,
    B,
    C,
    slope,
    intercept,
    isVertical,
    angleDeg,
    azimuthDeg,
  };
}

/**
 * Rebuilds building loop segments, outward normals, line equations and CCW winding for updated vertices.
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
  const segments: FacadeSegment[] = [];

  for (let i = 0; i < newVertices.length; i++) {
    const p1 = newVertices[i];
    const p2 = newVertices[(i + 1) % newVertices.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const normal = calculateOutwardNormal(p1, p2, isCCW);
    const lineEq = computeLineEquation(p1, p2, normal);

    segments.push({
      id: `${bldg.id}-seg-${i + 1}`,
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      normal,
      length: len,
      angleRad: Math.atan2(dy, dx),
      hTop: bldg.defaultHeight,
      hWindowBottom: bldg.hWindowBottom || 0.85,
      isCityCentre: bldg.isCityCentre,
      buildingType: bldg.buildingType,
      lineEquation: lineEq,
    });
  }

  return {
    ...bldg,
    vertices: newVertices.map((v) => ({ x: v.x, y: v.y })),
    segments,
    isClockwise: !isCCW,
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
 */
export function analyzeSegmentsStatistics(
  buildings: BuildingLoop[],
  options?: AnalyzeSegmentsOptions
): SegmentStatistics {
  const noisePercentileCutoff = options?.noisePercentileCutoff ?? 20; // Domyślnie 20%
  const minLengthThreshold = options?.minLengthMeters ?? 0.15;

  let totalSegments = 0;
  let totalLength = 0;
  let testedSegmentsCount = 0;
  let testedLength = 0;
  let obstacleSegmentsCount = 0;
  let obstacleLength = 0;

  // 1. Zbieranie wszystkich długości do wyznaczenia percentylu odcięcia
  const allLengths: number[] = [];

  for (const bldg of buildings) {
    if (bldg.isIncluded === false) continue;
    for (const seg of bldg.segments) {
      const len = seg.length;
      if (Number.isFinite(len) && len >= 1e-4) {
        allLengths.push(len);
      }
    }
  }

  // Obliczenie wartości długości dla percentylu
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

  // Fine-grained 1-degree histogram for dominant axis detection (tylko segmenty powyżej progu)
  const fineHistogram = new Float64Array(180);

  for (const bldg of buildings) {
    if (bldg.isIncluded === false) continue;

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

      // Add to fine histogram tylko dla segmentów istotnych (powyżej odcięcia szumu)
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

  // Detect dominant orthogonal pair (angle and angle + 90)
  const dominantDirections: DominantDirection[] = [];
  if (totalLength > 0) {
    let bestAngle = 0;
    let bestScore = 0;

    for (let a = 0; a < 90; a++) {
      const ortho = a + 90;
      const combinedScore = fineHistogram[a] + fineHistogram[ortho];
      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestAngle = a;
      }
    }

    // Measure exact length aligned within ±7.5° of bestAngle or bestAngle + 90
    let dominantLength = 0;
    for (const bldg of buildings) {
      if (bldg.isIncluded === false) continue;
      for (const seg of bldg.segments) {
        const lineEq = seg.lineEquation ?? computeLineEquation(seg.p1, seg.p2, seg.normal);
        const diff1 = Math.abs(lineEq.angleDeg - bestAngle);
        const diff2 = Math.abs(lineEq.angleDeg - (bestAngle + 90));
        if (diff1 <= 7.5 || diff1 >= 172.5 || diff2 <= 7.5 || diff2 >= 172.5) {
          dominantLength += seg.length;
        }
      }
    }

    const percentage = totalLength > 0 ? (dominantLength / totalLength) * 100 : 0;
    // Odrzucenie marginalnych próbek: wymagane co najmniej 15% łącznej długości
    if (percentage >= 15.0 || totalSegments <= 4) {
      dominantDirections.push({
        angleDeg: bestAngle,
        orthogonalDeg: (bestAngle + 90) % 180,
        totalLength: dominantLength,
        percentage,
        isTrackingActive: true,
      });
    } else {
      // Fallback: standardowa siatka kartezjańska 0°/90°
      dominantDirections.push({
        angleDeg: 0,
        orthogonalDeg: 90,
        totalLength: dominantLength,
        percentage,
        isTrackingActive: true,
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
