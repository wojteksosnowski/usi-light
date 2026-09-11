import { CadRenderContext } from '../../../components/cad/types';
import { WfsTreeFeature } from '../store/useWfsStore';

const MIN_RADIUS_PX = 3;
const MAX_RADIUS_PX = 18;
const MIN_TRUNK_CM = 10;
const MAX_TRUNK_CM = 400;

function getTreeColor(nameLatin: string): string {
  const lower = nameLatin.toLowerCase();
  if (lower.includes('tilia')) return '#4ade80';
  if (lower.includes('aesculus')) return '#f472b6';
  if (lower.includes('quercus')) return '#a3e635';
  if (lower.includes('acer')) return '#fbbf24';
  if (lower.includes('betula')) return '#86efac';
  if (lower.includes('pinus') || lower.includes('picea') || lower.includes('thuja')) return '#22c55e';
  if (lower.includes('fraxinus')) return '#a3e635';
  if (lower.includes('platanus')) return '#34d399';
  return '#6ee7b7';
}

function getTrunkRadius(trunkCm: string): number {
  const first = parseFloat(trunkCm) || MIN_TRUNK_CM;
  const t = Math.max(0, Math.min(1, (first - MIN_TRUNK_CM) / (MAX_TRUNK_CM - MIN_TRUNK_CM)));
  return MIN_RADIUS_PX + t * (MAX_RADIUS_PX - MIN_RADIUS_PX);
}

export interface RenderWfsTreesOptions {
  rc: CadRenderContext;
  trees: WfsTreeFeature[];
}

export function renderWfsTrees(options: RenderWfsTreesOptions) {
  const { rc, trees } = options;
  const { ctx, width, height, viewState } = rc;

  if (trees.length === 0) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (const tree of trees) {
    const { sx, sy } = rc.worldToScreen(tree.position.x, tree.position.y);

    if (sx < -50 || sx > width + 50 || sy < -50 || sy > height + 50) continue;

    const radius = getTrunkRadius(tree.trunkCircumference) * Math.min(1.5, viewState.scale);
    const clampedRadius = Math.max(2, Math.min(MAX_RADIUS_PX, radius));
    const color = getTreeColor(tree.nameLatin);

    ctx.beginPath();
    ctx.arc(sx, sy, clampedRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  ctx.restore();
}
