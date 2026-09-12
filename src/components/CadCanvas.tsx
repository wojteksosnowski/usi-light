import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Point2D, AnalysisPointResult } from '../types/geometry';
import { computeCombinedShadowEnvelope } from '@/utils/math2d';
import { computeHourlyShadowsLive } from '@/utils/math2d/shadowEnvelope';
import { CadCanvasProps, CadRenderContext } from './cad/types';
import { useCadViewport } from './cad/hooks/useCadViewport';
import { useCadHotkeys } from './cad/hooks/useCadHotkeys';
import { useCanvasInteraction, isBuildingLocked, getBuildingTopElevation } from './cad/hooks/useCanvasInteraction';
import { CadRenderPipeline } from './cad/pipeline/CadRenderPipeline';
import { getBuildingLabelScreenAnchor } from './cad/renderers/buildingsRenderer';
import { BuildingLabelMiniPanel } from './cad/BuildingLabelMiniPanel';
import { GoogleTileManager } from '../utils/googleTileManager';
import { HereTileManager } from '../utils/hereTileManager';
import { detectCoordinateSystem, CrsDetectionResult } from '../utils/geoTransform';
import { isPointInPolygon } from '@/utils/math2d';
import { APP_CONFIG } from '../config/appConfig';
import { useWfsStore, MpzpZoneFeature } from '../modules/wfs-import/store/useWfsStore';
import { prefetchActiveGeoLayersInRadius } from '../modules/wfs-import/registerGeoLayers';
import { useSolarAnalysisStore } from '../store/useSolarAnalysisStore';

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
    fitRequest,
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
    alignPendingRef = null,
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

  const [expandedLabelBuildingId, setExpandedLabelBuildingId] = useState<string | null>(null);
  const handleLabelClick = (id: string | null) => {
    setExpandedLabelBuildingId((prev) => (id && prev === id ? null : id));
  };

  // Menedżery kafelków satelitarnych (Google i HERE) — instancjonowane oba, aktywny wybierany przez satelliteProvider
  const [tileRenderTick, setTileRenderTick] = useState<number>(0);
  const tileManagerRef = useRef<GoogleTileManager | null>(null);
  const hereTileManagerRef = useRef<HereTileManager | null>(null);
  const satelliteProvider = useSolarAnalysisStore((s) => s.satelliteProvider);

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

  useEffect(() => {
    const effectiveKey = APP_CONFIG.hereMaps.apiKey;
    if (!hereTileManagerRef.current) {
      hereTileManagerRef.current = new HereTileManager(effectiveKey, () => {
        setTileRenderTick((t) => t + 1);
      });
    } else {
      hereTileManagerRef.current.setApiKey(effectiveKey);
    }
  }, []);

  const activeTileManager =
    satelliteProvider === 'orthophoto'
      ? null
      : satelliteProvider === 'here'
        ? hereTileManagerRef.current
        : tileManagerRef.current;

  // Ortofotomapa (PRO) jest osobną warstwą WMS w pipeline (zarejestrowaną przez registerGeoLayers),
  // sterowaną przez useWfsStore — synchronizujemy ją z przełącznikiem "Dostawca mapy".
  const setShowOrthophotoLayer = useWfsStore((s) => s.setShowOrthophotoLayer);
  const setOrthophotoOpacity = useWfsStore((s) => s.setOrthophotoOpacity);

  useEffect(() => {
    setShowOrthophotoLayer(showSatelliteLayer && satelliteProvider === 'orthophoto');
  }, [showSatelliteLayer, satelliteProvider, setShowOrthophotoLayer]);

  useEffect(() => {
    setOrthophotoOpacity(satelliteOpacity);
  }, [satelliteOpacity, setOrthophotoOpacity]);

  // Geo module: re-render canvas when WMS tiles load or layers change
  useEffect(() => {
    const handler = () => setTileRenderTick((t) => t + 1);
    window.addEventListener('geo-render-needed', handler);
    return () => window.removeEventListener('geo-render-needed', handler);
  }, []);

  // Prefetch mapy satelitarnej po synchronizacji danych geo
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ lat: number; lon: number; radius: number }>).detail;
      if (activeTileManager && detail) {
        activeTileManager.prefetchTilesInRadius(detail.lat, detail.lon, detail.radius);
      }
    };
    window.addEventListener('geo-prefetch-satellite', handler);
    return () => window.removeEventListener('geo-prefetch-satellite', handler);
  }, [activeTileManager]);


  // Project circle pulse animation (shows when Centruj is pressed)
  const [projectCirclePulse, setProjectCirclePulse] = useState<{ radius: number; opacity: number } | null>(null);
  const circleAnimRef = useRef<number | null>(null);
  const projectRadius = useWfsStore((s) => s.projectRadius);

  // Buforowanie automatyczne (nie tylko po ręcznej synchronizacji): za każdą zmianą lokalizacji,
  // promienia projektu, dostawcy mapy lub włączenia warstwy GEO, doprefetchowuje kafle satelitarne
  // i WMS w zasięgu projektu (z przypięciem w cache — patrz `tilePrefetchMath.ts`). Debounced, żeby
  // przeciąganie środka projektu nie odpalało lawiny requestów przy każdej klatce. Warstwy GEO
  // subskrybowane jako jeden klucz (nie 5 osobnych selectorów) — treść nieużywana w efekcie,
  // liczy się wyłącznie to, czy się zmieniła.
  const activeGeoLayersKey = useWfsStore(
    (s) => `${s.showOrthophotoLayer}|${s.showKiutLayer}|${s.showMpzpLayer}|${s.showBdotLayer}|${s.showTerrainLayer}`
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (activeTileManager) {
        activeTileManager.prefetchTilesInRadius(latitude, longitude, projectRadius);
      }
      prefetchActiveGeoLayersInRadius(latitude, longitude, projectRadius);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [latitude, longitude, projectRadius, activeTileManager, activeGeoLayersKey]);

  const triggerProjectCirclePulse = useCallback((radius: number) => {
    // Cancel any running animation
    if (circleAnimRef.current !== null) {
      cancelAnimationFrame(circleAnimRef.current);
      circleAnimRef.current = null;
    }

    const DURATION_MS = 2500;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / DURATION_MS, 1);
      const opacity = 1 - t;
      if (opacity > 0.01) {
        setProjectCirclePulse({ radius, opacity });
        circleAnimRef.current = requestAnimationFrame(animate);
      } else {
        setProjectCirclePulse(null);
        circleAnimRef.current = null;
      }
    };

    setProjectCirclePulse({ radius, opacity: 1 });
    circleAnimRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (fitRequest === undefined || fitRequest.nonce === 0) return;
    triggerProjectCirclePulse(projectRadius);
  }, [fitRequest, projectRadius, triggerProjectCirclePulse]);

  // Show the pulse whenever the project radius itself changes (e.g. via the parameters panel)
  const prevProjectRadiusRef = useRef(projectRadius);
  useEffect(() => {
    if (prevProjectRadiusRef.current !== projectRadius) {
      prevProjectRadiusRef.current = projectRadius;
      triggerProjectCirclePulse(projectRadius);
    }
  }, [projectRadius, triggerProjectCirclePulse]);

  useEffect(() => {
    return () => {
      if (circleAnimRef.current !== null) {
        cancelAnimationFrame(circleAnimRef.current);
        circleAnimRef.current = null;
      }
    };
  }, []);

  // Detekcja układu współrzędnych sceny CAD
  const crsInfo = useMemo<CrsDetectionResult>(() => {
    const allPts: Point2D[] = [];
    for (const b of buildings) {
      if (Array.isArray(b.vertices)) {
        for (const v of b.vertices) allPts.push(v);
      }
    }
    return detectCoordinateSystem(allPts, { lat: latitude, lon: longitude });
  }, [buildings, latitude, longitude]);

  // Viewport hook
  const { viewState, setViewState, worldToScreen, screenToWorld } = useCadViewport(
    containerRef,
    buildings,
    viewRotationDeg,
    fitRequest,
    selectedBuildingId,
    layerSettings,
    projectRadius
  );

  // Podgląd atrybutów strefy MPZP po kliknięciu (wektor, pilot Warszawa) — niezależny od
  // głównej logiki interakcji, aktywny tylko gdy warstwa jest widoczna.
  const showMpzpZonesLayer = useWfsStore((s) => s.showMpzpZonesLayer);
  const mpzpZones = useWfsStore((s) => s.mpzpZones);
  const [selectedMpzpZone, setSelectedMpzpZone] = useState<MpzpZoneFeature | null>(null);

  const handleCanvasClickForMpzpZone = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!showMpzpZonesLayer || mpzpZones.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const { wx, wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = mpzpZones.find((zone) => zone.rings.some((ring) => isPointInPolygon({ x: wx, y: wy }, ring)));
      setSelectedMpzpZone(hit ?? null);
    },
    [showMpzpZonesLayer, mpzpZones, screenToWorld]
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
    onLabelClick: handleLabelClick,
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
      hoveredLabelBuildingId: interaction.hoveredLabelBuildingId,
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
      tileManager: activeTileManager,
      crsInfo,
      draggedVertexIndex: interaction.draggedVertexIndex,
      dragVertexPreviewPt: interaction.dragVertexPreviewPt,
      projectCirclePulse,
      projectRadius,
    });
  }, [
    buildings,
    selectedBuildingId,
    selectedBuildingIds,
    interaction.hoveredBuildingId,
    interaction.hoveredLabelBuildingId,
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
    activeTileManager,
    crsInfo,
    interaction.draggedVertexIndex,
    interaction.dragVertexPreviewPt,
    projectCirclePulse,
    projectRadius,
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
      isRotateHandleHovered: interaction.isRotateHandleHovered,
      isRotating: interaction.isRotating,
      rotAngleDeg: interaction.rotAngleDeg,
      activeRotateAngleSnap: interaction.activeRotateAngleSnap,
      alignPendingRef,
      alignHoveredEdge: interaction.alignHoveredEdge,
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
    interaction.isRotateHandleHovered,
    interaction.isRotating,
    interaction.rotAngleDeg,
    interaction.activeRotateAngleSnap,
    alignPendingRef,
    interaction.alignHoveredEdge,
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

  const expandedLabelBuilding = expandedLabelBuildingId
    ? buildings.find((b) => b.id === expandedLabelBuildingId) || null
    : null;
  const expandedLabelAnchor = expandedLabelBuilding
    ? getBuildingLabelScreenAnchor(expandedLabelBuilding, worldToScreen)
    : null;

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
        onDoubleClick={interaction.handleDoubleClick}
        onMouseMove={interaction.handleMouseMove}
        onMouseUp={interaction.handleMouseUp}
        onMouseLeave={interaction.handleMouseUp}
        onContextMenu={interaction.handleContextMenu}
        onClick={handleCanvasClickForMpzpZone}
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
      {expandedLabelBuilding && expandedLabelAnchor && (
        <BuildingLabelMiniPanel
          building={expandedLabelBuilding}
          anchor={{ sx: expandedLabelAnchor.sx, sy: expandedLabelAnchor.bottomSy }}
          onClose={() => setExpandedLabelBuildingId(null)}
        />
      )}
      {selectedMpzpZone && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            padding: '10px 12px',
            borderRadius: '10px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(96, 165, 250, 0.4)',
            color: '#e2e8f0',
            fontSize: '11px',
            lineHeight: 1.5,
            maxWidth: '260px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700, color: '#60a5fa' }}>Strefa MPZP {selectedMpzpZone.funSymb || ''}</span>
            <button
              type="button"
              onClick={() => setSelectedMpzpZone(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
          {selectedMpzpZone.funNazwa && <div>Przeznaczenie: {selectedMpzpZone.funNazwa}</div>}
          {selectedMpzpZone.maxWysokosc && <div>Maks. wysokość: {selectedMpzpZone.maxWysokosc} m</div>}
          {selectedMpzpZone.intenZab && <div>Intensywność zabudowy: {selectedMpzpZone.intenZab}</div>}
          {selectedMpzpZone.powBio && <div>Pow. biologicznie czynna: {selectedMpzpZone.powBio}%</div>}
          {selectedMpzpZone.nazwaPlan && <div style={{ color: '#94a3b8', marginTop: '4px' }}>Plan: {selectedMpzpZone.nazwaPlan}</div>}
        </div>
      )}
    </div>
  );
};
