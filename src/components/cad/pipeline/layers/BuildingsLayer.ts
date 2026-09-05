import { Point2D } from '../../../../types/geometry';
import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderBuildings } from '../../renderers/buildingsRenderer';

export class BuildingsLayer implements CadRenderLayer {
  readonly id = 'buildings';
  readonly zIndex = 60;

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(context.buildings && context.buildings.length > 0);
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      buildings,
      selectedBuildingId = null,
      selectedBuildingIds = [],
      hoveredBuildingId = null,
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
      draggedVertexIndex = null,
      dragVertexPreviewPt = null,
    } = context;

    const effectiveBuildings =
      draggedVertexIndex !== null && dragVertexPreviewPt && selectedBuildingId
        ? buildings.map((bldg) => {
            if (bldg.id !== selectedBuildingId) return bldg;
            const isSweep = Array.isArray(bldg.sweepPath) && bldg.sweepPath.length >= 2;
            const verts = isSweep ? bldg.sweepPath! : bldg.vertices;
            const updatedVerts = verts.map((v: Point2D, idx: number) =>
              idx === draggedVertexIndex ? dragVertexPreviewPt : v
            );
            return isSweep
              ? { ...bldg, sweepPath: updatedVerts }
              : { ...bldg, vertices: updatedVerts };
          })
        : buildings;

    renderBuildings(
      renderContext,
      effectiveBuildings,
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
      drawingMode === 'rotate',
      selectedBuildingIds,
      showAnalysisPoints
    );
  }
}
