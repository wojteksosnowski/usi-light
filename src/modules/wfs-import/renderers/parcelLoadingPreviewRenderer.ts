import { CadRenderContext } from '../../../components/cad/types';
import { BuildingLoop } from '../../../types/geometry';

export interface RenderParcelLoadingPreviewOptions {
  rc: CadRenderContext;
  loops: BuildingLoop[];
}

export function renderParcelLoadingPreview(options: RenderParcelLoadingPreviewOptions) {
  const { rc, loops } = options;
  const { ctx } = rc;

  if (loops.length === 0) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (const loop of loops) {
    if (loop.vertices.length < 3) continue;

    ctx.beginPath();
    const pStart = rc.worldToScreen(loop.vertices[0].x, loop.vertices[0].y);
    ctx.moveTo(pStart.sx, pStart.sy);
    for (let i = 1; i < loop.vertices.length; i++) {
      const pNext = rc.worldToScreen(loop.vertices[i].x, loop.vertices[i].y);
      ctx.lineTo(pNext.sx, pNext.sy);
    }
    ctx.closePath();

    ctx.fillStyle = 'rgba(147, 197, 253, 0.12)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(147, 197, 253, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  ctx.restore();
}
