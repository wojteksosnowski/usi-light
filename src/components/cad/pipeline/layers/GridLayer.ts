import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderCadGrid } from '../../renderers/gridRenderer';

export class GridLayer implements CadRenderLayer {
  readonly id = 'grid';
  readonly zIndex = 10;

  shouldRender(_context: CadRenderFrameContext): boolean {
    return true;
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      rotationHover = null,
      viewRotationMode = false,
      buildings = [],
      showSatelliteLayer = false,
    } = context;
    renderCadGrid(renderContext, rotationHover, viewRotationMode, buildings, showSatelliteLayer);
  }
}
