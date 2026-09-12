import { CadRenderContext } from '../../../components/cad/types';
import { LandCoverFeature } from '../store/useWfsStore';

/**
 * Kolor wg klasy INSPIRE Land Cover (sufiks URI klasyfikacji GUGiK, patrz `wfsLcvClient.ts`).
 * Obserwowane w danych: "grass", "arableLand", "flowingWater", "railwayTracks",
 * "roadAndRailwayTracks" — reszta to rozsądne dopasowanie wg standardowego słownika INSPIRE LCV.
 */
function colorForLandCoverClass(className: string | null): { fill: string; stroke: string } {
  switch (className) {
    case 'flowingWater':
    case 'standingWater':
    case 'water':
      return { fill: 'rgba(56, 189, 248, 0.22)', stroke: 'rgba(56, 189, 248, 0.55)' };
    case 'forest':
    case 'woodland':
    case 'treeCover':
      return { fill: 'rgba(21, 128, 61, 0.22)', stroke: 'rgba(21, 128, 61, 0.55)' };
    case 'grass':
    case 'herbaceousVegetation':
    case 'naturalGrassland':
      return { fill: 'rgba(74, 222, 128, 0.2)', stroke: 'rgba(74, 222, 128, 0.5)' };
    case 'arableLand':
    case 'nonIrrigatedArableLand':
    case 'permanentCrops':
      return { fill: 'rgba(163, 230, 53, 0.2)', stroke: 'rgba(163, 230, 53, 0.5)' };
    case 'railwayTracks':
    case 'roadAndRailwayTracks':
    case 'roads':
    case 'artificiallySealedAreas':
      return { fill: 'rgba(148, 163, 184, 0.22)', stroke: 'rgba(148, 163, 184, 0.55)' };
    case 'buildings':
    case 'builtUpAreas':
      return { fill: 'rgba(100, 116, 139, 0.24)', stroke: 'rgba(100, 116, 139, 0.6)' };
    default:
      return { fill: 'rgba(226, 232, 240, 0.14)', stroke: 'rgba(226, 232, 240, 0.4)' };
  }
}

export interface RenderLandCoverOptions {
  rc: CadRenderContext;
  units: LandCoverFeature[];
  showUnits: boolean;
}

/**
 * Rysuje jednostki pokrycia terenu z uwzględnieniem otworów wewnętrznych: obrys + każdy
 * otwór jako osobny subpath tego samego `Path2D`, wypełniony regułą `evenodd` (jak
 * `buildingsRenderer.ts` `getOrComputeBuildingGeo()`) — w przeciwieństwie do
 * `mpzpZonesRenderer.ts`, który rysuje każdy pierścień niezależnie i zamalowałby otwór.
 */
export function renderLandCover(options: RenderLandCoverOptions) {
  const { rc, units, showUnits } = options;
  if (!showUnits || units.length === 0) return;

  const { ctx } = rc;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1;

  for (const unit of units) {
    if (unit.outer.length < 3) continue;
    const { fill, stroke } = colorForLandCoverClass(unit.landCoverClass);

    const path = new Path2D();
    const start = rc.worldToScreen(unit.outer[0].x, unit.outer[0].y);
    path.moveTo(start.sx, start.sy);
    for (let i = 1; i < unit.outer.length; i++) {
      const p = rc.worldToScreen(unit.outer[i].x, unit.outer[i].y);
      path.lineTo(p.sx, p.sy);
    }
    path.closePath();

    for (const hole of unit.holes || []) {
      if (hole.length < 3) continue;
      const hStart = rc.worldToScreen(hole[0].x, hole[0].y);
      path.moveTo(hStart.sx, hStart.sy);
      for (let i = 1; i < hole.length; i++) {
        const p = rc.worldToScreen(hole[i].x, hole[i].y);
        path.lineTo(p.sx, p.sy);
      }
      path.closePath();
    }

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.fill(path, 'evenodd');
    ctx.stroke(path);
  }

  ctx.restore();
}
