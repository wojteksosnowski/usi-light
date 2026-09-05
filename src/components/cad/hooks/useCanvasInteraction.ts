import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Point2D, BuildingLoop, CadLayerSettings, DimensionItem, DimensionReference, DimensionType } from '../../../types/geometry';
import { isPointInPolygon, adjustEdgeLength, calculateOutwardNormal, isPolygonCCW, normalizeAngle180, angleDiff180 } from '@/utils/math2d';
import { useUiStore } from '../../../store/useUiStore';
import {
  calculateDirectionSnap,
  DirectionSnapResult,
} from '../../../engine/snapping';
import {
  CachedLineEquation,
  buildLineBufferFromBuildings,
  flattenLineBuffer,
} from '../../../utils/lineBufferEngine';
import {
  OsnapSnapResult,
  BuildingDragSnapResult,
  EdgeDragSnapResult,
  SnapCoordinator,
  evaluateOsnapSnapWithCoordinator,
  evaluateBuildingDragMultiSnap,
  evaluateEdgeDragSnap,
} from '../../../engine/snapping';
import { APP_CONFIG } from '../../../config/appConfig';
import { CadCanvasProps, ViewportState } from '../types';
import { EditingEdgeLengthState, getBuildingLabelHitAtPoint } from '../renderers/buildingsRenderer';

export function isBuildingLocked(
  bldg: { layer?: string; isLocked?: boolean } | null | undefined,
  layerSettings: Record<string, { isLocked?: boolean }> = {}
): boolean {
  if (!bldg) return false;
  if (bldg.isLocked === true) return true;
  const lyr = bldg.layer || 'Domyślna (0)';
  return layerSettings[lyr]?.isLocked === true;
}

export function getBuildingTopElevation(bldg: { category?: string; elevation?: number; defaultHeight?: number; storyPolygons?: any[] }): number {
  if (bldg.category === 'boundary') return -999999;
  const base = bldg.elevation ?? 0;
  const height = bldg.defaultHeight ?? 0;
  let maxStoryHeight = 0;
  if (Array.isArray(bldg.storyPolygons)) {
    for (const st of bldg.storyPolygons) {
      if (st.hTop && st.hTop > maxStoryHeight) maxStoryHeight = st.hTop;
    }
  }
  return base + Math.max(height, maxStoryHeight);
}

interface DragVertexContext {
  buildingId: string;
  vertexIndex: number;
  initialVertices: Point2D[];
  currentTargetPt?: Point2D;
  isSweep: boolean;
  incidentAxes: {
    origin: Point2D;
    angleDeg: number;
    label: string;
  }[];
}

function computeIncidentAxes(
  verts: Point2D[],
  vertexIndex: number,
  isSweep: boolean
): { origin: Point2D; angleDeg: number; label: string }[] {
  const n = verts.length;
  const axes: { origin: Point2D; angleDeg: number; label: string }[] = [];
  const curr = verts[vertexIndex];
  if (!curr) return axes;

  if (isSweep) {
    if (vertexIndex > 0) {
      const prev = verts[vertexIndex - 1];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (Math.hypot(dx, dy) >= 0.05) {
        axes.push({
          origin: prev,
          angleDeg: normalizeAngle180((Math.atan2(dy, dx) * 180) / Math.PI),
          label: 'Krawędź dochodząca (Przedłużenie)',
        });
      }
    }
    if (vertexIndex < n - 1) {
      const next = verts[vertexIndex + 1];
      const dx = curr.x - next.x;
      const dy = curr.y - next.y;
      if (Math.hypot(dx, dy) >= 0.05) {
        axes.push({
          origin: next,
          angleDeg: normalizeAngle180((Math.atan2(dy, dx) * 180) / Math.PI),
          label: 'Krawędź wychodząca (Przedłużenie)',
        });
      }
    }
  } else if (n >= 3) {
    const prev = verts[(vertexIndex - 1 + n) % n];
    const next = verts[(vertexIndex + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    if (Math.hypot(dx1, dy1) >= 0.05) {
      axes.push({
        origin: prev,
        angleDeg: normalizeAngle180((Math.atan2(dy1, dx1) * 180) / Math.PI),
        label: 'Krawędź przyległa (Poprzednia)',
      });
    }

    const dx2 = curr.x - next.x;
    const dy2 = curr.y - next.y;
    if (Math.hypot(dx2, dy2) >= 0.05) {
      axes.push({
        origin: next,
        angleDeg: normalizeAngle180((Math.atan2(dy2, dx2) * 180) / Math.PI),
        label: 'Krawędź przyległa (Kolejna)',
      });
    }
  }
  return axes;
}

export interface UseCanvasInteractionParams extends CadCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewState: ViewportState;
  setViewState: React.Dispatch<React.SetStateAction<ViewportState>>;
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  screenToWorld: (sx: number, sy: number) => { wx: number; wy: number };
}

export function useCanvasInteraction({
  containerRef,
  canvasRef,
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
  viewState,
  setViewState,
  worldToScreen,
  screenToWorld,
}: UseCanvasInteractionParams) {
  // Drawing state
  const [drawingVertices, setDrawingVertices] = useState<Point2D[]>([]);
  const [currentMouseWorld, setCurrentMouseWorld] = useState<Point2D | null>(null);
  const [activeDirectionSnap, setActiveDirectionSnap] = useState<DirectionSnapResult | null>(null);

  // Advanced OSNAP & OTRACK state
  const snapCoordinatorRef = useRef<SnapCoordinator>(new SnapCoordinator());
  const [activeOsnapSnap, setActiveOsnapSnap] = useState<OsnapSnapResult | null>(null);
  const [activeBuildingDragSnap, setActiveBuildingDragSnap] = useState<BuildingDragSnapResult | EdgeDragSnapResult | null>(null);
  const [activeRotateAngleSnap, setActiveRotateAngleSnap] = useState<{ angleDeg: number; isCardinal?: boolean; label?: string } | null>(null);
  const [hoveredRotateVertexIndex, setHoveredRotateVertexIndex] = useState<number | null>(null);

  // Vertex edit state
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState<number | null>(null);
  const [hoveredMidpointIndex, setHoveredMidpointIndex] = useState<number | null>(null);
  const [draggedVertexIndex, setDraggedVertexIndex] = useState<number | null>(null);
  const [dragVertexPreviewPt, setDragVertexPreviewPt] = useState<Point2D | null>(null);
  const dragVertexContextRef = useRef<DragVertexContext | null>(null);

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

  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingBuilding, setIsDraggingBuilding] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

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
        const rawAngles: number[] = [0, 90, 180, 270];

        const viewRot = viewRotationDeg || 0;
        if (Math.abs(viewRot) > 0.05) {
          const baseView = (-viewRot + 3600) % 360;
          for (let k = 0; k < 4; k++) {
            rawAngles.push((baseView + k * 90) % 360);
          }
        }

        if (dominantDirections && dominantDirections.length > 0) {
          const dom0 = (dominantDirections[0].angleDeg + 3600) % 360;
          for (let k = 0; k < 4; k++) {
            rawAngles.push((dom0 + k * 90) % 360);
          }
        }

        const sorted = Array.from(new Set(rawAngles.map((a) => (a + 3600) % 360))).sort((a, b) => a - b);
        const uniqueTargets: number[] = [];
        for (const a of sorted) {
          if (!uniqueTargets.some((u) => Math.abs(u - a) < 1.0 || Math.abs(Math.abs(u - a) - 360) < 1.0)) {
            uniqueTargets.push(a);
          }
        }
        uniqueTargets.sort((a, b) => a - b);

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
    setHoveredEdge(null);
    setDraggingEdge(null);
  }, [drawingMode]);

  useEffect(() => {
    setCustomPivot(null);
    setEditingEdgeLength(null);
    setHoveredEdge(null);
    setDraggingEdge(null);
    setHoveredEdgeLengthBadge(null);
  }, [selectedBuildingId]);

  useEffect(() => {
    setEditingEdgeLength(null);
    setHoveredEdge(null);
    setDraggingEdge(null);
  }, [isDimensionMode, facadePointMode, isLinkingMode]);

  useEffect(() => {
    if (!viewRotationMode) setRotationHover(null);
  }, [viewRotationMode]);

  useEffect(() => {
    setHoveredBuildingIndex(0);
  }, [hoveredBuildings]);

  const getHoverCandidates = useCallback(
    (world: Point2D) => {
      const sorted = [...buildings].sort((a, b) => {
        const topA = getBuildingTopElevation(a);
        const topB = getBuildingTopElevation(b);
        return topB - topA;
      });

      const hits: string[] = [];
      for (const bldg of sorted) {
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

      const currentPinnedResults = propPinnedPointResults && propPinnedPointResults.length > 0
        ? propPinnedPointResults
        : pinnedPoints.map((pt, idx) => {
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
                buildingId: pt.buildingId,
                segmentId: pt.segmentId,
                label: pt.label || `P${idx + 1}`,
              };
            }
            return null;
          }).filter(Boolean);

      if (currentPinnedResults && currentPinnedResults.length > 0) {
        for (const ptRes of currentPinnedResults as any[]) {
          const sm = worldToScreen(ptRes.point.x, ptRes.point.y);
          if (Math.hypot(sx - sm.sx, sy - sm.sy) <= 15) {
            onSelectPinnedPoint?.(ptRes.id);
            onSelectPointResult?.(ptRes);
            if (facadePointMode) {
              setDraggingPinnedPointId(ptRes.id);
              onInteractionChange?.(true);
            }
            return;
          }
        }
      }

      if (selectedBuildingId && !isCreatingShape && !facadePointMode) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg && !isBuildingLocked(selBldg, layerSettings)) {
          const isSweep = Array.isArray(selBldg.sweepPath) && selBldg.sweepPath.length >= 2;
          const verts = isSweep ? selBldg.sweepPath! : selBldg.vertices;

          if (verts && (isSweep ? verts.length >= 2 : verts.length >= 3)) {
            for (let i = 0; i < verts.length; i++) {
              const s = worldToScreen(verts[i].x, verts[i].y);
              if (Math.hypot(sx - s.sx, sy - s.sy) <= 12) {
                setDraggedVertexIndex(i);
                setSelectedVertexIndex(i);
                setDragVertexPreviewPt(verts[i]);
                dragVertexContextRef.current = {
                  buildingId: selBldg.id,
                  vertexIndex: i,
                  initialVertices: [...verts],
                  currentTargetPt: { ...verts[i] },
                  isSweep,
                  incidentAxes: computeIncidentAxes(verts, i, isSweep),
                };
                onInteractionChange?.(true);
                return;
              }
            }
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
                setDragVertexPreviewPt(newPt);
                dragVertexContextRef.current = {
                  buildingId: selBldg.id,
                  vertexIndex: i + 1,
                  initialVertices: newPts,
                  currentTargetPt: newPt,
                  isSweep,
                  incidentAxes: computeIncidentAxes(newPts, i + 1, isSweep),
                };
                onInteractionChange?.(true);
                return;
              }
            }
          }
        }
      }

      if (selectedBuildingId && !isCreatingShape && !facadePointMode) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg && !isBuildingLocked(selBldg, layerSettings) && selBldg.segments) {
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

      if (editingEdgeLength) {
        setEditingEdgeLength(null);
      }

      if (isDimensionMode) {
        if (dimHoveredEdge) {
          onDimensionClickEdge?.(dimHoveredEdge.buildingId, dimHoveredEdge.segmentId);
        }
        return;
      }

      if (drawingMode === 'rotate' && selectedBuildingId && effectivePivot) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg && isBuildingLocked(selBldg, layerSettings)) {
          return;
        }

        const pS = worldToScreen(effectivePivot.x, effectivePivot.y);
        if (Math.hypot(sx - pS.sx, sy - pS.sy) <= 14) {
          setIsDraggingPivot(true);
          onInteractionChange?.(true);
          return;
        }

        let startAngleWorld = Math.atan2(world.wy - effectivePivot.y, world.wx - effectivePivot.x);
        let startAngleScreen = Math.atan2(sy - pS.sy, sx - pS.sx);

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

      if (!facadePointMode && (isEditMode || selectedBuildingId) && hoveredEdge) {
        const edgeBldg = buildings.find((b) => b.id === hoveredEdge.buildingId);
        if (edgeBldg && !isBuildingLocked(edgeBldg, layerSettings)) {
          setDraggingEdge(hoveredEdge);
          setDragStart({ x: world.wx, y: world.wy });
          onInteractionChange?.(true);
          return;
        }
      }

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
        const isLocked = isBuildingLocked(clickedBldg, layerSettings);
        if (!isLocked && !facadePointMode) {
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
        const isLocked = isBuildingLocked(clickedBldg, layerSettings);

        if (!isLocked && !facadePointMode) {
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
    if (selectedBuildingId && !isCreatingShape && !facadePointMode) {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      if (selBldg && !isBuildingLocked(selBldg, layerSettings)) {
        const isSweep = Array.isArray(selBldg.sweepPath) && selBldg.sweepPath.length >= 2;
        const dragCtx = dragVertexContextRef.current;
        const baseVerts =
          dragCtx && dragCtx.buildingId === selBldg.id
            ? dragCtx.initialVertices
            : (isSweep ? selBldg.sweepPath! : selBldg.vertices);

        if (baseVerts && (isSweep ? baseVerts.length >= 2 : baseVerts.length >= 3)) {
          if (draggedVertexIndex !== null) {
            let targetPt: Point2D = { x: world.wx, y: world.wy };
            let osnap: OsnapSnapResult | null = null;
            let dirSnap: DirectionSnapResult | null = null;

            const incidentAxes =
              dragCtx && dragCtx.incidentAxes.length > 0
                ? dragCtx.incidentAxes
                : computeIncidentAxes(baseVerts, draggedVertexIndex, isSweep);

            if (e.shiftKey && incidentAxes.length > 0) {
              let bestAxis = incidentAxes[0];
              let bestProjPt: Point2D = { x: world.wx, y: world.wy };
              let bestAxisDist = 999999;

              for (const axis of incidentAxes) {
                const rad = (axis.angleDeg * Math.PI) / 180;
                const cosA = Math.cos(rad);
                const sinA = Math.sin(rad);
                const dx = world.wx - axis.origin.x;
                const dy = world.wy - axis.origin.y;
                const projDist = dx * cosA + dy * sinA;
                const projPt: Point2D = {
                  x: axis.origin.x + projDist * cosA,
                  y: axis.origin.y + projDist * sinA,
                };

                const sMouse = worldToScreen(world.wx, world.wy);
                const sProj = worldToScreen(projPt.x, projPt.y);
                const screenDist = Math.hypot(sMouse.sx - sProj.sx, sMouse.sy - sProj.sy);
                if (screenDist < bestAxisDist) {
                  bestAxisDist = screenDist;
                  bestAxis = axis;
                  bestProjPt = projPt;
                }
              }

              targetPt = bestProjPt;

              if (isDirectionSnappingActive) {
                const candSnap = calculateDirectionSnap({
                  currentMouseWorld: { x: world.wx, y: world.wy },
                  originPoint: bestAxis.origin,
                  buildings,
                  dominantDirections,
                  polylineVertices: [],
                  staticReferenceSegments: [],
                  worldToScreen,
                  hoveredBuildingId: hoveredBldgId === selBldg.id ? undefined : hoveredBldgId,
                  excludeBuildingId: selBldg.id,
                });

                if (candSnap && candSnap.relationType === 'guide_intersection') {
                  const intAngleDiff = angleDiff180(candSnap.guideAngleDeg, bestAxis.angleDeg);
                  if (intAngleDiff <= 1.0) {
                    targetPt = candSnap.snappedPoint;
                    dirSnap = candSnap;
                  }
                }
              }

              if (!dirSnap) {
                const guideHalfLength = APP_CONFIG.directionSnapping.guideLineLengthMeters;
                const rad = (bestAxis.angleDeg * Math.PI) / 180;
                const cosA = Math.cos(rad);
                const sinA = Math.sin(rad);
                const distFromOrigin = Math.hypot(targetPt.x - bestAxis.origin.x, targetPt.y - bestAxis.origin.y);
                dirSnap = {
                  snappedPoint: targetPt,
                  originPoint: bestAxis.origin,
                  guideAngleDeg: bestAxis.angleDeg,
                  relationType: 'parallel',
                  isStatistical: false,
                  guideLine: {
                    p1: { x: bestAxis.origin.x - guideHalfLength * cosA, y: bestAxis.origin.y - guideHalfLength * sinA },
                    p2: { x: bestAxis.origin.x + guideHalfLength * cosA, y: bestAxis.origin.y + guideHalfLength * sinA },
                  },
                  distanceFromOrigin: distFromOrigin,
                  diffAngleDeg: 0,
                  sourceLabel: `${bestAxis.label} (SHIFT)`,
                };
              }

              setActiveDirectionSnap(dirSnap);
              setActiveOsnapSnap(null);
            } else {
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

              const n = baseVerts.length;
              let prevV: Point2D | null = null;
              let nextV: Point2D | null = null;
              const staticSegments: { p1: Point2D; p2: Point2D; label?: string; buildingId?: string; edgeIndex?: number }[] = [];

              if (isSweep) {
                if (draggedVertexIndex > 0) prevV = baseVerts[draggedVertexIndex - 1];
                if (draggedVertexIndex < n - 1) nextV = baseVerts[draggedVertexIndex + 1];

                for (let i = 0; i < n - 1; i++) {
                  if (i !== draggedVertexIndex - 1 && i !== draggedVertexIndex) {
                    staticSegments.push({
                      p1: baseVerts[i],
                      p2: baseVerts[i + 1],
                      label: `Odcinek ${i + 1} (Równoległy)`,
                      buildingId: selBldg.id,
                      edgeIndex: i,
                    });
                  }
                }
              } else {
                const prevIdx = (draggedVertexIndex - 1 + n) % n;
                const nextIdx = (draggedVertexIndex + 1) % n;
                prevV = baseVerts[prevIdx] || null;
                nextV = baseVerts[nextIdx] || null;

                const incomingIdx = (draggedVertexIndex - 1 + n) % n;
                const outgoingIdx = draggedVertexIndex;
                for (let i = 0; i < n; i++) {
                  if (i !== incomingIdx && i !== outgoingIdx) {
                    staticSegments.push({
                      p1: baseVerts[i],
                      p2: baseVerts[(i + 1) % n],
                      label: `Ściana ${i + 1} (Równoległy)`,
                      buildingId: selBldg.id,
                      edgeIndex: i,
                    });
                  }
                }
              }

              const primaryOrigin = prevV || nextV;
              const secondaryOrigins: Point2D[] = [];
              if (nextV && nextV !== primaryOrigin) secondaryOrigins.push(nextV);
              if (prevV && prevV !== primaryOrigin && !secondaryOrigins.includes(prevV)) secondaryOrigins.push(prevV);

              if (isDirectionSnappingActive && primaryOrigin && !(e.ctrlKey || e.metaKey)) {
                dirSnap = calculateDirectionSnap({
                  currentMouseWorld: targetPt,
                  originPoint: primaryOrigin,
                  secondaryOriginPoints: secondaryOrigins,
                  buildings,
                  dominantDirections,
                  polylineVertices: [],
                  staticReferenceSegments: staticSegments,
                  worldToScreen,
                  hoveredBuildingId: hoveredBldgId === selBldg.id ? undefined : hoveredBldgId,
                  excludeBuildingId: selBldg.id,
                });
              }

              if (osnap && (osnap.type === 'endpoint' || osnap.type === 'midpoint')) {
                targetPt = osnap.snappedPoint;
                setActiveOsnapSnap(osnap);
                setActiveDirectionSnap(null);
              } else if (dirSnap && dirSnap.relationType === 'guide_intersection') {
                targetPt = dirSnap.snappedPoint;
                setActiveDirectionSnap(dirSnap);
                setActiveOsnapSnap(null);
              } else if (dirSnap) {
                targetPt = dirSnap.snappedPoint;
                setActiveDirectionSnap(dirSnap);
                setActiveOsnapSnap(null);
              } else if (osnap) {
                targetPt = osnap.snappedPoint;
                setActiveOsnapSnap(osnap);
                setActiveDirectionSnap(null);
              } else {
                setActiveOsnapSnap(null);
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
            setDragVertexPreviewPt(targetPt);
            if (dragVertexContextRef.current) {
              dragVertexContextRef.current.currentTargetPt = targetPt;
              const dragCtx = dragVertexContextRef.current;
              const currVerts = dragCtx.initialVertices.map((v, idx) =>
                idx === dragCtx.vertexIndex ? targetPt : v
              );
              if (dragCtx.isSweep) {
                onUpdateBuildingSweepPath?.(dragCtx.buildingId, currVerts);
              } else {
                onUpdateBuildingVertices?.(dragCtx.buildingId, currVerts);
              }
            }
            return;
          }

          let foundV: number | null = null;
          let foundM: number | null = null;

          for (let i = 0; i < baseVerts.length; i++) {
            const s = worldToScreen(baseVerts[i].x, baseVerts[i].y);
            if (Math.hypot(sx - s.sx, sy - s.sy) <= 12) {
              foundV = i;
              break;
            }
          }

          if (foundV === null) {
            const numMidpoints = isSweep ? baseVerts.length - 1 : baseVerts.length;
            for (let i = 0; i < numMidpoints; i++) {
              const v1 = baseVerts[i];
              const v2 = isSweep ? baseVerts[i + 1] : baseVerts[(i + 1) % baseVerts.length];
              const sm = worldToScreen((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
              if (Math.hypot(sx - sm.sx, sy - sm.sy) <= 10) {
                foundM = i;
                break;
              }
            }
          }

          setHoveredVertexIndex(foundV);
          setHoveredMidpointIndex(foundM);
        } else {
          if (hoveredVertexIndex !== null) setHoveredVertexIndex(null);
          if (hoveredMidpointIndex !== null) setHoveredMidpointIndex(null);
        }
      } else {
        if (hoveredVertexIndex !== null) setHoveredVertexIndex(null);
        if (hoveredMidpointIndex !== null) setHoveredMidpointIndex(null);
      }
    } else {
      if (hoveredVertexIndex !== null) setHoveredVertexIndex(null);
      if (hoveredMidpointIndex !== null) setHoveredMidpointIndex(null);
    }

    if (drawingMode === 'rotate' && selectedBuildingId && effectivePivot) {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      const isBldgLocked = selBldg && isBuildingLocked(selBldg, layerSettings);

      if (!isBldgLocked) {
        const pS = worldToScreen(effectivePivot.x, effectivePivot.y);
        const isPivot = Math.hypot(sx - pS.sx, sy - pS.sy) <= 14;
        setIsPivotHovered(isPivot);

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
              excludeBuildingId: undefined,
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
            
            interface RotateTarget {
              targetTotalDeg: number;
              label: string;
              isCardinal: boolean;
              priority: number;
            }
            const targets: RotateTarget[] = [];

            for (const k of [-270, -180, -90, 0, 90, 180, 270, 360]) {
              targets.push({
                targetTotalDeg: k,
                label: `📐 Projekt ${k >= 0 ? '+' : ''}${k}°`,
                isCardinal: true,
                priority: 1,
              });
            }

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

            if (dominantDirections && dominantDirections.length > 0) {
              for (const dom of dominantDirections) {
                const domAngle = dom.angleDeg;
                for (const offset of [0, 90, 180, 270]) {
                  const targetA = domAngle + offset;
                  targets.push({
                    targetTotalDeg: targetA,
                    label: `🧭 Dominujący ${dom.angleDeg.toFixed(1)}° (${offset === 0 ? 'równoległy' : offset === 90 || offset === 270 ? 'prostopadły' : 'odwrócony'})`,
                    isCardinal: false,
                    priority: 3,
                  });
                }
              }
            }

            let bestTarget: RotateTarget | null = null;
            let minDiff: number = APP_CONFIG.directionSnapping.angleToleranceDeg || 2.5;

            for (const tgt of targets) {
              const diff = Math.abs(tentativeTotalDeg - tgt.targetTotalDeg);
              if (diff <= minDiff) {
                minDiff = diff;
                bestTarget = tgt;
              }
            }

            if (bestTarget) {
              const snappedDeltaDeg = bestTarget.targetTotalDeg - rotAngleDeg;
              const snappedAngleWorld = lastMouseAngleWorld + (snappedDeltaDeg * Math.PI) / 180;
              currAngleWorld = snappedAngleWorld;
              snapInfo = {
                angleDeg: bestTarget.targetTotalDeg,
                isCardinal: bestTarget.isCardinal,
                label: bestTarget.label,
              };
            }
          }

          setActiveRotateAngleSnap(snapInfo);

          const deltaAngleWorld = currAngleWorld - lastMouseAngleWorld;
          const deltaAngleDeg = (deltaAngleWorld * 180) / Math.PI;

          setRotAngleDeg((prev) => prev + deltaAngleDeg);
          setLastMouseAngleWorld(currAngleWorld);

          if (selectedBuildingId) {
            onBuildingRotate?.(selectedBuildingId, effectivePivot, deltaAngleWorld);
          }
          return;
        }
      } else {
        setIsPivotHovered(false);
        setHoveredRotateVertexIndex(null);
      }
    } else {
      if (isPivotHovered) setIsPivotHovered(false);
      if (hoveredRotateVertexIndex !== null) setHoveredRotateVertexIndex(null);
      if (activeRotateAngleSnap !== null) setActiveRotateAngleSnap(null);
    }

    if (selectedBuildingId && !facadePointMode && drawingMode !== 'vertexEdit' && drawingMode !== 'rotate') {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      let foundEdgeBadge: { buildingId: string; edgeIndex: number } | null = null;
      if (selBldg && !isBuildingLocked(selBldg, layerSettings) && selBldg.segments) {
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

      let dirSnap: DirectionSnapResult | null = null;
      if (isDirectionSnappingActive) {
        let origin: Point2D | null = null;
        if (drawingMode === 'rectangle' && drawingVertices.length === 1) {
          origin = drawingVertices[0];
        } else if ((drawingMode === 'polyline' || drawingMode === 'sweep') && drawingVertices.length > 0) {
          origin = drawingVertices[drawingVertices.length - 1];
        }

        if (origin) {
          const secondaryOrigins: Point2D[] = [];
          if (drawingVertices.length > 1) {
            secondaryOrigins.push(drawingVertices[0]);
            for (let vIdx = 1; vIdx < drawingVertices.length - 1; vIdx++) {
              secondaryOrigins.push(drawingVertices[vIdx]);
            }
          }

          dirSnap = calculateDirectionSnap({
            currentMouseWorld: mousePos,
            originPoint: origin,
            secondaryOriginPoints: secondaryOrigins,
            buildings,
            dominantDirections,
            polylineVertices: (drawingMode === 'polyline' || drawingMode === 'sweep') ? drawingVertices : [],
            worldToScreen,
            hoveredBuildingId: hoveredBldgId,
            selectedBuildingId: selectedBuildingId ?? undefined,
          });
        }
      }

      if (osnap && (osnap.type === 'endpoint' || osnap.type === 'midpoint')) {
        mousePos = osnap.snappedPoint;
        setActiveOsnapSnap(osnap);
        setActiveDirectionSnap(null);
      } else if (dirSnap && dirSnap.relationType === 'guide_intersection') {
        mousePos = dirSnap.snappedPoint;
        setActiveDirectionSnap(dirSnap);
        setActiveOsnapSnap(null);
      } else if (dirSnap) {
        mousePos = dirSnap.snappedPoint;
        setActiveDirectionSnap(dirSnap);
        setActiveOsnapSnap(null);
      } else if (osnap) {
        mousePos = osnap.snappedPoint;
        setActiveOsnapSnap(osnap);
        setActiveDirectionSnap(null);
      } else {
        setActiveOsnapSnap(null);
        setActiveDirectionSnap(null);
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

      let searchBuildings = hoveredBuildingId ? [buildings.find((b) => b.id === hoveredBuildingId)].filter(Boolean) : [];
      if (searchBuildings.length === 0 || !searchBuildings[0] || searchBuildings[0].category === 'boundary') {
        searchBuildings = buildings
          .filter((b) => {
            if (b.category === 'boundary') return false;
            const lyr = b.layer || 'Domyślna (0)';
            return layerSettings[lyr]?.isVisible !== false && layerSettings[lyr]?.isGhosted !== true;
          })
          .sort((a, b) => {
            const topA = getBuildingTopElevation(a);
            const topB = getBuildingTopElevation(b);
            return topB - topA;
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

    if (selectedBuildingId && !isCreatingShape && !facadePointMode) {
      const bldg = buildings.find((b) => b.id === selectedBuildingId);
      const isLocked = isBuildingLocked(bldg, layerSettings);

      if (bldg && !isLocked) {
        const isSweep = Array.isArray(bldg.sweepPath) && bldg.sweepPath.length >= 2;
        const pts = isSweep ? bldg.sweepPath! : bldg.vertices;
        const numEdges = isSweep ? pts.length - 1 : pts.length;

        if (pts && numEdges > 0) {
          let closestEdgeIdx: number | null = null;
          let minEdgeDistPx = 8.0;
          for (let i = 0; i < numEdges; i++) {
            const p1 = pts[i];
            const p2 = isSweep ? pts[i + 1] : pts[(i + 1) % pts.length];
            const s1 = worldToScreen(p1.x, p1.y);
            const s2 = worldToScreen(p2.x, p2.y);
            const dx = s2.sx - s1.sx;
            const dy = s2.sy - s1.sy;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-4) continue;
            const u = Math.max(0, Math.min(1, ((sx - s1.sx) * dx + (sy - s1.sy) * dy) / lenSq));
            const px = s1.sx + u * dx;
            const py = s1.sy + u * dy;
            const distPx = Math.hypot(sx - px, sy - py);
            if (distPx < minEdgeDistPx) {
              minEdgeDistPx = distPx;
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

      if (isOsnapActive && !(e.ctrlKey || e.metaKey)) {
        const bldg = buildings.find((b) => b.id === draggingEdge.buildingId);
        if (bldg) {
          const isSweep = Array.isArray(bldg.sweepPath) && bldg.sweepPath.length >= 2;
          const pts = isSweep ? bldg.sweepPath! : bldg.vertices;
          const numEdges = isSweep ? pts.length - 1 : pts.length;
          if (pts && draggingEdge.edgeIndex >= 0 && draggingEdge.edgeIndex < numEdges) {
            const p1 = pts[draggingEdge.edgeIndex];
            const p2 = isSweep ? pts[draggingEdge.edgeIndex + 1] : pts[(draggingEdge.edgeIndex + 1) % pts.length];
            const isCCW = isSweep ? true : isPolygonCCW(pts);
            const normal = calculateOutwardNormal(p1, p2, isCCW);

            const edgeSnap = evaluateEdgeDragSnap({
              edgeP1: p1,
              edgeP2: p2,
              normal,
              buildingId: bldg.id,
              edgeIndex: draggingEdge.edgeIndex,
              tentativeDelta: { dx: dwx, dy: dwy },
              referenceBuffer: lineBuffer,
              distanceThresholdMeters: APP_CONFIG.osnap.collinearDistanceToleranceMeters,
              angleToleranceRad: (APP_CONFIG.osnap.parallelAngleToleranceDeg * Math.PI) / 180,
            });

            if (edgeSnap) {
              dwx = edgeSnap.deltaOffset.dx;
              dwy = edgeSnap.deltaOffset.dy;
              setActiveBuildingDragSnap(edgeSnap);
            } else {
              setActiveBuildingDragSnap(null);
            }
          }
        }
      } else {
        if (activeBuildingDragSnap) setActiveBuildingDragSnap(null);
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

  const handleMouseUp = useCallback(() => {
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
    if (draggedVertexIndex !== null && dragVertexContextRef.current) {
      const dragCtx = dragVertexContextRef.current;
      const finalPt = dragCtx.currentTargetPt || dragVertexPreviewPt;
      if (finalPt) {
        const finalVerts = dragCtx.initialVertices.map((v, idx) =>
          idx === dragCtx.vertexIndex ? finalPt : v
        );
        if (dragCtx.isSweep) {
          onUpdateBuildingSweepPath?.(dragCtx.buildingId, finalVerts);
        } else {
          onUpdateBuildingVertices?.(dragCtx.buildingId, finalVerts);
        }
      }
    }
    setDragVertexPreviewPt(null);
    setDraggedVertexIndex(null);
    dragVertexContextRef.current = null;
    setIsDraggingPivot(false);
    setIsRotating(false);
    setLastMouseAngleWorld(null);
    setDragStart(null);
  }, [
    isDraggingBuilding,
    draggingEdge,
    draggingFacadePoint,
    draggingPinnedPointId,
    draggedVertexIndex,
    isDraggingPivot,
    isRotating,
    onInteractionChange,
    activeDirectionSnap,
    activeOsnapSnap,
    activeBuildingDragSnap,
    dragVertexPreviewPt,
    onUpdateBuildingSweepPath,
    onUpdateBuildingVertices,
  ]);

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
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getHoverCandidates, screenToWorld, containerRef, handleMouseUp]);

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const isCreatingShape = ['rectangle', 'polyline', 'sweep', 'rotate', 'union'].includes(drawingMode);
    if (selectedBuildingId && !isCreatingShape && !facadePointMode) {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      if (selBldg && !isBuildingLocked(selBldg, layerSettings)) {
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

  const cursorStyle = useMemo(() => {
    if (isDimensionMode) return 'crosshair';
    if (facadePointMode) {
      if (draggingPinnedPointId) return 'grabbing';
      if (liveFacadeSnap) return 'crosshair';
      return 'default';
    }
    if (hoveredVertexIndex !== null || draggedVertexIndex !== null) return 'move';
    if (hoveredMidpointIndex !== null) return 'copy';
    if (drawingMode === 'rotate') {
      if (isDraggingPivot || isPivotHovered) return 'move';
      if (isRotating) return 'grabbing';
      return 'grab';
    }
    if (drawingMode !== 'none' && drawingMode !== 'vertexEdit') return 'crosshair';
    if (draggingEdge) return 'move';
    if (hoveredEdge) return 'move';
    if (hoveredBuildingId) return 'pointer';
    if (isPanning || isDraggingBuilding) return 'grabbing';
    return 'grab';
  }, [
    isDimensionMode,
    facadePointMode,
    draggingPinnedPointId,
    liveFacadeSnap,
    hoveredVertexIndex,
    draggedVertexIndex,
    hoveredMidpointIndex,
    drawingMode,
    isDraggingPivot,
    isPivotHovered,
    isRotating,
    draggingEdge,
    hoveredEdge,
    hoveredBuildingId,
    isPanning,
    isDraggingBuilding,
  ]);

  return {
    drawingVertices,
    currentMouseWorld,
    activeDirectionSnap,
    activeOsnapSnap,
    activeBuildingDragSnap,
    activeRotateAngleSnap,
    hoveredRotateVertexIndex,
    selectedVertexIndex,
    hoveredVertexIndex,
    hoveredMidpointIndex,
    draggedVertexIndex,
    dragVertexPreviewPt,
    effectivePivot,
    isPivotHovered,
    isDraggingPivot,
    isRotating,
    rotStartAngleScreen,
    rotAngleDeg,
    editingEdgeLength,
    hoveredEdgeLengthBadge,
    hoveredEdge,
    draggingEdge,
    draggingFacadePoint,
    draggingPinnedPointId,
    liveFacadeSnap,
    hoveredBuildingId,
    hoveredBuildings,
    rotationHover,
    dimHoveredEdge,
    effectiveIsInteracting,
    cursorStyle,

    setDrawingVertices,
    setCurrentMouseWorld,
    setHoveredBuildingIndex,

    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleDeleteSelectedVertex,
    handleCycleVertexSelection,
    handleStepRotateBuilding,
    handleAdjustEdgeLengthStep,
    handleEdgeLengthInputChar,
    handleEdgeLengthBackspace,
    handleCommitEdgeLength,
    handleCancelEdgeLength,
  };
}
