import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Point2D, BuildingLoop, CadLayerSettings, DimensionItem, DimensionReference, DimensionType, DEFAULT_SWEEP_WIDTH } from '../../../types/geometry';
import { isPointInPolygon, adjustEdgeLength, calculateOutwardNormal, isPolygonCCW, normalizeAngle180, angleDiff180, getPolygonCentroid, getRotateHandleScreenPos, offsetPolygonEdge, offsetOpenPolylineEdge } from '@/utils/math2d';
import { isBuildingVariantActive } from '@/utils/geometrySelectors';
import { useUiStore } from '../../../store/useUiStore';
import { useCadToolStore } from '../../../store/useCadToolStore';
import { useSceneStore } from '../../../store/useSceneStore';
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
import { viewportWorldBounds } from '../masterplan/masterplanSpatial';
import { EditingEdgeLengthState, getBuildingLabelHitAtPoint, getLinkingActionHitAtPoint } from '../renderers/buildingsRenderer';
import { getMasterplanLabelHitAtPoint } from '../masterplan/masterplanLabels';

function getRotateHandleGeometry(
  selBldg: BuildingLoop,
  buildings: BuildingLoop[],
  openGroupId: string | null,
  effectivePivot: Point2D | null
) {
  const targetGroupId = selBldg.groupId;
  const isGroupOpen = !!targetGroupId && openGroupId === targetGroupId;
  const groupBldgs = targetGroupId && !isGroupOpen
    ? buildings.filter((b) => b.groupId === targetGroupId && isBuildingVariantActive(b))
    : [selBldg];
  const allGroupVertices = groupBldgs.flatMap((b) => b.vertices || []);
  const centroid = effectivePivot || getPolygonCentroid(selBldg.vertices);
  return { allGroupVertices, centroid };
}

function getLabelHitAtPoint(
  viewMode2D: string,
  sx: number,
  sy: number,
  buildings: BuildingLoop[],
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  scale: number,
  selectedBuildingId: string | null | undefined,
  selectedBuildingIds: string[] | null | undefined,
  hoveredBuildingId: string | null | undefined,
  layerSettings: Record<string, any>
): string | null {
  return viewMode2D === 'masterplan_white'
    ? getMasterplanLabelHitAtPoint(
        sx,
        sy,
        buildings,
        worldToScreen,
        scale,
        selectedBuildingId,
        selectedBuildingIds,
        hoveredBuildingId,
        layerSettings
      )
    : getBuildingLabelHitAtPoint(sx, sy, buildings, worldToScreen, scale, layerSettings);
}

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

interface DragEdgeContext {
  buildingId: string;
  edgeIndex: number;
  initialVertices: Point2D[];
  initialSweepPath?: Point2D[];
  initialMouseWorld: Point2D;
  edgeP1: Point2D;
  edgeP2: Point2D;
  normal: { x: number; y: number };
  isSweep: boolean;
  currentDelta?: { dx: number; dy: number };
}

export function getShiftOrthoSnap(
  origin: Point2D,
  currentMouse: Point2D,
  dominantDirections: { angleDeg: number; orthogonalDeg?: number }[] = []
): { snappedPoint: Point2D; dirSnap: DirectionSnapResult } {
  const dx = currentMouse.x - origin.x;
  const dy = currentMouse.y - origin.y;
  const rawAngleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;

  // Cardinal angles (0°, 90°, 180°, 270°)
  const candidateAngles: { angleDeg: number; label: string; isStatistical: boolean }[] = [
    { angleDeg: 0, label: 'Kardynalny X (0°)', isStatistical: false },
    { angleDeg: 90, label: 'Kardynalny Y (90°)', isStatistical: false },
    { angleDeg: 180, label: 'Kardynalny -X (180°)', isStatistical: false },
    { angleDeg: 270, label: 'Kardynalny -Y (270°)', isStatistical: false },
  ];

  if (dominantDirections && dominantDirections.length > 0) {
    const dom = dominantDirections[0];
    const a1 = ((dom.angleDeg % 360) + 360) % 360;
    const a2 = (a1 + 180) % 360;
    const ortho = dom.orthogonalDeg ?? (dom.angleDeg + 90);
    const o1 = ((ortho % 360) + 360) % 360;
    const o2 = (o1 + 180) % 360;

    candidateAngles.push(
      { angleDeg: a1, label: `Siatka główna (${dom.angleDeg.toFixed(1)}°)`, isStatistical: true },
      { angleDeg: a2, label: `Siatka główna (${dom.angleDeg.toFixed(1)}°)`, isStatistical: true },
      { angleDeg: o1, label: `Siatka poprzeczna (${ortho.toFixed(1)}°)`, isStatistical: true },
      { angleDeg: o2, label: `Siatka poprzeczna (${ortho.toFixed(1)}°)`, isStatistical: true }
    );
  }

  let bestAngle = candidateAngles[0];
  let minDiff = 360;

  for (const cand of candidateAngles) {
    let diff = Math.abs(cand.angleDeg - rawAngleDeg);
    if (diff > 180) diff = 360 - diff;
    if (diff < minDiff) {
      minDiff = diff;
      bestAngle = cand;
    }
  }

  const rad = (bestAngle.angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const projDist = dx * cosA + dy * sinA;
  const effectiveDist = Math.max(0, projDist);

  const snappedPoint: Point2D = {
    x: origin.x + effectiveDist * cosA,
    y: origin.y + effectiveDist * sinA,
  };

  const guideHalfLength = APP_CONFIG.directionSnapping.guideLineLengthMeters || 200;
  const dirSnap: DirectionSnapResult = {
    snappedPoint,
    originPoint: { x: origin.x, y: origin.y },
    guideAngleDeg: bestAngle.angleDeg,
    relationType: bestAngle.isStatistical ? 'dominant' : 'parallel',
    isStatistical: bestAngle.isStatistical,
    guideLine: {
      p1: { x: origin.x - guideHalfLength * cosA, y: origin.y - guideHalfLength * sinA },
      p2: { x: origin.x + guideHalfLength * cosA, y: origin.y + guideHalfLength * sinA },
    },
    distanceFromOrigin: effectiveDist,
    diffAngleDeg: minDiff,
    sourceLabel: `${bestAngle.label} [SHIFT]`,
  };

  return { snappedPoint, dirSnap };
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
  onLabelClick,
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
  onInteractionChange,
  isLinkingMode = false,
  linkingSourceId = null,
  drawingMode = 'none',
  onDrawingModeChange,
  sweepWidth = DEFAULT_SWEEP_WIDTH,
  sweepAlignment = 'center',
  onFinishDrawing,
  onCancelDrawing,
  onDrawingVerticesCountChange,
  onUpdateBuildingVertices,
  onUpdateBuildingSweepPath,
  onBuildingRotate,
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
  onAlignClickEdge,
  onDeleteDimension,
  isProjectBrushActive = false,
  onUpdateBuilding,
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
  viewMode2D = 'cad',
  viewState,
  setViewState,
  worldToScreen,
  screenToWorld,
}: UseCanvasInteractionParams) {
  const osnapModes = useCadToolStore((s) => s.osnapModes);
  const otrackModes = useCadToolStore((s) => s.otrackModes);
  const snapRadiusPx = useCadToolStore((s) => s.snapRadiusPx);

  // Drawing state
  const [drawingVertices, setDrawingVertices] = useState<Point2D[]>([]);
  const [currentMouseWorld, setCurrentMouseWorld] = useState<Point2D | null>(null);
  const [activeDirectionSnap, setActiveDirectionSnap] = useState<DirectionSnapResult | null>(null);

  // Advanced OSNAP & OTRACK state
  const snapCoordinatorRef = useRef<SnapCoordinator>(new SnapCoordinator());
  const [activeOsnapSnap, setActiveOsnapSnap] = useState<OsnapSnapResult | null>(null);
  const [activeBuildingDragSnap, setActiveBuildingDragSnap] = useState<BuildingDragSnapResult | EdgeDragSnapResult | null>(null);
  const [activeRotateAngleSnap, setActiveRotateAngleSnap] = useState<{ angleDeg: number; isCardinal?: boolean; label?: string } | null>(null);

  // Vertex edit state
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState<number | null>(null);
  const [hoveredMidpointIndex, setHoveredMidpointIndex] = useState<number | null>(null);
  const [draggedVertexIndex, setDraggedVertexIndex] = useState<number | null>(null);
  const [dragVertexPreviewPt, setDragVertexPreviewPt] = useState<Point2D | null>(null);
  const dragVertexContextRef = useRef<DragVertexContext | null>(null);
  const labelClickStartRef = useRef<{ buildingId: string; sx: number; sy: number } | null>(null);

  // Project brush state ('W projekcie')
  const brushStateRef = useRef<{
    isBrushing: boolean;
    startPos: { x: number; y: number } | null;
    brushedBuildingIds: Set<string>;
    initialClickedBuildingId: string | null;
  }>({ isBrushing: false, startPos: null, brushedBuildingIds: new Set(), initialClickedBuildingId: null });

  // Per-object rotate handle (shown on plain selection, drags the object around its own centroid)
  const [isRotateHandleHovered, setIsRotateHandleHovered] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [lastMouseAngleWorld, setLastMouseAngleWorld] = useState<number | null>(null);
  const [rotAngleDeg, setRotAngleDeg] = useState<number>(0);

  // Align tool (edge hover for two-click edge-to-edge alignment)
  const [alignHoveredEdge, setAlignHoveredEdge] = useState<{ buildingId: string; segmentId: string } | null>(null);

  // Edge length editing state
  const [editingEdgeLength, setEditingEdgeLength] = useState<EditingEdgeLengthState | null>(null);
  const [hoveredEdgeLengthBadge, setHoveredEdgeLengthBadge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);

  // Edge editing state (parallel offset)
  const [hoveredEdge, setHoveredEdge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);
  const dragEdgeContextRef = useRef<DragEdgeContext | null>(null);
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
  const [hoveredLabelBuildingId, setHoveredLabelBuildingId] = useState<string | null>(null);
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
  const [candidateIndex, setCandidateIndex] = useState(0);

  const handleCycleSnapCandidate = useCallback(() => {
    setCandidateIndex((prev) => prev + 1);
  }, []);

  const openGroupId = useSceneStore((s) => s.openGroupId);

  // Effective pivot for keyboard step-rotation (group centroid when closed, single building centroid when group is open)
  const effectivePivot = useMemo<Point2D | null>(() => {
    if (!selectedBuildingId) return null;
    const bldg = buildings.find((b) => b.id === selectedBuildingId);
    if (!bldg || bldg.vertices.length === 0) return null;

    const targetGroupId = bldg.groupId;
    const isGroupOpen = !!targetGroupId && openGroupId === targetGroupId;
    const groupBldgs = targetGroupId && !isGroupOpen
      ? buildings.filter((b) => b.groupId === targetGroupId && isBuildingVariantActive(b))
      : [bldg];
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
  }, [selectedBuildingId, buildings, openGroupId]);

  // Znormalizowany bufor linii Ax + By + C = 0 dla wszystkich widocznych warstwowo obiektów
  const lineBuffer = useMemo<CachedLineEquation[]>(() => {
    const map = buildLineBufferFromBuildings(buildings, layerSettings);
    return flattenLineBuffer(map);
  }, [buildings, layerSettings]);

  // Bufor linii Ax + By + C = 0 ograniczony do obiektów widocznych w aktualnym viewportcie (z 10% marginesem)
  const visibleLineBuffer = useMemo<CachedLineEquation[]>(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const width = canvas?.width ?? container?.clientWidth ?? 1000;
    const height = canvas?.height ?? container?.clientHeight ?? 800;

    const vp = viewportWorldBounds({ width, height, screenToWorld }, 0.1);

    return lineBuffer.filter((edge) => {
      const eMinX = Math.min(edge.p1.x, edge.p2.x);
      const eMaxX = Math.max(edge.p1.x, edge.p2.x);
      const eMinY = Math.min(edge.p1.y, edge.p2.y);
      const eMaxY = Math.max(edge.p1.y, edge.p2.y);
      return eMaxX >= vp.minX && eMinX <= vp.maxX && eMaxY >= vp.minY && eMinY <= vp.maxY;
    });
  }, [lineBuffer, screenToWorld, containerRef, canvasRef, viewState]);

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

  const handleAdjustObjectParam = useCallback(
    (direction: 'dec' | 'inc', isLargeStep?: boolean) => {
      const step = isLargeStep ? 1.0 : 0.5;
      const factor = direction === 'inc' ? 1 : -1;

      // 1. Jeśli zaznaczony jest budynek z wstęgą
      if (selectedBuildingId) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg && (selBldg.sweepPath || selBldg.sweepWidth !== undefined)) {
          const currentWidth = selBldg.sweepWidth ?? DEFAULT_SWEEP_WIDTH;
          const nextWidth = Math.max(0.5, Math.round((currentWidth + factor * step) * 10) / 10);
          onUpdateBuildingSweepPath?.(
            selectedBuildingId,
            selBldg.sweepPath || [],
            nextWidth,
            selBldg.sweepAlignment
          );
          useCadToolStore.getState().setSweepWidth(nextWidth);
          return;
        }
      }

      // 2. Globalny/aktywny parametr narzędzia Wstęga
      const currentToolWidth = useCadToolStore.getState().sweepWidth || DEFAULT_SWEEP_WIDTH;
      const nextToolWidth = Math.max(0.5, Math.round((currentToolWidth + factor * step) * 10) / 10);
      useCadToolStore.getState().setSweepWidth(nextToolWidth);
    },
    [selectedBuildingId, buildings, onUpdateBuildingSweepPath]
  );

  useEffect(() => {
    onDrawingVerticesCountChange?.(drawingVertices.length);
  }, [drawingVertices.length, onDrawingVerticesCountChange]);

  useEffect(() => {
    if (drawingMode === 'none') {
      setDrawingVertices([]);
      setCurrentMouseWorld(null);
    }
    if (drawingMode !== 'align') {
      setAlignHoveredEdge(null);
    }
    if (drawingMode !== 'vertexEdit') {
      setSelectedVertexIndex(null);
    }
    setEditingEdgeLength(null);
    setHoveredEdge(null);
    setDraggingEdge(null);
    dragEdgeContextRef.current = null;
  }, [drawingMode]);

  useEffect(() => {
    setEditingEdgeLength(null);
    setHoveredEdge(null);
    setDraggingEdge(null);
    dragEdgeContextRef.current = null;
    setHoveredEdgeLengthBadge(null);
  }, [selectedBuildingId]);

  useEffect(() => {
    setEditingEdgeLength(null);
    setHoveredEdge(null);
    setDraggingEdge(null);
    dragEdgeContextRef.current = null;
  }, [isDimensionMode, facadePointMode, isLinkingMode, isProjectBrushActive]);

  useEffect(() => {
    if (!isProjectBrushActive && brushStateRef.current.isBrushing) {
      brushStateRef.current.isBrushing = false;
      brushStateRef.current.initialClickedBuildingId = null;
      brushStateRef.current.brushedBuildingIds.clear();
      onInteractionChange?.(false);
    }
  }, [isProjectBrushActive, onInteractionChange]);

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
        if (!isBuildingVariantActive(bldg)) continue;
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
    isRotating ||
    draggedVertexIndex !== null ||
    draggingEdge !== null ||
    draggingFacadePoint !== null ||
    draggingPinnedPointId !== null
  );

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

      if (isProjectBrushActive) {
        const candidates = getHoverCandidates({ x: world.wx, y: world.wy });
        const hitBldgId = candidates.length > 0 ? candidates[0] : null;
        brushStateRef.current.isBrushing = true;
        brushStateRef.current.startPos = { x: sx, y: sy };
        brushStateRef.current.brushedBuildingIds.clear();
        brushStateRef.current.initialClickedBuildingId = hitBldgId;
        onInteractionChange?.(true);
        return;
      }


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

      if (selectedBuildingId && drawingMode === 'vertexEdit' && !facadePointMode) {
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

      if (selectedBuildingId && drawingMode === 'vertexEdit' && !facadePointMode) {
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

      if (drawingMode === 'align') {
        if (alignHoveredEdge && selectedBuildingId) {
          onAlignClickEdge?.(selectedBuildingId, alignHoveredEdge.buildingId, alignHoveredEdge.segmentId);
        }
        return;
      }

      // Per-object / group rotate handle: shown above a plainly-selected (non-editing) building or logical group.
      if (drawingMode === 'none' && selectedBuildingId && !facadePointMode) {
        const selBldg = buildings.find((b) => b.id === selectedBuildingId);
        if (selBldg && !isBuildingLocked(selBldg, layerSettings) && selBldg.vertices.length >= 3) {
          const targetGroupId = selBldg.groupId;
          const groupBldgs = targetGroupId
            ? buildings.filter((b) => b.groupId === targetGroupId && isBuildingVariantActive(b))
            : [selBldg];
          const allGroupVertices = groupBldgs.flatMap((b) => b.vertices || []);
          const centroid = effectivePivot || getPolygonCentroid(selBldg.vertices);
          const hS = getRotateHandleScreenPos(
            selBldg,
            worldToScreen,
            viewState.scale,
            viewRotationDeg,
            effectivePivot || undefined,
            allGroupVertices.length > 0 ? allGroupVertices : undefined
          );
          if (hS && Math.hypot(sx - hS.sx, sy - hS.sy) <= 10) {
            const startAngleWorld = Math.atan2(world.wy - centroid.y, world.wx - centroid.x);
            setIsRotating(true);
            setLastMouseAngleWorld(startAngleWorld);
            setRotAngleDeg(0);
            setActiveRotateAngleSnap(null);
            onInteractionChange?.(true);
            return;
          }
        }
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
          const isSweep = Array.isArray(edgeBldg.sweepPath) && edgeBldg.sweepPath.length >= 2;
          const pts = isSweep ? edgeBldg.sweepPath! : edgeBldg.vertices;
          const numEdges = isSweep ? pts.length - 1 : pts.length;
          if (pts && hoveredEdge.edgeIndex >= 0 && hoveredEdge.edgeIndex < numEdges) {
            const p1 = pts[hoveredEdge.edgeIndex];
            const p2 = isSweep ? pts[hoveredEdge.edgeIndex + 1] : pts[(hoveredEdge.edgeIndex + 1) % pts.length];
            const isCCW = isSweep ? true : isPolygonCCW(pts);
            const normal = calculateOutwardNormal(p1, p2, isCCW);

            dragEdgeContextRef.current = {
              buildingId: hoveredEdge.buildingId,
              edgeIndex: hoveredEdge.edgeIndex,
              initialVertices: edgeBldg.vertices.map((v) => ({ ...v })),
              initialSweepPath: edgeBldg.sweepPath ? edgeBldg.sweepPath.map((v) => ({ ...v })) : undefined,
              initialMouseWorld: { x: world.wx, y: world.wy },
              edgeP1: { ...p1 },
              edgeP2: { ...p2 },
              normal,
              isSweep,
            };

            setDraggingEdge(hoveredEdge);
            setDragStart({ x: world.wx, y: world.wy });
            onInteractionChange?.(true);
            return;
          }
        }
      }

      if (isLinkingMode && selectedBuildingId) {
        const linkHit = getLinkingActionHitAtPoint(
          sx,
          sy,
          buildings,
          worldToScreen,
          selectedBuildingId,
          layerSettings
        );
        if (linkHit) {
          if (linkHit.action === 'add') {
            useSceneStore.getState().performLinkBuildings(selectedBuildingId, linkHit.buildingId);
          } else {
            useSceneStore.getState().performUnlinkBuilding(linkHit.buildingId);
          }
          return;
        }
      }

      const hitLabelBldgId = getLabelHitAtPoint(
        viewMode2D,
        sx,
        sy,
        buildings,
        worldToScreen,
        viewState.scale,
        selectedBuildingId,
        selectedBuildingIds,
        hoveredBuildingId,
        layerSettings
      );
      if (hitLabelBldgId) {
        onSelectBuilding(hitLabelBldgId, e.shiftKey);
        labelClickStartRef.current = { buildingId: hitLabelBldgId, sx, sy };

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
        onLabelClick?.(null);

        const clickedBldg = buildings.find((b) => b.id === nextId);
        const isLocked = isBuildingLocked(clickedBldg, layerSettings);

        if (!isLocked && !facadePointMode) {
          setIsDraggingBuilding(true);
          setDragStart({ x: world.wx, y: world.wy });
          onInteractionChange?.(true);
        }
      } else {
        onSelectBuilding(null);
        onLabelClick?.(null);
        setIsPanning(true);
        setDragStart({ x: sx, y: sy });
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || facadePointMode || isDimensionMode || viewRotationMode || isProjectBrushActive) return;
    if (drawingMode !== 'none' && drawingMode !== 'vertexEdit') return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    const hits = getHoverCandidates({ x: world.wx, y: world.wy });
    const targetId = hits[0];
    if (!targetId) return;
    const selBldg = buildings.find((b) => b.id === targetId);
    if (!selBldg || isBuildingLocked(selBldg, layerSettings)) return;

    const currentOpenGroupId = useSceneStore.getState().openGroupId;

    // 1. Jeśli obiekt należy do grupy logicznej, a użytkownik nie jest jeszcze wewnątrz tej grupy:
    // wejście do wnętrza grupy (izolacja grupy i wybór klikniętego pojedynczego elementu)
    if (selBldg.groupId && currentOpenGroupId !== selBldg.groupId) {
      useSceneStore.getState().setOpenGroupId(selBldg.groupId);
      useSceneStore.getState().setSelectedBuildingId(targetId);
      return;
    }

    // 2. Jeśli użytkownik jest już wewnątrz grupy lub obiekt nie należy do żadnej grupy:
    // podwójne kliknięcie wprowadza dany obiekt w tryb edycji wierzchołków
    onSelectBuilding(targetId);
    onDrawingModeChange?.('vertexEdit');
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (isProjectBrushActive) {
      if (brushStateRef.current.isBrushing) {
        const dist = brushStateRef.current.startPos
          ? Math.hypot(sx - brushStateRef.current.startPos.x, sy - brushStateRef.current.startPos.y)
          : 0;
        if (dist > 3) {
          const candidates = getHoverCandidates({ x: world.wx, y: world.wy });
          if (
            brushStateRef.current.initialClickedBuildingId &&
            !brushStateRef.current.brushedBuildingIds.has(brushStateRef.current.initialClickedBuildingId)
          ) {
            brushStateRef.current.brushedBuildingIds.add(brushStateRef.current.initialClickedBuildingId);
            const initBldg = buildings.find((b) => b.id === brushStateRef.current.initialClickedBuildingId);
            if (initBldg && !initBldg.isTested) {
              onUpdateBuilding?.(initBldg.id, { isTested: true });
            }
          }
          for (const bldgId of candidates) {
            if (!brushStateRef.current.brushedBuildingIds.has(bldgId)) {
              brushStateRef.current.brushedBuildingIds.add(bldgId);
              const bldg = buildings.find((b) => b.id === bldgId);
              if (bldg && !bldg.isTested) {
                onUpdateBuilding?.(bldg.id, { isTested: true });
              }
            }
          }
        }
      }
      return;
    }

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

    const hitLabelId = getLabelHitAtPoint(
      viewMode2D,
      sx,
      sy,
      buildings,
      worldToScreen,
      viewState.scale,
      selectedBuildingId,
      selectedBuildingIds,
      hoveredBuildingId,
      layerSettings
    );
    setHoveredLabelBuildingId((prev) => (prev === hitLabelId ? prev : hitLabelId));

    let hoveredBldgId: string | undefined;
    let minBldgDistPx = 45;
    for (const bldg of buildings) {
      if (bldg.isIncluded === false || !Array.isArray(bldg.vertices)) continue;
      if (!isBuildingVariantActive(bldg)) continue;
      for (const v of bldg.vertices) {
        const sv = worldToScreen(v.x, v.y);
        const d = Math.hypot(sx - sv.sx, sy - sv.sy);
        if (d < minBldgDistPx) {
          minBldgDistPx = d;
          hoveredBldgId = bldg.id;
        }
      }
    }

    if (selectedBuildingId && drawingMode === 'vertexEdit' && !facadePointMode) {
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
              const isGroupOpen = !!selBldg.groupId && openGroupId === selBldg.groupId;
              const movingGroupBldgIds = selBldg.groupId && !isGroupOpen
                ? buildings.filter((b) => b.groupId === selBldg.groupId).map((b) => b.id)
                : [selBldg.id];

              if (isOsnapActive) {
                osnap = evaluateOsnapSnapWithCoordinator(snapCoordinatorRef.current, {
                  mouseWorld: targetPt,
                  lineBuffer: visibleLineBuffer,
                  worldToScreen,
                  screenSnapThresholdPx: snapRadiusPx,
                  excludeBuildingId: selBldg.id,
                  excludeBuildingIds: movingGroupBldgIds,
                  activeCategory: selBldg.category ?? 'building',
                  previousSnapResult: activeOsnapSnap,
                  hoveredBuildingId: hoveredBldgId === selBldg.id ? undefined : hoveredBldgId,
                  originPoint: (draggedVertexIndex > 0 && isSweep) ? baseVerts[draggedVertexIndex - 1] : (!isSweep && baseVerts.length > 0 ? baseVerts[(draggedVertexIndex - 1 + baseVerts.length) % baseVerts.length] : null),
                  candidateIndex,
                  activeSnapTypes: osnapModes,
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
                      label: `Segment ${i + 1} (Równoległy)`,
                      buildingId: selBldg.id,
                      edgeIndex: i,
                    });
                  }
                }
              } else {
                prevV = baseVerts[(draggedVertexIndex - 1 + n) % n];
                nextV = baseVerts[(draggedVertexIndex + 1) % n];
                const prevSegmentIdx = (draggedVertexIndex - 1 + n) % n;

                for (let i = 0; i < n; i++) {
                  if (i !== prevSegmentIdx && i !== draggedVertexIndex) {
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
                  excludeBuildingIds: movingGroupBldgIds,
                  activeCategory: selBldg.category ?? 'building',
                });
              }

              if (
                osnap &&
                (osnap.type === 'endpoint' ||
                  osnap.type === 'midpoint' ||
                  osnap.type === 'otrack_intersection' ||
                  osnap.type === 'perpendicular')
              ) {
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
              // Tani, natychmiastowy kanał (bez rebuildu segmentów/R-tree/analizy) zasilający
              // podgląd 3D na żywo podczas przeciągania - właściwy commit do useSceneStore
              // nadal następuje dopiero na mouseup (patrz handleMouseUp).
              useCadToolStore.getState().setLiveVertexPreview({
                buildingId: dragCtx.buildingId,
                vertexIndex: dragCtx.vertexIndex,
                point: targetPt,
              });
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

    if (drawingMode === 'none' && selectedBuildingId) {
      const selBldg = buildings.find((b) => b.id === selectedBuildingId);
      const isBldgLocked = selBldg && isBuildingLocked(selBldg, layerSettings);

      if (selBldg && !isBldgLocked && selBldg.vertices.length >= 3) {
        const { allGroupVertices, centroid } = getRotateHandleGeometry(selBldg, buildings, openGroupId, effectivePivot);
        const hS = getRotateHandleScreenPos(
          selBldg,
          worldToScreen,
          viewState.scale,
          viewRotationDeg,
          effectivePivot || undefined,
          allGroupVertices.length > 0 ? allGroupVertices : undefined
        );
        setIsRotateHandleHovered(!!hS && Math.hypot(sx - hS.sx, sy - hS.sy) <= 10);

        if (isRotating && lastMouseAngleWorld !== null) {
          let snapInfo: { angleDeg: number; isCardinal?: boolean; label?: string } | null = null;

          let currAngleWorld = Math.atan2(world.wy - centroid.y, world.wx - centroid.x);

          if (isDirectionSnappingActive) {
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

          onBuildingRotate?.(selectedBuildingId, centroid, deltaAngleWorld);
          return;
        }
      } else {
        setIsRotateHandleHovered(false);
      }
    } else {
      if (isRotateHandleHovered) setIsRotateHandleHovered(false);
      if (activeRotateAngleSnap !== null) setActiveRotateAngleSnap(null);
    }

    if (drawingMode === 'align' && selectedBuildingId) {
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
      setAlignHoveredEdge(closestSeg);
    } else {
      if (alignHoveredEdge) setAlignHoveredEdge(null);
    }

    if (selectedBuildingId && !facadePointMode && drawingMode !== 'vertexEdit' && drawingMode !== 'align') {
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

    if (drawingMode !== 'none' && drawingMode !== 'vertexEdit' && drawingMode !== 'align') {
      let mousePos: Point2D = { x: world.wx, y: world.wy };
      let osnap: OsnapSnapResult | null = null;
      let origin: Point2D | null = null;
      if (drawingMode === 'rectangle' && drawingVertices.length === 1) {
        origin = drawingVertices[0];
      } else if ((drawingMode === 'polyline' || drawingMode === 'sweep') && drawingVertices.length > 0) {
        origin = drawingVertices[drawingVertices.length - 1];
      }

      const drawingCategory = useCadToolStore.getState().drawingCategory ?? 'building';
      const activeCat = selectedBuildingId ? (buildings.find((b) => b.id === selectedBuildingId)?.category ?? drawingCategory) : drawingCategory;

      if (isOsnapActive) {
        osnap = evaluateOsnapSnapWithCoordinator(snapCoordinatorRef.current, {
          mouseWorld: mousePos,
          lineBuffer: visibleLineBuffer,
          worldToScreen,
          screenSnapThresholdPx: snapRadiusPx,
          previousSnapResult: activeOsnapSnap,
          hoveredBuildingId: hoveredBldgId,
          selectedBuildingId: selectedBuildingId ?? undefined,
          activeCategory: activeCat,
          originPoint: origin,
          candidateIndex,
          activeSnapTypes: osnapModes,
        });
      }

      let dirSnap: DirectionSnapResult | null = null;

      if (e.shiftKey && origin) {
        // Shift modifier forces CAD cardinal directions and dominant statistical angles
        const shiftRes = getShiftOrthoSnap(origin, mousePos, dominantDirections);
        mousePos = shiftRes.snappedPoint;
        dirSnap = shiftRes.dirSnap;
        setActiveDirectionSnap(dirSnap);
        setActiveOsnapSnap(null);
      } else {
        if (isDirectionSnappingActive && origin) {
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
            activeCategory: activeCat,
            otrackModes,
            screenSnapThresholdPx: snapRadiusPx * 1.4,
          });
        }

        if (
          osnap &&
          (osnap.type === 'endpoint' ||
            osnap.type === 'midpoint' ||
            osnap.type === 'otrack_intersection' ||
            osnap.type === 'perpendicular')
        ) {
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
            if (!isBuildingVariantActive(b)) return false;
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
        if (!isBuildingVariantActive(bldg)) continue;

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
        if (!isBuildingVariantActive(bldg)) continue;
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

    if (selectedBuildingId && drawingMode === 'vertexEdit' && !facadePointMode) {
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
      const dragCtx = dragEdgeContextRef.current;
      if (dragCtx) {
        let totalDx = world.wx - dragCtx.initialMouseWorld.x;
        let totalDy = world.wy - dragCtx.initialMouseWorld.y;

        if (e.ctrlKey || e.metaKey) {
          totalDx = Math.round(totalDx * 10) / 10;
          totalDy = Math.round(totalDy * 10) / 10;
        }

        let effectiveDx = totalDx;
        let effectiveDy = totalDy;

        if (isOsnapActive && !(e.ctrlKey || e.metaKey)) {
          const s0 = worldToScreen(world.wx, world.wy);
          const s1 = worldToScreen(world.wx + 1, world.wy);
          const pxPerMeter = Math.hypot(s1.sx - s0.sx, s1.sy - s0.sy) || 20;
          const distToleranceMeters = Math.max(0.1, snapRadiusPx / pxPerMeter);
          const edgeBldg = buildings.find((b) => b.id === dragCtx.buildingId);
          const edgeGroupBldgIds = edgeBldg?.groupId
            ? buildings.filter((b) => b.groupId === edgeBldg.groupId).map((b) => b.id)
            : [dragCtx.buildingId];

          const edgeSnap = evaluateEdgeDragSnap({
            edgeP1: dragCtx.edgeP1,
            edgeP2: dragCtx.edgeP2,
            normal: dragCtx.normal,
            buildingId: dragCtx.buildingId,
            excludeBuildingIds: edgeGroupBldgIds,
            edgeIndex: dragCtx.edgeIndex,
            tentativeDelta: { dx: totalDx, dy: totalDy },
            referenceBuffer: visibleLineBuffer,
            distanceThresholdMeters: distToleranceMeters,
            angleToleranceRad: ((APP_CONFIG.osnap?.parallelAngleToleranceDeg || 1.5) * Math.PI) / 180,
            previousSnap: activeBuildingDragSnap as any,
          });

          if (edgeSnap) {
            effectiveDx = edgeSnap.deltaOffset.dx;
            effectiveDy = edgeSnap.deltaOffset.dy;
            setActiveBuildingDragSnap(edgeSnap);
          } else {
            setActiveBuildingDragSnap(null);
          }
        } else {
          if (activeBuildingDragSnap) setActiveBuildingDragSnap(null);
        }

        dragCtx.currentDelta = { dx: effectiveDx, dy: effectiveDy };

        if (dragCtx.isSweep && dragCtx.initialSweepPath) {
          const nextSweepPath = offsetOpenPolylineEdge(dragCtx.initialSweepPath, dragCtx.edgeIndex, { x: effectiveDx, y: effectiveDy });
          onUpdateBuildingSweepPath?.(dragCtx.buildingId, nextSweepPath);
        } else {
          const nextVerts = offsetPolygonEdge(dragCtx.initialVertices, dragCtx.edgeIndex, { x: effectiveDx, y: effectiveDy });
          onUpdateBuildingVertices?.(dragCtx.buildingId, nextVerts);
        }
        return;
      }
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
          // Wyznacz wierzchołek kotwiczący najbliższy punktowi chwycenia myszą
          let dragAnchor: Point2D | undefined = undefined;
          let minAnchorDist = Infinity;
          for (const v of movingBldg.vertices) {
            const d = Math.hypot(v.x - dragStart.x, v.y - dragStart.y);
            if (d < minAnchorDist) {
              minAnchorDist = d;
              dragAnchor = { x: v.x + dwx, y: v.y + dwy };
            }
          }

          const isGroupOpen = !!movingBldg.groupId && openGroupId === movingBldg.groupId;
          const movingGroupBldgIds = new Set<string>(selectedBuildingIds);
          if (movingBldg.groupId && !isGroupOpen) {
            buildings.filter((b) => b.groupId === movingBldg.groupId).forEach((b) => movingGroupBldgIds.add(b.id));
          } else {
            movingGroupBldgIds.add(primaryId);
          }

          const s0 = worldToScreen(world.wx, world.wy);
          const s1 = worldToScreen(world.wx + 1, world.wy);
          const pxPerMeter = Math.hypot(s1.sx - s0.sx, s1.sy - s0.sy) || 20;
          const distToleranceMeters = Math.max(0.1, snapRadiusPx / pxPerMeter);
          const tentVerts = movingBldg.vertices.map((v) => ({ x: v.x + dwx, y: v.y + dwy }));
          const dragSnap = evaluateBuildingDragMultiSnap({
            movingVertices: tentVerts,
            movingBuildingId: primaryId,
            excludeBuildingIds: Array.from(movingGroupBldgIds),
            referenceBuffer: visibleLineBuffer,
            dragAnchorVertex: dragAnchor,
            distanceThresholdMeters: distToleranceMeters,
            angleToleranceRad: ((APP_CONFIG.osnap?.parallelAngleToleranceDeg || 0.8) * Math.PI) / 180,
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

  const handleMouseUp = useCallback((e?: { clientX: number; clientY: number }) => {
    if (brushStateRef.current.isBrushing) {
      brushStateRef.current.isBrushing = false;
      if (brushStateRef.current.brushedBuildingIds.size === 0 && brushStateRef.current.initialClickedBuildingId) {
        const clickedBldg = buildings.find((b) => b.id === brushStateRef.current.initialClickedBuildingId);
        if (clickedBldg) {
          onUpdateBuilding?.(clickedBldg.id, { isTested: !clickedBldg.isTested });
        }
      }
      brushStateRef.current.initialClickedBuildingId = null;
      brushStateRef.current.brushedBuildingIds.clear();
      onInteractionChange?.(false);
    }

    if (labelClickStartRef.current) {
      const start = labelClickStartRef.current;
      labelClickStartRef.current = null;
      const rect = e ? canvasRef.current?.getBoundingClientRect() : null;
      const moveDist = rect
        ? Math.hypot(e!.clientX - rect.left - start.sx, e!.clientY - rect.top - start.sy)
        : 0;
      if (moveDist <= 4) {
        onLabelClick?.(start.buildingId);
      }
    }
    if (
      isDraggingBuilding ||
      draggingEdge ||
      draggingFacadePoint ||
      draggingPinnedPointId ||
      draggedVertexIndex !== null ||
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
    if (draggingEdge && dragEdgeContextRef.current) {
      const dragCtx = dragEdgeContextRef.current;
      const finalDelta = dragCtx.currentDelta || { dx: 0, dy: 0 };
      if (dragCtx.isSweep && dragCtx.initialSweepPath) {
        const nextSweepPath = offsetOpenPolylineEdge(dragCtx.initialSweepPath, dragCtx.edgeIndex, { x: finalDelta.dx, y: finalDelta.dy });
        onUpdateBuildingSweepPath?.(dragCtx.buildingId, nextSweepPath);
      } else {
        const nextVerts = offsetPolygonEdge(dragCtx.initialVertices, dragCtx.edgeIndex, { x: finalDelta.dx, y: finalDelta.dy });
        onUpdateBuildingVertices?.(dragCtx.buildingId, nextVerts);
      }
    }
    setDraggingEdge(null);
    dragEdgeContextRef.current = null;
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
    setIsRotating(false);
    setLastMouseAngleWorld(null);
    setDragStart(null);
  }, [
    buildings,
    onUpdateBuilding,
    isDraggingBuilding,
    draggingEdge,
    draggingFacadePoint,
    draggingPinnedPointId,
    draggedVertexIndex,
    isRotating,
    onInteractionChange,
    activeDirectionSnap,
    activeOsnapSnap,
    activeBuildingDragSnap,
    dragVertexPreviewPt,
    onUpdateBuildingSweepPath,
    onUpdateBuildingVertices,
    onLabelClick,
  ]);

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        setHoveredBuildings([]);
        setHoveredLabelBuildingId(null);
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

    // Zabezpieczenie na wypadek utraty focusu okna w trakcie przeciągania (np. alt-tab) - żadne
    // mouseup nigdy nie nadejdzie w takim wypadku, więc isInteracting utknąłby na `true`, zamrażając
    // podgląd 3D w nieskończoność (patrz useStableWhileInteracting).
    const handleWindowBlur = () => {
      onInteractionChange?.(false);
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [getHoverCandidates, screenToWorld, containerRef, handleMouseUp, onInteractionChange]);

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedBuildingId && drawingMode === 'vertexEdit' && !facadePointMode) {
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
    if (isProjectBrushActive) return 'crosshair';
    if (isDimensionMode) return 'crosshair';
    if (facadePointMode) {
      if (draggingPinnedPointId) return 'grabbing';
      if (liveFacadeSnap) return 'crosshair';
      return 'default';
    }
    if (hoveredVertexIndex !== null || draggedVertexIndex !== null) return 'move';
    if (hoveredMidpointIndex !== null) return 'copy';
    if (drawingMode === 'none' && (isRotateHandleHovered || isRotating)) {
      return isRotating ? 'grabbing' : 'grab';
    }
    if (drawingMode !== 'none' && drawingMode !== 'vertexEdit') return 'crosshair';
    if (draggingEdge) return 'move';
    if (hoveredEdge) return 'move';
    if (hoveredBuildingId) return 'pointer';
    if (isPanning || isDraggingBuilding) return 'grabbing';
    return 'grab';
  }, [
    isProjectBrushActive,
    isDimensionMode,
    facadePointMode,
    draggingPinnedPointId,
    liveFacadeSnap,
    hoveredVertexIndex,
    draggedVertexIndex,
    hoveredMidpointIndex,
    drawingMode,
    isRotateHandleHovered,
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
    selectedVertexIndex,
    hoveredVertexIndex,
    hoveredMidpointIndex,
    draggedVertexIndex,
    dragVertexPreviewPt,
    effectivePivot,
    isRotateHandleHovered,
    isRotating,
    rotAngleDeg,
    alignHoveredEdge,
    editingEdgeLength,
    hoveredEdgeLengthBadge,
    hoveredEdge,
    draggingEdge,
    draggingFacadePoint,
    draggingPinnedPointId,
    liveFacadeSnap,
    hoveredBuildingId,
    hoveredBuildings,
    hoveredLabelBuildingId,
    rotationHover,
    dimHoveredEdge,
    effectiveIsInteracting,
    cursorStyle,

    setDrawingVertices,
    setCurrentMouseWorld,
    setHoveredBuildingIndex,

    handleMouseDown,
    handleDoubleClick,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleDeleteSelectedVertex,
    handleCycleVertexSelection,
    handleCycleSnapCandidate,
    handleStepRotateBuilding,
    handleAdjustObjectParam,
    handleAdjustEdgeLengthStep,
    handleEdgeLengthInputChar,
    handleEdgeLengthBackspace,
    handleCommitEdgeLength,
    handleCancelEdgeLength,
  };
}
