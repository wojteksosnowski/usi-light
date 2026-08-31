import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Point2D } from '../types/geometry';
import { isPointInPolygon, computeCombinedShadowEnvelope } from '../utils/math2d';
import { CadCanvasProps, CadRenderContext } from './cad/types';
import { useCadViewport } from './cad/hooks/useCadViewport';
import { useCadHotkeys } from './cad/hooks/useCadHotkeys';
import { renderCadGrid } from './cad/renderers/gridRenderer';
import { renderAnalysisBands } from './cad/renderers/analysisBandsRenderer';
import { renderBuildings } from './cad/renderers/buildingsRenderer';
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

  // Edge editing state (parallel offset)
  const [hoveredEdge, setHoveredEdge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);
  const [draggingFacadePoint, setDraggingFacadePoint] = useState<{ buildingId: string; segmentId: string } | null>(null);
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

  // Hotkeys hook
  useCadHotkeys({
    drawingMode,
    drawingVertices,
    hoveredBuildings,
    onCancelDrawing,
    onFinishDrawing,
    setDrawingVertices,
    setCurrentMouseWorld,
    setHoveredBuildingIndex,
  });

  useEffect(() => {
    onDrawingVerticesCountChange?.(drawingVertices.length);
  }, [drawingVertices.length, onDrawingVerticesCountChange]);

  useEffect(() => {
    if (drawingMode === 'none') {
      setDrawingVertices([]);
      setCurrentMouseWorld(null);
    }
  }, [drawingMode]);

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
      layerSettings
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

    // 6. Drawing Tool Live Previews
    renderDrawingToolPreview(renderContext, drawingMode, drawingVertices, currentMouseWorld);
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

      if (isDimensionMode) {
        if (dimHoveredEdge) {
          onDimensionClickEdge?.(dimHoveredEdge.buildingId, dimHoveredEdge.segmentId);
        }
        return;
      }

      if (drawingMode === 'rectangle') {
        if (drawingVertices.length === 0) {
          setDrawingVertices([{ x: world.wx, y: world.wy }]);
        } else {
          const p1 = drawingVertices[0];
          const p2 = { x: world.wx, y: world.wy };
          const minX = Math.min(p1.x, p2.x);
          const maxX = Math.max(p1.x, p2.x);
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);

          if (Math.abs(maxX - minX) >= 0.5 && Math.abs(maxY - minY) >= 0.5) {
            const rectVertices: Point2D[] = [
              { x: minX, y: minY },
              { x: maxX, y: minY },
              { x: maxX, y: maxY },
              { x: minX, y: maxY },
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

      if (facadePointMode && selectedBuildingId) {
        const bldg = buildings.find((b) => b.id === selectedBuildingId);
        const lyr = bldg?.layer || 'Domyślna (0)';
        if (bldg && layerSettings[lyr]?.isVisible !== false) {
          let closestSeg: { segId: string; ratio: number } | null = null;
          let minDist = 1.2;
          for (const seg of bldg.segments) {
            const dx = seg.p2.x - seg.p1.x;
            const dy = seg.p2.y - seg.p1.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-4) continue;
            const u = Math.max(0, Math.min(1, ((world.wx - seg.p1.x) * dx + (world.wy - seg.p1.y) * dy) / lenSq));
            const px = seg.p1.x + u * dx;
            const py = seg.p1.y + u * dy;
            const dist = Math.hypot(world.wx - px, world.wy - py);
            if (dist < minDist) {
              minDist = dist;
              closestSeg = { segId: seg.id, ratio: u };
            }
          }
          if (closestSeg) {
            onFacadePointMove?.(bldg.id, closestSeg.segId, closestSeg.ratio);
            setDraggingFacadePoint({ buildingId: bldg.id, segmentId: closestSeg.segId });
            onInteractionChange?.(true);
            return;
          }
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

    if (drawingMode !== 'none') {
      setCurrentMouseWorld({ x: world.wx, y: world.wy });
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
    if (isDraggingBuilding || draggingEdge || draggingFacadePoint) {
      onInteractionChange?.(false);
    }
    setIsPanning(false);
    setIsDraggingBuilding(false);
    setDraggingEdge(null);
    setDraggingFacadePoint(null);
    setDragStart(null);
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
