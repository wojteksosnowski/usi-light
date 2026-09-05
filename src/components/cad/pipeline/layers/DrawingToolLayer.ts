import { Point2D } from '../../../../types/geometry';
import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderDrawingToolPreview } from '../../renderers/drawingToolRenderer';

export class DrawingToolLayer implements CadRenderLayer {
  readonly id = 'drawing_tool_overlay';
  readonly zIndex = 90;

  shouldRender(_context: CadRenderFrameContext): boolean {
    return true; // Overlay is cleared and rendered every frame
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      buildings,
      selectedBuildingId,
      effectivePivot,
      isPivotHovered = false,
      isDraggingPivot = false,
      isRotating = false,
      rotStartAngleScreen = 0,
      rotAngleDeg = 0,
      hoveredRotateVertexIndex = null,
      activeRotateAngleSnap = null,
      drawingMode,
      drawingVertices = [],
      currentMouseWorld = null,
      hoveredVertexIndex = null,
      hoveredMidpointIndex = null,
      draggedVertexIndex = null,
      dragVertexPreviewPt = null,
      activeDirectionSnap = null,
      selectedVertexIndex = null,
      activeOsnapSnap = null,
      activeBuildingDragSnap = null,
      sweepWidth = 6.0,
      sweepAlignment = 'center',
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

    const activeSelectedBuilding = effectiveBuildings.find((b) => b.id === selectedBuildingId);
    const buildingForPreview = activeSelectedBuilding
      ? ({
          ...activeSelectedBuilding,
          customPivot: effectivePivot,
          isPivotHovered,
          isDraggingPivot,
          isRotating,
          rotStartAngleScreen,
          rotAngleDeg,
          hoveredRotateVertexIndex,
          activeRotateAngleSnap,
        } as any)
      : null;

    renderDrawingToolPreview(
      renderContext,
      drawingMode as any,
      drawingVertices,
      currentMouseWorld,
      buildingForPreview,
      hoveredVertexIndex,
      hoveredMidpointIndex,
      draggedVertexIndex,
      activeDirectionSnap,
      selectedVertexIndex,
      activeOsnapSnap,
      activeBuildingDragSnap,
      sweepWidth,
      sweepAlignment
    );
  }
}
