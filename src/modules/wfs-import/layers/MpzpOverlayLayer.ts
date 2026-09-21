import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderWmsOverlay } from '../renderers/wmsOverlayRenderer';
import { WmsTileManager } from '../renderers/wmsTileManager';

export class MpzpOverlayLayer implements CadRenderLayer {
  readonly id = 'wfs_mpzp_overlay';
  readonly zIndex = 4;
  readonly tier = 'background' as const;

  private tileManager: WmsTileManager | null = null;
  private opacity = 0.5;
  private invertColors = false;

  setTileManager(manager: WmsTileManager | null) {
    this.tileManager = manager;
    this.tileManager?.setInvertColors(this.invertColors);
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
  }

  setInvertColors(invert: boolean) {
    this.invertColors = invert;
    this.tileManager?.setInvertColors(invert);
  }

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(this.tileManager && context.crsInfo);
  }

  render(context: CadRenderFrameContext): void {
    if (!this.tileManager || !context.crsInfo) return;

    const { renderContext } = context;

    renderWmsOverlay({
      rc: renderContext,
      tileManager: this.tileManager,
      crsInfo: context.crsInfo,
      projectCenterLatLon: {
        lat: renderContext.latitude,
        lon: renderContext.longitude,
      },
      opacity: this.opacity,
      projectRadius: context.projectRadius,
    });
  }
}
