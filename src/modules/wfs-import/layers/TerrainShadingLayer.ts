import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderWmsOverlay } from '../renderers/wmsOverlayRenderer';
import { WmsTileManager } from '../renderers/wmsTileManager';

export class TerrainShadingLayer implements CadRenderLayer {
  readonly id = 'wfs_terrain_shading';
  readonly zIndex = -5;

  private tileManager: WmsTileManager | null = null;

  setTileManager(manager: WmsTileManager | null) {
    this.tileManager = manager;
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
      opacity: 0.35,
    });
  }
}
