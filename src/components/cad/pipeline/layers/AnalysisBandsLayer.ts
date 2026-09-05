import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderAnalysisBands } from '../../renderers/analysisBandsRenderer';

export class AnalysisBandsLayer implements CadRenderLayer {
  readonly id = 'analysis_bands';
  readonly zIndex = 40;

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(
      (context.showShadowingLines || context.showSunlightLines) &&
      context.analysisResults &&
      context.analysisResults.length > 0
    );
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      buildings,
      analysisResults = [],
      showShadowingLines = false,
      showSunlightLines = false,
      layerSettings = {},
    } = context;

    renderAnalysisBands(
      renderContext,
      buildings,
      analysisResults,
      showShadowingLines,
      showSunlightLines,
      layerSettings
    );
  }
}
