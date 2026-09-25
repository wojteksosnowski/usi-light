import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Point2D, AnalysisPointResult, DEFAULT_SWEEP_WIDTH } from '../types/geometry';
import { computeCombinedShadowEnvelope } from '@/utils/math2d';
import { isBuildingVariantActive } from '@/utils/geometrySelectors';
import { computeHourlyShadowsLive } from '@/utils/math2d/shadowEnvelope';
import { CadCanvasProps, CadRenderContext } from './cad/types';
import { CadRenderFrameContext } from './cad/pipeline/types';
import { useCadViewport } from './cad/hooks/useCadViewport';
import { useCadHotkeys } from './cad/hooks/useCadHotkeys';
import { useCanvasInteraction, isBuildingLocked, getBuildingTopElevation } from './cad/hooks/useCanvasInteraction';
import { useDemoRecorder } from '../hooks/useDemoRecorder';
import { useActionRecorderStore } from '../modules/action-recorder/useActionRecorderStore';
import { RecorderOverlay, SessionCatalogModal } from '../modules/action-recorder';
import { Recording3DPipWindow } from './preview/Recording3DPipWindow';
import { CadRenderPipeline } from './cad/pipeline/CadRenderPipeline';
import { SceneBuffer } from './cad/pipeline/SceneBuffer';
import { getBuildingLabelScreenAnchor } from './cad/renderers/buildingsRenderer';
import { getMasterplanLabelScreenAnchor } from './cad/masterplan/masterplanLabels';
import { BuildingLabelMiniPanel } from './cad/BuildingLabelMiniPanel';
import { GoogleTileManager } from '../utils/googleTileManager';
import { HereTileManager } from '../utils/hereTileManager';
import { detectCoordinateSystem, CrsDetectionResult } from '../utils/geoTransform';
import { isPointInPolygon } from '@/utils/math2d';
import { APP_CONFIG } from '../config/appConfig';
import { useWfsStore } from '../modules/wfs-import/store/useWfsStore';
import { prefetchActiveGeoLayersInRadius } from '../modules/wfs-import/registerGeoLayers';
import { useSolarAnalysisStore } from '../store/useSolarAnalysisStore';
import { useSceneStore } from '../store/useSceneStore';
import { useUiStore } from '../store/useUiStore';
import { useCadToolStore } from '../store/useCadToolStore';
import { MasterplanRenderPipeline } from './cad/masterplan/MasterplanRenderPipeline';
import { checkIsMobile, getCanvasWorkingWidth } from '../hooks/useIsMobile';

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
    masterplanHourFraction = 12.0,
    fitRequest,
    onCancelDrawing,
    onFinishDrawing,
    drawingMode = 'none',
    sweepWidth = DEFAULT_SWEEP_WIDTH,
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
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneBufferRef = useRef<SceneBuffer | null>(null);

  const openGroupId = useSceneStore((s) => s.openGroupId);

  // Action Recorder używa `canvas.captureStream()`, więc potrzebuje JEDNEGO canvasu ze
  // wszystkimi trzema warstwami złożonymi razem (tło + scena + HUD) — tego samego widoku, jaki
  // widzi użytkownik. Osobny canvas kompozytowy, odświeżany przez rAF tylko podczas nagrywania,
  // pozwala uniknąć powiązania tego z pętlami tła/sceny/HUD (patrz Loop A/B/C poniżej).
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useDemoRecorder(compositeCanvasRef, containerRef);

  const isRecorderActive = useActionRecorderStore(
    (s) => s.isRecording || s.replayerStatus.isPlaying || s.isCountingDown
  );

  useEffect(() => {
    if (!isRecorderActive) return;
    let rafId: number;
    const tick = () => {
      const composite = compositeCanvasRef.current;
      const bg = backgroundCanvasRef.current;
      const scene = canvasRef.current;
      const hud = overlayCanvasRef.current;
      if (composite && bg && scene && hud) {
        if (composite.width !== scene.width || composite.height !== scene.height) {
          composite.width = scene.width;
          composite.height = scene.height;
        }
        const ctx = composite.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, composite.width, composite.height);
          ctx.drawImage(bg, 0, 0);
          ctx.drawImage(scene, 0, 0);
          ctx.drawImage(hud, 0, 0);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isRecorderActive]);

  const [expandedLabelBuildingId, setExpandedLabelBuildingId] = useState<string | null>(null);
  const handleLabelClick = (id: string | null) => {
    setExpandedLabelBuildingId((prev) => (id && prev === id ? null : id));
  };

  // Menedżery kafelków satelitarnych (Google i HERE) — instancjonowane oba, aktywny wybierany przez satelliteProvider
  // Ostatni kontekst warstwy tła (kafle/siatka) — używany przez `scheduleTileRedraw` do przerysowania
  // WYŁĄCZNIE warstwy tła (bez dotykania bufora sceny) po załadowaniu kafla / przełączeniu warstwy geo.
  const latestBackgroundFrameContextRef = useRef<CadRenderFrameContext | null>(null);
  // Ostatni kontekst warstwy sceny — używany tylko w trybie masterplan (poza zakresem podziału na
  // tiery, patrz plan wdrożenia buforowania warstw), gdzie tło i scena renderują się razem.
  const latestSceneFrameContextRef = useRef<CadRenderFrameContext | null>(null);
  const tileManagerRef = useRef<GoogleTileManager | null>(null);
  const hereTileManagerRef = useRef<HereTileManager | null>(null);
  const satelliteProvider = useSolarAnalysisStore((s) => s.satelliteProvider);
  const tileRafIdRef = useRef<number | null>(null);

  const viewMode2D = useUiStore((s) => s.viewMode2D);

  const lastMasterplanTileRedrawTimeRef = useRef<number>(0);

  const scheduleTileRedraw = useCallback(() => {
    if (tileRafIdRef.current !== null) return;
    tileRafIdRef.current = requestAnimationFrame(() => {
      tileRafIdRef.current = null;
      if (useUiStore.getState().viewMode2D === 'masterplan_white') {
        // Tryb masterplan nie jest (jeszcze) podzielony na tiery — renderuje tło+scenę razem.
        // Ograniczamy lawinowe przerysowania całej sceny podczas gwałtownego napływu kafli (np. WMS GUGiK)
        // do co najwyżej 1 raz na 50ms, zapewniając responsywność głównego wątku.
        const now = performance.now();
        if (now - lastMasterplanTileRedrawTimeRef.current < 50) {
          scheduleTileRedraw();
          return;
        }
        lastMasterplanTileRedrawTimeRef.current = now;
        if (latestSceneFrameContextRef.current) {
          MasterplanRenderPipeline.render(latestSceneFrameContextRef.current);
        }
      } else if (latestBackgroundFrameContextRef.current) {
        const canvas = backgroundCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx) {
          CadRenderPipeline.renderBackground(latestBackgroundFrameContextRef.current, ctx);
        }
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (tileRafIdRef.current !== null) {
        cancelAnimationFrame(tileRafIdRef.current);
        tileRafIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const effectiveKey = googleMapsApiKey || APP_CONFIG.googleMaps.apiKey;
    if (!tileManagerRef.current) {
      tileManagerRef.current = new GoogleTileManager(effectiveKey, scheduleTileRedraw);
    } else {
      tileManagerRef.current.setApiKey(effectiveKey);
      tileManagerRef.current.setOnTileLoaded(scheduleTileRedraw);
    }
  }, [googleMapsApiKey, scheduleTileRedraw]);

  useEffect(() => {
    const effectiveKey = APP_CONFIG.hereMaps.apiKey;
    if (!hereTileManagerRef.current) {
      hereTileManagerRef.current = new HereTileManager(effectiveKey, scheduleTileRedraw);
    } else {
      hereTileManagerRef.current.setApiKey(effectiveKey);
      hereTileManagerRef.current.setOnTileLoaded(scheduleTileRedraw);
    }
  }, [scheduleTileRedraw]);

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

  // Geo module: re-render canvas when WMS tiles load or layers change (throttled via RAF)
  useEffect(() => {
    const handler = () => scheduleTileRedraw();
    window.addEventListener('geo-render-needed', handler);
    return () => window.removeEventListener('geo-render-needed', handler);
  }, [scheduleTileRedraw]);

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


  // Project circle pulse animation (shows when Centruj is pressed or project radius changes)
  const [projectCirclePulse, setProjectCirclePulse] = useState<{ radius: number; opacity: number } | null>(null);
  const circleAnimRef = useRef<number | null>(null);
  const projectRadius = useWfsStore((s) => s.projectRadius);

  const triggerProjectCirclePulse = useCallback((radius: number) => {
    if (circleAnimRef.current !== null) {
      cancelAnimationFrame(circleAnimRef.current);
    }

    const DURATION_MS = 2500;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const opacity = 1 - Math.min(elapsed / DURATION_MS, 1);
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
    if (fitRequest?.nonce) {
      triggerProjectCirclePulse(projectRadius);
    }
  }, [fitRequest, projectRadius, triggerProjectCirclePulse]);

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
    const allPts = buildings.flatMap((b) => (Array.isArray(b.vertices) ? b.vertices : []));
    return detectCoordinateSystem(allPts, { lat: latitude, lon: longitude });
  }, [buildings, latitude, longitude]);

  // Viewport hook
  const { viewState, setViewState, scheduleViewState, viewportMatrix, invViewportMatrix, worldToScreen, screenToWorld } = useCadViewport(
    containerRef,
    buildings,
    viewRotationDeg,
    fitRequest,
    selectedBuildingId,
    layerSettings,
    projectRadius
  );

  // Buforowanie automatyczne wyprzedzające (Look-Ahead): przy zmianie lokalizacji, promienia
  // lub poziomu zoomu, prefetchuje kafle wokół bieżącej skali, dzięki czemu przejścia
  // między progami całkowitymi (np. 18.01, 19.02, 20.02) korzystają z kafli już obecnych w RAM.
  const activeGeoLayersKey = useWfsStore(
    (s) => `${s.showOrthophotoLayer}|${s.showKiutLayer}|${s.showMpzpLayer}|${s.showBdotLayer}`
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const metersPerPixel = 1 / Math.max(0.0001, viewState.scale);
      const metersPerTileAtLat = 40075016.686 * Math.cos((latitude * Math.PI) / 180);
      const currentZoom = Math.log2(metersPerTileAtLat / (256 * metersPerPixel));

      if (showSatelliteLayer && activeTileManager) {
        activeTileManager.prefetchTilesInRadius(latitude, longitude, projectRadius, currentZoom);
      }
      prefetchActiveGeoLayersInRadius(latitude, longitude, projectRadius, currentZoom);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [latitude, longitude, projectRadius, activeTileManager, showSatelliteLayer, activeGeoLayersKey, viewState.scale]);

  // Podgląd atrybutów strefy MPZP po kliknięciu (wektor, pilot Warszawa) — niezależny od
  // głównej logiki interakcji, aktywny tylko gdy warstwa jest widoczna.
  const showMpzpZonesLayer = useWfsStore((s) => s.showMpzpZonesLayer);
  const mpzpZones = useWfsStore((s) => s.mpzpZones);
  const setSelectedMpzpZone = useWfsStore((s) => s.setSelectedMpzpZone);

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
    viewMode2D,
    containerRef,
    canvasRef,
    viewState,
    setViewState,
    scheduleViewState,
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
    onAdjustObjectParam: interaction.handleAdjustObjectParam,
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
    onCycleSnapCandidate: interaction.handleCycleSnapCandidate,
  });

  const isMobileShowcasePreview = useUiStore((s) => s.isMobileShowcasePreview);
  const isSidebarOpen = useUiStore((s) => s.isSidebarOpen);

  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>(() => {
    if (typeof window === 'undefined') return { width: 1200, height: 800 };
    const isKiosk = checkIsMobile() || isMobileShowcasePreview;
    const isSidebarActive = isSidebarOpen && !isKiosk;
    return {
      width: getCanvasWorkingWidth(isSidebarActive),
      height: window.innerHeight,
    };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateFromSize = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        const w = Math.floor(width);
        const h = Math.floor(height);
        setCanvasDimensions((prev) => (prev.width !== w || prev.height !== h ? { width: w, height: h } : prev));
      }
    };

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      const isKiosk = checkIsMobile() || isMobileShowcasePreview;
      const isSidebarActive = isSidebarOpen && !isKiosk;
      const defaultWidth = getCanvasWorkingWidth(isSidebarActive);
      const w = container.clientWidth > 50 ? container.clientWidth : (rect.width > 50 ? rect.width : defaultWidth);
      const h = container.clientHeight > 50 ? container.clientHeight : (rect.height > 50 ? rect.height : window.innerHeight);
      updateFromSize(w, h);
    };

    updateDimensions();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateFromSize(entry.contentRect.width, entry.contentRect.height);
      }
    });

    observer.observe(container);
    window.addEventListener('resize', updateDimensions);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [isMobileShowcasePreview, isSidebarOpen]);

  const visibleBuildings = useMemo(() => {
    return buildings.filter((b) => {
      if (!isBuildingVariantActive(b)) return false;
      const lyr = b.layer || 'Domyślna (0)';
      return layerSettings[lyr]?.isVisible !== false;
    });
  }, [buildings, layerSettings]);

  const isEffectiveInteracting = isInteracting || interaction.effectiveIsInteracting;

  const liveShadowResult = useMemo(() => {
    if (!showShadowRange) return null;
    return computeHourlyShadowsLive(visibleBuildings, latitude, longitude, equinoxDate, 1.0, sunlightMethod);
  }, [showShadowRange, visibleBuildings, latitude, longitude, equinoxDate, sunlightMethod]);

  const hourlyShadowsToRender = useMemo(() => {
    if (!showShadowRange) return [];
    if (isEffectiveInteracting || !shadowAnalysis?.hourlyShadows || shadowAnalysis.hourlyShadows.length === 0) {
      return liveShadowResult?.hourlyShadows ?? [];
    }
    return shadowAnalysis.hourlyShadows;
  }, [showShadowRange, isEffectiveInteracting, liveShadowResult, shadowAnalysis]);

  const shadowRangeLoopsToRender = useMemo(() => {
    if (!showShadowRange) return [];
    if (isEffectiveInteracting || !shadowAnalysis?.envelopeLoops || shadowAnalysis.envelopeLoops.length === 0) {
      return liveShadowResult?.envelopeLoops ?? [];
    }
    return shadowAnalysis.envelopeLoops;
  }, [showShadowRange, isEffectiveInteracting, liveShadowResult, shadowAnalysis]);

  const pinnedPointResults = useMemo(() => {
    if (propPinnedPointResults && propPinnedPointResults.length > 0) {
      return propPinnedPointResults;
    }
    if (!pinnedPoints || pinnedPoints.length === 0) {
      return selectedPointResult ? [selectedPointResult] : [];
    }
    return pinnedPoints.flatMap((pt, idx) => {
      const bldg = buildings.find((b) => b.id === pt.buildingId);
      if (!isBuildingVariantActive(bldg)) return [];
      const lyr = bldg?.layer || 'Domyślna (0)';
      if (!bldg || layerSettings[lyr]?.isVisible === false) return [];
      const seg = bldg.segments?.find((s) => s.id === pt.segmentId);
      if (!seg) return [];

      const px = seg.p1.x + pt.offsetRatio * (seg.p2.x - seg.p1.x);
      const py = seg.p1.y + pt.offsetRatio * (seg.p2.y - seg.p1.y);
      const point = { x: px, y: py };

      return [{
        id: pt.id,
        point,
        normal: seg.normal || { x: 0, y: 1 },
        buildingId: pt.buildingId,
        segmentId: pt.segmentId,
        label: pt.label || `P${idx + 1}`,
        shadowing: { point, segmentId: pt.segmentId, offsetRatio: pt.offsetRatio, isCompliant: true, maxContinuousFreeSpanDeg: 156, totalFreeSpanDeg: 156, sectors: [], rays: [] },
        sunlight: { point, segmentId: pt.segmentId, offsetRatio: pt.offsetRatio, totalMinutes: 0, totalHours: 0, isCompliant: true, timeSlots: [], sectors: [] },
      } as AnalysisPointResult];
    });
  }, [propPinnedPointResults, pinnedPoints, buildings, selectedPointResult, layerSettings]);

  // Kontekst wspólny dla warstw tła/sceny — budowany na nowo przy każdym renderze komponentu
  // (celowo NIE opakowany w useCallback: memoizacja funkcji budującej pełny kontekst, obejmujący
  // zarówno pola tła jak i pola drag/hover, wymuszałaby nową referencję przy każdej zmianie
  // interakcji, co unieważniałoby oba bufory tła i sceny na każdy mousemove — dokładnie problem,
  // który ten podział ma rozwiązać). Efekty renderujące referencjonują tę funkcję z domknięcia i
  // same kontrolują częstotliwość przerysowań przez własne, przycięte tablice zależności.
  const buildLegacyFrameContext = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): CadRenderFrameContext => {
    const renderContext: CadRenderContext = {
        ctx,
        width,
        height,
        viewState,
        viewRotationDeg,
        viewportMatrix,
        invViewportMatrix,
        worldToScreen,
        screenToWorld,
        latitude,
        longitude,
        equinoxDate,
        sunlightMethod,
        masterplanHourFraction,
        isInteracting: interaction.effectiveIsInteracting,
      };

      return {
        renderContext,
        buildings,
        selectedBuildingId,
        selectedBuildingIds,
        openGroupId,
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
        hideOtherLabelsInLinkingMode: useCadToolStore.getState().hideOtherLabelsInLinkingMode,
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
        ucsMode: useCadToolStore.getState().ucsMode,
        showSatelliteLayer,
        satelliteOpacity,
        tileManager: activeTileManager,
        crsInfo,
        draggedVertexIndex: interaction.draggedVertexIndex,
        dragVertexPreviewPt: interaction.dragVertexPreviewPt,
        projectCirclePulse,
        projectRadius,
      };
    };

  // Koalescencja renderu do requestAnimationFrame: podczas panningu `viewState` potrafi się
  // zmieniać częściej niż przeglądarka faktycznie maluje klatki (zdarzenia mousemove/pointermove
  // nie są throttlowane do rAF). Bez koalescencji każda taka zmiana synchronicznie odpala pełny
  // render Loop A/B (dla sceny z ~370 budynkami zmierzono empirycznie ~8-9ms/wywołanie, PerfMonitor
  // `render.layer.buildings`), co przy zdarzeniach gęstszych niż budżet klatki (~16ms) powoduje
  // kolejkowanie się renderów na głównym wątku i odczuwalny bezwład. Efekt zawsze zapisuje
  // NAJNOWSZĄ funkcję renderującą do refa; faktyczne wywołanie planowane jest przez rAF i
  // deduplikowane — w obrębie jednej klatki wykonuje się co najwyżej jeden realny render,
  // zawsze z najświeższym stanem.
  const bgRenderFnRef = useRef<() => void>(() => {});
  const bgRafIdRef = useRef<number | null>(null);
  const sceneRenderFnRef = useRef<() => void>(() => {});
  const sceneRafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (bgRafIdRef.current !== null) {
        cancelAnimationFrame(bgRafIdRef.current);
        bgRafIdRef.current = null;
      }
      if (sceneRafIdRef.current !== null) {
        cancelAnimationFrame(sceneRafIdRef.current);
        sceneRafIdRef.current = null;
      }
    };
  }, []);

  // 1a. Background Render Loop (tier: background) — kafle satelitarne/WMS, siatka CAD.
  // Przerysowywana tylko przy zmianie viewportu/rozmiaru, budynków (wpływają na zasięg siatki),
  // widoczności warstw geo lub interakcji obrotu widoku — NIE przy hover/drag wierzchołka.
  useEffect(() => {
    if (viewMode2D === 'masterplan_white') return; // masterplan renderuje tło+scenę razem (Loop B)

    bgRenderFnRef.current = () => {
      const canvas = backgroundCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvasDimensions.width;
      const height = canvasDimensions.height;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const frameContext = buildLegacyFrameContext(ctx, width, height);
      latestBackgroundFrameContextRef.current = frameContext;
      CadRenderPipeline.renderBackground(frameContext, ctx);
    };

    if (bgRafIdRef.current === null) {
      bgRafIdRef.current = requestAnimationFrame(() => {
        bgRafIdRef.current = null;
        bgRenderFnRef.current();
      });
    }
  }, [
    viewMode2D,
    canvasDimensions,
    buildings,
    viewState,
    viewRotationDeg,
    crsInfo,
    showSatelliteLayer,
    satelliteOpacity,
    activeTileManager,
    interaction.rotationHover,
    viewRotationMode,
    projectCirclePulse,
    projectRadius,
  ]);

  // 1b. Scene Render Loop (tier: scene) — budynki, cienie, pasma analizy.
  // Renderuje do `SceneBuffer` (OffscreenCanvas) i kopiuje bitmapę na `canvasRef` przez `drawImage`,
  // zamiast rysować bezpośrednio — dzięki temu bufor pozostaje ważny między klatkami HUD.
  // Świadomie NIE zawiera `draggedVertexIndex`/`dragVertexPreviewPt` w zależnościach: podgląd
  // przeciąganego wierzchołka rysuje osobna warstwa HUD (`BuildingsDragPreviewLayer`).
  useEffect(() => {
    sceneRenderFnRef.current = () => {
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

      if (viewMode2D === 'masterplan_white') {
        const frameContext = buildLegacyFrameContext(ctx, width, height);
        latestSceneFrameContextRef.current = frameContext;
        MasterplanRenderPipeline.render(frameContext);
        return;
      }

      if (!sceneBufferRef.current) {
        sceneBufferRef.current = new SceneBuffer();
      }
      const sceneBuffer = sceneBufferRef.current;
      sceneBuffer.resize(width, height);

      const frameContext = buildLegacyFrameContext(sceneBuffer.ctx, width, height);
      CadRenderPipeline.renderScene(frameContext, sceneBuffer.ctx);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(sceneBuffer.source, 0, 0);
      ctx.restore();
    };

    if (sceneRafIdRef.current === null) {
      sceneRafIdRef.current = requestAnimationFrame(() => {
        sceneRafIdRef.current = null;
        sceneRenderFnRef.current();
      });
    }
  }, [
    viewMode2D,
    canvasDimensions,
    buildings,
    selectedBuildingId,
    selectedBuildingIds,
    openGroupId,
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
    masterplanHourFraction,
    dimensions,
    isDimensionMode,
    dimensionType,
    interaction.dimHoveredEdge,
    viewState,
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
    analysisResults,
    layerSettings,
    shadowRangeLoopsToRender,
    hourlyShadowsToRender,
    showShadowFill,
    worldToScreen,
    screenToWorld,
    visibleBuildings,
    showAnalysisPoints,
    crsInfo,
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
      viewportMatrix,
      invViewportMatrix,
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

  // 3. Natywny nasłuchiwacz zdarzenia wheel z { passive: false }
  // Rozwiązuje problem gubienia klatek i szarpania przy gładziku na macOS oraz kółku myszy.
  const handleInteractionChange = props.onInteractionChange;
  const isInteractingDebounceTimer = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Obsługa gestu pinch-to-zoom na gładziku (e.ctrlKey === true) oraz klasycznego scrolla
      let zoomFactor: number;
      if (e.ctrlKey) {
        // macOS trackpad pinch
        zoomFactor = Math.exp(-e.deltaY * 0.008);
      } else {
        // Mysz / standardowy trackpad scroll
        const rawDelta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
        const clampedDelta = Math.max(-120, Math.min(120, rawDelta));
        zoomFactor = Math.exp(-clampedDelta * 0.0018);
      }

      scheduleViewState((prev) => {
        const newScale = Math.max(0.001, Math.min(100, prev.scale * zoomFactor));
        if (Math.abs(newScale - prev.scale) < 1e-6) return prev;
        const ratio = newScale / prev.scale;
        return {
          scale: newScale,
          panX: mouseX - (mouseX - prev.panX) * ratio,
          panY: mouseY - (mouseY - prev.panY) * ratio,
        };
      });

      // Flaga interakcji z debouncem (zapobiega ciężkim przeliczeniom podczas ciągłego zoomowania)
      handleInteractionChange?.(true);
      if (isInteractingDebounceTimer.current !== null) {
        window.clearTimeout(isInteractingDebounceTimer.current);
      }
      isInteractingDebounceTimer.current = window.setTimeout(() => {
        handleInteractionChange?.(false);
        isInteractingDebounceTimer.current = null;
      }, 150);
    };

    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleNativeWheel);
      if (isInteractingDebounceTimer.current !== null) {
        window.clearTimeout(isInteractingDebounceTimer.current);
        isInteractingDebounceTimer.current = null;
      }
    };
  }, [handleInteractionChange]);

  // `interaction.effectiveIsInteracting` już poprawnie odzwierciedla przeciąganie budynku,
  // obracanie, edycję wierzchołka/krawędzi itd. (patrz `useCanvasInteraction.ts`), ale dotąd
  // globalny `useCadToolStore.isInteracting` (czytany m.in. przez podgląd 3D do zamrożenia
  // auto-kadrowania) był aktualizowany WYŁĄCZNIE z handlera scrolla powyżej - żaden z pozostałych
  // typów interakcji nigdy go nie ustawiał. Ten efekt uzupełnia pokrycie o wszystkie pozostałe
  // typy interakcji (mają naturalne mouse-down/mouse-up, więc nie potrzebują debounce'u jak scroll).
  useEffect(() => {
    handleInteractionChange?.(interaction.effectiveIsInteracting);
  }, [interaction.effectiveIsInteracting, handleInteractionChange]);

  const expandedLabelBuilding = expandedLabelBuildingId
    ? buildings.find((b) => b.id === expandedLabelBuildingId) || null
    : null;
  const expandedLabelAnchor = expandedLabelBuilding
    ? viewMode2D === 'masterplan_white'
      ? getMasterplanLabelScreenAnchor(
          expandedLabelBuilding,
          buildings,
          worldToScreen,
          viewState.scale,
          selectedBuildingId,
          selectedBuildingIds,
          interaction.hoveredBuildingId
        )
      : getBuildingLabelScreenAnchor(expandedLabelBuilding, worldToScreen)
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
        ref={backgroundCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: viewMode2D === 'masterplan_white' ? 'none' : 'block',
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={canvasRef}
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
      {/* Canvas kompozytowy (tło+scena+HUD) dla Action Recordera — poza ekranem, nie renderowany bezpośrednio */}
      <canvas ref={compositeCanvasRef} style={{ position: 'absolute', left: '-99999px', top: 0, pointerEvents: 'none' }} />
      {/* Nakładka Demo / Action Recorder (Odliczanie, Replay Bar) */}
      <RecorderOverlay />
      {/* Pływające okno podglądu 3D Picture-in-Picture */}
      <Recording3DPipWindow />
      {/* Modal Katalogu Nagrań i Sesji */}
      <SessionCatalogModal />

      {expandedLabelBuilding && expandedLabelAnchor && (
        <BuildingLabelMiniPanel
          building={expandedLabelBuilding}
          anchor={{ sx: expandedLabelAnchor.sx, sy: expandedLabelAnchor.bottomSy }}
          onClose={() => setExpandedLabelBuildingId(null)}
        />
      )}
    </div>
  );
};
