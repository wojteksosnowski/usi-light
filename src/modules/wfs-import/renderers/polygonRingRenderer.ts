import { CadRenderContext } from '../../../components/cad/types';
import { Point2D } from '../../../types/geometry';

/**
 * Rysuje i wypełnia/obrysowuje jeden pierścień poligonu (world → screen), zgodnie z bieżącym
 * `ctx.fillStyle`/`ctx.strokeStyle` — wspólne dla wszystkich warstw kontekstowych renderujących
 * poligony (Overture, strefy MPZP, ...).
 */
export function fillAndStrokeRing(rc: CadRenderContext, ring: Point2D[]) {
  if (ring.length < 3) return;

  const { ctx } = rc;
  ctx.beginPath();
  const start = rc.worldToScreen(ring[0].x, ring[0].y);
  ctx.moveTo(start.sx, start.sy);
  for (let i = 1; i < ring.length; i++) {
    const p = rc.worldToScreen(ring[i].x, ring[i].y);
    ctx.lineTo(p.sx, p.sy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
