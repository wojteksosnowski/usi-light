import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  BuildingLoop,
  AnalysisPointResult,
} from '../types/geometry';

interface CadCanvasProps {
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  onSelectBuilding: (id: string | null) => void;
  onBuildingMove: (id: string, dx: number, dy: number) => void;
  analysisResults: AnalysisPointResult[];
  selectedPointResult: AnalysisPointResult | null;
  onSelectPointResult: (res: AnalysisPointResult | null) => void;
  showNormals: boolean;
  showShadowingLines: boolean;
  showSunlightLines: boolean;
  fitTrigger?: number;
  onInteractionChange?: (isInteracting: boolean) => void;
}

export const CadCanvas: React.FC<CadCanvasProps> = ({
  buildings,
  selectedBuildingId,
  onSelectBuilding,
  onBuildingMove,
  analysisResults,
  selectedPointResult,
  onSelectPointResult,
  showNormals,
  showShadowingLines,
  showSunlightLines,
  fitTrigger,
  onInteractionChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Margin factor 65%
    const scaleX = (width * 0.65) / bboxWidth;
    const scaleY = (height * 0.65) / bboxHeight;
    const newScale = Math.max(0.001, Math.min(100, Math.min(scaleX, scaleY)));

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
      const w = Math.max(200, Math.floor(rect.width || window.innerWidth - 380));
      const h = Math.max(200, Math.floor(rect.height || window.innerHeight));
      setCanvasDimensions((prev) => {
        if (prev.width !== w || prev.height !== h) {
          return { width: w, height: h };
        }
        return prev;
      });
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);
    window.addEventListener('resize', updateDimensions);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

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

    // 4. Render Analytical Bands & Lines adjacent to building facades
    // Helper function for Purple-to-Orange sunlight color scale in 30-minute steps (with 0.85 opacity)
    const getSunlightColor = (hours: number) => {
      // Step to nearest 0.5h (30 min)
      const steppedHours = Math.floor(hours * 2) / 2;
      
      // Color Palette: Deep Violet (0h) -> Purple (1h) -> Magenta/Pink (2h) -> Coral/Amber (3h) -> Bright Orange (4h+)
      if (steppedHours < 0.5) return 'rgba(59, 7, 100, 0.85)';   // very dark purple (<30 min)
      if (steppedHours < 1.0) return 'rgba(88, 28, 135, 0.85)';  // dark violet (30 min)
      if (steppedHours < 1.5) return 'rgba(126, 34, 206, 0.85)'; // violet (1.0 h)
      if (steppedHours < 2.0) return 'rgba(168, 85, 247, 0.85)'; // bright purple (1.5 h)
      if (steppedHours < 2.5) return 'rgba(192, 38, 211, 0.85)'; // fuchsia / magenta (2.0 h)
      if (steppedHours < 3.0) return 'rgba(225, 29, 72, 0.85)';  // rose / coral (2.5 h)
      if (steppedHours < 3.5) return 'rgba(234, 88, 12, 0.85)';  // rich orange (3.0 h - standard met)
      if (steppedHours < 4.0) return 'rgba(249, 115, 22, 0.85)'; // vibrant orange (3.5 h)
      return 'rgba(251, 146, 60, 0.85)';                         // bright warm orange (4.0 h+)
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

      // Clean Stroke (drawn above analytical bands)
      ctx.save();
      if (!isIncluded) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = isSelected ? '#94a3b8' : '#475569';
      } else {
        ctx.strokeStyle = isTested ? '#60a5fa' : '#64748b';
      }
      ctx.lineWidth = isSelected ? 3 : 1.5;
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
        ctx.strokeStyle = isSelected ? '#3b82f6' : (!isIncluded ? '#475569' : '#334155');
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = !isIncluded ? '#94a3b8' : '#f8fafc';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${bldg.name}`, sx, sy - 2);

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

    // 5. Render Ray Casting Fan for Selected Point — sector arc visualization
    if (selectedPointResult) {
      const { point, shadowing } = selectedPointResult;
      const { sx: px, sy: py } = worldToScreen(point.x, point.y);
      const rays = shadowing.rays;

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
    viewState,
    showNormals,
    showShadowingLines,
    showSunlightLines,
    worldToScreen,
    screenToWorld,
  ]);

  // Mouse interaction handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setViewState((prev) => ({
      ...prev,
      scale: Math.max(3, Math.min(100, prev.scale * zoomFactor)),
    }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    // Check if clicked near an analysis point or facade segment
    let clickedPoint: AnalysisPointResult | null = null;
    let minDist = 1.0;

    for (const res of analysisResults) {
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
      setIsDraggingBuilding(true);
      setDragStart({ x: world.wx, y: world.wy });
      onInteractionChange?.(true);
    } else {
      setIsPanning(true);
      setDragStart({ x: sx, y: sy });
      onInteractionChange?.(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

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
      const world = screenToWorld(sx, sy);
      const dwx = world.wx - dragStart.x;
      const dwy = world.wy - dragStart.y;
      onBuildingMove(selectedBuildingId, dwx, dwy);
      setDragStart({ x: world.wx, y: world.wy });
    }
  };

  const handleMouseUp = () => {
    if (isPanning || isDraggingBuilding) {
      onInteractionChange?.(false);
    }
    setIsPanning(false);
    setIsDraggingBuilding(false);
    setDragStart(null);
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />
    </div>
  );
};
