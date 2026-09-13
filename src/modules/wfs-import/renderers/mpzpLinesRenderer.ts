import { CadRenderContext } from '../../../components/cad/types';
import { MpzpLineFeature } from '../store/useWfsStore';

export interface RenderMpzpLinesOptions {
  rc: CadRenderContext;
  lines: MpzpLineFeature[];
  showLines: boolean;
  projectRadius?: number;
}

function drawZabudowyTriangles(
  ctx: CanvasRenderingContext2D,
  screenPoints: { sx: number; sy: number }[],
  triSize: number,
) {
  for (let i = 0; i < screenPoints.length - 1; i++) {
    const p1 = screenPoints[i];
    const p2 = screenPoints[i + 1];
    const dx = p2.sx - p1.sx;
    const dy = p2.sy - p1.sy;
    const len = Math.hypot(dx, dy);
    if (len < 20) continue;

    const mx = (p1.sx + p2.sx) / 2;
    const my = (p1.sy + p2.sy) / 2;
    const nx = -dy / len;
    const ny = dx / len;

    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + nx * triSize + (dx / len) * (triSize * 0.6), my + ny * triSize + (dy / len) * (triSize * 0.6));
    ctx.lineTo(mx + nx * triSize - (dx / len) * (triSize * 0.6), my + ny * triSize - (dy / len) * (triSize * 0.6));
    ctx.closePath();
    ctx.fill();
  }
}

export function renderMpzpLines(options: RenderMpzpLinesOptions) {
  const { rc, lines, showLines, projectRadius } = options;
  if (!showLines || lines.length === 0) return;

  const { ctx, worldToScreen, viewState } = rc;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (projectRadius != null) {
    const originSc = worldToScreen(0, 0);
    const radiusPx = projectRadius * viewState.scale;
    ctx.beginPath();
    ctx.arc(originSc.sx, originSc.sy, radiusPx, 0, Math.PI * 2);
    ctx.clip();
  }

  for (const line of lines) {
    if (line.points.length < 2) continue;

    const screenPoints = line.points.map((p) => worldToScreen(p.x, p.y));

    ctx.beginPath();
    ctx.moveTo(screenPoints[0].sx, screenPoints[0].sy);
    for (let i = 1; i < screenPoints.length; i++) {
      ctx.lineTo(screenPoints[i].sx, screenPoints[i].sy);
    }

    if (line.lineType === 'nieprzekraczalna_linia_zabudowy') {
      // Nieprzekraczalna: linia przerywana czerwono-bordowa
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = Math.max(1.5, 2 * viewState.scale);
      ctx.setLineDash([8 * viewState.scale, 5 * viewState.scale]);
      ctx.stroke();

      // Rysowanie trójkątów symboliki planistycznej wzdłuż linii
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      drawZabudowyTriangles(ctx, screenPoints, Math.max(4, 5 * viewState.scale));
    } else if (line.lineType === 'obowiazujaca_linia_zabudowy') {
      // Obowiązująca: linia ciągła czerwona z pełnymi trójkątami
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = Math.max(2, 2.5 * viewState.scale);
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.fillStyle = '#dc2626';
      drawZabudowyTriangles(ctx, screenPoints, Math.max(4, 6 * viewState.scale));
    } else if (line.lineType === 'linia_rozgraniczajaca') {
      // Linia rozgraniczająca: ciemna linia kropka-kreska
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = Math.max(1.5, 2 * viewState.scale);
      ctx.setLineDash([12 * viewState.scale, 4 * viewState.scale, 3 * viewState.scale, 4 * viewState.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Inna linia planistyczna
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = Math.max(1, 1.2 * viewState.scale);
      ctx.setLineDash([4 * viewState.scale, 4 * viewState.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}
