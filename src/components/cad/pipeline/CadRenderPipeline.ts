import { Point2D, BuildingLoop, AnalysisPointResult, DimensionItem, DimensionReference, DimensionType, CadLayerSettings } from '../../../types/geometry';
import { CadRenderContext } from '../types';
import { renderCadGrid } from '../renderers/gridRenderer';
import { renderAnalysisBands } from '../renderers/analysisBandsRenderer';
import { renderBuildings, EditingEdgeLengthState } from '../renderers/buildingsRenderer';
import { renderShadowRange } from '../renderers/shadowRangeRenderer';
import { renderSunlightVisualization } from '../renderers/sunlightRenderer';
import { renderShadowingVisualization } from '../renderers/shadowingRenderer';
import { renderDimensions } from '../renderers/dimensionsRenderer';
import { renderDrawingToolPreview } from '../renderers/drawingToolRenderer';
import { renderSatelliteMap } from '../renderers/satelliteMapRenderer';
import { renderPlaygroundSunlightVisualizations } from '../renderers/playgroundRenderer';
import { GoogleTileManager } from '../../../utils/googleTileManager';
import { CrsDetectionResult } from '../../../utils/geoTransform';
import { OsnapSnapResult, BuildingDragSnapResult, EdgeDragSnapResult } from '../../../engine/snapping';
import { DirectionSnapResult } from '../../../utils/directionSnapping';
import { SweepAlignment } from '@/utils/math2d/sweep';

export interface MainPipelineRenderParams {
  renderContext: CadRenderContext;
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  selectedBuildingIds?: string[];
  hoveredBuildingId: string | null;
  hoveredEdge: { buildingId: string; edgeIndex: number } | null;
  isEditMode: boolean;
  showNormals: boolean;
  analysisResults: AnalysisPointResult[];
  selectedPointResult: AnalysisPointResult | null;
  activePointMode: 'shadowing' | 'sunlight';
  isLinkingMode: boolean;
  linkingSourceId: string | null;
  layerSettings: Record<string, CadLayerSettings>;
  editingEdgeLength: EditingEdgeLengthState | null;
  hoveredEdgeLengthBadge: { buildingId: string; edgeIndex: number } | null;
  pinnedPointResults: AnalysisPointResult[];
  activePinnedPointId: string | null;
  liveFacadeSnap: {
    point: Point2D;
    buildingId: string;
    segmentId: string;
    ratio: number;
  } | null;
  facadePointMode: boolean;
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'rotate' | 'union';
  showAnalysisPoints: boolean;
  showShadowRange: boolean;
  showShadowFill: boolean;
  showShadowingLines: boolean;
  showSunlightLines: boolean;
  shadowRangeLoopsToRender: Point2D[][];
  hourlyShadowsToRender: any[];
  visibleBuildings: BuildingLoop[];
  dimensions: DimensionItem[];
  isDimensionMode: boolean;
  dimensionPendingRef: DimensionReference | null;
  dimHoveredEdge: { buildingId: string; segmentId: string } | null;
  dimensionType: DimensionType;
  rotationHover: any;
  viewRotationMode: boolean;
  showSatelliteLayer: boolean;
  satelliteOpacity: number;
  tileManager: GoogleTileManager | null;
  crsInfo: CrsDetectionResult;
  draggedVertexIndex: number | null;
  dragVertexPreviewPt: Point2D | null;
}

export interface OverlayPipelineRenderParams {
  renderContext: CadRenderContext;
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  effectivePivot: Point2D | null;
  isPivotHovered: boolean;
  isDraggingPivot: boolean;
  isRotating: boolean;
  rotStartAngleScreen: number;
  rotAngleDeg: number;
  hoveredRotateVertexIndex: number | null;
  activeRotateAngleSnap: { angleDeg: number; isCardinal?: boolean; label?: string } | null;
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'rotate' | 'union';
  drawingVertices: Point2D[];
  currentMouseWorld: Point2D | null;
  hoveredVertexIndex: number | null;
  hoveredMidpointIndex: number | null;
  draggedVertexIndex: number | null;
  dragVertexPreviewPt: Point2D | null;
  activeDirectionSnap: DirectionSnapResult | null;
  selectedVertexIndex: number | null;
  activeOsnapSnap: OsnapSnapResult | null;
  activeBuildingDragSnap: BuildingDragSnapResult | EdgeDragSnapResult | null;
  sweepWidth: number;
  sweepAlignment: SweepAlignment;
}

export class CadRenderPipeline {
  /**
   * Wykonuje pełny potok renderowania warstw sceny CAD (warstwy 1-6) na głównym canvasie.
   */
  static renderMain(params: MainPipelineRenderParams): void {
    const {
      renderContext,
      buildings,
      selectedBuildingId,
      selectedBuildingIds = [],
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
      drawingMode,
      showAnalysisPoints,
      showShadowRange,
      showShadowFill,
      showShadowingLines,
      showSunlightLines,
      shadowRangeLoopsToRender,
      hourlyShadowsToRender,
      visibleBuildings,
      dimensions,
      isDimensionMode,
      dimensionPendingRef,
      dimHoveredEdge,
      dimensionType,
      rotationHover,
      viewRotationMode,
      showSatelliteLayer,
      satelliteOpacity,
      tileManager,
      crsInfo,
      draggedVertexIndex,
      dragVertexPreviewPt,
    } = params;

    const { ctx, width, height, latitude, longitude, equinoxDate, sunlightMethod } = renderContext;

    // 0. Podkład satelitarny Google Maps (ABSOLUTNIE NA SAMYM SPODZIE)
    if (showSatelliteLayer && tileManager) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      renderSatelliteMap({
        rc: renderContext,
        tileManager,
        crsInfo,
        projectCenterLatLon: { lat: latitude, lon: longitude },
        opacity: satelliteOpacity,
      });
    }

    // 1. Grid & Background
    renderCadGrid(renderContext, rotationHover, viewRotationMode, buildings, showSatelliteLayer);

    // 2. Shadow Range § 12 (drawn OVER satellite and grid, but UNDER buildings and analysis bands)
    renderShadowRange(renderContext, shadowRangeLoopsToRender, showShadowRange, showShadowFill, hourlyShadowsToRender);

    // 3. Analytical Color Ribbons (§ 12 & § 56)
    renderAnalysisBands(
      renderContext,
      buildings,
      analysisResults,
      showShadowingLines,
      showSunlightLines,
      layerSettings
    );

    // 4. Buildings Base & Outlines
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

    // 5. Playground Sunlight Analysis Visualization (§ 33.3) - podłączone pod warstwę Punkty
    if (showAnalysisPoints) {
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

    // 6. Point Analysis Visualization (Sunlight § 56 or Shadowing § 12) for all pinned points
    const pointsToVisualize = (showAnalysisPoints && pinnedPointResults && pinnedPointResults.length > 0)
      ? pinnedPointResults
      : (showAnalysisPoints && selectedPointResult ? [selectedPointResult] : []);

    if (pointsToVisualize.length > 0) {
      const sortedVisualizations = [...pointsToVisualize].sort((a, b) => {
        const aActive = a.id === activePinnedPointId || a.id === selectedPointResult?.id;
        const bActive = b.id === activePinnedPointId || b.id === selectedPointResult?.id;
        if (aActive && !bActive) return 1;
        if (!aActive && bActive) return -1;
        return 0;
      });

      for (const ptRes of sortedVisualizations) {
        if (activePointMode === 'sunlight') {
          renderSunlightVisualization(renderContext, ptRes, visibleBuildings);
        } else {
          renderShadowingVisualization(renderContext, ptRes, visibleBuildings);
        }
      }
    }

    // 7. Dimensions & Annotations
    renderDimensions(
      renderContext,
      visibleBuildings,
      dimensions,
      isDimensionMode,
      dimensionPendingRef,
      dimHoveredEdge,
      dimensionType,
      selectedBuildingId
    );
  }

  /**
   * Wykonuje potok renderowania nakładki interaktywnej (warstwa 7: kursor, OSNAP, OTRACK, Rubberband, narzędzia rysowania).
   */
  static renderOverlay(params: OverlayPipelineRenderParams): void {
    const {
      renderContext,
      buildings,
      selectedBuildingId,
      effectivePivot,
      isPivotHovered,
      isDraggingPivot,
      isRotating,
      rotStartAngleScreen,
      rotAngleDeg,
      hoveredRotateVertexIndex,
      activeRotateAngleSnap,
      drawingMode,
      drawingVertices,
      currentMouseWorld,
      hoveredVertexIndex,
      hoveredMidpointIndex,
      draggedVertexIndex,
      dragVertexPreviewPt,
      activeDirectionSnap,
      selectedVertexIndex,
      activeOsnapSnap,
      activeBuildingDragSnap,
      sweepWidth,
      sweepAlignment,
    } = params;

    const { ctx, width, height } = renderContext;
    ctx.clearRect(0, 0, width, height);

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
