import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderMpzpZones } from '../renderers/mpzpZonesRenderer';
import { MpzpZoneFeature } from '../store/useWfsStore';

/**
 * Warstwa wektorowa stref MPZP (pilot Warszawa) — geometria + atrybuty z usługi REST BGiK
 * "PrzeznaczenieTerenow" (patrz `wfsMpzpWarsawClient.ts`). Niezależna od `MpzpOverlayLayer`
 * (raster WMS ogólnopolski) — obie warstwy mogą być włączone jednocześnie.
 */
export class MpzpZonesVectorLayer implements CadRenderLayer {
  readonly id = 'wfs_mpzp_zones_vector';
  readonly zIndex = 5;

  private zones: MpzpZoneFeature[] = [];
  private showZones = false;

  setData(zones: MpzpZoneFeature[]) {
    this.zones = zones;
  }

  setVisibility(show: boolean) {
    this.showZones = show;
  }

  shouldRender(_context: CadRenderFrameContext): boolean {
    return this.showZones && this.zones.length > 0;
  }

  render(context: CadRenderFrameContext): void {
    renderMpzpZones({
      rc: context.renderContext,
      zones: this.zones,
      showZones: this.showZones,
    });
  }
}
