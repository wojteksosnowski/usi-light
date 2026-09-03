import { CadRenderContext } from '../types';
import { Point2D, HourlyShadowLoop } from '../../../types/geometry';
import { APP_CONFIG } from '../../../config/appConfig';

export function renderShadowRange(
  rc: CadRenderContext,
  envelopeLoops: Point2D[][],
  showShadowRange: boolean,
  showShadowFill: boolean,
  hourlyShadows?: HourlyShadowLoop[]
) {
  if (!showShadowRange) return;
  const { ctx, worldToScreen } = rc;

  ctx.save();

  // 1. Render hourly shadow shapes (only fill with transparency when enabled, no outline stroke)
  if (showShadowFill && hourlyShadows && hourlyShadows.length > 0) {
    const step = hourlyShadows.length > 1
      ? Math.abs(hourlyShadows[1].hourOffset - hourlyShadows[0].hourOffset)
      : 1.0;
    // Zależność przezroczystości od kroku próbkowania — dla gęstszego kroku alpha jest proporcjonalnie mniejsza
    const effectiveAlpha = Math.max(0.005, Math.min(0.2, APP_CONFIG.shadowFill.fillAlpha * Math.min(1.0, step)));
    ctx.fillStyle = `rgba(129, 140, 248, ${effectiveAlpha})`;
    for (const hourly of hourlyShadows) {
      for (const poly of hourly.polygons) {
        if (poly.length < 3) continue;
        ctx.beginPath();
        poly.forEach((v, idx) => {
          const { sx, sy } = worldToScreen(v.x, v.y);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // 2. Render outer envelope (Contour Stroke with Tag)
  if (envelopeLoops && envelopeLoops.length > 0) {
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([8, 5]);

    let globalTopVertex: { x: number; y: number } | null = null;

    for (const loop of envelopeLoops) {
      if (loop.length < 3) continue;
      ctx.beginPath();
      loop.forEach((v, idx) => {
        const { sx, sy } = worldToScreen(v.x, v.y);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);

        if (!globalTopVertex || v.y > globalTopVertex.y) {
          globalTopVertex = v;
        }
      });
      ctx.closePath();
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Tag at northernmost vertex of shadow envelope
    if (globalTopVertex) {
      const { sx: tagSx, sy: tagSy } = worldToScreen(
        (globalTopVertex as any).x,
        (globalTopVertex as any).y
      );

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1;
      const labelText = 'ZAKRES CIENIA OBIEKTÓW BADANYCH';
      ctx.font = 'bold 10px Inter, sans-serif';
      const lw = ctx.measureText(labelText).width;
      ctx.beginPath();
      ctx.roundRect(tagSx - lw / 2 - 8, tagSy - 20, lw + 16, 18, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c7d2fe';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, tagSx, tagSy - 11);
    }
  }

  ctx.restore();
}

