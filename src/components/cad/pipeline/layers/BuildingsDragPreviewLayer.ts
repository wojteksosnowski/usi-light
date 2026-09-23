import { AnalysisPointResult, Point2D } from '../../../../types/geometry';
import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderBuildings } from '../../renderers/buildingsRenderer';
import { rebuildBuildingSegments } from '../../../../utils/segmentStatistics';

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

    // Podczas przeciągania wierzchołka `buildings` w store pozostaje nieruszony (commit dopiero
    // na mouseup, patrz komentarz klasy) — więc `pinnedPointResults` z kontekstu wciąż niesie
    // point/normal policzone względem starych, nieprzesuniętych segmentów. Przeliczamy tu na żywo
    // pozycję znaczników P1/P2/P3 należących do przeciąganego budynku względem segmentów preview,
    // zachowując zamrożoną analizę shadowing/sunlight (patrz AGENTS.md §1a).
    const previewSegments = isSweep ? null : rebuildBuildingSegments(draggedBuilding, updatedVerts).segments;
    const livePinnedPointResults: AnalysisPointResult[] = !previewSegments
      ? pinnedPointResults
      : pinnedPointResults.map((ptRes) => {
          if (ptRes.buildingId !== selectedBuildingId) return ptRes;
          const oldSeg = draggedBuilding.segments.find((s) => s.id === ptRes.segmentId);
          if (!oldSeg) return ptRes;
          const dx = oldSeg.p2.x - oldSeg.p1.x;
          const dy = oldSeg.p2.y - oldSeg.p1.y;
          const lenSq = dx * dx + dy * dy;
          const r =
            lenSq > 1e-9
              ? ((ptRes.point.x - oldSeg.p1.x) * dx + (ptRes.point.y - oldSeg.p1.y) * dy) / lenSq
              : 0;
          const newSeg = previewSegments.find((s) => s.id === ptRes.segmentId);
          if (!newSeg) return ptRes;
          return {
            ...ptRes,
            point: {
              x: newSeg.p1.x + r * (newSeg.p2.x - newSeg.p1.x),
              y: newSeg.p1.y + r * (newSeg.p2.y - newSeg.p1.y),
            },
            normal: newSeg.normal,
          };
        });

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
      livePinnedPointResults,
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
