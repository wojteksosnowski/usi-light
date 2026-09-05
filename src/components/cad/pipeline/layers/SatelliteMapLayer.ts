import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderSatelliteMap } from '../../renderers/satelliteMapRenderer';

export class SatelliteMapLayer implements CadRenderLayer {
  readonly id = 'satellite_map';
  readonly zIndex = 0;

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(context.showSatelliteLayer && context.tileManager);
  }

  render(context: CadRenderFrameContext): void {
    const { renderContext, tileManager, crsInfo, satelliteOpacity = 1 } = context;
    if (!tileManager || !crsInfo) return;

    const { ctx, width, height, latitude, longitude } = renderContext;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    renderSatelliteMap({
      rc: renderContext,
      tileManager,
      crsInfo,
      projectCenterLatLon: { lat: latitude, lon: longitude },
      opacity: satelliteOpacity,
    });
  }
}
