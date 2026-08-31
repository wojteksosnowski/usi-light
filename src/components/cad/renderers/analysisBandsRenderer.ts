import { CadRenderContext } from '../types';
import { AnalysisPointResult, BuildingLoop, Point2D } from '../../../types/geometry';
import { APP_CONFIG } from '../../../config/appConfig';

/**
 * Renders continuous analysis bands on building facades for § 12 (inside) and § 56 (outside).
 * Corners are analytically mitered along angle bisectors to ensure seamless cuts without overlapping.
 */
export function renderAnalysisBands(
  rc: CadRenderContext,
  buildings: BuildingLoop[],
  analysisResults: AnalysisPointResult[],
  showShadowingLines: boolean,
  showSunlightLines: boolean,
  layerSettings: Record<string, any> = {}
) {
  if (!showShadowingLines && !showSunlightLines) return;
  if (!analysisResults || analysisResults.length === 0) return;

  const { ctx, worldToScreen, viewState } = rc;
  const { minThicknessPx, maxThicknessPx, scaleFactor, defaultAlpha, shadowing, sunlight } =
    APP_CONFIG.analysisBands;

  // Band thickness in pixels and offset in world coordinates
  const bandThicknessPx = Math.max(
    minThicknessPx,
    Math.min(maxThicknessPx, viewState.scale * scaleFactor)
  );
  const bandWidthWorld = bandThicknessPx / Math.max(0.001, viewState.scale);

  // Group analysis points by building
  const pointsByBuilding = new Map<string, Map<string, AnalysisPointResult[]>>();
  for (const res of analysisResults) {
    if (!pointsByBuilding.has(res.buildingId)) {
      pointsByBuilding.set(res.buildingId, new Map());
    }
    const segMap = pointsByBuilding.get(res.buildingId)!;
    if (!segMap.has(res.segmentId)) {
      segMap.set(res.segmentId, []);
    }
    segMap.get(res.segmentId)!.push(res);
  }

  ctx.save();

  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;
    const lyr = bldg.layer || 'Domyślna (0)';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;

    const segMap = pointsByBuilding.get(bldg.id);
    if (!segMap) continue;

    const n = bldg.segments.length;
    if (n < 3) continue;

    // Pre-calculate inward (for § 12) and outward (for § 56) miter vertices at each corner V_i
    // Vertex V_i is where segment (i - 1 + n) % n ends and segment i begins.
    const inwardMiters: Point2D[] = [];
    const outwardMiters: Point2D[] = [];

    for (let i = 0; i < n; i++) {
      const prevIdx = (i - 1 + n) % n;
      const segPrev = bldg.segments[prevIdx];
      const segCurr = bldg.segments[i];
      const vi = segCurr.p1;

      // Inward normals (pointing inside the building for § 12)
      const nPrevIn = { x: -segPrev.normal.x, y: -segPrev.normal.y };
      const nCurrIn = { x: -segCurr.normal.x, y: -segCurr.normal.y };

      // Inward miter vertex
      inwardMiters.push(computeMiterVertex(vi, nPrevIn, nCurrIn, bandWidthWorld));

      // Outward normals (pointing outside the building for § 56)
      const nPrevOut = segPrev.normal;
      const nCurrOut = segCurr.normal;

      // Outward miter vertex
      outwardMiters.push(computeMiterVertex(vi, nPrevOut, nCurrOut, bandWidthWorld));
    }

    // Render bands for each segment
    for (let sIdx = 0; sIdx < n; sIdx++) {
      const seg = bldg.segments[sIdx];
      const points = segMap.get(seg.id);
      if (!points || points.length === 0) continue;

      // Sort points along segment by ratio
      points.sort((a, b) => a.shadowing.offsetRatio - b.shadowing.offsetRatio);

      const nextIdx = (sIdx + 1) % n;
      const dx = seg.p2.x - seg.p1.x;
      const dy = seg.p2.y - seg.p1.y;

      // --- § 12 Shadowing Band (INSIDE the building with mitered corners) ---
      if (showShadowingLines) {
        interface ShadowInterval {
          isCompliant: boolean;
          startRatio: number;
          endRatio: number;
        }
        const intervals: ShadowInterval[] = [];
        const numPts = points.length;

        for (let i = 0; i < numPts; i++) {
          const p = points[i];
          const prevRatio =
            i === 0 ? 0.0 : (points[i - 1].shadowing.offsetRatio + p.shadowing.offsetRatio) / 2;
          const nextRatio =
            i === numPts - 1 ? 1.0 : (p.shadowing.offsetRatio + points[i + 1].shadowing.offsetRatio) / 2;

          const lastInt = intervals[intervals.length - 1];
          if (lastInt && lastInt.isCompliant === p.shadowing.isCompliant) {
            lastInt.endRatio = nextRatio;
          } else {
            intervals.push({
              isCompliant: p.shadowing.isCompliant,
              startRatio: prevRatio,
              endRatio: nextRatio,
            });
          }
        }

        const normIn = { x: -seg.normal.x, y: -seg.normal.y };
        const miterStart = inwardMiters[sIdx];
        const miterEnd = inwardMiters[nextIdx];

        for (const inter of intervals) {
          const color = inter.isCompliant
            ? shadowing.compliantColor(defaultAlpha)
            : shadowing.nonCompliantColor(defaultAlpha);

          renderMiteredQuad(
            ctx,
            worldToScreen,
            seg.p1,
            dx,
            dy,
            inter.startRatio,
            inter.endRatio,
            normIn,
            bandWidthWorld,
            miterStart,
            miterEnd,
            color
          );
        }
      }

      // --- § 56 Sunlight Band (OUTSIDE the building with mitered corners) ---
      if (showSunlightLines) {
        interface SunlightInterval {
          color: string;
          startRatio: number;
          endRatio: number;
        }
        const intervals: SunlightInterval[] = [];
        const numPts = points.length;

        for (let i = 0; i < numPts; i++) {
          const p = points[i];
          const color = sunlight.getColor(p.sunlight.totalHours, defaultAlpha);
          const prevRatio =
            i === 0 ? 0.0 : (points[i - 1].shadowing.offsetRatio + p.shadowing.offsetRatio) / 2;
          const nextRatio =
            i === numPts - 1 ? 1.0 : (p.shadowing.offsetRatio + points[i + 1].shadowing.offsetRatio) / 2;

          const lastInt = intervals[intervals.length - 1];
          if (lastInt && lastInt.color === color) {
            lastInt.endRatio = nextRatio;
          } else {
            intervals.push({
              color,
              startRatio: prevRatio,
              endRatio: nextRatio,
            });
          }
        }

        const normOut = seg.normal;
        const miterStart = outwardMiters[sIdx];
        const miterEnd = outwardMiters[nextIdx];

        for (const inter of intervals) {
          renderMiteredQuad(
            ctx,
            worldToScreen,
            seg.p1,
            dx,
            dy,
            inter.startRatio,
            inter.endRatio,
            normOut,
            bandWidthWorld,
            miterStart,
            miterEnd,
            inter.color
          );
        }
      }
    }
  }

  ctx.restore();
}

/**
 * Calculates mitered corner vertex M_i where two adjacent segment offset lines meet.
 */
function computeMiterVertex(
  vertex: Point2D,
  normPrev: Point2D,
  normCurr: Point2D,
  width: number
): Point2D {
  const sumX = normPrev.x + normCurr.x;
  const sumY = normPrev.y + normCurr.y;
  const lenSum = Math.hypot(sumX, sumY);

  if (lenSum < 1e-4) {
    // Collinear or reflex 180°
    return {
      x: vertex.x + normCurr.x * width,
      y: vertex.y + normCurr.y * width,
    };
  }

  const bx = sumX / lenSum;
  const by = sumY / lenSum;
  const dot = normCurr.x * bx + normCurr.y * by;

  // Miter factor with safety clamping for sharp corners (limit <= 2.5)
  const miterFactor = dot > 0.25 ? Math.min(2.5, 1.0 / dot) : 2.5;

  return {
    x: vertex.x + bx * (width * miterFactor),
    y: vertex.y + by * (width * miterFactor),
  };
}

/**
 * Renders a single interval quad along the wall, precisely mitered at segment corners.
 */
function renderMiteredQuad(
  ctx: CanvasRenderingContext2D,
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  p1: Point2D,
  dx: number,
  dy: number,
  startRatio: number,
  endRatio: number,
  offsetNormal: Point2D,
  bandWidth: number,
  miterStart: Point2D,
  miterEnd: Point2D,
  color: string
) {
  // Outer points on wall baseline
  const o1 = { x: p1.x + startRatio * dx, y: p1.y + startRatio * dy };
  const o2 = { x: p1.x + endRatio * dx, y: p1.y + endRatio * dy };

  // Inner/Offset points:
  // If start is at the exact corner (ratio 0), use the miter vertex; otherwise use parallel normal offset.
  const i1 =
    startRatio <= 0.001
      ? miterStart
      : { x: o1.x + offsetNormal.x * bandWidth, y: o1.y + offsetNormal.y * bandWidth };

  // If end is at the exact corner (ratio 1), use the miter vertex; otherwise use parallel normal offset.
  const i2 =
    endRatio >= 0.999
      ? miterEnd
      : { x: o2.x + offsetNormal.x * bandWidth, y: o2.y + offsetNormal.y * bandWidth };

  const so1 = worldToScreen(o1.x, o1.y);
  const so2 = worldToScreen(o2.x, o2.y);
  const si2 = worldToScreen(i2.x, i2.y);
  const si1 = worldToScreen(i1.x, i1.y);

  if (
    !Number.isFinite(so1.sx) ||
    !Number.isFinite(so1.sy) ||
    !Number.isFinite(so2.sx) ||
    !Number.isFinite(so2.sy) ||
    !Number.isFinite(si2.sx) ||
    !Number.isFinite(si2.sy) ||
    !Number.isFinite(si1.sx) ||
    !Number.isFinite(si1.sy)
  ) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(so1.sx, so1.sy);
  ctx.lineTo(so2.sx, so2.sy);
  ctx.lineTo(si2.sx, si2.sy);
  ctx.lineTo(si1.sx, si1.sy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
