import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderSunlightVisualization } from '../../renderers/sunlightRenderer';

export class SunlightLayer implements CadRenderLayer {
  readonly id = 'sunlight_visualization';
  readonly zIndex = 70;

  shouldRender(context: CadRenderFrameContext): boolean {
    if (!context.showAnalysisPoints || context.activePointMode !== 'sunlight') {
      return false;
    }
    const points = (context.pinnedPointResults && context.pinnedPointResults.length > 0)
      ? context.pinnedPointResults
      : (context.selectedPointResult ? [context.selectedPointResult] : []);
    return points.length > 0;
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      showAnalysisPoints = false,
      pinnedPointResults = [],
      selectedPointResult = null,
      activePinnedPointId = null,
      visibleBuildings = context.buildings,
    } = context;

    const pointsToVisualize = (showAnalysisPoints && pinnedPointResults && pinnedPointResults.length > 0)
      ? pinnedPointResults
      : (showAnalysisPoints && selectedPointResult ? [selectedPointResult] : []);

    if (pointsToVisualize.length === 0) return;

    const sortedVisualizations = [...pointsToVisualize].sort((a, b) => {
      const aActive = a.id === activePinnedPointId || a.id === selectedPointResult?.id;
      const bActive = b.id === activePinnedPointId || b.id === selectedPointResult?.id;
      if (aActive && !bActive) return 1;
      if (!aActive && bActive) return -1;
      return 0;
    });

    for (const ptRes of sortedVisualizations) {
      renderSunlightVisualization(renderContext, ptRes, visibleBuildings);
    }
  }
}
