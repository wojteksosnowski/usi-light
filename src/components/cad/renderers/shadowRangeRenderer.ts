import { CadRenderContext } from '../types';
import { Point2D } from '../../../types/geometry';

export function renderShadowRange(
  rc: CadRenderContext,
  loops: Point2D[][],
  showShadowRange: boolean
) {
  if (!showShadowRange) return;
  if (!loops || loops.length === 0) return;
  const { ctx, worldToScreen } = rc;

  ctx.save();

  // ONLY Contour (Stroke), ZERO fill to prevent overlapping reinforcement
  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 2.0;
  ctx.setLineDash([8, 5]);

  let globalTopVertex: { x: number; y: number } | null = null;

  for (const loop of loops) {
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

  ctx.restore();
}
