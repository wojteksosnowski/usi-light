import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderMpzpZones } from '../renderers/mpzpZonesRenderer';
import { renderMpzpLines } from '../renderers/mpzpLinesRenderer';
import { MpzpZoneFeature, MpzpLineFeature } from '../store/useWfsStore';

/**
 * Warstwa wektorowa stref i linii MPZP — geometria + atrybuty z serwisów miejskich.
 * Niezależna od `MpzpOverlayLayer` (raster WMS ogólnopolski) — obie warstwy mogą być włączone jednocześnie.
 */
export class MpzpZonesVectorLayer implements CadRenderLayer {
  readonly id = 'wfs_mpzp_zones_vector';
  readonly zIndex = 5;

  private zones: MpzpZoneFeature[] = [];
  private lines: MpzpLineFeature[] = [];
  private showZones = false;

  setData(zones: MpzpZoneFeature[], lines: MpzpLineFeature[] = []) {
    this.zones = zones;
    this.lines = lines;
  }

  setVisibility(show: boolean) {
    this.showZones = show;
  }

  shouldRender(_context: CadRenderFrameContext): boolean {
    return this.showZones && (this.zones.length > 0 || this.lines.length > 0);
  }

  render(context: CadRenderFrameContext): void {
    if (this.zones.length > 0) {
      renderMpzpZones({
        rc: context.renderContext,
        zones: this.zones,
        showZones: this.showZones,
        projectRadius: context.projectRadius,
      });
    }

    if (this.lines.length > 0) {
      renderMpzpLines({
        rc: context.renderContext,
        lines: this.lines,
        showLines: this.showZones,
        projectRadius: context.projectRadius,
      });
    }
  }
}

