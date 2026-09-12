import { CadRenderContext } from '../../../components/cad/types';
import { OverturePolygonFeature } from '../store/useWfsStore';
import { fillAndStrokeRing } from './polygonRingRenderer';

const GREEN_FILL = 'rgba(74, 222, 128, 0.18)';
const GREEN_STROKE = 'rgba(74, 222, 128, 0.4)';

function drawPolygons(rc: CadRenderContext, polygons: OverturePolygonFeature[], fill: string, stroke: string) {
  if (polygons.length === 0) return;

  const { ctx } = rc;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;

  for (const poly of polygons) {
    for (const ring of poly.rings) {
      fillAndStrokeRing(rc, ring);
    }
  }
}

export interface RenderOvertureContextOptions {
  rc: CadRenderContext;
  greenAreas: OverturePolygonFeature[];
  showGreenAreas: boolean;
}

export function renderOvertureContext(options: RenderOvertureContextOptions) {
  const { rc, greenAreas, showGreenAreas } = options;

  rc.ctx.save();
  rc.ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (showGreenAreas) drawPolygons(rc, greenAreas, GREEN_FILL, GREEN_STROKE);

  rc.ctx.restore();
}
