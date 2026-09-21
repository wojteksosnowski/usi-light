import { Point2D } from '../../../../types/geometry';
import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderBuildings } from '../../renderers/buildingsRenderer';

/**
 * Rysuje podgląd przeciąganego wierzchołka budynku — warstwa HUD (60 FPS), oddzielona od
 * `BuildingsLayer` (tier `scene`), tak by ciągnięcie wierzchołka nie unieważniało bufora sceny
 * (patrz plan "Podział canvasu na warstwy buforowane").
 *
 * Rysuje tylko przeciągany budynek, z podmienioną pozycją wierzchołka, ponad rzeczywistą
 * (nieruszoną) geometrią narysowaną wcześniej przez warstwę sceny.
 */
export class BuildingsDragPreviewLayer implements CadRenderLayer {
  readonly id = 'buildings_drag_preview';
  readonly zIndex = 95;
  readonly tier = 'hud' as const;

  shouldRender(context: CadRenderFrameContext): boolean {
    return Boolean(
      context.draggedVertexIndex !== null &&
        context.draggedVertexIndex !== undefined &&
        context.dragVertexPreviewPt &&
        context.selectedBuildingId
    );
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
      draggedVertexIndex = null,
      dragVertexPreviewPt = null,
    } = context;

    if (draggedVertexIndex === null || draggedVertexIndex === undefined || !dragVertexPreviewPt || !selectedBuildingId) {
      return;
    }

    const draggedBuilding = buildings.find((b) => b.id === selectedBuildingId);
    if (!draggedBuilding) return;

    const isSweep = Array.isArray(draggedBuilding.sweepPath) && draggedBuilding.sweepPath.length >= 2;
    const verts = isSweep ? draggedBuilding.sweepPath! : draggedBuilding.vertices;
    const updatedVerts = verts.map((v: Point2D, idx: number) => (idx === draggedVertexIndex ? dragVertexPreviewPt : v));
    const previewBuilding = isSweep
      ? { ...draggedBuilding, sweepPath: updatedVerts }
      : { ...draggedBuilding, vertices: updatedVerts };

    renderBuildings(
      renderContext,
      [previewBuilding],
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
