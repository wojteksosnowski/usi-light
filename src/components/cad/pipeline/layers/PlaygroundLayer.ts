import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderPlaygroundSunlightVisualizations } from '../../renderers/playgroundRenderer';

export class PlaygroundLayer implements CadRenderLayer {
  readonly id = 'playground_analysis';
  readonly zIndex = 50;

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(context.showAnalysisPoints && context.buildings && context.buildings.length > 0);
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      buildings,
      layerSettings,
    } = context;

    const { latitude, longitude, equinoxDate, sunlightMethod } = renderContext;

    renderPlaygroundSunlightVisualizations(
      renderContext,
      buildings,
      {
        latitude,
        longitude,
        isCityCentreDefault: false,
        samplingInterval: 0.5,
        equinoxDate,
      },
      sunlightMethod,
      layerSettings
    );
  }
}
