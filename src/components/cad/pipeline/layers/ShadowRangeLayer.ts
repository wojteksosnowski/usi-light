import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderShadowRange } from '../../renderers/shadowRangeRenderer';

export class ShadowRangeLayer implements CadRenderLayer {
  readonly id = 'shadow_range';
  readonly zIndex = 20;

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(
      context.showShadowRange ||
      context.showShadowFill ||
      (context.shadowRangeLoopsToRender && context.shadowRangeLoopsToRender.length > 0)
    );
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      shadowRangeLoopsToRender = [],
      showShadowRange = false,
      showShadowFill = false,
      hourlyShadowsToRender = [],
    } = context;

    renderShadowRange(
      renderContext,
      shadowRangeLoopsToRender,
      showShadowRange,
      showShadowFill,
      hourlyShadowsToRender
    );
  }
}
