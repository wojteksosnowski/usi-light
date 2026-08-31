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
}

export interface DominantDirection {
  angleDeg: number; // e.g. 24.5°
  orthogonalDeg: number; // e.g. 114.5°
  totalLength: number; // Total length aligned with this axis (within ±7.5°)
  percentage: number;
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
}

/**
 * Performs comprehensive statistical and geometric analysis of all facade segments across buildings.
 */
export function analyzeSegmentsStatistics(buildings: BuildingLoop[]): SegmentStatistics {
  let totalSegments = 0;
  let totalLength = 0;
  let testedSegmentsCount = 0;
  let testedLength = 0;
  let obstacleSegmentsCount = 0;
  let obstacleLength = 0;

  // 12 angle bins of 15 degrees each: 0-15, 15-30, ..., 165-180
  const binStep = 15;
  const numBins = 180 / binStep;
  const bins: { count: number; length: number }[] = Array.from({ length: numBins }, () => ({
    count: 0,
    length: 0,
  }));

  // Fine-grained 1-degree histogram for dominant axis detection
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

      // Add to bin
      const bIdx = Math.min(numBins - 1, Math.max(0, Math.floor(angle / binStep)));
      bins[bIdx].count++;
      bins[bIdx].length += len;

      // Add to fine histogram (with smooth kernel ±3 deg)
      const centerDeg = Math.round(angle) % 180;
      for (let offset = -3; offset <= 3; offset++) {
        const d = (centerDeg + offset + 180) % 180;
        const weight = Math.exp(-(offset * offset) / 4);
        fineHistogram[d] += len * weight;
      }
    }
  }

  const averageLength = totalSegments > 0 ? totalLength / totalSegments : 0;

  const angleBins: AngleBin[] = bins.map((b, idx) => {
    const start = idx * binStep;
    const end = start + binStep;
    return {
      binStartDeg: start,
      binEndDeg: end,
      label: `${start}° - ${end}°`,
      count: b.count,
      totalLength: b.length,
      percentage: totalLength > 0 ? (b.length / totalLength) * 100 : 0,
    };
  });

  // Detect dominant orthogonal pair (angle and angle + 90)
  const dominantDirections: DominantDirection[] = [];
  if (totalLength > 0) {
    // Check angles in [0, 90) and combine with orthogonal (angle + 90)
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

    dominantDirections.push({
      angleDeg: bestAngle,
      orthogonalDeg: (bestAngle + 90) % 180,
      totalLength: dominantLength,
      percentage: (dominantLength / totalLength) * 100,
    });
  }

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
  };
}
