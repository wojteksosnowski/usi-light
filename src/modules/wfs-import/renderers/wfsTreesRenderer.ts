import { CadRenderContext } from '../../../components/cad/types';
import { WfsTreeFeature } from '../store/useWfsStore';
import { applyMatrixToContext, resolveViewportMatrix } from '../../../utils/math2d';

const MIN_RADIUS_PX = 1.0;
const MAX_RADIUS_PX = 500;

/**
 * Dobiera kolor korony i styl w zależności od rodzaju botanicznego (genus),
 * typu liścia oraz nazwy drzewa.
 */
function getTreeColor(tree: WfsTreeFeature): { fill: string; stroke: string; isNeedle: boolean } {
  const isNeedle = tree.leafType === 'needleleaved';
  const genus = (tree.genus || '').toLowerCase();
  const text = `${tree.nameLatin || ''} ${genus} ${tree.namePolish || ''}`.toLowerCase();

  // 1. Iglaste (Coniferous)
  if (isNeedle || genus === 'pinus' || text.includes('sosna')) {
    return { fill: '#14532d', stroke: '#052e16', isNeedle: true }; // Ciemna sosnowa zieleń
  }
  if (genus === 'picea' || text.includes('świerk') || text.includes('swierk')) {
    return { fill: '#166534', stroke: '#14532d', isNeedle: true }; // Głęboki świerk
  }
  if (genus === 'abies' || text.includes('jodła') || text.includes('jodla')) {
    return { fill: '#15803d', stroke: '#166534', isNeedle: true }; // Jodła
  }
  if (genus === 'larix' || text.includes('modrzew')) {
    return { fill: '#84cc16', stroke: '#4d7c0f', isNeedle: true }; // Jasny świeży modrzew
  }
  if (genus === 'thuja' || genus === 'juniperus' || genus === 'taxus' || text.includes('żywotnik') || text.includes('jałowiec') || text.includes('cis')) {
    return { fill: '#0f766e', stroke: '#115e59', isNeedle: true }; // Ciemny turkusowo-iglasty
  }

  // 2. Liściaste (Deciduous)
  if (genus === 'quercus' || text.includes('dąb') || text.includes('dab')) {
    return { fill: '#65a30d', stroke: '#4d7c0f', isNeedle: false }; // Majestatyczny dąb (oliwka)
  }
  if (genus === 'tilia' || text.includes('lipa')) {
    return { fill: '#4ade80', stroke: '#16a34a', isNeedle: false }; // Jasna miododajna lipa
  }
  if (genus === 'acer' || text.includes('klon') || text.includes('jawor')) {
    return { fill: '#a3e635', stroke: '#65a30d', isNeedle: false }; // Ciepły klon
  }
  if (genus === 'betula' || text.includes('brzoza')) {
    return { fill: '#86efac', stroke: '#22c55e', isNeedle: false }; // Seledynowa brzoza
  }
  if (genus === 'aesculus' || text.includes('kasztan')) {
    return { fill: '#22c55e', stroke: '#15803d', isNeedle: false }; // Gęsty kasztanowiec
  }
  if (genus === 'platanus' || text.includes('platan')) {
    return { fill: '#34d399', stroke: '#059669', isNeedle: false }; // Szmaragdowy platan
  }
  if (genus === 'salix' || text.includes('wierzba')) {
    return { fill: '#a7f3d0', stroke: '#34d399', isNeedle: false }; // Srebrzysto-limonkowa wierzba
  }
  if (genus === 'populus' || text.includes('topola') || text.includes('osika')) {
    return { fill: '#84cc16', stroke: '#4d7c0f', isNeedle: false }; // Strzelista topola
  }
  if (genus === 'fagus' || genus === 'carpinus' || text.includes('buk') || text.includes('grab')) {
    return { fill: '#4ade80', stroke: '#15803d', isNeedle: false }; // Buk / Grab
  }
  if (genus === 'fraxinus' || genus === 'ulmus' || text.includes('jesion') || text.includes('wiąz')) {
    return { fill: '#84cc16', stroke: '#3f6212', isNeedle: false }; // Jesion / Wiąz
  }
  if (genus === 'robinia' || text.includes('akacja')) {
    return { fill: '#a3e635', stroke: '#4d7c0f', isNeedle: false }; // Robinia
  }
  if (genus === 'prunus' || genus === 'malus' || genus === 'pyrus' || text.includes('owocowe') || text.includes('wiśnia')) {
    return { fill: '#f472b6', stroke: '#db2777', isNeedle: false }; // Kwitnące / owocowe (róż)
  }

  // Domyślna liściasta
  return { fill: '#22c55e', stroke: '#16a34a', isNeedle: false };
}

/**
 * Oblicza promień korony w pikselach na ekranie w zależności od skali CAD
 */
function getTreeScreenRadius(tree: WfsTreeFeature, scale: number): number {
  let worldRadiusM = 3.5;
  if (tree.crownDiameter && tree.crownDiameter > 0) {
    worldRadiusM = tree.crownDiameter / 2;
  } else if (tree.height && tree.height > 0) {
    const isNeedle = tree.leafType === 'needleleaved';
    worldRadiusM = Math.max(1.5, Math.min(10, tree.height * (isNeedle ? 0.35 : 0.5)));
  }

  const rawPx = worldRadiusM * scale;
  return Math.max(MIN_RADIUS_PX, Math.min(MAX_RADIUS_PX, rawPx));
}

export interface RenderWfsTreesOptions {
  rc: CadRenderContext;
  trees: WfsTreeFeature[];
  projectRadius?: number;
}

export function renderWfsTrees(options: RenderWfsTreesOptions) {
  const { rc, trees, projectRadius } = options;
  const { ctx, width, height, viewState, viewRotationDeg } = rc;

  if (trees.length === 0) return;

  ctx.save();

  // 1. Ograniczenie zasięgiem projektu (Maska kołowa w układzie CAD)
  if (projectRadius != null) {
    const vm = resolveViewportMatrix(rc, viewState, viewRotationDeg);
    applyMatrixToContext(vm, ctx);
    ctx.beginPath();
    ctx.arc(0, 0, projectRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset do screen coords dla rysowania koron
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  for (const tree of trees) {
    const { sx, sy } = rc.worldToScreen(tree.position.x, tree.position.y);

    // Odrzuć elementy całkowicie poza widocznym ekranem
    if (sx < -80 || sx > width + 80 || sy < -80 || sy > height + 80) continue;

    const screenRadius = getTreeScreenRadius(tree, viewState.scale);
    const { fill, stroke, isNeedle } = getTreeColor(tree);

    // A. Korona drzewa
    ctx.beginPath();
    ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.58;
    ctx.fill();

    // B. Obrys korony
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1, 1.2 * Math.min(1.5, viewState.scale));
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // C. Oznaczenie gatunków iglastych (promieniste igły w centrum przy powiększeniu)
    if (isNeedle && screenRadius >= 8 && viewState.scale >= 0.5) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang) * (screenRadius * 0.75), sy + Math.sin(ang) * (screenRadius * 0.75));
        ctx.stroke();
      }
    }

    // D. Wyróżnienie pomników przyrody (złoty podwójny pierścień przerywany)
    if (tree.isMonument) {
      ctx.beginPath();
      ctx.arc(sx, sy, screenRadius + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
      ctx.globalAlpha = 0.95;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // E. Pień w centrum przy zbliżeniu CAD (wymiarowany z pnia / wysokości)
    if (viewState.scale >= 0.6 && screenRadius >= 5) {
      let trunkM = 0.35;
      if (tree.trunkCircumference) {
        const c = parseFloat(tree.trunkCircumference) || 0;
        if (c > 0) trunkM = (c / 100) / Math.PI;
      }
      const trunkPx = Math.max(1.8, Math.min(5, (trunkM / 2) * viewState.scale));
      
      ctx.beginPath();
      ctx.arc(sx, sy, trunkPx, 0, Math.PI * 2);
      ctx.fillStyle = '#78350f';
      ctx.globalAlpha = 0.95;
      ctx.fill();
    }
  }

  ctx.restore();
}
