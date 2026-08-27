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
    const width = rect.width || window.innerWidth - 380;
    const height = rect.height || window.innerHeight;

    if (width <= 0 || height <= 0) return;

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

    // Available screen space with padding (margin 25%)
    const paddingFactor = 0.70;
    const scaleX = (width * paddingFactor) / bboxWidth;
    const scaleY = (height * paddingFactor) / bboxHeight;
    const newScale = Math.min(scaleX, scaleY);

    // Calculate pan coordinates to put (centerX, centerY) right at screen center
    const panX = width / 2 - centerX * newScale;
    const panY = height / 2 + centerY * newScale; // Y-up inverted

    setViewState({
      panX,
      panY,
      scale: Math.max(0.0001, newScale),
    });
  }, [buildings]);

  // Fit to extents on initial mount, when buildings change or when fitTrigger is updated
  useEffect(() => {
    const timer = setTimeout(() => {
      fitToExtents();
    }, 50);
    return () => clearTimeout(timer);
  }, [buildings, fitTrigger]);

  // Resize Observer for 100% fullscreen canvas sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(100, Math.round(rect.width));
      const h = Math.max(100, Math.round(rect.height));

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = Math.max(100, rect.width);
    const height = Math.max(100, rect.height);

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // 1. Clean CAD background
    ctx.fillStyle = '#020617'; // slate-950
    ctx.fillRect(0, 0, width, height);

    // 2. High-precision dynamic CAD Grid
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    const gridStep = Math.max(1, Math.pow(10, Math.floor(Math.log10(50 / Math.max(0.001, viewState.scale))))); // Dynamic grid step
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

    // 3. Render Buildings
    for (const bldg of buildings) {
      const isSelected = bldg.id === selectedBuildingId;
      const isTested = bldg.isTested;

      ctx.beginPath();
      bldg.vertices.forEach((v, idx) => {
        const { sx, sy } = worldToScreen(v.x, v.y);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();

      // Premium Fill styling
      if (isTested) {
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.28)' : 'rgba(59, 130, 246, 0.16)';
      } else {
        ctx.fillStyle = isSelected ? 'rgba(148, 163, 184, 0.25)' : 'rgba(71, 85, 105, 0.18)';
      }
      ctx.fill();

      // Clean Stroke
      ctx.strokeStyle = isTested ? '#3b82f6' : '#64748b';
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

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
        ctx.roundRect(sx - 70, sy - 18, 140, 36, 8);
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#334155';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${bldg.name}`, sx, sy - 2);

        ctx.fillStyle = isTested ? '#60a5fa' : '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(`H = ${bldg.defaultHeight}m ${bldg.isTested ? '• BADANY' : ''}`, sx, sy + 11);
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

    // 4. Render Analytical Lines & Sample Points
    const offsetDistance = 0.8; // meters

    for (const res of analysisResults) {
      const { point, normal, shadowing, sunlight } = res;
      const isSelectedPoint = selectedPointResult?.id === res.id;

      // § 12 (Inner offset / Direct facade points)
      if (showShadowingLines) {
        const { sx, sy } = worldToScreen(point.x, point.y);
        ctx.beginPath();
        ctx.arc(sx, sy, isSelectedPoint ? 6 : 4, 0, 2 * Math.PI);
        ctx.fillStyle = shadowing.isCompliant ? '#10b981' : '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isSelectedPoint ? 2.5 : 1;
        ctx.stroke();
      }

      // § 56 (Outer offset solar points)
      if (showSunlightLines) {
        const outerX = point.x + normal.x * offsetDistance;
        const outerY = point.y + normal.y * offsetDistance;
        const { sx, sy } = worldToScreen(outerX, outerY);

        ctx.beginPath();
        ctx.arc(sx, sy, isSelectedPoint ? 6 : 4, 0, 2 * Math.PI);

        if (sunlight.totalHours >= 3.0) {
          ctx.fillStyle = '#10b981'; // Green
        } else if (sunlight.totalHours >= 1.5) {
          ctx.fillStyle = '#f59e0b'; // Amber/Yellow
        } else {
          ctx.fillStyle = '#ef4444'; // Red
        }
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 5. Render Ray Casting Fan for Selected Point
    if (selectedPointResult) {
      const { point, shadowing } = selectedPointResult;
      const { sx: px, sy: py } = worldToScreen(point.x, point.y);

      for (const ray of shadowing.rays) {
        const dist = Math.min(ray.hitDistance, 28);
        const rad = (ray.worldAngleDeg * Math.PI) / 180;
        const targetWorldX = point.x + Math.cos(rad) * dist;
        const targetWorldY = point.y + Math.sin(rad) * dist;
        const { sx: rx, sy: ry } = worldToScreen(targetWorldX, targetWorldY);

        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(rx, ry);
        ctx.strokeStyle = ray.isFree ? 'rgba(52, 211, 153, 0.35)' : 'rgba(244, 63, 94, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
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

    // Check if clicked on an analysis point
    let clickedPoint: AnalysisPointResult | null = null;
    let minDist = 1.2;

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
    } else {
      setIsPanning(true);
      setDragStart({ x: sx, y: sy });
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
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />
    </div>
  );
};
