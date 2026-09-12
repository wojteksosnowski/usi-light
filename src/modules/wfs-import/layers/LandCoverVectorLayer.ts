import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderLandCover } from '../renderers/landCoverRenderer';
import { LandCoverFeature } from '../store/useWfsStore';

/**
 * Warstwa wektorowa pokrycia terenu (ogólnopolska) — geometria + klasyfikacja z usługi WFS
 * GUGiK "wfsLCV" (patrz `wfsLcvClient.ts`). Niezależna od warstw MPZP.
 */
export class LandCoverVectorLayer implements CadRenderLayer {
  readonly id = 'wfs_land_cover_vector';
  readonly zIndex = 4;

  private units: LandCoverFeature[] = [];
  private showUnits = false;

  setData(units: LandCoverFeature[]) {
    this.units = units;
  }

  setVisibility(show: boolean) {
    this.showUnits = show;
  }

  shouldRender(_context: CadRenderFrameContext): boolean {
    return this.showUnits && this.units.length > 0;
  }

  render(context: CadRenderFrameContext): void {
    renderLandCover({
      rc: context.renderContext,
      units: this.units,
      showUnits: this.showUnits,
    });
  }
}
