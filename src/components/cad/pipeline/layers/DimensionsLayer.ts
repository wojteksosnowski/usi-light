import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderDimensions } from '../../renderers/dimensionsRenderer';

export class DimensionsLayer implements CadRenderLayer {
  readonly id = 'dimensions';
  readonly zIndex = 80;

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(
      (context.dimensions && context.dimensions.length > 0) ||
      context.isDimensionMode
    );
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      visibleBuildings = context.buildings,
      dimensions = [],
      isDimensionMode = false,
      dimensionPendingRef = null,
      dimHoveredEdge = null,
      dimensionType = 'linear',
      selectedBuildingId = null,
    } = context;

    renderDimensions(
      renderContext,
      visibleBuildings,
      dimensions,
      isDimensionMode,
      dimensionPendingRef,
      dimHoveredEdge,
      dimensionType,
      selectedBuildingId
    );
  }
}
