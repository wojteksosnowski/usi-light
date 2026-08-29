import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  BuildingLoop,
  AnalysisPointResult,
  Point2D,
  DimensionItem,
  DimensionReference,
  DimensionType,
  CadLayerSettings,
} from '../types/geometry';
import {
  computeBuildingShadowEnvelope,
  computeCombinedShadowEnvelope,
  computeLinearDimension,
  computeAngularDimension,
} from '../utils/math2d';

interface CadCanvasProps {
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  onSelectBuilding: (id: string | null) => void;
  onBuildingMove: (id: string, dx: number, dy: number) => void;
  analysisResults: AnalysisPointResult[];
  selectedPointResult: AnalysisPointResult | null;
  activePointMode?: 'shadowing' | 'sunlight';
  onSelectPointResult: (res: AnalysisPointResult | null) => void;
  showNormals: boolean;
  showShadowingLines: boolean;
  showSunlightLines: boolean;
  showShadowRange?: boolean;
  latitude?: number;
  equinoxDate?: 'spring' | 'autumn';
  fitTrigger?: number;
  onInteractionChange?: (isInteracting: boolean) => void;
  isLinkingMode?: boolean;
  linkingSourceId?: string | null;
  drawingMode?: 'none' | 'rectangle' | 'polyline';
  onFinishDrawing?: (vertices: Point2D[], shapeType: 'rectangle' | 'polyline') => void;
  onCancelDrawing?: () => void;
  onDrawingVerticesCountChange?: (count: number) => void;
  isEditMode?: boolean;
  onBuildingEdgeMove?: (buildingId: string, edgeIndex: number, dx: number, dy: number) => void;
  dimensions?: DimensionItem[];
  isDimensionMode?: boolean;
  dimensionType?: DimensionType;
  dimensionPendingRef?: DimensionReference | null;
  onDimensionClickEdge?: (buildingId: string, segmentId: string) => void;
  onDeleteDimension?: (id: string) => void;
  layerSettings?: Record<string, CadLayerSettings>;
}

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
  latitude = 52.23,
  equinoxDate = 'spring',
  fitTrigger,
  onInteractionChange,
  isLinkingMode = false,
  linkingSourceId = null,
  drawingMode = 'none',
  onFinishDrawing,
  onCancelDrawing,
  onDrawingVerticesCountChange,
  isEditMode = false,
  onBuildingEdgeMove,
  dimensions = [],
  isDimensionMode = false,
  dimensionType = 'linear',
  dimensionPendingRef = null,
  onDimensionClickEdge,
  onDeleteDimension,
  layerSettings = {},
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Drawing state
  const [drawingVertices, setDrawingVertices] = useState<Point2D[]>([]);
  const [currentMouseWorld, setCurrentMouseWorld] = useState<Point2D | null>(null);

  // Edge editing state (parallel offset)
  const [hoveredEdge, setHoveredEdge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<{ buildingId: string; edgeIndex: number } | null>(null);

  // Dimension tool edge hover state
  const [dimHoveredEdge, setDimHoveredEdge] = useState<{ buildingId: string; segmentId: string } | null>(null);

  useEffect(() => {
    onDrawingVerticesCountChange?.(drawingVertices.length);
  }, [drawingVertices.length, onDrawingVerticesCountChange]);

  useEffect(() => {
    if (drawingMode === 'none') {
      setDrawingVertices([]);
      setCurrentMouseWorld(null);
    }
  }, [drawingMode]);

  // Viewport state (pan & zoom)
  const [viewState, setViewState] = useState({
    panX: 500,
    panY: 450,
    scale: 14, // pixels per meter
  });

  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingBuilding, setIsDraggingBuilding] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // World <-> Screen coordinate conversions
  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      return {
        sx: viewState.panX + wx * viewState.scale,
        sy: viewState.panY - wy * viewState.scale, // Y-up in CAD
      };
    },
    [viewState]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      return {
        wx: (sx - viewState.panX) / viewState.scale,
        wy: -(sy - viewState.panY) / viewState.scale,
      };
    },
    [viewState]
  );

  // Automatically center & fit view to buildings bounding box
  const fitToExtents = useCallback(() => {
    const container = containerRef.current;
    if (!container || buildings.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width > 50 ? rect.width : window.innerWidth - 380;
    const height = rect.height > 50 ? rect.height : window.innerHeight;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const bldg of buildings) {
      for (const v of bldg.vertices) {
        if (Number.isFinite(v.x) && v.x < minX) minX = v.x;
        if (Number.isFinite(v.x) && v.x > maxX) maxX = v.x;
        if (Number.isFinite(v.y) && v.y < minY) minY = v.y;
        if (Number.isFinite(v.y) && v.y > maxY) maxY = v.y;
      }
    }

    if (minX === Infinity) return;

    const bboxWidth = Math.max(5, maxX - minX);
    const bboxHeight = Math.max(5, maxY - minY);
    // World-space center of the bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Fit with 80% margin so all objects are clearly visible
    const scaleX = (width * 0.80) / bboxWidth;
    const scaleY = (height * 0.80) / bboxHeight;
    const newScale = Math.max(0.001, Math.min(100, Math.min(scaleX, scaleY)));

    // Center the bounding-box center on the canvas center.
    // worldToScreen formula: sx = panX + wx * scale, sy = panY - wy * scale
    // We want: sx = width/2 when wx = centerX  → panX = width/2 - centerX * newScale
    //          sy = height/2 when wy = centerY → panY = height/2 + centerY * newScale
    const panX = width / 2 - centerX * newScale;
    const panY = height / 2 + centerY * newScale;

    setViewState({
      panX,
      panY,
      scale: newScale,
    });
  }, [buildings]);

  // Fit to extents ONLY on initial mount and when user explicitly triggers fitTrigger
  useEffect(() => {
    fitToExtents();
    const t = setTimeout(fitToExtents, 100);
    return () => clearTimeout(t);
  }, [fitTrigger]);

  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth - 380 : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  // Observe container size accurately
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

  // Keyboard shortcut listener for drawing actions (Escape / Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawingMode !== 'none' || drawingVertices.length > 0) {
          setDrawingVertices([]);
          setCurrentMouseWorld(null);
          onCancelDrawing?.();
        }
      } else if (e.key === 'Enter') {
        if (drawingMode === 'polyline' && drawingVertices.length >= 3) {
          onFinishDrawing?.(drawingVertices, 'polyline');
          setDrawingVertices([]);
          setCurrentMouseWorld(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingMode, drawingVertices, onCancelDrawing, onFinishDrawing]);

  // Main Render Loop (Draws onto Canvas)
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

    // 1. Clean background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    // 2. High-precision dynamic CAD Grid
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    const gridStep = Math.max(1, Math.pow(10, Math.floor(Math.log10(60 / Math.max(0.001, viewState.scale)))));
    const topLeftWorld = screenToWorld(0, 0);
    const bottomRightWorld = screenToWorld(width, height);

    const minGridX = Math.floor(topLeftWorld.wx / gridStep) * gridStep;
    const maxGridX = Math.ceil(bottomRightWorld.wx / gridStep) * gridStep;
    const minGridY = Math.floor(bottomRightWorld.wy / gridStep) * gridStep;
    const maxGridY = Math.ceil(topLeftWorld.wy / gridStep) * gridStep;

    ctx.beginPath();
    for (let gx = minGridX; gx <= maxGridX; gx += gridStep) {
      const { sx } = worldToScreen(gx, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let gy = minGridY; gy <= maxGridY; gy += gridStep) {
      const { sy } = worldToScreen(0, gy);
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();

    // Minor 1m Subgrid when zoomed in
    if (viewState.scale > 10) {
      ctx.strokeStyle = '#09101d';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let gx = minGridX; gx <= maxGridX; gx += 1) {
        if (gx % gridStep === 0) continue;
        const { sx } = worldToScreen(gx, 0);
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, height);
      }
      for (let gy = minGridY; gy <= maxGridY; gy += 1) {
        if (gy % gridStep === 0) continue;
        const { sy } = worldToScreen(0, gy);
        ctx.moveTo(0, sy);
        ctx.lineTo(width, sy);
      }
      ctx.stroke();
    }

    // Origin Axes (0,0)
    const originScreen = worldToScreen(0, 0);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, originScreen.sy);
    ctx.lineTo(width, originScreen.sy);
    ctx.moveTo(originScreen.sx, 0);
    ctx.lineTo(originScreen.sx, height);
    ctx.stroke();

    // 3. Render Building Fills (base level)
    for (const bldg of buildings) {
      const isSelected = bldg.id === selectedBuildingId;
      const isTested = bldg.isTested;
      const isIncluded = bldg.isIncluded !== false;

      ctx.beginPath();
      bldg.vertices.forEach((v, idx) => {
        const { sx, sy } = worldToScreen(v.x, v.y);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();

      if (!isIncluded) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      } else if (isTested) {
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.28)' : 'rgba(59, 130, 246, 0.16)';
      } else {
        ctx.fillStyle = isSelected ? 'rgba(148, 163, 184, 0.25)' : 'rgba(71, 85, 105, 0.18)';
      }
      ctx.fill();
    }

    // 3.5. Render Unified Boolean Shadow Envelope (Zakres Cienia) for Tested Buildings (Contour only, No fill)
    if (showShadowRange) {
      const loops = computeCombinedShadowEnvelope(buildings, latitude, equinoxDate);

      if (loops.length > 0) {
        ctx.save();

        // ONLY Contour (Stroke), ZERO fill to prevent overlapping reinforcement
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2.0;
        ctx.setLineDash([8, 5]);

        let globalTopVertex: { x: number; y: number } | null = null;

        for (const loop of loops) {
          if (loop.length < 3) continue;
          ctx.beginPath();
          loop.forEach((v, idx) => {
            const { sx, sy } = worldToScreen(v.x, v.y);
            if (idx === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);

            if (!globalTopVertex || v.y > globalTopVertex.y) {
              globalTopVertex = v;
            }
          });
          ctx.closePath();
          ctx.stroke();
        }

        ctx.setLineDash([]);

        // Tag at northernmost vertex of shadow envelope
        if (globalTopVertex) {
          const { sx: tagSx, sy: tagSy } = worldToScreen((globalTopVertex as any).x, (globalTopVertex as any).y);

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 1;
          const labelText = 'ZAKRES CIENIA OBIEKTÓW BADANYCH';
          ctx.font = 'bold 10px Inter, sans-serif';
          const lw = ctx.measureText(labelText).width;
          ctx.beginPath();
          ctx.roundRect(tagSx - lw / 2 - 8, tagSy - 20, lw + 16, 18, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#c7d2fe';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, tagSx, tagSy - 11);
        }

        ctx.restore();
      }
    }

    // Helper function for Purple-to-Orange sunlight color scale in 30-minute steps (matching legend)
    const getSunlightColor = (hours: number, alpha: number = 0.85) => {
      // Step to nearest 0.5h (30 min)
      const steppedHours = Math.floor(hours * 2) / 2;
      
      // Color Palette: Deep Violet (0h) -> Purple (1h) -> Magenta/Pink (2h) -> Coral/Amber (3h) -> Bright Orange (4h+)
      if (steppedHours < 0.5) return `rgba(59, 7, 100, ${alpha})`;   // very dark purple (<30 min)
      if (steppedHours < 1.0) return `rgba(88, 28, 135, ${alpha})`;  // dark violet (30 min)
      if (steppedHours < 1.5) return `rgba(126, 34, 206, ${alpha})`; // violet (1.0 h)
      if (steppedHours < 2.0) return `rgba(168, 85, 247, ${alpha})`; // bright purple (1.5 h)
      if (steppedHours < 2.5) return `rgba(192, 38, 211, ${alpha})`; // fuchsia / magenta (2.0 h)
      if (steppedHours < 3.0) return `rgba(225, 29, 72, ${alpha})`;  // rose / coral (2.5 h)
      if (steppedHours < 3.5) return `rgba(234, 88, 12, ${alpha})`;  // rich orange (3.0 h - standard met)
      if (steppedHours < 4.0) return `rgba(249, 115, 22, ${alpha})`; // vibrant orange (3.5 h)
      return `rgba(251, 146, 60, ${alpha})`;                         // bright warm orange (4.0 h+)
    };

    // Group analysis points by building+segment for smooth continuous band rendering.
    // Key = "buildingId|segmentId" to guarantee isolation between buildings even if
    // segment IDs were ever non-unique across buildings.
    const pointsBySegment = new Map<string, typeof analysisResults>();
    for (const res of analysisResults) {
      const key = `${res.buildingId}|${res.segmentId}`;
      if (!pointsBySegment.has(key)) {
        pointsBySegment.set(key, []);
      }
      pointsBySegment.get(key)!.push(res);
    }

    // Band thickness in pixels and offset in world space so bands border right against the facade line
    const bandThickness = Math.max(3, Math.min(8, viewState.scale * 0.28)); // Screen pixels thickness
    const halfBandWorld = (bandThickness / 2) / Math.max(0.001, viewState.scale);

    ctx.save();
    pointsBySegment.forEach((points) => {
      if (points.length === 0) return;

      // Sort points along segment by ratio
      points.sort((a, b) => a.shadowing.offsetRatio - b.shadowing.offsetRatio);

      // Find original facade segment
      const bldg = buildings.find((b) => b.id === points[0].buildingId);
      const seg = bldg?.segments.find((s) => s.id === points[0].segmentId);
      if (!seg) return;

      const norm = seg.normal;
      const dx = seg.p2.x - seg.p1.x;
      const dy = seg.p2.y - seg.p1.y;

      // --- § 12 Shadowing Band (INSIDE the building, clinging directly to the wall) ---
      if (showShadowingLines) {
        interface ShadowInterval {
          isCompliant: boolean;
          startRatio: number;
          endRatio: number;
        }
        const intervals: ShadowInterval[] = [];
        const n = points.length;

        for (let i = 0; i < n; i++) {
          const p = points[i];
          const prevRatio = i === 0 ? 0.0 : (points[i - 1].shadowing.offsetRatio + p.shadowing.offsetRatio) / 2;
          const nextRatio = i === n - 1 ? 1.0 : (p.shadowing.offsetRatio + points[i + 1].shadowing.offsetRatio) / 2;

          const lastInt = intervals[intervals.length - 1];
          if (lastInt && lastInt.isCompliant === p.shadowing.isCompliant) {
            lastInt.endRatio = nextRatio;
          } else {
            intervals.push({
              isCompliant: p.shadowing.isCompliant,
              startRatio: prevRatio,
              endRatio: nextRatio,
            });
          }
        }

        for (const inter of intervals) {
          const w1 = {
            x: seg.p1.x + inter.startRatio * dx - norm.x * halfBandWorld,
            y: seg.p1.y + inter.startRatio * dy - norm.y * halfBandWorld,
          };
          const w2 = {
            x: seg.p1.x + inter.endRatio * dx - norm.x * halfBandWorld,
            y: seg.p1.y + inter.endRatio * dy - norm.y * halfBandWorld,
          };

          const s1 = worldToScreen(w1.x, w1.y);
          const s2 = worldToScreen(w2.x, w2.y);

          ctx.beginPath();
          ctx.moveTo(s1.sx, s1.sy);
          ctx.lineTo(s2.sx, s2.sy);
          ctx.strokeStyle = inter.isCompliant ? 'rgba(16, 185, 129, 0.85)' : 'rgba(244, 63, 94, 0.85)';
          ctx.lineWidth = bandThickness;
          ctx.lineCap = 'butt';
          ctx.stroke();
        }
      }

      // --- § 56 Sunlight Band (OUTSIDE the building, clinging directly to the wall) ---
      if (showSunlightLines) {
        interface SunlightInterval {
          color: string;
          startRatio: number;
          endRatio: number;
        }
        const intervals: SunlightInterval[] = [];
        const n = points.length;

        for (let i = 0; i < n; i++) {
          const p = points[i];
          const color = getSunlightColor(p.sunlight.totalHours);
          const prevRatio = i === 0 ? 0.0 : (points[i - 1].shadowing.offsetRatio + p.shadowing.offsetRatio) / 2;
          const nextRatio = i === n - 1 ? 1.0 : (p.shadowing.offsetRatio + points[i + 1].shadowing.offsetRatio) / 2;

          const lastInt = intervals[intervals.length - 1];
          if (lastInt && lastInt.color === color) {
            lastInt.endRatio = nextRatio;
          } else {
            intervals.push({
              color,
              startRatio: prevRatio,
              endRatio: nextRatio,
            });
          }
        }

        for (const inter of intervals) {
          const w1 = {
            x: seg.p1.x + inter.startRatio * dx + norm.x * halfBandWorld,
            y: seg.p1.y + inter.startRatio * dy + norm.y * halfBandWorld,
          };
          const w2 = {
            x: seg.p1.x + inter.endRatio * dx + norm.x * halfBandWorld,
            y: seg.p1.y + inter.endRatio * dy + norm.y * halfBandWorld,
          };

          const s1 = worldToScreen(w1.x, w1.y);
          const s2 = worldToScreen(w2.x, w2.y);

          ctx.beginPath();
          ctx.moveTo(s1.sx, s1.sy);
          ctx.lineTo(s2.sx, s2.sy);
          ctx.strokeStyle = inter.color;
          ctx.lineWidth = bandThickness;
          ctx.lineCap = 'butt';
          ctx.stroke();
        }
      }
    });
    ctx.restore();

    // 4.1. Render Building Outlines, Normals & Name Tags (OVER the analytical ribbons)
    const selectedBldgObj = buildings.find((b) => b.id === selectedBuildingId);

    for (const bldg of buildings) {
      const lyr = bldg.layer || 'Domyślna (0)';
      const lyrSetting = layerSettings[lyr] || {};
      if (lyrSetting.isVisible === false) continue; // Layer turned off (Żarówka)

      const isGhosted = lyrSetting.isGhosted === true;
      const isLocked = lyrSetting.isLocked === true;
      const isSelected = bldg.id === selectedBuildingId;
      const isLinkingSource = isLinkingMode && bldg.id === linkingSourceId;
      const isGroupSelected =
        !isSelected &&
        !!selectedBldgObj?.groupId &&
        bldg.groupId === selectedBldgObj.groupId;
      const isTested = bldg.isTested;
      const isIncluded = bldg.isIncluded !== false;

      ctx.save();
      if (isGhosted) {
        ctx.globalAlpha = 0.35;
      }

      ctx.beginPath();
      bldg.vertices.forEach((v, idx) => {
        const { sx, sy } = worldToScreen(v.x, v.y);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();

      // Clean Stroke (drawn above analytical bands)
      ctx.save();
      if (isLinkingSource) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.5;
      } else if (isSelected) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
      } else if (isGroupSelected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 3]);
      } else if (!isIncluded) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = isTested ? '#60a5fa' : '#64748b';
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();
      ctx.restore();

      // Center Name Tag
      if (bldg.vertices.length > 0) {
        const centroid = bldg.vertices.reduce(
          (acc, v) => ({ x: acc.x + v.x / bldg.vertices.length, y: acc.y + v.y / bldg.vertices.length }),
          { x: 0, y: 0 }
        );
        const { sx, sy } = worldToScreen(centroid.x, centroid.y);

        // Badge pill
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(sx - 75, sy - 18, 150, 36, 8);
        ctx.fill();
        ctx.strokeStyle = isLinkingSource
          ? '#f59e0b'
          : isSelected
          ? '#3b82f6'
          : isGroupSelected
          ? '#38bdf8'
          : !isIncluded
          ? '#475569'
          : '#334155';
        ctx.lineWidth = isLinkingSource || isSelected ? 1.5 : 1;
        ctx.stroke();

        ctx.fillStyle = !isIncluded ? '#94a3b8' : '#f8fafc';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        const groupTag = bldg.groupId ? ' 🔗' : '';
        const lockTag = isLocked ? ' 🔒' : '';
        const ghostTag = isGhosted ? ' 👻' : '';
        ctx.fillText(`${bldg.name}${groupTag}${lockTag}${ghostTag}`, sx, sy - 2);

        if (!isIncluded) {
          ctx.fillStyle = '#f87171';
          ctx.font = '9px Inter, sans-serif';
          ctx.fillText(`(WYŁĄCZONY Z KALKULACJI)`, sx, sy + 11);
        } else {
          ctx.fillStyle = isTested ? '#60a5fa' : '#94a3b8';
          ctx.font = '10px Inter, sans-serif';
          ctx.fillText(`H = ${bldg.defaultHeight}m ${bldg.isTested ? '• BADANY' : ''}`, sx, sy + 11);
        }
      }

      ctx.restore();

      // Draw Normals
      if (showNormals) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        for (const seg of bldg.segments) {
          const midX = (seg.p1.x + seg.p2.x) / 2;
          const midY = (seg.p1.y + seg.p2.y) / 2;
          const { sx: mx, sy: my } = worldToScreen(midX, midY);
          const { sx: nx, sy: ny } = worldToScreen(midX + seg.normal.x * 2.0, midY + seg.normal.y * 2.0);

          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(nx, ny);
          ctx.stroke();

          // Arrowhead
          const headLen = 6;
          const angle = Math.atan2(ny - my, nx - mx);
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(nx - headLen * Math.cos(angle - Math.PI / 6), ny - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(nx - headLen * Math.cos(angle + Math.PI / 6), ny - headLen * Math.sin(angle + Math.PI / 6));
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
        }
      }
    }

    // 4.2. Draw Connecting Links between Grouped Buildings
    const groupCentroids = new Map<string, { x: number; y: number }[]>();
    for (const bldg of buildings) {
      if (bldg.groupId && bldg.vertices.length > 0) {
        const centroid = bldg.vertices.reduce(
          (acc, v) => ({ x: acc.x + v.x / bldg.vertices.length, y: acc.y + v.y / bldg.vertices.length }),
          { x: 0, y: 0 }
        );
        if (!groupCentroids.has(bldg.groupId)) {
          groupCentroids.set(bldg.groupId, []);
        }
        groupCentroids.get(bldg.groupId)!.push(centroid);
      }
    }

    groupCentroids.forEach((centroids) => {
      if (centroids.length >= 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        for (let i = 0; i < centroids.length - 1; i++) {
          const c1 = worldToScreen(centroids[i].x, centroids[i].y);
          const c2 = worldToScreen(centroids[i + 1].x, centroids[i + 1].y);
          ctx.beginPath();
          ctx.moveTo(c1.sx, c1.sy);
          ctx.lineTo(c2.sx, c2.sy);
          ctx.stroke();

          // Small link indicator in the middle of line
          const midX = (c1.sx + c2.sx) / 2;
          const midY = (c1.sy + c2.sy) / 2;
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(midX, midY, 9, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🔗', midX, midY + 1);
        }
        ctx.restore();
      }
    });

    // Highlight selected point marker if active
    if (selectedPointResult) {
      const { point } = selectedPointResult;
      const { sx, sy } = worldToScreen(point.x, point.y);
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, 2 * Math.PI);
      ctx.fillStyle = '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 5. Render Ray Casting Fan or Twarowski's Linijka Słońca for Selected Point
    if (selectedPointResult) {
      const { point, shadowing, sunlight } = selectedPointResult;
      const { sx: px, sy: py } = worldToScreen(point.x, point.y);

      if (activePointMode === 'sunlight') {
        // ───────────────────────────────────────────────────────────────────
        // LINIJKA SŁOŃCA — tylko żółte trójkąty nasłonecznienia
        // Długość promienia = odległość do krawędzi zacieniającej (requiredDistance)
        // ───────────────────────────────────────────────────────────────────
        const bldgOfPoint = buildings.find((b) => b.id === selectedPointResult.buildingId);
        const heightH = Math.max(5, bldgOfPoint?.defaultHeight ?? 15);
        const isCityCentre = bldgOfPoint?.isCityCentre ?? false;
        const maxAllowedReq = isCityCentre ? 17.5 : 35.0;

        // Max ray length = shadow length at solar noon (fallback gdy brak przeszkód)
        const slots = sunlight.timeSlots;
        let noonElevationDeg = 38.0;
        for (const s of slots) {
          if (s.elevationDeg > noonElevationDeg) noonElevationDeg = s.elevationDeg;
        }
        const noonElevRad = (noonElevationDeg * Math.PI) / 180;
        const shadowLengthH = Math.min(heightH / Math.tan(noonElevRad), maxAllowedReq);

        // Normalna fasady w stopniach (matematycznych, CCW od wschodu)
        const normalWorldDeg = (Math.atan2(selectedPointResult.normal.y, selectedPointResult.normal.x) * 180) / Math.PI;
        const sectors = shadowing.sectors ?? [];

        // Dla podanego azymutu słonecznego (CW od N) zwraca odległość do krawędzi zacieniającej.
        // Mechanizm identyczny jak w wizualizacji § 12 (precedens wyższego budynku).
        const getRayDist = (azimuthDeg: number): number => {
          // Azymut słoneczny → kąt matematyczny (CCW od wschodu)
          const mathDeg = ((90 - azimuthDeg) % 360 + 360) % 360;
          // Kąt względem normalnej fasady
          const relDeg = ((mathDeg - normalWorldDeg) % 360 + 360) % 360;

          for (let sIdx = 0; sIdx < sectors.length; sIdx++) {
            const sec = sectors[sIdx];
            const startRel = ((sec.startAngleDeg % 360) + 360) % 360;
            const span = sec.spanDeg ?? 0;
            // Sprawdź czy relDeg leży w sektorze [startRel, startRel+span] (mod 360)
            const delta = ((relDeg - startRel) % 360 + 360) % 360;
            if (delta > span + 0.01) continue; // nie w tym sektorze

            if (sec.isFree) {
              // Wolny sektor — użyj max odległości z sąsiednich sektorów blokujących
              const prevReq = sIdx > 0 ? (sectors[sIdx - 1].requiredDistance ?? 0) : 0;
              const nextReq = sIdx < sectors.length - 1 ? (sectors[sIdx + 1].requiredDistance ?? 0) : 0;
              const boundingReq = Math.max(sec.requiredDistance ?? 0, prevReq, nextReq);
              return boundingReq > 0 ? Math.min(boundingReq, maxAllowedReq) : shadowLengthH;
            } else {
              const req = sec.requiredDistance ?? 0;
              return Math.min(req > 0 ? req : maxAllowedReq, maxAllowedReq);
            }
          }
          return shadowLengthH; // brak dopasowania → pełna odległość
        };

        // Sloty nad horyzontem z kątem padania ≥ 12°
        const validSlots = slots.filter(
          (s) => s.isSunAboveHorizon && s.elevationDeg > 0.5 && s.isAngleAbove12Deg
        );

        // Jeśli wynik zawiera analityczne ciągłe sektory (metoda Segmenty),
        // rysujemy trójkąty bezpośrednio z krawędzi przecięć odcinków:
        if (sunlight.sectors && sunlight.sectors.length > 0) {
          ctx.save();

          const directSectors = sunlight.sectors.filter((s) => s.isDirectSunlight && s.spanDeg > 0.05);

          const calcRulerEndpoint = (dirX: number, dirY: number, d: number) => {
            if (dirY < -1e-4) {
              const t = -d / dirY;
              return { wx: point.x + dirX * Math.min(t, d * 3.0), wy: point.y - d };
            } else {
              return { wx: point.x + dirX * d, wy: point.y + dirY * d };
            }
          };

          for (const sec of directSectors) {
            // Przeliczamy oba azymuty skrajne sektora
            const az1MathRad = ((90 - sec.startAzimuthDeg + 360) % 360) * (Math.PI / 180);
            const dirX1 = Math.cos(az1MathRad);
            const dirY1 = Math.sin(az1MathRad);

            const az2MathRad = ((90 - sec.endAzimuthDeg + 360) % 360) * (Math.PI / 180);
            const dirX2 = Math.cos(az2MathRad);
            const dirY2 = Math.sin(az2MathRad);

            const dist = sec.requiredDistance && sec.requiredDistance > 0 ? sec.requiredDistance : shadowLengthH;

            const p1 = calcRulerEndpoint(dirX1, dirY1, dist);
            const s1 = worldToScreen(p1.wx, p1.wy);

            const p2 = calcRulerEndpoint(dirX2, dirY2, dist);
            const s2 = worldToScreen(p2.wx, p2.wy);

            const fillCol = getSunlightColor(sunlight.totalHours, 0.35);
            const strokeCol = getSunlightColor(sunlight.totalHours, 0.85);
            const solidCol = getSunlightColor(sunlight.totalHours, 1.0);

            // Wypełniony trójkąt sektora
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(s1.sx, s1.sy);
            ctx.lineTo(s2.sx, s2.sy);
            ctx.closePath();
            ctx.fillStyle = fillCol;
            ctx.fill();
            ctx.strokeStyle = strokeCol;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Podstawa trójkąta (krawędź zacieniająca)
            ctx.beginPath();
            ctx.moveTo(s1.sx, s1.sy);
            ctx.lineTo(s2.sx, s2.sy);
            ctx.strokeStyle = solidCol;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Etykieta czasu i kąta sektora
            const midSx = (s1.sx + s2.sx) / 2;
            const midSy = (s1.sy + s2.sy) / 2;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#f8fafc';
            const timeLabel = sec.startTimeStr && sec.endTimeStr ? `${sec.startTimeStr}–${sec.endTimeStr} ` : '';
            ctx.fillText(`${timeLabel}(${sec.hours.toFixed(2)}h, ${sec.spanDeg.toFixed(1)}°)`, midSx, midSy + 6);
          }

          // Badge tytułowy
          const badgeY = py - 24;
          const solidCol = getSunlightColor(sunlight.totalHours, 1.0);
          const titleText = `Linijka Słońca (Segmenty analityczne, H=${heightH.toFixed(0)}m, Czas: ${sunlight.totalHours.toFixed(2)}h)`;
          ctx.font = 'bold 11px sans-serif';
          const tw = ctx.measureText(titleText).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.strokeStyle = solidCol;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(px - tw / 2 - 8, badgeY - 8, tw + 16, 20, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = solidCol;
          ctx.textBaseline = 'middle';
          ctx.fillText(titleText, px, badgeY + 2);

          ctx.restore();
        } else if (validSlots.length >= 2) {
          // Standardowy fallback dla metody raycasting (dyskretyzacja czasowa)
          ctx.save();

          const fillCol = getSunlightColor(sunlight.totalHours, 0.32);
          const strokeCol = getSunlightColor(sunlight.totalHours, 0.75);
          const solidCol = getSunlightColor(sunlight.totalHours, 1.0);

          // Oblicz punkt końcowy każdego promienia w przestrzeni ekranowej
          const slotCoords: {
            time: string;
            isDirect: boolean;
            wx: number;
            wy: number;
            sx: number;
            sy: number;
          }[] = [];

          for (const s of validSlots) {
            const azMathRad = ((90 - s.azimuthDeg + 360) % 360) * (Math.PI / 180);
            const dirX = Math.cos(azMathRad);
            const dirY = Math.sin(azMathRad);

            const dist = getRayDist(s.azimuthDeg);

            if (dirY >= -1e-6) continue;
            const t = -dist / dirY;
            const wx = point.x + dirX * t;
            const wy = point.y - dist;
            const { sx, sy } = worldToScreen(wx, wy);

            slotCoords.push({ time: s.time, isDirect: s.isDirectSunlight, wx, wy, sx, sy });
          }

          for (let i = 0; i < slotCoords.length - 1; i++) {
            const c1 = slotCoords[i];
            const c2 = slotCoords[i + 1];
            if (!c1.isDirect || !c2.isDirect) continue;

            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(c1.sx, c1.sy);
            ctx.lineTo(c2.sx, c2.sy);
            ctx.closePath();
            ctx.fillStyle = fillCol;
            ctx.fill();
            ctx.strokeStyle = strokeCol;
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          let groupStart = -1;
          for (let i = 0; i <= slotCoords.length - 1; i++) {
            const isDirect = slotCoords[i]?.isDirect ?? false;
            if (isDirect && groupStart < 0) {
              groupStart = i;
            }
            if ((!isDirect || i === slotCoords.length - 1) && groupStart >= 0) {
              const endIdx = isDirect ? i : i - 1;
              if (endIdx > groupStart) {
                ctx.beginPath();
                ctx.moveTo(slotCoords[groupStart].sx, slotCoords[groupStart].sy);
                for (let j = groupStart + 1; j <= endIdx; j++) {
                  ctx.lineTo(slotCoords[j].sx, slotCoords[j].sy);
                }
                ctx.strokeStyle = solidCol;
                ctx.lineWidth = 2;
                ctx.stroke();
              }
              groupStart = -1;
            }
          }

          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          for (const c of slotCoords) {
            if (!c.time.endsWith(':00')) continue;
            ctx.beginPath();
            ctx.arc(c.sx, c.sy, 2.5, 0, 2 * Math.PI);
            ctx.fillStyle = c.isDirect ? solidCol : '#475569';
            ctx.fill();
            ctx.fillStyle = c.isDirect ? '#f8fafc' : '#64748b';
            ctx.fillText(c.time, c.sx, c.sy + 5);
          }

          const badgeY = py - 24;
          const titleText = `Linijka Słońca (Raycasting, H=${heightH.toFixed(0)}m, Czas: ${sunlight.totalHours.toFixed(2)}h)`;
          ctx.font = 'bold 11px sans-serif';
          const tw = ctx.measureText(titleText).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.strokeStyle = solidCol;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(px - tw / 2 - 8, badgeY - 8, tw + 16, 20, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = solidCol;
          ctx.textBaseline = 'middle';
          ctx.fillText(titleText, px, badgeY + 2);

          ctx.restore();
        }

      } else {
        // ───────────────────────────────────────────────────────────────────
        // § 12 PRZESŁANIANIE (SHADOWING SECTORS) VISUALIZATION
        // ───────────────────────────────────────────────────────────────────
        const sectors = shadowing.sectors;

        if (sectors && sectors.length > 0) {
          const normalWorldDeg = (Math.atan2(selectedPointResult.normal.y, selectedPointResult.normal.x) * 180) / Math.PI;

          // Calculate precise continuous boundary angles for each sector
          const sectorBoundariesDeg: { startWorldDeg: number; endWorldDeg: number; spanDeg: number }[] = [];

          for (let i = 0; i < sectors.length; i++) {
            const s = sectors[i];
            const startRelDeg = s.startAngleDeg;
            const endRelDeg = s.endAngleDeg;
            const spanDeg = s.spanDeg;

            const startWorldDeg = ((normalWorldDeg + startRelDeg) % 360 + 360) % 360;
            const endWorldDeg = ((normalWorldDeg + endRelDeg) % 360 + 360) % 360;

            sectorBoundariesDeg.push({ startWorldDeg, endWorldDeg, spanDeg });
          }

          ctx.save();
          for (let sIdx = 0; sIdx < sectors.length; sIdx++) {
            const sector = sectors[sIdx];
            const isFree = sector.isFree;
            const isTolerated = (sector as any).isTolerated === true;
            const { startWorldDeg, endWorldDeg, spanDeg } = sectorBoundariesDeg[sIdx];

            // Compute reach distance for this sector:
            const bldgOfPoint = buildings.find((b) => b.id === selectedPointResult.buildingId);
            const isCityCentre = bldgOfPoint?.isCityCentre ?? false;
            const maxAllowedReq = isCityCentre ? 17.5 : 35.0;

            // Find required distance of bounding obstacles
            let dist: number;
            if (isFree) {
              const prevSector = sIdx > 0 ? sectors[sIdx - 1] : null;
              const nextSector = sIdx < sectors.length - 1 ? sectors[sIdx + 1] : null;

              const prevReq = prevSector ? (prevSector.requiredDistance ?? 0) : 0;
              const nextReq = nextSector ? (nextSector.requiredDistance ?? 0) : 0;
              const boundingReq = Math.max(sector.requiredDistance ?? 0, prevReq, nextReq);

              dist = boundingReq > 0
                ? Math.min(boundingReq, maxAllowedReq)
                : maxAllowedReq;
            } else {
              const req = sector.requiredDistance ?? 0;
              dist = Math.min(req > 0 ? req : maxAllowedReq, maxAllowedReq);
            }

            // Color classification: Green (Free) | Yellow (Tolerated <=15° in >=75° window) | Red (Blocked)
            let strokeColor = 'rgba(244, 63, 94, 0.85)';
            let fillColor   = 'rgba(244, 63, 94, 0.12)';
            let textColor   = '#f87171';

            if (isFree) {
              strokeColor = 'rgba(52, 211, 153, 0.85)';
              fillColor   = 'rgba(52, 211, 153, 0.12)';
              textColor   = '#34d399';
            } else if (isTolerated) {
              strokeColor = 'rgba(234, 179, 8, 0.9)'; // Yellow
              fillColor   = 'rgba(234, 179, 8, 0.18)';
              textColor   = '#facc15';
            }

            const lineWidth = 1.5;
            const startRad = (startWorldDeg * Math.PI) / 180;
            const endRad   = (endWorldDeg * Math.PI) / 180;

            // First edge ray endpoint
            const x1 = point.x + Math.cos(startRad) * dist;
            const y1 = point.y + Math.sin(startRad) * dist;
            const { sx: sx1, sy: sy1 } = worldToScreen(x1, y1);

            // Last edge ray endpoint
            const x2 = point.x + Math.cos(endRad) * dist;
            const y2 = point.y + Math.sin(endRad) * dist;
            const { sx: sx2, sy: sy2 } = worldToScreen(x2, y2);

            // Radius in screen pixels
            const radiusPx = dist * viewState.scale;

            // Angular sweep in world space (CCW: sweep = endRelDeg - startRelDeg > 0)
            const sweep = spanDeg;

            const startCanvasRad = -startRad;
            const endCanvasRad   = -(startRad + (sweep * Math.PI) / 180);
            const ccwInCanvas    = true; // CCW in world is anticlockwise=true in canvas (Y-down)

            // 1. Filled sector wedge
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(sx1, sy1);
            ctx.arc(px, py, radiusPx, startCanvasRad, endCanvasRad, ccwInCanvas);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();

            // 2. Edge rays
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(sx1, sy1);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(sx2, sy2);
            ctx.stroke();

            // 3. Connecting arc at radius
            ctx.beginPath();
            ctx.arc(px, py, radiusPx, startCanvasRad, endCanvasRad, ccwInCanvas);
            ctx.stroke();

            // 4. Sector Angle Label inside the sector (e.g. "58.0°" or "34.5°") + distance label
            {
              const midAngleWorldDeg = startWorldDeg + sweep / 2;
              const midRad = (midAngleWorldDeg * Math.PI) / 180;

              // Position label inside the sector at ~60% of reach distance
              const labelDist = Math.max(2.5, dist * 0.65);
              const lxW = point.x + Math.cos(midRad) * labelDist;
              const lyW = point.y + Math.sin(midRad) * labelDist;
              const { sx: lsx, sy: lsy } = worldToScreen(lxW, lyW);

              ctx.save();
              ctx.font = `bold ${Math.max(10, Math.min(13, viewState.scale * 0.32))}px monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const angleText = `${spanDeg.toFixed(1)}°`;
              const textWidth = ctx.measureText(angleText).width;

              // Badge pill
              ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(lsx - textWidth / 2 - 5, lsy - 9, textWidth + 10, 18, 4);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = textColor;
              ctx.fillText(angleText, lsx, lsy);

              // Arc radius tick near arc boundary
              if (isFree || dist >= 10) {
                const txW = point.x + Math.cos(midRad) * dist;
                const tyW = point.y + Math.sin(midRad) * dist;
                const { sx: tsx, sy: tsy } = worldToScreen(txW, tyW);
                ctx.fillStyle = strokeColor;
                ctx.font = `bold ${Math.max(9, Math.min(11, viewState.scale * 0.28))}px monospace`;
                ctx.fillText(`${dist.toFixed(0)}m`, tsx, tsy - 8);
              }
              ctx.restore();
            }
          }
          ctx.restore();
        }
      }
    }

    // 6. Dimension Annotations for Selected Building
    const activeSelectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
    if (activeSelectedBuilding) {
      ctx.save();
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (const seg of activeSelectedBuilding.segments) {
        const midX = (seg.p1.x + seg.p2.x) / 2;
        const midY = (seg.p1.y + seg.p2.y) / 2;
        const labelWorldX = midX + seg.normal.x * 1.0;
        const labelWorldY = midY + seg.normal.y * 1.0;
        const { sx, sy } = worldToScreen(labelWorldX, labelWorldY);

        const text = `${seg.length.toFixed(1)}m`;
        const textWidth = ctx.measureText(text).width;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(sx - textWidth / 2 - 4, sy - 8, textWidth + 8, 16, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e0e7ff';
        ctx.fillText(text, sx, sy);
      }
      ctx.restore();
    }

    // 6.5. Dynamic Drawing Tool Preview (Rectangle & Polyline)
    if (drawingMode === 'rectangle' && drawingVertices.length === 1 && currentMouseWorld) {
      const p1 = drawingVertices[0];
      const p2 = currentMouseWorld;
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      const s1 = worldToScreen(minX, minY);
      const s2 = worldToScreen(maxX, minY);
      const s3 = worldToScreen(maxX, maxY);
      const s4 = worldToScreen(minX, maxY);

      ctx.save();
      // Filled preview box
      ctx.beginPath();
      ctx.moveTo(s1.sx, s1.sy);
      ctx.lineTo(s2.sx, s2.sy);
      ctx.lineTo(s3.sx, s3.sy);
      ctx.lineTo(s4.sx, s4.sy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(99, 102, 241, 0.22)';
      ctx.fill();

      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 4]);
      ctx.stroke();

      // Corner handles
      [s1, s2, s3, s4].forEach((s) => {
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#6366f1';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Dimensions annotations
      const widthM = maxX - minX;
      const heightM = maxY - minY;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Width label
      const midTopX = (s4.sx + s3.sx) / 2;
      const midTopY = (s4.sy + s3.sy) / 2 - 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1;
      const wText = `${widthM.toFixed(2)} m`;
      const wTw = ctx.measureText(wText).width;
      ctx.beginPath();
      ctx.roundRect(midTopX - wTw / 2 - 4, midTopY - 8, wTw + 8, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#a5b4fc';
      ctx.fillText(wText, midTopX, midTopY);

      // Height label
      const midRightX = (s2.sx + s3.sx) / 2 + 25;
      const midRightY = (s2.sy + s3.sy) / 2;
      const hText = `${heightM.toFixed(2)} m`;
      const hTw = ctx.measureText(hText).width;
      ctx.beginPath();
      ctx.roundRect(midRightX - hTw / 2 - 4, midRightY - 8, hTw + 8, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#a5b4fc';
      ctx.fillText(hText, midRightX, midRightY);

      ctx.restore();
    } else if (drawingMode === 'polyline' && drawingVertices.length >= 1) {
      ctx.save();
      const p0 = drawingVertices[0];
      const s0 = worldToScreen(p0.x, p0.y);

      let isNearStart = false;
      let mouseScreen: { sx: number; sy: number } | null = null;
      if (currentMouseWorld) {
        mouseScreen = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
        if (drawingVertices.length >= 3) {
          const distToP0 = Math.hypot(mouseScreen.sx - s0.sx, mouseScreen.sy - s0.sy);
          if (distToP0 < 20) isNearStart = true;
        }
      }

      // 1. Draw existing placed segments
      if (drawingVertices.length >= 2) {
        ctx.beginPath();
        const start = worldToScreen(drawingVertices[0].x, drawingVertices[0].y);
        ctx.moveTo(start.sx, start.sy);
        for (let i = 1; i < drawingVertices.length; i++) {
          const s = worldToScreen(drawingVertices[i].x, drawingVertices[i].y);
          ctx.lineTo(s.sx, s.sy);
        }
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // 2. Draw active rubber-band line to cursor
      if (mouseScreen) {
        const lastV = drawingVertices[drawingVertices.length - 1];
        const lastS = worldToScreen(lastV.x, lastV.y);
        const targetS = isNearStart ? s0 : mouseScreen;

        ctx.beginPath();
        ctx.moveTo(lastS.sx, lastS.sy);
        ctx.lineTo(targetS.sx, targetS.sy);
        ctx.strokeStyle = isNearStart ? '#10b981' : '#f59e0b';
        ctx.lineWidth = isNearStart ? 2.5 : 2.0;
        ctx.setLineDash(isNearStart ? [] : [6, 4]);
        ctx.stroke();

        // Rubber-band length label
        if (!isNearStart && currentMouseWorld) {
          const segLen = Math.hypot(currentMouseWorld.x - lastV.x, currentMouseWorld.y - lastV.y);
          const midSx = (lastS.sx + mouseScreen.sx) / 2;
          const midSy = (lastS.sy + mouseScreen.sy) / 2 - 10;
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1;
          const lText = `${segLen.toFixed(2)}m`;
          const lTw = ctx.measureText(lText).width;
          ctx.beginPath();
          ctx.roundRect(midSx - lTw / 2 - 3, midSy - 7, lTw + 6, 14, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fcd34d';
          ctx.fillText(lText, midSx, midSy);
        }
      }

      // 3. Vertex markers
      drawingVertices.forEach((v, idx) => {
        const s = worldToScreen(v.x, v.y);
        const isStartVertex = idx === 0;

        ctx.beginPath();
        ctx.arc(s.sx, s.sy, isStartVertex && isNearStart ? 8 : 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = isStartVertex ? (isNearStart ? '#10b981' : '#f59e0b') : '#6366f1';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (isStartVertex && isNearStart) {
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1;
          const snapText = 'Kliknij, aby ZAMKNĄĆ polilinię';
          const stw = ctx.measureText(snapText).width;
          ctx.beginPath();
          ctx.roundRect(s.sx - stw / 2 - 6, s.sy - 24, stw + 12, 18, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#34d399';
          ctx.fillText(snapText, s.sx, s.sy - 15);
        }
      });

      ctx.restore();
    }

    // 6.6. Edge Editing Mode Overlay & Handles
    if (isEditMode && selectedBuildingId) {
      const bldg = buildings.find((b) => b.id === selectedBuildingId);
      if (bldg && bldg.vertices.length >= 3) {
        ctx.save();
        const n = bldg.vertices.length;

        for (let i = 0; i < n; i++) {
          const p1 = bldg.vertices[i];
          const p2 = bldg.vertices[(i + 1) % n];
          const isEdgeHovered = hoveredEdge?.buildingId === bldg.id && hoveredEdge?.edgeIndex === i;
          const isEdgeDragged = draggingEdge?.buildingId === bldg.id && draggingEdge?.edgeIndex === i;
          const isCurrentActive = isEdgeHovered || isEdgeDragged;

          const s1 = worldToScreen(p1.x, p1.y);
          const s2 = worldToScreen(p2.x, p2.y);

          // Edge stroke highlight when hovered/dragged
          if (isCurrentActive) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(s1.sx, s1.sy);
            ctx.lineTo(s2.sx, s2.sy);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.restore();
          }

          // Edge mid-point handle
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const midS = worldToScreen(midX, midY);

          ctx.beginPath();
          ctx.arc(midS.sx, midS.sy, isCurrentActive ? 7 : 5, 0, 2 * Math.PI);
          ctx.fillStyle = isCurrentActive ? '#f59e0b' : '#38bdf8';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Normal direction arrow on handle
          const seg = bldg.segments[i];
          if (seg) {
            const normalArrowLen = isCurrentActive ? 14 : 10;
            const nx = seg.normal.x;
            const ny = -seg.normal.y; // screen Y is inverted

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(midS.sx - nx * normalArrowLen, midS.sy - ny * normalArrowLen);
            ctx.lineTo(midS.sx + nx * normalArrowLen, midS.sy + ny * normalArrowLen);
            ctx.strokeStyle = isCurrentActive ? '#fbbf24' : 'rgba(56, 189, 248, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
          }

          if (isCurrentActive) {
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1;
            const hintText = 'Przeciągnij, aby przesunąć krawędź równolegle';
            const htw = ctx.measureText(hintText).width;
            ctx.beginPath();
            ctx.roundRect(midS.sx - htw / 2 - 5, midS.sy - 22, htw + 10, 16, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fef08a';
            ctx.fillText(hintText, midS.sx, midS.sy - 11);
          }
        }
        ctx.restore();
      }
    }

    // 6.7. Dimensions Rendering (Linear & Angular)
    if (dimensions && dimensions.length > 0) {
      ctx.save();
      for (const dim of dimensions) {
        const bldg1 = buildings.find((b) => b.id === dim.ref1.buildingId);
        const seg1 = bldg1?.segments.find((s) => s.id === dim.ref1.segmentId);
        const bldg2 = buildings.find((b) => b.id === dim.ref2.buildingId);
        const seg2 = bldg2?.segments.find((s) => s.id === dim.ref2.segmentId);

        if (!seg1 || !seg2) continue;

        if (dim.type === 'linear') {
          const res = computeLinearDimension(seg1.p1, seg1.p2, seg2.p1, seg2.p2);
          const s1 = worldToScreen(res.p1.x, res.p1.y);
          const s2 = worldToScreen(res.p2.x, res.p2.y);

          // Dimension line
          ctx.beginPath();
          ctx.moveTo(s1.sx, s1.sy);
          ctx.lineTo(s2.sx, s2.sy);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // End ticks perpendicular to dimension line
          const angle = Math.atan2(s2.sy - s1.sy, s2.sx - s1.sx);
          const perpAngle = angle + Math.PI / 2;
          const tickLen = 6;

          [s1, s2].forEach((s) => {
            ctx.beginPath();
            ctx.moveTo(s.sx - Math.cos(perpAngle) * tickLen, s.sy - Math.sin(perpAngle) * tickLen);
            ctx.lineTo(s.sx + Math.cos(perpAngle) * tickLen, s.sy + Math.sin(perpAngle) * tickLen);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.0;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(s.sx, s.sy, 3, 0, 2 * Math.PI);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
          });

          // Measurement badge
          const midSx = (s1.sx + s2.sx) / 2;
          const midSy = (s1.sy + s2.sy) / 2;
          const labelText = `${res.distance.toFixed(2)} m`;

          ctx.font = 'bold 11px monospace';
          const lw = ctx.measureText(labelText).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(midSx - lw / 2 - 5, midSy - 9, lw + 10, 18, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#e0f2fe';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, midSx, midSy);
        } else {
          // Angular dimension
          const res = computeAngularDimension(seg1.p1, seg1.p2, seg2.p1, seg2.p2);
          const sI = worldToScreen(res.intersection.x, res.intersection.y);
          const sm1 = worldToScreen(res.mid1.x, res.mid1.y);
          const sm2 = worldToScreen(res.mid2.x, res.mid2.y);

          // Connecting guide lines from intersection to midpoints
          ctx.beginPath();
          ctx.moveTo(sI.sx, sI.sy);
          ctx.lineTo(sm1.sx, sm1.sy);
          ctx.moveTo(sI.sx, sI.sy);
          ctx.lineTo(sm2.sx, sm2.sy);
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Arc
          const r = 26;
          ctx.beginPath();
          ctx.arc(sI.sx, sI.sy, r, -res.ang1, -res.ang2, res.ang1 > res.ang2);
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2.0;
          ctx.stroke();

          // Label
          const labelAngle = (-res.ang1 + -res.ang2) / 2;
          const labelX = sI.sx + Math.cos(labelAngle) * (r + 14);
          const labelY = sI.sy + Math.sin(labelAngle) * (r + 14);
          const labelText = `${res.angleDeg.toFixed(1)}°`;

          ctx.font = 'bold 11px monospace';
          const lw = ctx.measureText(labelText).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(labelX - lw / 2 - 5, labelY - 9, lw + 10, 18, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f3e8ff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, labelX, labelY);
        }
      }
      ctx.restore();
    }

    // 6.8. Active Dimension Tool Interactive Guide & Live Preview
    if (isDimensionMode) {
      ctx.save();

      // Highlight pending 1st edge
      if (dimensionPendingRef) {
        const bldg1 = buildings.find((b) => b.id === dimensionPendingRef.buildingId);
        const seg1 = bldg1?.segments.find((s) => s.id === dimensionPendingRef.segmentId);
        if (seg1) {
          const s1_p1 = worldToScreen(seg1.p1.x, seg1.p1.y);
          const s1_p2 = worldToScreen(seg1.p2.x, seg1.p2.y);

          ctx.beginPath();
          ctx.moveTo(s1_p1.sx, s1_p1.sy);
          ctx.lineTo(s1_p2.sx, s1_p2.sy);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 5;
          ctx.stroke();

          const midS = worldToScreen((seg1.p1.x + seg1.p2.x) / 2, (seg1.p1.y + seg1.p2.y) / 2);
          ctx.font = 'bold 10px sans-serif';
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          const hint = '1. Początek wymiaru';
          const hw = ctx.measureText(hint).width;
          ctx.beginPath();
          ctx.roundRect(midS.sx - hw / 2 - 5, midS.sy - 20, hw + 10, 16, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#38bdf8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(hint, midS.sx, midS.sy - 12);
        }
      }

      // Highlight hovered edge
      if (dimHoveredEdge) {
        const hBldg = buildings.find((b) => b.id === dimHoveredEdge.buildingId);
        const hSeg = hBldg?.segments.find((s) => s.id === dimHoveredEdge.segmentId);
        if (hSeg) {
          const hs1 = worldToScreen(hSeg.p1.x, hSeg.p1.y);
          const hs2 = worldToScreen(hSeg.p2.x, hSeg.p2.y);

          ctx.beginPath();
          ctx.moveTo(hs1.sx, hs1.sy);
          ctx.lineTo(hs2.sx, hs2.sy);
          ctx.strokeStyle = dimensionPendingRef ? '#34d399' : '#38bdf8';
          ctx.lineWidth = 4;
          ctx.stroke();

          // Live rubber-band preview if pending ref exists
          if (dimensionPendingRef) {
            const bldg1 = buildings.find((b) => b.id === dimensionPendingRef.buildingId);
            const seg1 = bldg1?.segments.find((s) => s.id === dimensionPendingRef.segmentId);
            if (seg1) {
              if (dimensionType === 'linear') {
                const res = computeLinearDimension(seg1.p1, seg1.p2, hSeg.p1, hSeg.p2);
                const s1 = worldToScreen(res.p1.x, res.p1.y);
                const s2 = worldToScreen(res.p2.x, res.p2.y);

                ctx.beginPath();
                ctx.moveTo(s1.sx, s1.sy);
                ctx.lineTo(s2.sx, s2.sy);
                ctx.strokeStyle = '#34d399';
                ctx.lineWidth = 2.0;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);

                const midSx = (s1.sx + s2.sx) / 2;
                const midSy = (s1.sy + s2.sy) / 2;
                const prevLabel = `${res.distance.toFixed(2)} m (Kliknij koniec)`;
                ctx.font = 'bold 11px sans-serif';
                const pw = ctx.measureText(prevLabel).width;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
                ctx.strokeStyle = '#34d399';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(midSx - pw / 2 - 6, midSy - 10, pw + 12, 20, 4);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#6ee7b7';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(prevLabel, midSx, midSy);
              } else {
                const res = computeAngularDimension(seg1.p1, seg1.p2, hSeg.p1, hSeg.p2);
                const prevLabel = `${res.angleDeg.toFixed(1)}° (Kliknij koniec)`;
                const midS = worldToScreen((hSeg.p1.x + hSeg.p2.x) / 2, (hSeg.p1.y + hSeg.p2.y) / 2);

                ctx.font = 'bold 11px sans-serif';
                const pw = ctx.measureText(prevLabel).width;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
                ctx.strokeStyle = '#c084fc';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(midS.sx - pw / 2 - 6, midS.sy - 22, pw + 12, 20, 4);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#e9d5ff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(prevLabel, midS.sx, midS.sy - 12);
              }
            }
          }
        }
      }

      ctx.restore();
    }

    // 7. Visual Metric Scale Bar (bottom-right)
    {
      ctx.save();
      const margin = 24;
      const targetPixels = 100;
      const rawMeters = targetPixels / Math.max(0.0001, viewState.scale);
      const exp = Math.floor(Math.log10(rawMeters));
      const frac = rawMeters / Math.pow(10, exp);
      let niceFrac = 1;
      if (frac >= 5) niceFrac = 5;
      else if (frac >= 2) niceFrac = 2;
      const niceMeters = niceFrac * Math.pow(10, exp);
      const barPixels = niceMeters * viewState.scale;

      const barX = width - margin - barPixels;
      const barY = height - margin;

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(barX, barY - 6);
      ctx.lineTo(barX, barY);
      ctx.lineTo(barX + barPixels, barY);
      ctx.lineTo(barX + barPixels, barY - 6);
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      const label = niceMeters >= 1000 ? `${(niceMeters / 1000).toFixed(1)} km` : `${niceMeters} m`;
      ctx.fillText(label, barX + barPixels / 2, barY - 10);
      ctx.restore();
    }

    ctx.restore();
  }, [
    buildings,
    selectedBuildingId,
    analysisResults,
    selectedPointResult,
    activePointMode,
    viewState,
    canvasDimensions,
    showNormals,
    showShadowingLines,
    showSunlightLines,
    showShadowRange,
    latitude,
    equinoxDate,
    isLinkingMode,
    linkingSourceId,
    drawingMode,
    drawingVertices,
    currentMouseWorld,
    isEditMode,
    hoveredEdge,
    draggingEdge,
    dimensions,
    isDimensionMode,
    dimensionType,
    dimensionPendingRef,
    dimHoveredEdge,
    layerSettings,
    worldToScreen,
    screenToWorld,
  ]);


  // Mouse interaction handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

    setViewState((prev) => {
      const newScale = Math.max(0.5, Math.min(500, prev.scale * zoomFactor));
      const wx = (mouseX - prev.panX) / prev.scale;
      const wy = -(mouseY - prev.panY) / prev.scale;

      const newPanX = mouseX - wx * newScale;
      const newPanY = mouseY + wy * newScale;

      return {
        ...prev,
        scale: newScale,
        panX: newPanX,
        panY: newPanY,
      };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    // If dimension tool is active:
    if (isDimensionMode && dimHoveredEdge) {
      onDimensionClickEdge?.(dimHoveredEdge.buildingId, dimHoveredEdge.segmentId);
      return;
    }

    // If drawing mode is active:
    if (drawingMode === 'rectangle') {
      if (drawingVertices.length === 0) {
        setDrawingVertices([{ x: world.wx, y: world.wy }]);
      } else {
        const p1 = drawingVertices[0];
        const p2 = { x: world.wx, y: world.wy };
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        if (w >= 0.2 && h >= 0.2) {
          const minX = Math.min(p1.x, p2.x);
          const maxX = Math.max(p1.x, p2.x);
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          const rectVerts: Point2D[] = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ];
          onFinishDrawing?.(rectVerts, 'rectangle');
          setDrawingVertices([]);
          setCurrentMouseWorld(null);
        }
      }
      return;
    }

    if (drawingMode === 'polyline') {
      if (drawingVertices.length === 0) {
        setDrawingVertices([{ x: world.wx, y: world.wy }]);
      } else {
        const p0 = drawingVertices[0];
        const s0 = worldToScreen(p0.x, p0.y);
        const distToP0 = Math.hypot(sx - s0.sx, sy - s0.sy);

        if (distToP0 < 20 && drawingVertices.length >= 3) {
          onFinishDrawing?.(drawingVertices, 'polyline');
          setDrawingVertices([]);
          setCurrentMouseWorld(null);
        } else {
          setDrawingVertices((prev) => [...prev, { x: world.wx, y: world.wy }]);
        }
      }
      return;
    }

    // If edit mode is active and an edge is hovered, start dragging the edge
    if (isEditMode && hoveredEdge) {
      setDraggingEdge(hoveredEdge);
      setDragStart({ x: world.wx, y: world.wy });
      onInteractionChange?.(true);
      return;
    }

    // Check if clicked near an analysis point or facade segment
    let clickedPoint: AnalysisPointResult | null = null;
    let minDist = 1.0;

    for (const res of analysisResults) {
      const bldg = buildings.find((b) => b.id === res.buildingId);
      const lyr = bldg?.layer || 'Domyślna (0)';
      const lyrSetting = layerSettings[lyr] || {};
      if (lyrSetting.isVisible === false || lyrSetting.isGhosted === true) continue;

      const d = Math.hypot(res.point.x - world.wx, res.point.y - world.wy);
      if (d < minDist) {
        minDist = d;
        clickedPoint = res;
      }
    }

    if (clickedPoint) {
      onSelectPointResult(clickedPoint);
      return;
    }

    // Check if clicked near any building facade segment (project onto wall)
    let closestSegHit: { bldgId: string; segId: string; ratio: number } | null = null;
    let minSegDist = 0.8; // meters

    for (const bldg of buildings) {
      const lyr = bldg.layer || 'Domyślna (0)';
      const lyrSetting = layerSettings[lyr] || {};
      if (lyrSetting.isVisible === false || lyrSetting.isGhosted === true) continue;

      for (const seg of bldg.segments) {
        const dx = seg.p2.x - seg.p1.x;
        const dy = seg.p2.y - seg.p1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-4) continue;

        const u = ((world.wx - seg.p1.x) * dx + (world.wy - seg.p1.y) * dy) / lenSq;
        const clampedU = Math.max(0.02, Math.min(0.98, u));
        const px = seg.p1.x + clampedU * dx;
        const py = seg.p1.y + clampedU * dy;
        const dist = Math.hypot(world.wx - px, world.wy - py);

        if (dist < minSegDist) {
          minSegDist = dist;
          closestSegHit = { bldgId: bldg.id, segId: seg.id, ratio: clampedU };
        }
      }
    }

    if (closestSegHit) {
      onSelectPointResult({
        id: `pinned-${closestSegHit.bldgId}-${closestSegHit.segId}-${closestSegHit.ratio.toFixed(4)}`,
        point: { x: 0, y: 0 },
        normal: { x: 0, y: 0 },
        buildingId: closestSegHit.bldgId,
        segmentId: closestSegHit.segId,
        shadowing: {
          point: { x: 0, y: 0 },
          segmentId: closestSegHit.segId,
          offsetRatio: closestSegHit.ratio,
          isCompliant: false,
          maxContinuousFreeSpanDeg: 0,
          totalFreeSpanDeg: 0,
          sectors: [],
          rays: [],
        },
        sunlight: {
          point: { x: 0, y: 0 },
          segmentId: closestSegHit.segId,
          offsetRatio: closestSegHit.ratio,
          totalHours: 0,
          totalMinutes: 0,
          isCompliant: false,
          timeSlots: [],
        },
      });
      return;
    }

    // Check if clicked inside a building
    let clickedBuildingId: string | null = null;
    for (const bldg of buildings) {
      const lyr = bldg.layer || 'Domyślna (0)';
      const lyrSetting = layerSettings[lyr] || {};
      if (lyrSetting.isVisible === false || lyrSetting.isGhosted === true) continue;

      const minX = Math.min(...bldg.vertices.map((v) => v.x));
      const maxX = Math.max(...bldg.vertices.map((v) => v.x));
      const minY = Math.min(...bldg.vertices.map((v) => v.y));
      const maxY = Math.max(...bldg.vertices.map((v) => v.y));

      if (world.wx >= minX && world.wx <= maxX && world.wy >= minY && world.wy <= maxY) {
        clickedBuildingId = bldg.id;
        break;
      }
    }

    if (e.button === 0 && clickedBuildingId) {
      onSelectBuilding(clickedBuildingId);
      const clickedBldg = buildings.find((b) => b.id === clickedBuildingId);
      const lyr = clickedBldg?.layer || 'Domyślna (0)';
      const isLocked = layerSettings[lyr]?.isLocked === true;

      if (!isLocked) {
        setIsDraggingBuilding(true);
        setDragStart({ x: world.wx, y: world.wy });
        onInteractionChange?.(true);
      }
    } else {
      setIsPanning(true);
      setDragStart({ x: sx, y: sy });
      onInteractionChange?.(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (drawingMode !== 'none') {
      setCurrentMouseWorld({ x: world.wx, y: world.wy });
    }

    // Check edge hover in dimension mode
    if (isDimensionMode) {
      let closestSeg: { buildingId: string; segmentId: string } | null = null;
      let minSegDist = 1.2; // 1.2m tolerance
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

    // Check edge hover in edit mode
    if (isEditMode && selectedBuildingId) {
      const bldg = buildings.find((b) => b.id === selectedBuildingId);
      const lyr = bldg?.layer || 'Domyślna (0)';
      const isLocked = layerSettings[lyr]?.isLocked === true;

      if (bldg && bldg.vertices.length >= 3 && !isLocked) {
        let closestEdgeIdx: number | null = null;
        let minEdgeDist = 1.0; // 1 meter hover tolerance
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

  const handleMouseUp = () => {
    if (isPanning || isDraggingBuilding || draggingEdge) {
      onInteractionChange?.(false);
    }
    setIsPanning(false);
    setIsDraggingBuilding(false);
    setDraggingEdge(null);
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
              : isPanning || isDraggingBuilding
              ? 'grabbing'
              : 'grab',
        }}
      />
    </div>
  );
};
