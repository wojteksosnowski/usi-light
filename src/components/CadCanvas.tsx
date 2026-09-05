import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Point2D, AnalysisPointResult } from '../types/geometry';
import { computeCombinedShadowEnvelope } from '@/utils/math2d';
import { computeHourlyShadowsLive } from '@/utils/math2d/shadowEnvelope';
import { CadCanvasProps, CadRenderContext } from './cad/types';
import { useCadViewport } from './cad/hooks/useCadViewport';
import { useCadHotkeys } from './cad/hooks/useCadHotkeys';
import { useCanvasInteraction, isBuildingLocked, getBuildingTopElevation } from './cad/hooks/useCanvasInteraction';
import { CadRenderPipeline } from './cad/pipeline/CadRenderPipeline';
import { GoogleTileManager } from '../utils/googleTileManager';
import { detectCoordinateSystem, CrsDetectionResult } from '../utils/geoTransform';
import { APP_CONFIG } from '../config/appConfig';

export { isBuildingLocked, getBuildingTopElevation };

export const CadCanvas: React.FC<CadCanvasProps> = (props) => {
  const {
    buildings,
    selectedBuildingId,
    selectedBuildingIds = [],
    onSelectBuilding,
    analysisResults,
    selectedPointResult,
    activePointMode = 'shadowing',
    showNormals,
    showShadowingLines,
    showSunlightLines,
    showAnalysisPoints = true,
    showShadowRange = false,
    showShadowFill = false,
    isInteracting = false,
    shadowAnalysis,
    sunlightMethod = 'raycasting',
    latitude = 52.23,
    longitude = 21.01,
    equinoxDate = 'spring',
    fitTrigger,
    onCancelDrawing,
    onFinishDrawing,
    drawingMode = 'none',
    sweepWidth = 5.0,
    sweepAlignment = 'center',
    pinnedPoints = [],
    pinnedPointResults: propPinnedPointResults,
    activePinnedPointId = null,
    facadePointMode = false,
    isEditMode = false,
    dimensions = [],
    isDimensionMode = false,
    dimensionType = 'linear',
    dimensionPendingRef = null,
    layerSettings = {},
    viewRotationMode = false,
    viewRotationDeg = 0,
    onToggleOsnap,
    showSatelliteLayer = false,
    satelliteOpacity = 0.65,
    googleMapsApiKey = '',
    isLinkingMode = false,
    linkingSourceId = null,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Menedżer kafelków satelitarnych Google Maps
  const [tileRenderTick, setTileRenderTick] = useState<number>(0);
  const tileManagerRef = useRef<GoogleTileManager | null>(null);

  useEffect(() => {
    const effectiveKey = googleMapsApiKey || APP_CONFIG.googleMaps.apiKey;
    if (!tileManagerRef.current) {
      tileManagerRef.current = new GoogleTileManager(effectiveKey, () => {
        setTileRenderTick((t) => t + 1);
      });
    } else {
      tileManagerRef.current.setApiKey(effectiveKey);
    }
  }, [googleMapsApiKey]);

  // Detekcja układu współrzędnych sceny CAD
  const crsInfo = useMemo<CrsDetectionResult>(() => {
    const allPts: Point2D[] = [];
    for (const b of buildings) {
      if (Array.isArray(b.vertices)) {
        for (const v of b.vertices) allPts.push(v);
      }
    }
    return detectCoordinateSystem(allPts);
  }, [buildings]);

  // Viewport hook
  const { viewState, setViewState, worldToScreen, screenToWorld } = useCadViewport(
    containerRef,
    buildings,
    viewRotationDeg,
    fitTrigger,
    selectedBuildingId,
    layerSettings
  );

  // Canvas interaction hook
  const interaction = useCanvasInteraction({
    ...props,
    containerRef,
    canvasRef,
    viewState,
    setViewState,
    worldToScreen,
    screenToWorld,
  });

  // Hotkeys hook
  useCadHotkeys({
    drawingMode,
    drawingVertices: interaction.drawingVertices,
    hoveredBuildings: interaction.hoveredBuildings,
    selectedVertexIndex: interaction.selectedVertexIndex,
    onDeleteSelectedVertex: interaction.handleDeleteSelectedVertex,
    onCycleVertexSelection: interaction.handleCycleVertexSelection,
    onStepRotateBuilding: interaction.handleStepRotateBuilding,
    onCancelDrawing,
    onFinishDrawing,
    setDrawingVertices: interaction.setDrawingVertices,
    setCurrentMouseWorld: interaction.setCurrentMouseWorld,
    setHoveredBuildingIndex: interaction.setHoveredBuildingIndex,
    isEditingEdgeLength: Boolean(interaction.editingEdgeLength),
    onAdjustEdgeLengthStep: interaction.handleAdjustEdgeLengthStep,
    onEdgeLengthInputChar: interaction.handleEdgeLengthInputChar,
    onEdgeLengthBackspace: interaction.handleEdgeLengthBackspace,
    onCommitEdgeLength: interaction.handleCommitEdgeLength,
    onCancelEdgeLength: interaction.handleCancelEdgeLength,
    onToggleOsnap,
  });

  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth - 380 : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        setCanvasDimensions((prev) => {
          if (prev.width !== w || prev.height !== h) {
            return { width: w, height: h };
          }
          return prev;
        });
      }
    };

    updateDimensions();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const w = Math.floor(width);
          const h = Math.floor(height);
          setCanvasDimensions((prev) => {
            if (prev.width !== w || prev.height !== h) {
              return { width: w, height: h };
            }
            return prev;
          });
        }
      }
    });

    observer.observe(container);
    window.addEventListener('resize', updateDimensions);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  const visibleBuildings = useMemo(() => {
    return buildings.filter((b) => {
      const lyr = b.layer || 'Domyślna (0)';
      return layerSettings[lyr]?.isVisible !== false;
    });
  }, [buildings, layerSettings]);

  const shadowRangeLoops = useMemo(() => {
    if (!showShadowRange) return [];
    if (shadowAnalysis?.envelopeLoops) {
      return shadowAnalysis.envelopeLoops;
    }
    return computeCombinedShadowEnvelope(visibleBuildings, latitude, equinoxDate, longitude);
  }, [visibleBuildings, showShadowRange, shadowAnalysis, latitude, equinoxDate, longitude]);

  const liveShadowResult = useMemo(() => {
    if (!showShadowRange || !isInteracting) return null;
    return computeHourlyShadowsLive(buildings, latitude, longitude, equinoxDate, 0.5, sunlightMethod);
  }, [showShadowRange, isInteracting, buildings, latitude, longitude, equinoxDate, sunlightMethod]);

  const hourlyShadowsToRender = useMemo(() => {
    if (!showShadowRange) return [];
    if (isInteracting && liveShadowResult) {
      return liveShadowResult.hourlyShadows;
    }
    return shadowAnalysis?.hourlyShadows ?? [];
  }, [showShadowRange, isInteracting, liveShadowResult, shadowAnalysis]);

  const shadowRangeLoopsToRender = useMemo(() => {
    if (!showShadowRange) return [];
    if (isInteracting && liveShadowResult) {
      return liveShadowResult.envelopeLoops;
    }
    return shadowRangeLoops;
  }, [showShadowRange, isInteracting, liveShadowResult, shadowRangeLoops]);

  const pinnedPointResults = useMemo(() => {
    if (propPinnedPointResults && propPinnedPointResults.length > 0) {
      return propPinnedPointResults;
    }
    if (!pinnedPoints || pinnedPoints.length === 0) {
      return selectedPointResult ? [selectedPointResult] : [];
    }
    return pinnedPoints.map((pt, idx) => {
      const bldg = buildings.find((b) => b.id === pt.buildingId);
      if (!bldg) return null;
      const lyr = bldg.layer || 'Domyślna (0)';
      if (layerSettings[lyr]?.isVisible === false) return null;
      const seg = bldg.segments.find((s) => s.id === pt.segmentId);
      if (seg) {
        const px = seg.p1.x + pt.offsetRatio * (seg.p2.x - seg.p1.x);
        const py = seg.p1.y + pt.offsetRatio * (seg.p2.y - seg.p1.y);
        return {
          id: pt.id,
          point: { x: px, y: py },
          normal: seg.normal || { x: 0, y: 1 },
          buildingId: pt.buildingId,
          segmentId: pt.segmentId,
          label: pt.label || `P${idx + 1}`,
          shadowing: { point: { x: px, y: py }, segmentId: pt.segmentId, offsetRatio: pt.offsetRatio, isCompliant: true, maxContinuousFreeSpanDeg: 156, totalFreeSpanDeg: 156, sectors: [], rays: [] },
          sunlight: { point: { x: px, y: py }, segmentId: pt.segmentId, offsetRatio: pt.offsetRatio, totalMinutes: 0, totalHours: 0, isCompliant: true, timeSlots: [], sectors: [] },
        };
      }
      return null;
    }).filter(Boolean) as AnalysisPointResult[];
  }, [propPinnedPointResults, pinnedPoints, buildings, selectedPointResult, layerSettings]);

  // 1. Base Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvasDimensions.width;
    const height = canvasDimensions.height;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const renderContext: CadRenderContext = {
      ctx,
      width,
      height,
      viewState,
      viewRotationDeg,
      worldToScreen,
      screenToWorld,
      latitude,
      longitude,
      equinoxDate,
      sunlightMethod,
      isInteracting: interaction.effectiveIsInteracting,
    };

    CadRenderPipeline.renderMain({
      renderContext,
      buildings,
      selectedBuildingId,
      selectedBuildingIds,
      hoveredBuildingId: interaction.hoveredBuildingId,
      hoveredEdge: interaction.hoveredEdge,
      isEditMode,
      showNormals,
      analysisResults,
      selectedPointResult,
      activePointMode,
      isLinkingMode,
      linkingSourceId,
      layerSettings,
      editingEdgeLength: interaction.editingEdgeLength,
      hoveredEdgeLengthBadge: interaction.hoveredEdgeLengthBadge,
      pinnedPointResults,
      activePinnedPointId,
      liveFacadeSnap: interaction.liveFacadeSnap,
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
      dimHoveredEdge: interaction.dimHoveredEdge,
      dimensionType,
      rotationHover: interaction.rotationHover,
      viewRotationMode,
      showSatelliteLayer,
      satelliteOpacity,
      tileManager: tileManagerRef.current,
      crsInfo,
      draggedVertexIndex: interaction.draggedVertexIndex,
      dragVertexPreviewPt: interaction.dragVertexPreviewPt,
    });
  }, [
    buildings,
    selectedBuildingId,
    selectedBuildingIds,
    interaction.hoveredBuildingId,
    interaction.hoveredEdge,
    selectedPointResult,
    activePointMode,
    showNormals,
    showShadowingLines,
    showSunlightLines,
    showShadowRange,
    latitude,
    longitude,
    equinoxDate,
    sunlightMethod,
    dimensions,
    isDimensionMode,
    dimensionType,
    interaction.dimHoveredEdge,
    viewState,
    canvasDimensions,
    drawingMode,
    interaction.editingEdgeLength,
    interaction.hoveredEdgeLengthBadge,
    pinnedPointResults,
    activePinnedPointId,
    interaction.liveFacadeSnap,
    facadePointMode,
    isLinkingMode,
    linkingSourceId,
    isEditMode,
    viewRotationMode,
    viewRotationDeg,
    interaction.rotationHover,
    analysisResults,
    layerSettings,
    shadowRangeLoopsToRender,
    hourlyShadowsToRender,
    showShadowFill,
    interaction.effectiveIsInteracting,
    worldToScreen,
    screenToWorld,
    visibleBuildings,
    showSatelliteLayer,
    satelliteOpacity,
    showAnalysisPoints,
    tileRenderTick,
    crsInfo,
    interaction.draggedVertexIndex,
    interaction.dragVertexPreviewPt,
  ]);

  // 2. Overlay Render Loop
  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    const width = canvasDimensions.width;
    const height = canvasDimensions.height;

    if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
      overlayCanvas.width = width;
      overlayCanvas.height = height;
    }

    const renderContext: CadRenderContext = {
      ctx,
      width,
      height,
      viewState,
      viewRotationDeg,
      worldToScreen,
      screenToWorld,
      latitude,
      longitude,
      equinoxDate,
      sunlightMethod,
      isInteracting: interaction.effectiveIsInteracting,
    };

    CadRenderPipeline.renderOverlay({
      renderContext,
      buildings,
      selectedBuildingId,
      effectivePivot: interaction.effectivePivot,
      isPivotHovered: interaction.isPivotHovered,
      isDraggingPivot: interaction.isDraggingPivot,
      isRotating: interaction.isRotating,
      rotStartAngleScreen: interaction.rotStartAngleScreen,
      rotAngleDeg: interaction.rotAngleDeg,
      hoveredRotateVertexIndex: interaction.hoveredRotateVertexIndex,
      activeRotateAngleSnap: interaction.activeRotateAngleSnap,
      drawingMode,
      drawingVertices: interaction.drawingVertices,
      currentMouseWorld: interaction.currentMouseWorld,
      hoveredVertexIndex: interaction.hoveredVertexIndex,
      hoveredMidpointIndex: interaction.hoveredMidpointIndex,
      draggedVertexIndex: interaction.draggedVertexIndex,
      dragVertexPreviewPt: interaction.dragVertexPreviewPt,
      activeDirectionSnap: interaction.activeDirectionSnap,
      selectedVertexIndex: interaction.selectedVertexIndex,
      activeOsnapSnap: interaction.activeOsnapSnap,
      activeBuildingDragSnap: interaction.activeBuildingDragSnap,
      sweepWidth,
      sweepAlignment,
    });
  }, [
    canvasDimensions,
    viewState,
    viewRotationDeg,
    worldToScreen,
    screenToWorld,
    latitude,
    longitude,
    equinoxDate,
    sunlightMethod,
    buildings,
    selectedBuildingId,
    interaction.effectivePivot,
    interaction.isPivotHovered,
    interaction.isDraggingPivot,
    interaction.isRotating,
    interaction.rotStartAngleScreen,
    interaction.rotAngleDeg,
    interaction.hoveredRotateVertexIndex,
    interaction.activeRotateAngleSnap,
    drawingMode,
    interaction.drawingVertices,
    interaction.currentMouseWorld,
    interaction.hoveredVertexIndex,
    interaction.hoveredMidpointIndex,
    interaction.draggedVertexIndex,
    interaction.dragVertexPreviewPt,
    interaction.activeDirectionSnap,
    interaction.selectedVertexIndex,
    interaction.activeOsnapSnap,
    interaction.activeBuildingDragSnap,
    sweepWidth,
    sweepAlignment,
    interaction.effectiveIsInteracting,
  ]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        onWheel={interaction.handleWheel}
        onMouseDown={interaction.handleMouseDown}
        onMouseMove={interaction.handleMouseMove}
        onMouseUp={interaction.handleMouseUp}
        onMouseLeave={interaction.handleMouseUp}
        onContextMenu={interaction.handleContextMenu}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: interaction.cursorStyle,
        }}
      />
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
