import { CadRenderContext } from '../types';
import { Point2D, HourlyShadowLoop } from '../../../types/geometry';

export function renderShadowRange(
  rc: CadRenderContext,
  envelopeLoops: Point2D[][],
  showShadowRange: boolean,
  hourlyShadows?: HourlyShadowLoop[]
) {
  if (!showShadowRange) return;
  const { ctx, worldToScreen } = rc;

  ctx.save();

  // 1. Render hourly shadow contours (subtle dashed lines for each hour from solar noon)
  if (hourlyShadows && hourlyShadows.length > 0) {
    ctx.lineWidth = 1.0;
    ctx.setLineDash([3, 4]);

    for (const hourly of hourlyShadows) {
      const isNoon = hourly.hourOffset === 0;
      ctx.strokeStyle = isNoon ? 'rgba(251, 191, 36, 0.4)' : 'rgba(129, 140, 248, 0.22)';

      for (const poly of hourly.polygons) {
        if (poly.length < 3) continue;
        ctx.beginPath();
        poly.forEach((v, idx) => {
          const { sx, sy } = worldToScreen(v.x, v.y);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.stroke();
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

