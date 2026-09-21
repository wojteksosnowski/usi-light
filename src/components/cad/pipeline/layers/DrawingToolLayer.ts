import { Point2D, DEFAULT_SWEEP_WIDTH } from '../../../../types/geometry';
import { CadRenderLayer, CadRenderFrameContext } from '../types';
import { renderDrawingToolPreview } from '../../renderers/drawingToolRenderer';

export class DrawingToolLayer implements CadRenderLayer {
  readonly id = 'drawing_tool_overlay';
  readonly zIndex = 90;
  readonly tier = 'hud' as const;

  private groupVerticesCache: { buildings: unknown; targetGroupId: string | undefined; vertices: Point2D[] } | null = null;

  shouldRender(_context: CadRenderFrameContext): boolean {
    return true; // Overlay is cleared and rendered every frame
  }

  render(context: CadRenderFrameContext): void {
    const {
      renderContext,
      buildings,
      selectedBuildingId,
      effectivePivot,
      isRotateHandleHovered = false,
      isRotating = false,
      rotAngleDeg = 0,
      activeRotateAngleSnap = null,
      alignPendingRef = null,
      alignHoveredEdge = null,
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
      activeDebugHpfCandidates = null,
      activeBuildingDragSnap = null,
      sweepWidth = DEFAULT_SWEEP_WIDTH,
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
    const targetGroupId = activeSelectedBuilding?.groupId;

    let allGroupVertices: Point2D[];
    if (
      this.groupVerticesCache &&
      this.groupVerticesCache.buildings === effectiveBuildings &&
      this.groupVerticesCache.targetGroupId === targetGroupId
    ) {
      allGroupVertices = this.groupVerticesCache.vertices;
    } else {
      const groupBldgs = targetGroupId
        ? effectiveBuildings.filter((b) => b.groupId === targetGroupId)
        : activeSelectedBuilding
          ? [activeSelectedBuilding]
          : [];
      allGroupVertices = groupBldgs.flatMap((b) => b.vertices || []);
      this.groupVerticesCache = { buildings: effectiveBuildings, targetGroupId, vertices: allGroupVertices };
    }

    const buildingForPreview = activeSelectedBuilding
      ? ({
          ...activeSelectedBuilding,
          customPivot: effectivePivot,
          allGroupVertices: allGroupVertices.length > 0 ? allGroupVertices : undefined,
          isRotateHandleHovered,
          isRotating,
          rotAngleDeg,
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
      sweepAlignment,
      effectiveBuildings,
      alignPendingRef,
      alignHoveredEdge,
      activeDebugHpfCandidates
    );
  }
}
