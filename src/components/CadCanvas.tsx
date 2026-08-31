import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Point2D, PinnedFacadePoint, AnalysisPointResult } from '../types/geometry';
import { isPointInPolygon, computeCombinedShadowEnvelope, adjustEdgeLength } from '../utils/math2d';
import { CadCanvasProps, CadRenderContext } from './cad/types';
import { useCadViewport } from './cad/hooks/useCadViewport';
import { useCadHotkeys } from './cad/hooks/useCadHotkeys';
import { renderCadGrid } from './cad/renderers/gridRenderer';
import { renderAnalysisBands } from './cad/renderers/analysisBandsRenderer';
import { renderBuildings, EditingEdgeLengthState } from './cad/renderers/buildingsRenderer';
import { renderShadowRange } from './cad/renderers/shadowRangeRenderer';
import { renderSunlightVisualization } from './cad/renderers/sunlightRenderer';
import { renderShadowingVisualization } from './cad/renderers/shadowingRenderer';
import { renderDimensions } from './cad/renderers/dimensionsRenderer';
import { renderDrawingToolPreview } from './cad/renderers/drawingToolRenderer';

export const CadCanvas: React.FC<CadCanvasProps> = ({
  buildings,
  selectedBuildingId,
  onSelectBuilding,
  onBuildingMove,
  analysisResults,
  selectedPointResult,
  activePointMode = 'shadowing',
  onSelectPointResult,
  showNormals,
  showShadowingLines,
  showSunlightLines,
  showShadowRange = false,
  shadowAnalysis,
  sunlightMethod = 'raycasting',
  latitude = 52.23,
  longitude = 21.01,
  equinoxDate = 'spring',

  fitTrigger,
  onInteractionChange,
  isLinkingMode = false,
  linkingSourceId = null,
  drawingMode = 'none',
  onFinishDrawing,
  onCancelDrawing,
  onDrawingVerticesCountChange,
  onUpdateBuildingVertices,
  onBuildingRotate,
  pinnedPoints = [],
  activePinnedPointId = null,
  onSelectPinnedPoint,
  onAddPinnedPoint,
  onDeletePinnedPoint,
  onUpdatePinnedPoint,
  facadePointMode = false,
  onFacadePointMove,
  isEditMode = false,
  onBuildingEdgeMove,
  dimensions = [],
  isDimensionMode = false,
  dimensionType = 'linear',
  dimensionPendingRef = null,
  onDimensionClickEdge,
  onDeleteDimension,
  layerSettings = {},
  viewRotationMode = false,
  viewRotationDeg = 0,
  onViewRotationChange,
  onEndViewRotationMode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Drawing state
  const [drawingVertices, setDrawingVertices] = useState<Point2D[]>([]);
  const [currentMouseWorld, setCurrentMouseWorld] = useState<Point2D | null>(null);

  // Vertex edit state
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState<number | null>(null);
  const [hoveredMidpointIndex, setHoveredMidpointIndex] = useState<number | null>(null);
  const [draggedVertexIndex, setDraggedVertexIndex] = useState<number | null>(null);

  // Object rotation tool state (with movable pivot)
  const [customPivot, setCustomPivot] = useState<Point2D | null>(null);
  const [isDraggingPivot, setIsDraggingPivot] = useState<boolean>(false);
  const [isPivotHovered, setIsPivotHovered] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [lastMouseAngleWorld, setLastMouseAngleWorld] = useState<number | null>(null);
  const [rotStartAngleScreen, setRotStartAngleScreen] = useState<number>(0);
  const [rotAngleDeg, setRotAngleDeg] = useState<number>(0);

  // Edge length editing state
  const [editingEdgeLength, setEditingEdgeLength] = useState<EditingEdgeLengthState | null>(null);
  const [hoveredEdgeLengthBadge, setHoveredEdgeLengthBadge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);

  // Edge editing state (parallel offset)
  const [hoveredEdge, setHoveredEdge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);
  const [draggingFacadePoint, setDraggingFacadePoint] = useState<{ buildingId: string; segmentId: string } | null>(null);
  const [draggingPinnedPointId, setDraggingPinnedPointId] = useState<string | null>(null);
  const [liveFacadeSnap, setLiveFacadeSnap] = useState<{
    point: Point2D;
    buildingId: string;
    segmentId: string;
    ratio: number;
  } | null>(null);

  const [hoveredBuildings, setHoveredBuildings] = useState<string[]>([]);
  const [hoveredBuildingIndex, setHoveredBuildingIndex] = useState(0);
  const [rotationHover, setRotationHover] = useState<{
    buildingId: string;
    segmentId: string;
    angleDeg: number;
    previewDeg: number;
    ratio: number;
    point: Point2D;
  } | null>(null);

  // Dimension tool edge hover state
  const [dimHoveredEdge, setDimHoveredEdge] = useState<{ buildingId: string; segmentId: string } | null>(null);

  // Viewport hook
  const { viewState, setViewState, worldToScreen, screenToWorld } = useCadViewport(
    containerRef,
    buildings,
    viewRotationDeg,
    fitTrigger,
    selectedBuildingId,
    layerSettings
  );

  // Calculate effective rotation pivot (custom or group centroid)
  const effectivePivot = useMemo<Point2D | null>(() => {
    if (!selectedBuildingId) return null;
    if (customPivot) return customPivot;
    const bldg = buildings.find((b) => b.id === selectedBuildingId);
    if (!bldg || bldg.vertices.length === 0) return null;

    const targetGroupId = bldg.groupId;
    const groupBldgs = targetGroupId ? buildings.filter((b) => b.groupId === targetGroupId) : [bldg];
    let cx = 0;
    let cy = 0;
    let totalCount = 0;
    for (const b of groupBldgs) {
      for (const v of b.vertices) {
        cx += v.x;
        cy += v.y;
        totalCount++;
      }
    }
    return totalCount > 0 ? { x: cx / totalCount, y: cy / totalCount } : null;
  }, [selectedBuildingId, customPivot, buildings]);

  const handleDeleteSelectedVertex = useCallback(() => {
    if (selectedVertexIndex === null || !selectedBuildingId) return;
    const selBldg = buildings.find((b) => b.id === selectedBuildingId);
    if (selBldg && selBldg.vertices.length > 3) {
      const filtered = selBldg.vertices.filter((_, idx) => idx !== selectedVertexIndex);
      onUpdateBuildingVertices?.(selBldg.id, filtered);
      setSelectedVertexIndex(null);
    }
  }, [selectedVertexIndex, selectedBuildingId, buildings, onUpdateBuildingVertices]);

  // Edge length editing callbacks
  const handleAdjustEdgeLengthStep = useCallback((delta: number) => {
    if (!editingEdgeLength) return;
    const selBldg = buildings.find((b) => b.id === editingEdgeLength.buildingId);
    if (!selBldg || !selBldg.vertices) return;
    const nextLen = Math.max(0.2, Number((editingEdgeLength.targetLength + delta).toFixed(2)));
    const preview = adjustEdgeLength(selBldg.vertices, editingEdgeLength.edgeIndex, nextLen);
    setEditingEdgeLength({
      ...editingEdgeLength,
      targetLength: nextLen,
      inputStr: nextLen.toFixed(2),
      isFresh: false,
      previewVertices: preview,
    });
  }, [editingEdgeLength, buildings]);

  const handleEdgeLengthInputChar = useCallback((char: string) => {
    if (!editingEdgeLength) return;
    const selBldg = buildings.find((b) => b.id === editingEdgeLength.buildingId);
    if (!selBldg || !selBldg.vertices) return;
    const isFirstType = editingEdgeLength.isFresh || editingEdgeLength.inputStr === editingEdgeLength.currentLength.toFixed(2);
    let nextStr = isFirstType ? '' : editingEdgeLength.inputStr;
    if (char === '.' && nextStr.includes('.')) return;
    nextStr += char;
    const parsed = parseFloat(nextStr);
    const validLen = !isNaN(parsed) && parsed > 0.01 ? parsed : editingEdgeLength.targetLength;
    const preview = adjustEdgeLength(selBldg.vertices, editingEdgeLength.edgeIndex, validLen);
    setEditingEdgeLength({
      ...editingEdgeLength,
      inputStr: nextStr,
      targetLength: validLen,
      isFresh: false,
      previewVertices: preview,
    });
  }, [editingEdgeLength, buildings]);

  const handleEdgeLengthBackspace = useCallback(() => {
    if (!editingEdgeLength) return;
    const selBldg = buildings.find((b) => b.id === editingEdgeLength.buildingId);
    if (!selBldg || !selBldg.vertices) return;
    const nextStr = editingEdgeLength.inputStr.slice(0, -1);
    const parsed = parseFloat(nextStr);
    const validLen = !isNaN(parsed) && parsed > 0.01 ? parsed : editingEdgeLength.currentLength;
    const preview = adjustEdgeLength(selBldg.vertices, editingEdgeLength.edgeIndex, validLen);
    setEditingEdgeLength({
      ...editingEdgeLength,
      inputStr: nextStr,
      targetLength: validLen,
      isFresh: false,
      previewVertices: preview,
    });
  }, [editingEdgeLength, buildings]);

  const handleCommitEdgeLength = useCallback(() => {
    if (editingEdgeLength && editingEdgeLength.previewVertices) {
      onUpdateBuildingVertices?.(editingEdgeLength.buildingId, editingEdgeLength.previewVertices);
      setEditingEdgeLength(null);
    }
  }, [editingEdgeLength, onUpdateBuildingVertices]);

  const handleCancelEdgeLength = useCallback(() => {
    setEditingEdgeLength(null);
  }, []);

  // Hotkeys hook
  useCadHotkeys({
    drawingMode,
    drawingVertices,
    hoveredBuildings,
    selectedVertexIndex,
    onDeleteSelectedVertex: handleDeleteSelectedVertex,
    onCancelDrawing,
    onFinishDrawing,
    setDrawingVertices,
    setCurrentMouseWorld,
    setHoveredBuildingIndex,
    isEditingEdgeLength: Boolean(editingEdgeLength),
    onAdjustEdgeLengthStep: handleAdjustEdgeLengthStep,
    onEdgeLengthInputChar: handleEdgeLengthInputChar,
    onEdgeLengthBackspace: handleEdgeLengthBackspace,
    onCommitEdgeLength: handleCommitEdgeLength,
    onCancelEdgeLength: handleCancelEdgeLength,
  });

  useEffect(() => {
    onDrawingVerticesCountChange?.(drawingVertices.length);
  }, [drawingVertices.length, onDrawingVerticesCountChange]);

  useEffect(() => {
    if (drawingMode === 'none') {
      setDrawingVertices([]);
      setCurrentMouseWorld(null);
    }
    if (drawingMode !== 'rotate') {
      setCustomPivot(null);
      setIsRotating(false);
      setIsDraggingPivot(false);
    }
    if (drawingMode !== 'vertexEdit') {
      setSelectedVertexIndex(null);
    }
  }, [drawingMode]);

  useEffect(() => {
    setCustomPivot(null);
  }, [selectedBuildingId]);

  useEffect(() => {
    if (!viewRotationMode) setRotationHover(null);
  }, [viewRotationMode]);

  useEffect(() => {
    setHoveredBuildingIndex(0);
  }, [hoveredBuildings]);

  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingBuilding, setIsDraggingBuilding] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const getHoverCandidates = useCallback(
    (world: Point2D) => {
      const hits: string[] = [];
      for (let i = buildings.length - 1; i >= 0; i--) {
        const bldg = buildings[i];
        const lyr = bldg.layer || 'Domyślna (0)';
        const lyrSetting = layerSettings[lyr] || {};
        if (lyrSetting.isVisible === false || lyrSetting.isGhosted === true) continue;
        if (bldg.vertices.length >= 3 && isPointInPolygon(world, bldg.vertices)) {
          hits.push(bldg.id);
        }
      }
      return hits;
    },
    [buildings, layerSettings]
  );

  const hoveredBuildingId =
    hoveredBuildings.length > 0
      ? hoveredBuildings[Math.min(hoveredBuildingIndex, hoveredBuildings.length - 1)]
      : null;

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

  const pinnedPointResults = useMemo(() => {
    if (!pinnedPoints || pinnedPoints.length === 0) {
      return selectedPointResult ? [selectedPointResult] : [];
    }
    return pinnedPoints.map((pt, idx) => {
      const found = analysisResults.find(
        (r) => r.buildingId === pt.buildingId && r.segmentId === pt.segmentId && Math.abs((r.shadowing?.offsetRatio ?? 0) - pt.offsetRatio) < 0.05
      );
      if (found) {
        return { ...found, id: pt.id, label: pt.label || `P${idx + 1}` };
      }
      const bldg = buildings.find((b) => b.id === pt.buildingId);
      const seg = bldg?.segments.find((s) => s.id === pt.segmentId);
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
  }, [pinnedPoints, analysisResults, buildings, selectedPointResult]);

  // Main Render Loop
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
    };

    // 1. Grid & Background
    renderCadGrid(renderContext, rotationHover, viewRotationMode, buildings);

    // 2. Analytical Color Ribbons (§ 12 & § 56)
    renderAnalysisBands(
      renderContext,
      buildings,
      analysisResults,
      showShadowingLines,
      showSunlightLines,
      layerSettings
    );

    // 3. Buildings Base & Outlines
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
      facadePointMode
    );

    // 3. Shadow Range § 12 (only for visible tested buildings)
    renderShadowRange(renderContext, shadowRangeLoops, showShadowRange, shadowAnalysis?.hourlyShadows);


    // 4. Point Analysis Visualization (Sunlight § 56 or Shadowing § 12)
    if (selectedPointResult) {
      if (activePointMode === 'sunlight') {
        renderSunlightVisualization(renderContext, selectedPointResult, visibleBuildings);
      } else {
        renderShadowingVisualization(renderContext, selectedPointResult, visibleBuildings);
      }
    }

    // 5. Dimensions & Annotations
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

    // 6. Drawing Tool Live Previews, Vertex Edit Handles & Object Rotation
    const activeSelectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
    const buildingForPreview = activeSelectedBuilding
      ? ({
          ...activeSelectedBuilding,
          customPivot: effectivePivot,
          isPivotHovered,
          isDraggingPivot,
          isRotating,
          rotStartAngleScreen,
          rotAngleDeg,
        } as any)
      : null;

    renderDrawingToolPreview(
      renderContext,
      drawingMode,
      drawingVertices,
      currentMouseWorld,
      buildingForPreview,
      hoveredVertexIndex,
      hoveredMidpointIndex,
      draggedVertexIndex
    );
  }, [
    buildings,
    selectedBuildingId,
    hoveredBuildingId,
    hoveredEdge,
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
    dimensionPendingRef,
    dimHoveredEdge,
    viewState,
    canvasDimensions,
    drawingMode,
    drawingVertices,
    currentMouseWorld,
    hoveredVertexIndex,
    hoveredMidpointIndex,
    draggedVertexIndex,
    effectivePivot,
    isPivotHovered,
    isDraggingPivot,
    isRotating,
    rotStartAngleScreen,
    rotAngleDeg,
    isLinkingMode,
    linkingSourceId,
    isEditMode,
    viewRotationMode,
    viewRotationDeg,
    rotationHover,
    analysisResults,
    worldToScreen,
    screenToWorld,
  ]);

  // Mouse Interactions
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.001, Math.min(100, viewState.scale * zoomFactor));

    setViewState((prev) => ({
      scale: newScale,
      panX: mouseX - (mouseX - prev.panX) * (newScale / prev.scale),
      panY: mouseY - (mouseY - prev.panY) * (newScale / prev.scale),
    }));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setDragStart({ x: sx, y: sy });
      return;
    }

    if (e.button === 0) {
      if (viewRotationMode) {
        if (rotationHover) {
          onViewRotationChange?.(rotationHover.previewDeg);
          onEndViewRotationMode?.();
        }
        return;
      }

      // Check click on Edge Length Badges of Selected Building
      if (selectedBuildingId) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg && selBldg.segments) {
          for (let eIdx = 0; eIdx < selBldg.segments.length; eIdx++) {
            const seg = selBldg.segments[eIdx];
            const midX = (seg.p1.x + seg.p2.x) / 2;
            const midY = (seg.p1.y + seg.p2.y) / 2;
            const sm = worldToScreen(midX, midY);
            const len = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
            if (Math.abs(sx - sm.sx) <= 25 && Math.abs(sy - sm.sy) <= 12) {
              (document.activeElement as HTMLElement)?.blur();
              setEditingEdgeLength({
                buildingId: selBldg.id,
                edgeIndex: eIdx,
                currentLength: len,
                targetLength: len,
                inputStr: len.toFixed(2),
                isFresh: true,
                previewVertices: selBldg.vertices,
              });
              return;
            }
          }
        }
      }

      // If active edge editing is in progress, block building dragging / deselection
      if (editingEdgeLength) {
        return;
      }

      // Check click on Pinned Facade Points
      if (pinnedPointResults && pinnedPointResults.length > 0) {
        for (const ptRes of pinnedPointResults) {
          const sm = worldToScreen(ptRes.point.x, ptRes.point.y);
          if (Math.hypot(sx - sm.sx, sy - sm.sy) <= 15) {
            onSelectPinnedPoint?.(ptRes.id);
            onSelectPointResult(ptRes);
            if (facadePointMode) {
              setDraggingPinnedPointId(ptRes.id);
              onInteractionChange?.(true);
            }
            return;
          }
        }
      }

      if (isDimensionMode) {
        if (dimHoveredEdge) {
          onDimensionClickEdge?.(dimHoveredEdge.buildingId, dimHoveredEdge.segmentId);
        }
        return;
      }

      if (drawingMode === 'vertexEdit' && selectedBuildingId) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg && selBldg.vertices.length >= 3) {
          // Check if clicked on delete badge [x] of any vertex
          if (selBldg.vertices.length > 3) {
            for (let i = 0; i < selBldg.vertices.length; i++) {
              const s = worldToScreen(selBldg.vertices[i].x, selBldg.vertices[i].y);
              if (Math.hypot(sx - (s.sx + 13), sy - (s.sy - 13)) <= 9) {
                const filtered = selBldg.vertices.filter((_, idx) => idx !== i);
                onUpdateBuildingVertices?.(selBldg.id, filtered);
                setSelectedVertexIndex(null);
                setHoveredVertexIndex(null);
                return;
              }
            }
          }

          // Check existing vertices
          for (let i = 0; i < selBldg.vertices.length; i++) {
            const s = worldToScreen(selBldg.vertices[i].x, selBldg.vertices[i].y);
            if (Math.hypot(sx - s.sx, sy - s.sy) <= 12) {
              setDraggedVertexIndex(i);
              setSelectedVertexIndex(i);
              onInteractionChange?.(true);
              return;
            }
          }
          // Check edge midpoint [+] to insert new vertex
          for (let i = 0; i < selBldg.vertices.length; i++) {
            const v1 = selBldg.vertices[i];
            const v2 = selBldg.vertices[(i + 1) % selBldg.vertices.length];
            const sm = worldToScreen((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
            if (Math.hypot(sx - sm.sx, sy - sm.sy) <= 10) {
              const newVerts = [...selBldg.vertices];
              const newPt = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
              newVerts.splice(i + 1, 0, newPt);
              onUpdateBuildingVertices?.(selBldg.id, newVerts);
              setDraggedVertexIndex(i + 1);
              setSelectedVertexIndex(i + 1);
              onInteractionChange?.(true);
              return;
            }
          }
          setSelectedVertexIndex(null);
        }
      }

      if (drawingMode === 'rotate' && selectedBuildingId && effectivePivot) {
        const pS = worldToScreen(effectivePivot.x, effectivePivot.y);
        // If clicked directly on pivot handle -> drag pivot
        if (Math.hypot(sx - pS.sx, sy - pS.sy) <= 14) {
          setIsDraggingPivot(true);
          onInteractionChange?.(true);
          return;
        }

        // Start rotating around pivot
        const mouseAngleWorld = Math.atan2(world.wy - effectivePivot.y, world.wx - effectivePivot.x);
        const mouseAngleScreen = Math.atan2(sy - pS.sy, sx - pS.sx);
        setIsRotating(true);
        setLastMouseAngleWorld(mouseAngleWorld);
        setRotStartAngleScreen(mouseAngleScreen);
        setRotAngleDeg(0);
        onInteractionChange?.(true);
        return;
      }

      if (drawingMode === 'rectangle') {
        if (drawingVertices.length === 0) {
          setDrawingVertices([{ x: world.wx, y: world.wy }]);
        } else {
          const p1 = drawingVertices[0];
          const p2 = { x: world.wx, y: world.wy };

          const theta = ((viewRotationDeg || 0) * Math.PI) / 180;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const ux = cosT;
          const uy = -sinT;
          const vx = sinT;
          const vy = cosT;

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;

          const w = dx * ux + dy * uy;
          const h = dx * vx + dy * vy;

          if (Math.abs(w) >= 0.5 && Math.abs(h) >= 0.5) {
            const rectVertices: Point2D[] = [
              { x: p1.x, y: p1.y },
              { x: p1.x + w * ux, y: p1.y + w * uy },
              { x: p1.x + w * ux + h * vx, y: p1.y + w * uy + h * vy },
              { x: p1.x + h * vx, y: p1.y + h * vy },
            ];
            onFinishDrawing?.(rectVertices, 'rectangle');
          }
          setDrawingVertices([]);
          setCurrentMouseWorld(null);
        }
        return;
      }

      if (drawingMode === 'polyline') {
        if (drawingVertices.length >= 3) {
          const first = drawingVertices[0];
          const firstScreen = worldToScreen(first.x, first.y);
          const clickScreen = worldToScreen(world.wx, world.wy);
          const distPx = Math.hypot(clickScreen.sx - firstScreen.sx, clickScreen.sy - firstScreen.sy);

          // Kliknięcie w pobliżu pierwszego punktu (np. w promieniu 15 pikseli na ekranie lub 0.6m w świecie)
          if (distPx <= 15 || Math.hypot(world.wx - first.x, world.wy - first.y) <= 0.6) {
            onFinishDrawing?.(drawingVertices, 'polyline');
            setDrawingVertices([]);
            setCurrentMouseWorld(null);
            return;
          }
        }
        setDrawingVertices((prev) => [...prev, { x: world.wx, y: world.wy }]);
        return;
      }

      if (facadePointMode) {
        if (liveFacadeSnap) {
          onAddPinnedPoint?.({
            buildingId: liveFacadeSnap.buildingId,
            segmentId: liveFacadeSnap.segmentId,
            offsetRatio: liveFacadeSnap.ratio,
          });
          return;
        }
      }

      if (isEditMode && hoveredEdge) {
        setDraggingEdge(hoveredEdge);
        setDragStart({ x: world.wx, y: world.wy });
        onInteractionChange?.(true);
        return;
      }

      const hits = getHoverCandidates({ x: world.wx, y: world.wy });
      if (hits.length > 0) {
        const nextId = hits[hoveredBuildingIndex % hits.length];
        onSelectBuilding(nextId);

        const clickedBldg = buildings.find((b) => b.id === nextId);
        const lyr = clickedBldg?.layer || 'Domyślna (0)';
        const isLocked = layerSettings[lyr]?.isLocked === true;

        if (!isLocked) {
          setIsDraggingBuilding(true);
          setDragStart({ x: world.wx, y: world.wy });
          onInteractionChange?.(true);
        }
      } else {
        onSelectBuilding(null);
        setIsPanning(true);
        setDragStart({ x: sx, y: sy });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (viewRotationMode) {
      let closest: any = null;
      let minDistance = 2.0;
      for (const bldg of buildings) {
        const lyr = bldg.layer || 'Domyślna (0)';
        if (layerSettings[lyr]?.isVisible === false) continue;
        for (const seg of bldg.segments) {
          const dx = seg.p2.x - seg.p1.x;
          const dy = seg.p2.y - seg.p1.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-4) continue;
          const u = Math.max(0, Math.min(1, ((world.wx - seg.p1.x) * dx + (world.wy - seg.p1.y) * dy) / lenSq));
          const px = seg.p1.x + u * dx;
          const py = seg.p1.y + u * dy;
          const dist = Math.hypot(world.wx - px, world.wy - py);
          if (dist < minDistance) {
            minDistance = dist;
            const segVec = u >= 0.5 ? { dx, dy } : { dx: -dx, dy: -dy };
            const angleDeg = (Math.atan2(segVec.dy, segVec.dx) * 180) / Math.PI;
            closest = {
              buildingId: bldg.id,
              segmentId: seg.id,
              angleDeg,
              previewDeg: -angleDeg,
              ratio: u,
              point: { x: px, y: py },
            };
          }
        }
      }
      setRotationHover(closest);
    }

    if (drawingMode === 'vertexEdit' && selectedBuildingId) {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      if (selBldg && selBldg.vertices.length >= 3) {
        if (draggedVertexIndex !== null) {
          const updatedVerts = selBldg.vertices.map((v, idx) =>
            idx === draggedVertexIndex ? { x: world.wx, y: world.wy } : v
          );
          onUpdateBuildingVertices?.(selBldg.id, updatedVerts);
          return;
        }

        // Check hover
        let foundV: number | null = null;
        let foundM: number | null = null;

        for (let i = 0; i < selBldg.vertices.length; i++) {
          const s = worldToScreen(selBldg.vertices[i].x, selBldg.vertices[i].y);
          if (Math.hypot(sx - s.sx, sy - s.sy) <= 12) {
            foundV = i;
            break;
          }
        }

        if (foundV === null) {
          for (let i = 0; i < selBldg.vertices.length; i++) {
            const v1 = selBldg.vertices[i];
            const v2 = selBldg.vertices[(i + 1) % selBldg.vertices.length];
            const sm = worldToScreen((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
            if (Math.hypot(sx - sm.sx, sy - sm.sy) <= 10) {
              foundM = i;
              break;
            }
          }
        }

        setHoveredVertexIndex(foundV);
        setHoveredMidpointIndex(foundM);
      }
    } else {
      if (hoveredVertexIndex !== null) setHoveredVertexIndex(null);
      if (hoveredMidpointIndex !== null) setHoveredMidpointIndex(null);
    }

    if (drawingMode === 'rotate' && selectedBuildingId && effectivePivot) {
      const pS = worldToScreen(effectivePivot.x, effectivePivot.y);
      const isPivot = Math.hypot(sx - pS.sx, sy - pS.sy) <= 14;
      setIsPivotHovered(isPivot);

      if (isDraggingPivot) {
        setCustomPivot({ x: world.wx, y: world.wy });
        return;
      }

      if (isRotating && lastMouseAngleWorld !== null) {
        const currAngleWorld = Math.atan2(world.wy - effectivePivot.y, world.wx - effectivePivot.x);
        let delta = currAngleWorld - lastMouseAngleWorld;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;

        onBuildingRotate?.(selectedBuildingId, effectivePivot, delta);
        setLastMouseAngleWorld(currAngleWorld);
        setRotAngleDeg((prev) => prev + (delta * 180) / Math.PI);
        return;
      }
    }

    // Check Hover on Edge Length Badges of Selected Building
    if (selectedBuildingId) {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      let foundEdgeBadge: { buildingId: string; edgeIndex: number } | null = null;
      if (selBldg && selBldg.segments) {
        for (let eIdx = 0; eIdx < selBldg.segments.length; eIdx++) {
          const seg = selBldg.segments[eIdx];
          const midX = (seg.p1.x + seg.p2.x) / 2;
          const midY = (seg.p1.y + seg.p2.y) / 2;
          const sm = worldToScreen(midX, midY);
          if (Math.abs(sx - sm.sx) <= 25 && Math.abs(sy - sm.sy) <= 12) {
            foundEdgeBadge = { buildingId: selBldg.id, edgeIndex: eIdx };
            break;
          }
        }
      }
      setHoveredEdgeLengthBadge(foundEdgeBadge);
    } else {
      if (hoveredEdgeLengthBadge) setHoveredEdgeLengthBadge(null);
    }

    if (drawingMode !== 'none' && drawingMode !== 'vertexEdit' && drawingMode !== 'rotate') {
      setCurrentMouseWorld({ x: world.wx, y: world.wy });
    }

    if (facadePointMode) {
      if (draggingPinnedPointId) {
        const activePt = pinnedPoints.find((p) => p.id === draggingPinnedPointId);
        if (activePt) {
          const bldg = buildings.find((b) => b.id === activePt.buildingId);
          const seg = bldg?.segments.find((s) => s.id === activePt.segmentId);
          if (seg) {
            const dx = seg.p2.x - seg.p1.x;
            const dy = seg.p2.y - seg.p1.y;
            const lenSq = dx * dx + dy * dy;
            const ratio = Math.max(0, Math.min(1, ((world.wx - seg.p1.x) * dx + (world.wy - seg.p1.y) * dy) / lenSq));
            onUpdatePinnedPoint?.(activePt.id, activePt.buildingId, seg.id, ratio);
          }
        }
        return;
      }

      // Snapping candidate calculation (prioritize hovered building)
      let searchBuildings = hoveredBuildingId ? [buildings.find((b) => b.id === hoveredBuildingId)].filter(Boolean) : [];
      if (searchBuildings.length === 0 || !searchBuildings[0]) {
        searchBuildings = buildings.filter((b) => {
          const lyr = b.layer || 'Domyślna (0)';
          return layerSettings[lyr]?.isVisible !== false && layerSettings[lyr]?.isGhosted !== true;
        });
      }
      let bestSnap: { point: Point2D; buildingId: string; segmentId: string; ratio: number } | null = null;
      let minSnapDist = 999999;
      for (const bldg of searchBuildings) {
        if (!bldg || !Array.isArray(bldg.segments)) continue;

        for (const seg of bldg.segments) {
          const dx = seg.p2.x - seg.p1.x;
          const dy = seg.p2.y - seg.p1.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-4) continue;
          const u = Math.max(0, Math.min(1, ((world.wx - seg.p1.x) * dx + (world.wy - seg.p1.y) * dy) / lenSq));
          const px = seg.p1.x + u * dx;
          const py = seg.p1.y + u * dy;
          const dist = Math.hypot(world.wx - px, world.wy - py);
          if (dist < minSnapDist) {
            minSnapDist = dist;
            bestSnap = {
              point: { x: px, y: py },
              buildingId: bldg.id,
              segmentId: seg.id,
              ratio: u,
            };
          }
        }
      }
      setLiveFacadeSnap(bestSnap);
    } else {
      if (liveFacadeSnap) setLiveFacadeSnap(null);
    }

    if (draggingFacadePoint) {
      const bldg = buildings.find((item) => item.id === draggingFacadePoint.buildingId);
      const seg = bldg?.segments.find((item) => item.id === draggingFacadePoint.segmentId);
      if (seg) {
        const dx = seg.p2.x - seg.p1.x;
        const dy = seg.p2.y - seg.p1.y;
        const lenSq = dx * dx + dy * dy;
        const ratio = Math.max(0, Math.min(1, ((world.wx - seg.p1.x) * dx + (world.wy - seg.p1.y) * dy) / lenSq));
        onFacadePointMove?.(draggingFacadePoint.buildingId, seg.id, ratio);
      }
      return;
    }

    if (isDimensionMode) {
      let closestSeg: { buildingId: string; segmentId: string } | null = null;
      let minSegDist = 1.2;
      for (const bldg of buildings) {
        const lyr = bldg.layer || 'Domyślna (0)';
        const lyrSetting = layerSettings[lyr] || {};
        if (lyrSetting.isVisible === false || lyrSetting.isGhosted === true) continue;

        for (const seg of bldg.segments) {
          const dx = seg.p2.x - seg.p1.x;
          const dy = seg.p2.y - seg.p1.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-4) continue;
          const u = Math.max(0, Math.min(1, ((world.wx - seg.p1.x) * dx + (world.wy - seg.p1.y) * dy) / lenSq));
          const px = seg.p1.x + u * dx;
          const py = seg.p1.y + u * dy;
          const dist = Math.hypot(world.wx - px, world.wy - py);
          if (dist < minSegDist) {
            minSegDist = dist;
            closestSeg = { buildingId: bldg.id, segmentId: seg.id };
          }
        }
      }
      setDimHoveredEdge(closestSeg);
    } else {
      if (dimHoveredEdge) setDimHoveredEdge(null);
    }

    if (isEditMode && selectedBuildingId) {
      const bldg = buildings.find((b) => b.id === selectedBuildingId);
      const lyr = bldg?.layer || 'Domyślna (0)';
      const isLocked = layerSettings[lyr]?.isLocked === true;

      if (bldg && bldg.vertices.length >= 3 && !isLocked) {
        let closestEdgeIdx: number | null = null;
        let minEdgeDist = 1.0;
        for (let i = 0; i < bldg.vertices.length; i++) {
          const p1 = bldg.vertices[i];
          const p2 = bldg.vertices[(i + 1) % bldg.vertices.length];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-4) continue;
          const u = Math.max(0, Math.min(1, ((world.wx - p1.x) * dx + (world.wy - p1.y) * dy) / lenSq));
          const px = p1.x + u * dx;
          const py = p1.y + u * dy;
          const dist = Math.hypot(world.wx - px, world.wy - py);
          if (dist < minEdgeDist) {
            minEdgeDist = dist;
            closestEdgeIdx = i;
          }
        }
        if (closestEdgeIdx !== null) {
          setHoveredEdge({ buildingId: selectedBuildingId, edgeIndex: closestEdgeIdx });
        } else {
          setHoveredEdge(null);
        }
      } else {
        if (hoveredEdge) setHoveredEdge(null);
      }
    } else {
      if (hoveredEdge) setHoveredEdge(null);
    }

    if (!dragStart) return;

    if (draggingEdge) {
      const dwx = world.wx - dragStart.x;
      const dwy = world.wy - dragStart.y;
      onBuildingEdgeMove?.(draggingEdge.buildingId, draggingEdge.edgeIndex, dwx, dwy);
      setDragStart({ x: world.wx, y: world.wy });
      return;
    }

    if (isPanning) {
      const dx = sx - dragStart.x;
      const dy = sy - dragStart.y;
      setViewState((prev) => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }));
      setDragStart({ x: sx, y: sy });
    } else if (isDraggingBuilding && selectedBuildingId) {
      const dwx = world.wx - dragStart.x;
      const dwy = world.wy - dragStart.y;
      onBuildingMove(selectedBuildingId, dwx, dwy);
      setDragStart({ x: world.wx, y: world.wy });
    }
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        setHoveredBuildings([]);
        return;
      }
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      const hits = getHoverCandidates({ x: world.wx, y: world.wy });
      setHoveredBuildings((prev) => {
        if (prev.length === hits.length && prev.every((id, idx) => id === hits[idx])) {
          return prev;
        }
        return hits;
      });
      setHoveredBuildingIndex((prev) => (hits.length === 0 ? 0 : Math.min(prev, hits.length - 1)));
    };

    window.addEventListener('mousemove', handleGlobalMove);
    return () => window.removeEventListener('mousemove', handleGlobalMove);
  }, [getHoverCandidates, screenToWorld]);

  const handleMouseUp = () => {
    if (
      isDraggingBuilding ||
      draggingEdge ||
      draggingFacadePoint ||
      draggingPinnedPointId ||
      draggedVertexIndex !== null ||
      isDraggingPivot ||
      isRotating
    ) {
      onInteractionChange?.(false);
    }
    setIsPanning(false);
    setIsDraggingBuilding(false);
    setDraggingEdge(null);
    setDraggingFacadePoint(null);
    setDraggingPinnedPointId(null);
    setDraggedVertexIndex(null);
    setIsDraggingPivot(false);
    setIsRotating(false);
    setLastMouseAngleWorld(null);
    setDragStart(null);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawingMode === 'vertexEdit' && selectedBuildingId) {
      e.preventDefault();
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      if (selBldg && selBldg.vertices.length > 3) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        for (let i = 0; i < selBldg.vertices.length; i++) {
          const s = worldToScreen(selBldg.vertices[i].x, selBldg.vertices[i].y);
          if (Math.hypot(sx - s.sx, sy - s.sy) <= 12) {
            const filtered = selBldg.vertices.filter((_, idx) => idx !== i);
            onUpdateBuildingVertices?.(selBldg.id, filtered);
            setSelectedVertexIndex(null);
            setHoveredVertexIndex(null);
            setHoveredMidpointIndex(null);
            return;
          }
        }
      }
    }
  };

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
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor:
            isDimensionMode
              ? 'crosshair'
              : drawingMode === 'vertexEdit'
              ? hoveredVertexIndex !== null || draggedVertexIndex !== null
                ? 'move'
                : hoveredMidpointIndex !== null
                ? 'copy'
                : 'default'
              : drawingMode === 'rotate'
              ? isDraggingPivot || isPivotHovered
                ? 'move'
                : isRotating
                ? 'grabbing'
                : 'grab'
              : drawingMode !== 'none'
              ? 'crosshair'
              : draggingEdge
              ? 'move'
              : isEditMode && hoveredEdge
              ? 'move'
              : hoveredBuildingId
              ? 'pointer'
              : isPanning || isDraggingBuilding
              ? 'grabbing'
              : 'grab',
        }}
      />
    </div>
  );
};
