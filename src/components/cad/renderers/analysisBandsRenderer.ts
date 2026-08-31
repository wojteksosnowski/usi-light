import { CadRenderContext } from '../types';
import { AnalysisPointResult, BuildingLoop } from '../../../types/geometry';
import { getSunlightColor } from './sunlightRenderer';

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

  // Group analysis points by building+segment for smooth continuous band rendering.
  const pointsBySegment = new Map<string, AnalysisPointResult[]>();
  for (const res of analysisResults) {
    const key = `${res.buildingId}|${res.segmentId}`;
    if (!pointsBySegment.has(key)) {
      pointsBySegment.set(key, []);
    }
    pointsBySegment.get(key)!.push(res);
  }

  // Band thickness in pixels and offset in world space so bands border right against the facade line
  const bandThickness = Math.max(3, Math.min(8, viewState.scale * 0.28));
  const halfBandWorld = bandThickness / 2 / Math.max(0.001, viewState.scale);

  ctx.save();
  pointsBySegment.forEach((points) => {
    if (points.length === 0) return;

    // Sort points along segment by ratio
    points.sort((a, b) => a.shadowing.offsetRatio - b.shadowing.offsetRatio);

    const bldg = buildings.find((b) => b.id === points[0].buildingId);
    const lyr = bldg?.layer || 'Domyślna (0)';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) return;

    const seg = bldg?.segments.find((s) => s.id === points[0].segmentId);
    if (!seg) return;

    const norm = seg.normal;
    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;

    // --- § 12 Shadowing Band (INSIDE the building, clinging directly to the wall) ---
    if (showShadowingLines) {
      interface ShadowInterval {
        isCompliant: boolean;
        startRatio: number;
        endRatio: number;
      }
      const intervals: ShadowInterval[] = [];
      const n = points.length;

      for (let i = 0; i < n; i++) {
        const p = points[i];
        const prevRatio = i === 0 ? 0.0 : (points[i - 1].shadowing.offsetRatio + p.shadowing.offsetRatio) / 2;
        const nextRatio = i === n - 1 ? 1.0 : (p.shadowing.offsetRatio + points[i + 1].shadowing.offsetRatio) / 2;

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

      for (const inter of intervals) {
        const w1 = {
          x: seg.p1.x + inter.startRatio * dx - norm.x * halfBandWorld,
          y: seg.p1.y + inter.startRatio * dy - norm.y * halfBandWorld,
        };
        const w2 = {
          x: seg.p1.x + inter.endRatio * dx - norm.x * halfBandWorld,
          y: seg.p1.y + inter.endRatio * dy - norm.y * halfBandWorld,
        };

        const s1 = worldToScreen(w1.x, w1.y);
        const s2 = worldToScreen(w2.x, w2.y);

        ctx.beginPath();
        ctx.moveTo(s1.sx, s1.sy);
        ctx.lineTo(s2.sx, s2.sy);
        ctx.strokeStyle = inter.isCompliant ? 'rgba(16, 185, 129, 0.85)' : 'rgba(244, 63, 94, 0.85)';
        ctx.lineWidth = bandThickness;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    }

    // --- § 56 Sunlight Band (OUTSIDE the building, clinging directly to the wall) ---
    if (showSunlightLines) {
      interface SunlightInterval {
        color: string;
        startRatio: number;
        endRatio: number;
      }
      const intervals: SunlightInterval[] = [];
      const n = points.length;

      for (let i = 0; i < n; i++) {
        const p = points[i];
        const color = getSunlightColor(p.sunlight.totalHours);
        const prevRatio = i === 0 ? 0.0 : (points[i - 1].shadowing.offsetRatio + p.shadowing.offsetRatio) / 2;
        const nextRatio = i === n - 1 ? 1.0 : (p.shadowing.offsetRatio + points[i + 1].shadowing.offsetRatio) / 2;

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

      for (const inter of intervals) {
        const w1 = {
          x: seg.p1.x + inter.startRatio * dx + norm.x * halfBandWorld,
          y: seg.p1.y + inter.startRatio * dy + norm.y * halfBandWorld,
        };
        const w2 = {
          x: seg.p1.x + inter.endRatio * dx + norm.x * halfBandWorld,
          y: seg.p1.y + inter.endRatio * dy + norm.y * halfBandWorld,
        };

        const s1 = worldToScreen(w1.x, w1.y);
        const s2 = worldToScreen(w2.x, w2.y);

        ctx.beginPath();
        ctx.moveTo(s1.sx, s1.sy);
        ctx.lineTo(s2.sx, s2.sy);
        ctx.strokeStyle = inter.color;
        ctx.lineWidth = bandThickness;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    }
  });
  ctx.restore();
}
