import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderBuildings } from '../../renderers/buildingsRenderer';

/**
 * Renderuje rzeczywistą (persystentną) geometrię budynków — warstwa "scene", buforowana.
 * Podgląd przeciąganego wierzchołka jest rysowany osobno przez `BuildingsDragPreviewLayer`
 * (warstwa HUD), aby przeciąganie wierzchołka nie unieważniało bufora sceny.
 */
export class BuildingsLayer implements CadRenderLayer {
  readonly id = 'buildings';
  readonly zIndex = 60;
  readonly tier = 'scene' as const;

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(context.buildings && context.buildings.length > 0);
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      buildings,
      selectedBuildingId = null,
      selectedBuildingIds = [],
      openGroupId = null,
      hoveredBuildingId = null,
      hoveredLabelBuildingId = null,
      hoveredEdge = null,
      isEditMode = false,
      showNormals = false,
      analysisResults = [],
      selectedPointResult = null,
      activePointMode = 'shadowing',
      isLinkingMode = false,
      linkingSourceId = null,
      layerSettings = {},
      editingEdgeLength = null,
      hoveredEdgeLengthBadge = null,
      pinnedPointResults = [],
      activePinnedPointId = null,
      liveFacadeSnap = null,
      facadePointMode = false,
      drawingMode = 'none',
      showAnalysisPoints = false,
    } = context;

    renderBuildings(
      renderContext,
      buildings,
      selectedBuildingId,
      hoveredBuildingId,
      hoveredEdge,
      isEditMode,
      showNormals,
      analysisResults,
      selectedPointResult,
      activePointMode,
      isLinkingMode,
      linkingSourceId,
      layerSettings,
      editingEdgeLength,
      hoveredEdgeLengthBadge,
      pinnedPointResults,
      activePinnedPointId,
      liveFacadeSnap,
      facadePointMode,
      drawingMode === 'vertexEdit',
      drawingMode === 'align',
      selectedBuildingIds,
      showAnalysisPoints,
      hoveredLabelBuildingId,
      openGroupId
    );
  }
}
