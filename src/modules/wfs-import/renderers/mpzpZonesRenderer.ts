import { CadRenderContext } from '../../../components/cad/types';
import { MpzpZoneFeature } from '../store/useWfsStore';
import { fillAndStrokeRing } from './polygonRingRenderer';

/** Kolor wg pierwszej litery funkcji terenu (konwencja polskich planów: M-mieszkaniowe, U-usługi,
 * Z-zieleń, P-produkcja/przemysł, K-komunikacja, R-rolne). Reszta — kolor neutralny. */
function colorForFunSymb(funSymb: string | null): { fill: string; stroke: string } {
  const letter = (funSymb || '').replace(/^[\d.]+/, '').charAt(0).toUpperCase();
  switch (letter) {
    case 'M': return { fill: 'rgba(251, 191, 36, 0.18)', stroke: 'rgba(251, 191, 36, 0.55)' };
    case 'U': return { fill: 'rgba(96, 165, 250, 0.18)', stroke: 'rgba(96, 165, 250, 0.55)' };
    case 'Z': return { fill: 'rgba(74, 222, 128, 0.18)', stroke: 'rgba(74, 222, 128, 0.55)' };
    case 'P': return { fill: 'rgba(168, 85, 247, 0.18)', stroke: 'rgba(168, 85, 247, 0.55)' };
    case 'K': return { fill: 'rgba(148, 163, 184, 0.18)', stroke: 'rgba(148, 163, 184, 0.55)' };
    case 'R': return { fill: 'rgba(163, 230, 53, 0.18)', stroke: 'rgba(163, 230, 53, 0.55)' };
    default: return { fill: 'rgba(226, 232, 240, 0.14)', stroke: 'rgba(226, 232, 240, 0.45)' };
  }
}

export interface RenderMpzpZonesOptions {
  rc: CadRenderContext;
  zones: MpzpZoneFeature[];
  showZones: boolean;
}

export function renderMpzpZones(options: RenderMpzpZonesOptions) {
  const { rc, zones, showZones } = options;
  if (!showZones || zones.length === 0) return;

  const { ctx } = rc;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1;

  for (const zone of zones) {
    const { fill, stroke } = colorForFunSymb(zone.funSymb);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;

    for (const ring of zone.rings) {
      fillAndStrokeRing(rc, ring);
    }
  }

  ctx.restore();
}
