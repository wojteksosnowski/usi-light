import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Point2D, PinnedFacadePoint, AnalysisPointResult } from '../types/geometry';
import { isPointInPolygon, computeCombinedShadowEnvelope, adjustEdgeLength } from '@/utils/math2d';
import { computeHourlyShadowsLive } from '@/utils/math2d/shadowEnvelope';
import { CadCanvasProps, CadRenderContext } from './cad/types';
import { useCadViewport } from './cad/hooks/useCadViewport';
import { useCadHotkeys } from './cad/hooks/useCadHotkeys';
import { renderCadGrid } from './cad/renderers/gridRenderer';
import { renderAnalysisBands } from './cad/renderers/analysisBandsRenderer';
import { renderBuildings, EditingEdgeLengthState, getBuildingLabelHitAtPoint } from './cad/renderers/buildingsRenderer';
import { useUiStore } from '../store/useUiStore';
import { renderShadowRange } from './cad/renderers/shadowRangeRenderer';
import { renderSunlightVisualization } from './cad/renderers/sunlightRenderer';
import { renderShadowingVisualization } from './cad/renderers/shadowingRenderer';
import { renderDimensions } from './cad/renderers/dimensionsRenderer';
import { renderDrawingToolPreview } from './cad/renderers/drawingToolRenderer';
import { renderSatelliteMap } from './cad/renderers/satelliteMapRenderer';
import { renderPlaygroundSunlightVisualizations } from './cad/renderers/playgroundRenderer';
import { GoogleTileManager } from '../utils/googleTileManager';
import { detectCoordinateSystem, CrsDetectionResult } from '../utils/geoTransform';
import { calculateDirectionSnap } from '../utils/directionSnapping';
import {
  CachedLineEquation,
  buildLineBufferFromBuildings,
  flattenLineBuffer,
  createCachedLineEquation,
} from '../utils/lineBufferEngine';
import {
  OsnapSnapResult,
  BuildingDragSnapResult,
  SnapCoordinator,
  evaluateOsnapSnapWithCoordinator,
  evaluateCollinearAndParallelLock,
  evaluateBuildingDragMultiSnap,
} from '../engine/snapping';
import { APP_CONFIG } from '../config/appConfig';


export const CadCanvas: React.FC<CadCanvasProps> = ({
  buildings,
  selectedBuildingId,
  selectedBuildingIds = [],
  onSelectBuilding,
  onBuildingMove,
  onBuildingsMove,
  analysisResults,
  selectedPointResult,
  activePointMode = 'shadowing',
  onSelectPointResult,
  showNormals,
  showShadowingLines,
  showSunlightLines,
  showShadowRange = false,
  showShadowFill = false,
  isInteracting = false,
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
  sweepWidth = 5.0,
  sweepAlignment = 'center',
  onFinishDrawing,
  onCancelDrawing,
  onDrawingVerticesCountChange,
  onUpdateBuildingVertices,
  onUpdateBuildingSweepPath,
  onBuildingRotate,
  onBooleanUnion,
  pinnedPoints = [],
  pinnedPointResults: propPinnedPointResults,
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
  isDirectionSnappingActive = true,
  isOsnapActive = true,
  onToggleOsnap,
  dominantDirections = [],
  showSatelliteLayer = false,
  satelliteOpacity = 0.65,
  googleMapsApiKey = '',
}) => {
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

  // Drawing state
  const [drawingVertices, setDrawingVertices] = useState<Point2D[]>([]);
  const [currentMouseWorld, setCurrentMouseWorld] = useState<Point2D | null>(null);
  const [activeDirectionSnap, setActiveDirectionSnap] = useState<import('../utils/directionSnapping').DirectionSnapResult | null>(null);

  // Advanced OSNAP & OTRACK state
  const snapCoordinatorRef = useRef<SnapCoordinator>(new SnapCoordinator());
  const [activeOsnapSnap, setActiveOsnapSnap] = useState<OsnapSnapResult | null>(null);
  const [activeBuildingDragSnap, setActiveBuildingDragSnap] = useState<BuildingDragSnapResult | null>(null);
  const [activeRotateAngleSnap, setActiveRotateAngleSnap] = useState<{ angleDeg: number; isCardinal?: boolean; label?: string } | null>(null);
  const [hoveredRotateVertexIndex, setHoveredRotateVertexIndex] = useState<number | null>(null);

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
    originPoint?: Point2D;
    targetPoint?: Point2D;
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

  // Znormalizowany bufor linii Ax + By + C = 0 dla wszystkich widocznych obiektów
  const lineBuffer = useMemo<CachedLineEquation[]>(() => {
    const map = buildLineBufferFromBuildings(buildings, layerSettings);
    return flattenLineBuffer(map);
  }, [buildings, layerSettings]);




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

  const handleCycleVertexSelection = useCallback((direction: 'prev' | 'next') => {
    if (!selectedBuildingId) return;
    const selBldg = buildings.find((b) => b.id === selectedBuildingId);
    if (!selBldg || !selBldg.vertices || selBldg.vertices.length === 0) return;
    const n = selBldg.vertices.length;
    setSelectedVertexIndex((prev) => {
      if (prev === null || prev === undefined) {
        return direction === 'next' ? 0 : n - 1;
      }
      return direction === 'next' ? (prev + 1) % n : (prev - 1 + n) % n;
    });
  }, [selectedBuildingId, buildings]);

  const handleStepRotateBuilding = useCallback(
    (direction: 'cw' | 'ccw') => {
      if (!selectedBuildingId || !effectivePivot) return;
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      if (!selBldg) return;

      if (isDirectionSnappingActive) {
        // Zbuduj unikalną, posortowaną listę celów kątowych w [0, 360)
        const rawAngles: number[] = [0, 90, 180, 270];

        // Kąty widoku
        const viewRot = viewRotationDeg || 0;
        if (Math.abs(viewRot) > 0.05) {
          const baseView = (-viewRot + 3600) % 360;
          for (let k = 0; k < 4; k++) {
            rawAngles.push((baseView + k * 90) % 360);
          }
        }

        // Kąty dominant statystycznych
        if (dominantDirections && dominantDirections.length > 0) {
          const dom0 = (dominantDirections[0].angleDeg + 3600) % 360;
          for (let k = 0; k < 4; k++) {
            rawAngles.push((dom0 + k * 90) % 360);
          }
        }

        // Deduplikacja w tolerancji 1.0°
        const sorted = Array.from(new Set(rawAngles.map((a) => (a + 3600) % 360))).sort((a, b) => a - b);
        const uniqueTargets: number[] = [];
        for (const a of sorted) {
          if (!uniqueTargets.some((u) => Math.abs(u - a) < 1.0 || Math.abs(Math.abs(u - a) - 360) < 1.0)) {
            uniqueTargets.push(a);
          }
        }
        uniqueTargets.sort((a, b) => a - b);

        // Aktualny kąt obiektu
        const currRot = ((rotAngleDeg % 360) + 360) % 360;

        let targetAngle: number;
        if (direction === 'cw') {
          const next = uniqueTargets.find((a) => a > currRot + 0.5);
          targetAngle = next !== undefined ? next : uniqueTargets[0] + 360;
        } else {
          const prev = [...uniqueTargets].reverse().find((a) => a < currRot - 0.5);
          targetAngle = prev !== undefined ? prev : uniqueTargets[uniqueTargets.length - 1] - 360;
        }

        let deltaDeg = targetAngle - currRot;
        while (deltaDeg > 180) deltaDeg -= 360;
        while (deltaDeg < -180) deltaDeg += 360;

        const deltaRad = (deltaDeg * Math.PI) / 180;
        onBuildingRotate?.(selectedBuildingId, effectivePivot, deltaRad);
        setRotAngleDeg((prev) => prev + deltaDeg);
      } else {
        const stepDeg = direction === 'cw' ? 5 : -5;
        const deltaRad = (stepDeg * Math.PI) / 180;
        onBuildingRotate?.(selectedBuildingId, effectivePivot, deltaRad);
        setRotAngleDeg((prev) => prev + stepDeg);
      }
    },
    [
      selectedBuildingId,
      effectivePivot,
      buildings,
      isDirectionSnappingActive,
      viewRotationDeg,
      dominantDirections,
      rotAngleDeg,
      onBuildingRotate,
    ]
  );

  // Hotkeys hook
  useCadHotkeys({
    drawingMode,
    drawingVertices,
    hoveredBuildings,
    selectedVertexIndex,
    onDeleteSelectedVertex: handleDeleteSelectedVertex,
    onCycleVertexSelection: handleCycleVertexSelection,
    onStepRotateBuilding: handleStepRotateBuilding,
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
    onToggleOsnap,
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
    setEditingEdgeLength(null);
  }, [drawingMode]);

  useEffect(() => {
    setCustomPivot(null);
    setEditingEdgeLength(null);
  }, [selectedBuildingId]);

  useEffect(() => {
    setEditingEdgeLength(null);
  }, [isDimensionMode, facadePointMode, isLinkingMode]);

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

  // Obliczenia cienia live (synchroniczne) podczas przeciągania obiektów
  const liveShadowResult = useMemo(() => {
    if (!showShadowRange || !isInteracting) return null;
    return computeHourlyShadowsLive(buildings, latitude, longitude, equinoxDate, 0.5, sunlightMethod);
  }, [showShadowRange, isInteracting, buildings, latitude, longitude, equinoxDate, sunlightMethod]);

  // Cienie godzinowe / kroki cienia: podczas ruchu live (krok 0.5h), po zatrzymaniu z workera (krok 0.25h)
  const hourlyShadowsToRender = useMemo(() => {
    if (!showShadowRange) return [];
    if (isInteracting && liveShadowResult) {
      return liveShadowResult.hourlyShadows;
    }
    return shadowAnalysis?.hourlyShadows ?? [];
  }, [showShadowRange, isInteracting, liveShadowResult, shadowAnalysis]);

  // Obwiednia maksymalna (envelope): generowana bezpośrednio z sumy obrysów live podczas ruchu oraz z workera po zatrzymaniu
  const shadowRangeLoopsToRender = useMemo(() => {
    if (!showShadowRange) return [];
    if (isInteracting && liveShadowResult) {
      return liveShadowResult.envelopeLoops;
    }
    return shadowRangeLoops;
  }, [showShadowRange, isInteracting, liveShadowResult, shadowRangeLoops]);


  const effectiveIsInteracting = Boolean(
    isInteracting ||
    isPanning ||
    isDraggingBuilding ||
    isDraggingPivot ||
    isRotating ||
    draggedVertexIndex !== null ||
    draggingEdge !== null ||
    draggingFacadePoint !== null ||
    draggingPinnedPointId !== null
  );

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
  }, [propPinnedPointResults, pinnedPoints, buildings, selectedPointResult]);

  // 1. Base Render Loop (Siatka, Wstęgi, Budynki, Cienie, Wymiary) - ciężka geometria przerysowywana tylko przy zmianie sceny lub widoku
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
      isInteracting: effectiveIsInteracting,
    };

    // 0. Podkład satelitarny Google Maps (ABSOLUTNIE NA SAMYM SPODZIE)
    // Rygorystyczna zasada: gdy showSatelliteLayer === false, nie wywołujemy renderera
    // ani nie odpytujemy API (zero zapytań HTTP/transferu danych).
    if (showSatelliteLayer && tileManagerRef.current) {
      // Wyczyść tło płótna przed nałożeniem kafelków
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      renderSatelliteMap({
        rc: renderContext,
        tileManager: tileManagerRef.current,
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
      facadePointMode,
      drawingMode === 'vertexEdit',
      drawingMode === 'rotate',
      selectedBuildingIds
    );

    // 5. Playground Sunlight Analysis Visualization (§ 33.3) - podłączone pod przełącznik Analizy 56
    if (showSunlightLines) {
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
    const pointsToVisualize = (pinnedPointResults && pinnedPointResults.length > 0)
      ? pinnedPointResults
      : (selectedPointResult ? [selectedPointResult] : []);

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
  }, [
    buildings,
    selectedBuildingId,
    selectedBuildingIds,
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
    dimHoveredEdge,
    viewState,
    canvasDimensions,
    drawingMode,
    editingEdgeLength,
    hoveredEdgeLengthBadge,
    pinnedPointResults,
    activePinnedPointId,
    liveFacadeSnap,
    facadePointMode,
    isLinkingMode,
    linkingSourceId,
    isEditMode,
    viewRotationMode,
    viewRotationDeg,
    rotationHover,
    analysisResults,
    layerSettings,
    shadowRangeLoops,
    shadowRangeLoopsToRender,
    hourlyShadowsToRender,
    shadowAnalysis,
    showShadowFill,
    isInteracting,
    worldToScreen,
    screenToWorld,
    visibleBuildings,
    showSatelliteLayer,
    satelliteOpacity,
    tileRenderTick,
    crsInfo,
  ]);

  // 2. Overlay Render Loop (Kursor, OSNAP, OTRACK, Rubberband, Narzędzia Rysowania) - natychmiastowe 60/120 FPS
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

    ctx.clearRect(0, 0, width, height);

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
      isInteracting: effectiveIsInteracting,
    };

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
          hoveredRotateVertexIndex,
          activeRotateAngleSnap,
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
      draggedVertexIndex,
      activeDirectionSnap,
      selectedVertexIndex,
      activeOsnapSnap,
      activeBuildingDragSnap,
      sweepWidth,
      sweepAlignment
    );
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
    activeDirectionSnap,
    selectedVertexIndex,
    activeOsnapSnap,
    activeBuildingDragSnap,
    sweepWidth,
    sweepAlignment,
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

      const isCreatingShape = ['rectangle', 'polyline', 'sweep', 'rotate', 'union'].includes(drawingMode);

      // Check click on Vertices and Edge Midpoints [+] of Selected Building
      if (selectedBuildingId && !isCreatingShape) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg) {
          const isSweep = Array.isArray(selBldg.sweepPath) && selBldg.sweepPath.length >= 2;
          const verts = isSweep ? selBldg.sweepPath! : selBldg.vertices;

          if (verts && (isSweep ? verts.length >= 2 : verts.length >= 3)) {
            // Check existing vertices (click selects and begins drag)
            for (let i = 0; i < verts.length; i++) {
              const s = worldToScreen(verts[i].x, verts[i].y);
              if (Math.hypot(sx - s.sx, sy - s.sy) <= 12) {
                setDraggedVertexIndex(i);
                setSelectedVertexIndex(i);
                onInteractionChange?.(true);
                return;
              }
            }
            // Check edge midpoint [+] to insert new vertex
            const numMidpoints = isSweep ? verts.length - 1 : verts.length;
            for (let i = 0; i < numMidpoints; i++) {
              const v1 = verts[i];
              const v2 = isSweep ? verts[i + 1] : verts[(i + 1) % verts.length];
              const sm = worldToScreen((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
              if (Math.hypot(sx - sm.sx, sy - sm.sy) <= 10) {
                const newPts = [...verts];
                const newPt = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
                newPts.splice(i + 1, 0, newPt);
                if (isSweep) {
                  onUpdateBuildingSweepPath?.(selBldg.id, newPts);
                } else {
                  onUpdateBuildingVertices?.(selBldg.id, newPts);
                }
                setDraggedVertexIndex(i + 1);
                setSelectedVertexIndex(i + 1);
                onInteractionChange?.(true);
                return;
              }
            }
          }
        }
      }

      // Check click on Edge Length Badges of Selected Building
      if (selectedBuildingId && !isCreatingShape) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg && selBldg.segments) {
          for (let eIdx = 0; eIdx < selBldg.segments.length; eIdx++) {
            const seg = selBldg.segments[eIdx];
            const midX = (seg.p1.x + seg.p2.x) / 2;
            const midY = (seg.p1.y + seg.p2.y) / 2;
            const normX = seg.normal?.x ?? 0;
            const normY = seg.normal?.y ?? 0;
            const sm = worldToScreen(midX, midY);
            const sn = worldToScreen(midX + normX, midY + normY);
            let screenNormX = sn.sx - sm.sx;
            let screenNormY = sn.sy - sm.sy;
            const screenNormLen = Math.hypot(screenNormX, screenNormY);
            if (screenNormLen > 1e-4) {
              screenNormX /= screenNormLen;
              screenNormY /= screenNormLen;
            } else {
              screenNormX = 0;
              screenNormY = -1;
            }
            const s1 = worldToScreen(seg.p1.x, seg.p1.y);
            const s2 = worldToScreen(seg.p2.x, seg.p2.y);
            const edgeScreenLen = Math.hypot(s2.sx - s1.sx, s2.sy - s1.sy);
            const offsetPx = Math.max(8, Math.min(18, edgeScreenLen * 0.15 + 6));
            const badgeSx = sm.sx + screenNormX * offsetPx;
            const badgeSy = sm.sy + screenNormY * offsetPx;
            const len = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
            if (Math.hypot(sx - badgeSx, sy - badgeSy) <= 20 || (Math.abs(sx - badgeSx) <= 25 && Math.abs(sy - badgeSy) <= 14)) {
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

      // If active edge editing is in progress and we clicked outside an edge badge, cancel edge length editing
      if (editingEdgeLength) {
        setEditingEdgeLength(null);
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

      if (drawingMode === 'rotate' && selectedBuildingId && effectivePivot) {
        const pS = worldToScreen(effectivePivot.x, effectivePivot.y);
        // If clicked directly on pivot handle -> drag pivot
        if (Math.hypot(sx - pS.sx, sy - pS.sy) <= 14) {
          setIsDraggingPivot(true);
          onInteractionChange?.(true);
          return;
        }

        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        let startAngleWorld = Math.atan2(world.wy - effectivePivot.y, world.wx - effectivePivot.x);
        let startAngleScreen = Math.atan2(sy - pS.sy, sx - pS.sx);

        // If clicked directly on a vertex grip -> anchor rotation at that vertex
        if (selBldg && hoveredRotateVertexIndex !== null && selBldg.vertices[hoveredRotateVertexIndex]) {
          const v = selBldg.vertices[hoveredRotateVertexIndex];
          startAngleWorld = Math.atan2(v.y - effectivePivot.y, v.x - effectivePivot.x);
          const vs = worldToScreen(v.x, v.y);
          startAngleScreen = Math.atan2(vs.sy - pS.sy, vs.sx - pS.sx);
        }

        setIsRotating(true);
        setLastMouseAngleWorld(startAngleWorld);
        setRotStartAngleScreen(startAngleScreen);
        setRotAngleDeg(0);
        setActiveRotateAngleSnap(null);
        onInteractionChange?.(true);
        return;
      }

      if (drawingMode === 'union') {
        const clickedBuildingId = hoveredBuildingId || (hoveredBuildings.length > 0 ? hoveredBuildings[0] : null);
        if (clickedBuildingId) {
          if (!selectedBuildingId) {
            onSelectBuilding(clickedBuildingId);
          } else if (selectedBuildingId !== clickedBuildingId) {
            onBooleanUnion?.(selectedBuildingId, clickedBuildingId);
          }
        }
        return;
      }


      if (drawingMode === 'rectangle') {
        const effectiveWorldPt = activeOsnapSnap?.snappedPoint || activeDirectionSnap?.snappedPoint || { x: world.wx, y: world.wy };
        if (drawingVertices.length === 0) {
          setDrawingVertices([effectiveWorldPt]);
        } else {
          const p1 = drawingVertices[0];
          const p2 = effectiveWorldPt;

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

          if (Math.abs(w) >= 0.1 && Math.abs(h) >= 0.1) {
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
          setActiveDirectionSnap(null);
          setActiveOsnapSnap(null);
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
            setActiveDirectionSnap(null);
            setActiveOsnapSnap(null);
            return;
          }
        }
        const effectiveWorldPt = activeOsnapSnap?.snappedPoint || activeDirectionSnap?.snappedPoint || { x: world.wx, y: world.wy };
        setDrawingVertices((prev) => [...prev, effectiveWorldPt]);
        return;
      }

      if (drawingMode === 'sweep') {
        const effectiveWorldPt = activeOsnapSnap?.snappedPoint || activeDirectionSnap?.snappedPoint || { x: world.wx, y: world.wy };
        if (drawingVertices.length >= 2) {
          const lastPt = drawingVertices[drawingVertices.length - 1];
          const lastScreen = worldToScreen(lastPt.x, lastPt.y);
          const clickScreen = worldToScreen(world.wx, world.wy);
          // Kliknięcie w pobliżu ostatniego wierzchołka kończy rysowanie otwartej wstęgi
          if (Math.hypot(clickScreen.sx - lastScreen.sx, clickScreen.sy - lastScreen.sy) <= 12 || Math.hypot(world.wx - lastPt.x, world.wy - lastPt.y) <= 0.3) {
            onFinishDrawing?.(drawingVertices, 'sweep');
            setDrawingVertices([]);
            setCurrentMouseWorld(null);
            setActiveDirectionSnap(null);
            setActiveOsnapSnap(null);
            return;
          }
        }
        setDrawingVertices((prev) => [...prev, effectiveWorldPt]);
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

      if ((isEditMode || selectedBuildingId) && hoveredEdge) {
        setDraggingEdge(hoveredEdge);
        setDragStart({ x: world.wx, y: world.wy });
        onInteractionChange?.(true);
        return;
      }

      // 0. Sprawdzenie kliknięcia bezpośrednio w etykietę/kartę obiektu (otwiera edycję w sidebarze)
      const hitLabelBldgId = getBuildingLabelHitAtPoint(
        sx,
        sy,
        buildings,
        worldToScreen,
        viewState.scale,
        layerSettings
      );
      if (hitLabelBldgId) {
        onSelectBuilding(hitLabelBldgId, e.shiftKey);
        useUiStore.getState().setSidebarOpen(true);
        useUiStore.getState().setOpenSidebarGroup('layers');

        const clickedBldg = buildings.find((b) => b.id === hitLabelBldgId);
        const lyr = clickedBldg?.layer || 'Domyślna (0)';
        const isLocked = layerSettings[lyr]?.isLocked === true;
        if (!isLocked) {
          setIsDraggingBuilding(true);
          setDragStart({ x: world.wx, y: world.wy });
          onInteractionChange?.(true);
        }
        return;
      }

      const hits = getHoverCandidates({ x: world.wx, y: world.wy });
      if (hits.length > 0) {
        const nextId = hits[hoveredBuildingIndex % hits.length];
        onSelectBuilding(nextId, e.shiftKey);

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
            const origin = u < 0.5 ? seg.p1 : seg.p2;
            const target = u < 0.5 ? seg.p2 : seg.p1;
            const segVec = { dx: target.x - origin.x, dy: target.y - origin.y };
            const angleDeg = (Math.atan2(segVec.dy, segVec.dx) * 180) / Math.PI;
            closest = {
              buildingId: bldg.id,
              segmentId: seg.id,
              angleDeg,
              previewDeg: -angleDeg,
              ratio: u,
              point: { x: px, y: py },
              originPoint: origin,
              targetPoint: target,
            };
          }
        }
      }
      setRotationHover(closest);
    }

    // Wykrywanie wskazanego/najbliższego budynku do kursora
    let hoveredBldgId: string | undefined;
    let minBldgDistPx = 45;
    for (const bldg of buildings) {
      if (bldg.isIncluded === false || !Array.isArray(bldg.vertices)) continue;
      for (const v of bldg.vertices) {
        const sv = worldToScreen(v.x, v.y);
        const d = Math.hypot(sx - sv.sx, sy - sv.sy);
        if (d < minBldgDistPx) {
          minBldgDistPx = d;
          hoveredBldgId = bldg.id;
        }
      }
    }



    const isCreatingShape = ['rectangle', 'polyline', 'sweep', 'rotate', 'union'].includes(drawingMode);
    if (selectedBuildingId && !isCreatingShape) {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      if (selBldg) {
        const isSweep = Array.isArray(selBldg.sweepPath) && selBldg.sweepPath.length >= 2;
        const verts = isSweep ? selBldg.sweepPath! : selBldg.vertices;

        if (verts && (isSweep ? verts.length >= 2 : verts.length >= 3)) {
          if (draggedVertexIndex !== null) {
            let targetPt: Point2D = { x: world.wx, y: world.wy };
            let osnap: OsnapSnapResult | null = null;

            if (isOsnapActive) {
              osnap = evaluateOsnapSnapWithCoordinator(snapCoordinatorRef.current, {
                mouseWorld: targetPt,
                lineBuffer,
                worldToScreen,
                screenSnapThresholdPx: APP_CONFIG.osnap?.snapRadiusPx || 14,
                excludeBuildingId: selBldg.id,
                previousSnapResult: activeOsnapSnap,
                hoveredBuildingId: hoveredBldgId === selBldg.id ? undefined : hoveredBldgId,
              });
            }

            if (osnap) {
              targetPt = osnap.snappedPoint;
              setActiveOsnapSnap(osnap);
              setActiveDirectionSnap(null);
            } else {
              setActiveOsnapSnap(null);
              // Dla Wstęgi nie generujemy kierunków śledzenia podczas profilowania węzłów osi
              if (isDirectionSnappingActive && !isSweep) {
                const n = verts.length;
                const prevIdx = (draggedVertexIndex - 1 + n) % n;
                const nextIdx = (draggedVertexIndex + 1) % n;

                const prevV = prevIdx >= 0 && prevIdx < n ? verts[prevIdx] : null;
                const nextV = nextIdx >= 0 && nextIdx < n ? verts[nextIdx] : null;

                const snapPrev = prevV
                  ? calculateDirectionSnap({
                      currentMouseWorld: targetPt,
                      originPoint: prevV,
                      buildings,
                      dominantDirections,
                      polylineVertices: [prevV],
                      worldToScreen,
                      hoveredBuildingId: hoveredBldgId === selBldg.id ? undefined : hoveredBldgId,
                      excludeBuildingId: selBldg.id,
                    })
                  : null;

                const snapNext = nextV
                  ? calculateDirectionSnap({
                      currentMouseWorld: targetPt,
                      originPoint: nextV,
                      buildings,
                      dominantDirections,
                      polylineVertices: [nextV],
                      worldToScreen,
                      hoveredBuildingId: hoveredBldgId === selBldg.id ? undefined : hoveredBldgId,
                      excludeBuildingId: selBldg.id,
                    })
                  : null;

                let chosenSnap: import('../utils/directionSnapping').DirectionSnapResult | null = null;
                if (snapPrev && snapNext) {
                  chosenSnap = snapPrev.diffAngleDeg <= snapNext.diffAngleDeg ? snapPrev : snapNext;
                } else {
                  chosenSnap = snapPrev || snapNext || null;
                }

                if (chosenSnap) {
                  targetPt = chosenSnap.snappedPoint;
                  setActiveDirectionSnap(chosenSnap);
                } else {
                  setActiveDirectionSnap(null);
                }
              } else {
                setActiveDirectionSnap(null);
              }
            }

            if (e.ctrlKey || e.metaKey) {
              targetPt = {
                x: Math.round(targetPt.x * 10) / 10,
                y: Math.round(targetPt.y * 10) / 10,
              };
            }

            setCurrentMouseWorld(targetPt);

            const updatedVerts = verts.map((v, idx) =>
              idx === draggedVertexIndex ? targetPt : v
            );

            if (isSweep) {
              onUpdateBuildingSweepPath?.(selBldg.id, updatedVerts);
            } else {
              onUpdateBuildingVertices?.(selBldg.id, updatedVerts);
            }
            return;
          }

          // Check hover
          let foundV: number | null = null;
          let foundM: number | null = null;

          for (let i = 0; i < verts.length; i++) {
            const s = worldToScreen(verts[i].x, verts[i].y);
            if (Math.hypot(sx - s.sx, sy - s.sy) <= 12) {
              foundV = i;
              break;
            }
          }

          if (foundV === null) {
            const numMidpoints = isSweep ? verts.length - 1 : verts.length;
            for (let i = 0; i < numMidpoints; i++) {
              const v1 = verts[i];
              const v2 = isSweep ? verts[i + 1] : verts[(i + 1) % verts.length];
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
      }
    } else {
      if (hoveredVertexIndex !== null) setHoveredVertexIndex(null);
      if (hoveredMidpointIndex !== null) setHoveredMidpointIndex(null);
    }

    if (drawingMode === 'rotate' && selectedBuildingId && effectivePivot) {
      const pS = worldToScreen(effectivePivot.x, effectivePivot.y);
      const isPivot = Math.hypot(sx - pS.sx, sy - pS.sy) <= 14;
      setIsPivotHovered(isPivot);

      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      let foundRotateV: number | null = null;
      if (selBldg && selBldg.vertices && !isRotating && !isDraggingPivot) {
        for (let i = 0; i < selBldg.vertices.length; i++) {
          const vs = worldToScreen(selBldg.vertices[i].x, selBldg.vertices[i].y);
          if (Math.hypot(sx - vs.sx, sy - vs.sy) <= 10) {
            foundRotateV = i;
            break;
          }
        }
      }
      setHoveredRotateVertexIndex(foundRotateV);

      if (isDraggingPivot) {
        let pivotPt: Point2D = { x: world.wx, y: world.wy };
        if (isOsnapActive) {
          const osnap = evaluateOsnapSnapWithCoordinator(snapCoordinatorRef.current, {
            mouseWorld: pivotPt,
            lineBuffer,
            worldToScreen,
            screenSnapThresholdPx: APP_CONFIG.osnap?.snapRadiusPx || 14,
            excludeBuildingId: undefined, // Pozwala przyciągać punkt obrotu do narożników samego obracanego budynku
            previousSnapResult: activeOsnapSnap,
          });
          if (osnap) {
            pivotPt = osnap.snappedPoint;
            setActiveOsnapSnap(osnap);
          } else {
            setActiveOsnapSnap(null);
          }
        }
        setCustomPivot(pivotPt);
        return;
      }

      if (isRotating && lastMouseAngleWorld !== null) {
        let currWorldPos: Point2D = { x: world.wx, y: world.wy };
        let osnapAngle: number | null = null;
        let snapInfo: { angleDeg: number; isCardinal?: boolean; label?: string } | null = null;

        if (isOsnapActive) {
          const osnap = evaluateOsnapSnapWithCoordinator(snapCoordinatorRef.current, {
            mouseWorld: currWorldPos,
            lineBuffer,
            worldToScreen,
            screenSnapThresholdPx: APP_CONFIG.osnap?.snapRadiusPx || 14,
            excludeBuildingId: selectedBuildingId,
            previousSnapResult: activeOsnapSnap,
          });
          if (osnap) {
            currWorldPos = osnap.snappedPoint;
            setActiveOsnapSnap(osnap);
            osnapAngle = Math.atan2(currWorldPos.y - effectivePivot.y, currWorldPos.x - effectivePivot.x);
          } else {
            setActiveOsnapSnap(null);
          }
        }

        let currAngleWorld = osnapAngle ?? Math.atan2(world.wy - effectivePivot.y, world.wx - effectivePivot.x);

        if (isDirectionSnappingActive && osnapAngle === null) {
          const tentativeDeltaDeg = ((currAngleWorld - lastMouseAngleWorld) * 180) / Math.PI;
          const tentativeTotalDeg = rotAngleDeg + tentativeDeltaDeg;
          
          // Zbuduj listę celów kardynalnych dla rotacji
          interface RotateTarget {
            targetTotalDeg: number;
            label: string;
            isCardinal: boolean;
            priority: number;
          }
          const targets: RotateTarget[] = [];

          // 1. Kardynalne projektu (Global Project Cardinal): 0°, 90°, 180°, 270°, -90°, -180°, -270°
          for (const k of [-270, -180, -90, 0, 90, 180, 270, 360]) {
            targets.push({
              targetTotalDeg: k,
              label: `📐 Projekt ${k >= 0 ? '+' : ''}${k}°`,
              isCardinal: true,
              priority: 1,
            });
          }

          // 2. Kardynalne widoku (Viewport View Cardinal): zorientowane z aktualnym obrotem widoku
          const viewRot = viewRotationDeg || 0;
          if (Math.abs(viewRot) > 0.05) {
            const baseView = -viewRot;
            for (let mult = -3; mult <= 3; mult++) {
              const ang = baseView + mult * 90;
              targets.push({
                targetTotalDeg: ang,
                label: `🖥️ Widok ${ang >= 0 ? '+' : ''}${ang.toFixed(1)}°`,
                isCardinal: true,
                priority: 2,
              });
            }
          }

          // 3. Dominujące kierunki statystyczne (Dominant Statistical Grid)
          if (dominantDirections && dominantDirections.length > 0) {
            const dom0 = dominantDirections[0].angleDeg;
            for (let mult = -3; mult <= 3; mult++) {
              const ang = dom0 + mult * 90;
              targets.push({
                targetTotalDeg: ang,
                label: `📊 Siatka ${ang >= 0 ? '+' : ''}${ang.toFixed(1)}°`,
                isCardinal: false,
                priority: 3,
              });
            }
          }

          // 4. Krok względny 90° od kąta bazowego
          const nearest90 = Math.round(tentativeTotalDeg / 90) * 90;
          targets.push({
            targetTotalDeg: nearest90,
            label: `🔄 ${nearest90 >= 0 ? '+' : ''}${nearest90}°`,
            isCardinal: true,
            priority: 4,
          });

          // Znajdź najbliższy cel w tolerancji 3.2°
          let bestTarget: RotateTarget | null = null;
          let bestScore = 999;

          for (const tgt of targets) {
            const diff = Math.abs(tentativeTotalDeg - tgt.targetTotalDeg);
            if (diff <= 3.2) {
              const score = diff + tgt.priority * 0.1;
              if (score < bestScore) {
                bestScore = score;
                bestTarget = tgt;
              }
            }
          }

          if (bestTarget) {
            const radCorrection = ((bestTarget.targetTotalDeg - rotAngleDeg) * Math.PI) / 180;
            currAngleWorld = lastMouseAngleWorld + radCorrection;
            snapInfo = {
              angleDeg: bestTarget.targetTotalDeg,
              isCardinal: bestTarget.isCardinal,
              label: bestTarget.label,
            };
          }
        }

        setActiveRotateAngleSnap(snapInfo);

        let delta = currAngleWorld - lastMouseAngleWorld;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;

        if (Math.abs(delta) > 1e-6) {
          onBuildingRotate?.(selectedBuildingId, effectivePivot, delta);
          setLastMouseAngleWorld(currAngleWorld);
          setRotAngleDeg((prev) => prev + (delta * 180) / Math.PI);
        }
        return;
      }
    } else {
      if (hoveredRotateVertexIndex !== null) setHoveredRotateVertexIndex(null);
      if (activeRotateAngleSnap !== null) setActiveRotateAngleSnap(null);
    }

    // Check Hover on Edge Length Badges of Selected Building (disabled in vertexEdit & rotate modes)
    if (selectedBuildingId && drawingMode !== 'vertexEdit' && drawingMode !== 'rotate') {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      let foundEdgeBadge: { buildingId: string; edgeIndex: number } | null = null;
      if (selBldg && selBldg.segments) {
        for (let eIdx = 0; eIdx < selBldg.segments.length; eIdx++) {
          const seg = selBldg.segments[eIdx];
          const midX = (seg.p1.x + seg.p2.x) / 2;
          const midY = (seg.p1.y + seg.p2.y) / 2;
          const normX = seg.normal?.x ?? 0;
          const normY = seg.normal?.y ?? 0;
          const sm = worldToScreen(midX, midY);
          const sn = worldToScreen(midX + normX, midY + normY);
          let screenNormX = sn.sx - sm.sx;
          let screenNormY = sn.sy - sm.sy;
          const screenNormLen = Math.hypot(screenNormX, screenNormY);
          if (screenNormLen > 1e-4) {
            screenNormX /= screenNormLen;
            screenNormY /= screenNormLen;
          } else {
            screenNormX = 0;
            screenNormY = -1;
          }
          const s1 = worldToScreen(seg.p1.x, seg.p1.y);
          const s2 = worldToScreen(seg.p2.x, seg.p2.y);
          const edgeScreenLen = Math.hypot(s2.sx - s1.sx, s2.sy - s1.sy);
          const offsetPx = Math.max(8, Math.min(18, edgeScreenLen * 0.15 + 6));
          const badgeSx = sm.sx + screenNormX * offsetPx;
          const badgeSy = sm.sy + screenNormY * offsetPx;
          if (Math.hypot(sx - badgeSx, sy - badgeSy) <= 20 || (Math.abs(sx - badgeSx) <= 25 && Math.abs(sy - badgeSy) <= 14)) {
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
      let mousePos: Point2D = { x: world.wx, y: world.wy };
      let osnap: OsnapSnapResult | null = null;

      if (isOsnapActive) {
        osnap = evaluateOsnapSnapWithCoordinator(snapCoordinatorRef.current, {
          mouseWorld: mousePos,
          lineBuffer,
          worldToScreen,
          screenSnapThresholdPx: APP_CONFIG.osnap?.snapRadiusPx || 14,
          previousSnapResult: activeOsnapSnap,
          hoveredBuildingId: hoveredBldgId,
          selectedBuildingId: selectedBuildingId ?? undefined,
        });
      }

      if (osnap) {
        mousePos = osnap.snappedPoint;
        setActiveOsnapSnap(osnap);
        setActiveDirectionSnap(null);
      } else {
        setActiveOsnapSnap(null);
        if (isDirectionSnappingActive) {
          let origin: Point2D | null = null;
          if (drawingMode === 'rectangle' && drawingVertices.length === 1) {
            origin = drawingVertices[0];
          } else if ((drawingMode === 'polyline' || drawingMode === 'sweep') && drawingVertices.length > 0) {
            origin = drawingVertices[drawingVertices.length - 1];
          }

          if (origin) {
            const snap = calculateDirectionSnap({
              currentMouseWorld: mousePos,
              originPoint: origin,
              buildings,
              dominantDirections,
              polylineVertices: (drawingMode === 'polyline' || drawingMode === 'sweep') ? drawingVertices : [],
              worldToScreen,
              hoveredBuildingId: hoveredBldgId,
              selectedBuildingId: selectedBuildingId ?? undefined,
            });
            if (snap) {
              mousePos = snap.snappedPoint;
              setActiveDirectionSnap(snap);
            } else {
              setActiveDirectionSnap(null);
            }
          } else {
            setActiveDirectionSnap(null);
          }
        } else {
          setActiveDirectionSnap(null);
        }
      }

      setCurrentMouseWorld(mousePos);
    } else {
      if (activeDirectionSnap) setActiveDirectionSnap(null);
      if (activeOsnapSnap) setActiveOsnapSnap(null);
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

      // Snapping candidate calculation (prioritize hovered building, ignore 'boundary' category)
      let searchBuildings = hoveredBuildingId ? [buildings.find((b) => b.id === hoveredBuildingId)].filter(Boolean) : [];
      if (searchBuildings.length === 0 || !searchBuildings[0] || searchBuildings[0].category === 'boundary') {
        searchBuildings = buildings.filter((b) => {
          if (b.category === 'boundary') return false;
          const lyr = b.layer || 'Domyślna (0)';
          return layerSettings[lyr]?.isVisible !== false && layerSettings[lyr]?.isGhosted !== true;
        });
      }
      let bestSnap: { point: Point2D; buildingId: string; segmentId: string; ratio: number } | null = null;
      let minSnapDist = 999999;
      for (const bldg of searchBuildings) {
        if (!bldg || bldg.category === 'boundary' || !Array.isArray(bldg.segments)) continue;

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

    if (selectedBuildingId && !isCreatingShape) {
      const bldg = buildings.find((b) => b.id === selectedBuildingId);
      const lyr = bldg?.layer || 'Domyślna (0)';
      const isLocked = layerSettings[lyr]?.isLocked === true;

      if (bldg && !isLocked) {
        const isSweep = Array.isArray(bldg.sweepPath) && bldg.sweepPath.length >= 2;
        const pts = isSweep ? bldg.sweepPath! : bldg.vertices;
        const numEdges = isSweep ? pts.length - 1 : pts.length;

        if (pts && numEdges > 0) {
          let closestEdgeIdx: number | null = null;
          let minEdgeDist = 1.0;
          for (let i = 0; i < numEdges; i++) {
            const p1 = pts[i];
            const p2 = isSweep ? pts[i + 1] : pts[(i + 1) % pts.length];
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
    } else {
      if (hoveredEdge) setHoveredEdge(null);
    }

    if (!dragStart) return;

    if (draggingEdge) {
      let dwx = world.wx - dragStart.x;
      let dwy = world.wy - dragStart.y;
      if (e.ctrlKey || e.metaKey) {
        dwx = Math.round(dwx * 10) / 10;
        dwy = Math.round(dwy * 10) / 10;
      }
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
    } else if (isDraggingBuilding && (selectedBuildingId || selectedBuildingIds.length > 0)) {
      let dwx = world.wx - dragStart.x;
      let dwy = world.wy - dragStart.y;

      if (e.ctrlKey || e.metaKey) {
        dwx = Math.round(dwx * 10) / 10;
        dwy = Math.round(dwy * 10) / 10;
      }

      const primaryId = selectedBuildingId || selectedBuildingIds[0];

      if (isOsnapActive && primaryId && !(e.ctrlKey || e.metaKey)) {
        const movingBldg = buildings.find((b) => b.id === primaryId);
        if (movingBldg && movingBldg.vertices && movingBldg.vertices.length >= 2) {
          const tentVerts = movingBldg.vertices.map((v) => ({ x: v.x + dwx, y: v.y + dwy }));
          const dragSnap = evaluateBuildingDragMultiSnap({
            movingVertices: tentVerts,
            movingBuildingId: primaryId,
            referenceBuffer: lineBuffer,
            distanceThresholdMeters: APP_CONFIG.osnap.collinearDistanceToleranceMeters,
            angleToleranceRad: (APP_CONFIG.osnap.parallelAngleToleranceDeg * Math.PI) / 180,
          });

          if (dragSnap) {
            dwx += dragSnap.deltaX;
            dwy += dragSnap.deltaY;
            setActiveBuildingDragSnap(dragSnap);
          } else {
            setActiveBuildingDragSnap(null);
          }
        }
      } else {
        if (activeBuildingDragSnap) setActiveBuildingDragSnap(null);
      }

      if (selectedBuildingIds.length > 1 && onBuildingsMove) {
        onBuildingsMove(selectedBuildingIds, dwx, dwy);
      } else if (primaryId) {
        onBuildingMove(primaryId, dwx, dwy);
      }
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
    if (activeDirectionSnap) {
      setActiveDirectionSnap(null);
    }
    if (activeOsnapSnap) {
      setActiveOsnapSnap(null);
    }
    if (activeBuildingDragSnap) {
      setActiveBuildingDragSnap(null);
    }
    setActiveRotateAngleSnap(null);
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
    const isCreatingShape = ['rectangle', 'polyline', 'sweep', 'rotate', 'union'].includes(drawingMode);
    if (selectedBuildingId && !isCreatingShape) {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      if (selBldg) {
        const isSweep = Array.isArray(selBldg.sweepPath) && selBldg.sweepPath.length >= 2;
        const verts = isSweep ? selBldg.sweepPath! : selBldg.vertices;
        const minCount = isSweep ? 2 : 3;

        if (verts && verts.length > minCount) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          for (let i = 0; i < verts.length; i++) {
            const s = worldToScreen(verts[i].x, verts[i].y);
            if (Math.hypot(sx - s.sx, sy - s.sy) <= 12) {
              e.preventDefault();
              const filtered = verts.filter((_, idx) => idx !== i);
              if (isSweep) {
                onUpdateBuildingSweepPath?.(selBldg.id, filtered);
              } else {
                onUpdateBuildingVertices?.(selBldg.id, filtered);
              }
              setSelectedVertexIndex(null);
              setHoveredVertexIndex(null);
              setHoveredMidpointIndex(null);
              return;
            }
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
              : (hoveredVertexIndex !== null || draggedVertexIndex !== null)
              ? 'move'
              : hoveredMidpointIndex !== null
              ? 'copy'
              : drawingMode === 'rotate'
              ? isDraggingPivot || isPivotHovered
                ? 'move'
                : isRotating
                ? 'grabbing'
                : 'grab'
              : drawingMode !== 'none' && drawingMode !== 'vertexEdit'
              ? 'crosshair'
              : draggingEdge
              ? 'move'
              : hoveredEdge
              ? 'move'
              : hoveredBuildingId
              ? 'pointer'
              : isPanning || isDraggingBuilding
              ? 'grabbing'
              : 'grab',
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
