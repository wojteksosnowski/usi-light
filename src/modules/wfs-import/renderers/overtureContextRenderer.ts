import { CadRenderContext } from '../../../components/cad/types';
import { OverturePolygonFeature, OvertureLandUseCategory } from '../store/useWfsStore';
import { fillAndStrokeRing } from './polygonRingRenderer';

export function colorForOvertureCategory(
  category?: OvertureLandUseCategory,
  className?: string | null
): { fill: string; stroke: string } {
  switch (category) {
    case 'green':
      return { fill: 'rgba(74, 222, 128, 0.18)', stroke: 'rgba(74, 222, 128, 0.45)' };
    case 'water':
      return { fill: 'rgba(56, 189, 248, 0.22)', stroke: 'rgba(56, 189, 248, 0.55)' };
    case 'residential':
      return { fill: 'rgba(251, 146, 60, 0.18)', stroke: 'rgba(251, 146, 60, 0.45)' };
    case 'commercial':
      return { fill: 'rgba(244, 63, 94, 0.18)', stroke: 'rgba(244, 63, 94, 0.45)' };
    case 'industrial':
      return { fill: 'rgba(168, 85, 247, 0.18)', stroke: 'rgba(168, 85, 247, 0.45)' };
    case 'institutional':
      return { fill: 'rgba(250, 204, 21, 0.18)', stroke: 'rgba(250, 204, 21, 0.45)' };
    case 'agricultural':
      return { fill: 'rgba(163, 230, 53, 0.18)', stroke: 'rgba(163, 230, 53, 0.45)' };
    case 'infrastructure':
    case 'other':
    default:
      return { fill: 'rgba(148, 163, 184, 0.16)', stroke: 'rgba(148, 163, 184, 0.4)' };
  }
}

export interface RenderOvertureContextOptions {
  rc: CadRenderContext;
  greenAreas: OverturePolygonFeature[];
  showGreenAreas: boolean;
  projectRadius?: number;
}

import { applyMatrixToContext, resolveViewportMatrix } from '../../../utils/math2d';

export function renderOvertureContext(options: RenderOvertureContextOptions) {
  const { rc, greenAreas, showGreenAreas, projectRadius } = options;
  if (!showGreenAreas || greenAreas.length === 0) return;

  const { ctx, viewState, viewRotationDeg } = rc;
  ctx.save();
  const vm = resolveViewportMatrix(rc, viewState, viewRotationDeg);
  applyMatrixToContext(vm, ctx);
  ctx.lineWidth = 1 / viewState.scale;

  if (projectRadius != null) {
    ctx.beginPath();
    ctx.arc(0, 0, projectRadius, 0, Math.PI * 2);
    ctx.clip();
  }

  for (const poly of greenAreas) {
    const { fill, stroke } = colorForOvertureCategory(poly.category, poly.className);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    for (const ring of poly.rings) {
      fillAndStrokeRing(rc, ring);
    }
  }

  ctx.restore();
}
