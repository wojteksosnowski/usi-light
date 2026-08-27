import React, { useRef, useEffect, useState } from 'react';
import {
  BuildingLoop,
  AnalysisPointResult,
  Point2D,
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport state (pan & zoom)
  const [viewState, setViewState] = useState({
    panX: 400,
    panY: 350,
    scale: 12, // pixels per meter
  });

  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingBuilding, setIsDraggingBuilding] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // World <-> Screen coordinate conversions
  const worldToScreen = (wx: number, wy: number) => {
    return {
      sx: viewState.panX + wx * viewState.scale,
      sy: viewState.panY - wy * viewState.scale, // Y-up in CAD
    };
  };

  const screenToWorld = (sx: number, sy: number) => {
    return {
      wx: (sx - viewState.panX) / viewState.scale,
      wy: -(sy - viewState.panY) / viewState.scale,
    };
  };

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle canvas resizing
    canvas.width = canvas.parentElement?.clientWidth || 800;
    canvas.height = canvas.parentElement?.clientHeight || 600;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Clear background
    ctx.fillStyle = '#0f172a'; // Tailwind slate-900
    ctx.fillRect(0, 0, width, height);

    // 2. Draw CAD Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridStep = 5; // meters
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

    // Draw Main Axes
    const originScreen = worldToScreen(0, 0);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, originScreen.sy);
    ctx.lineTo(width, originScreen.sy);
    ctx.moveTo(originScreen.sx, 0);
    ctx.lineTo(originScreen.sx, height);
    ctx.stroke();

    // 3. Draw Buildings
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

      // Building Fill
      if (isTested) {
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.2)';
      } else {
        ctx.fillStyle = isSelected ? 'rgba(148, 163, 184, 0.35)' : 'rgba(71, 85, 105, 0.25)';
      }
      ctx.fill();

      // Building Stroke
      ctx.strokeStyle = isTested ? '#60a5fa' : '#94a3b8';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Building Label
      if (bldg.vertices.length > 0) {
        const centroid = bldg.vertices.reduce(
          (acc, v) => ({ x: acc.x + v.x / bldg.vertices.length, y: acc.y + v.y / bldg.vertices.length }),
          { x: 0, y: 0 }
        );
        const { sx, sy } = worldToScreen(centroid.x, centroid.y);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${bldg.name}`, sx, sy);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.fillText(`H = ${bldg.defaultHeight}m`, sx, sy + 14);
      }

      // Draw Facade Normals
      if (showNormals) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        for (const seg of bldg.segments) {
          const midX = (seg.p1.x + seg.p2.x) / 2;
          const midY = (seg.p1.y + seg.p2.y) / 2;
          const { sx: mx, sy: my } = worldToScreen(midX, midY);
          const { sx: nx, sy: ny } = worldToScreen(midX + seg.normal.x * 1.5, midY + seg.normal.y * 1.5);

          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(nx, ny);
          ctx.stroke();

          // Arrowhead
          const headLen = 5;
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

    // 4. Draw Analysis Offset Lines & Sample Points
    const offsetDistance = 0.6; // meters

    for (const res of analysisResults) {
      const { point, normal, shadowing, sunlight } = res;
      const isSelectedPoint = selectedPointResult?.id === res.id;

      // § 12 (Inner offset / Direct point)
      if (showShadowingLines) {
        const { sx, sy } = worldToScreen(point.x, point.y);
        ctx.beginPath();
        ctx.arc(sx, sy, isSelectedPoint ? 6 : 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = shadowing.isCompliant ? '#10b981' : '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isSelectedPoint ? 2 : 1;
        ctx.stroke();
      }

      // § 56 (Outer offset line)
      if (showSunlightLines) {
        const outerX = point.x + normal.x * offsetDistance;
        const outerY = point.y + normal.y * offsetDistance;
        const { sx, sy } = worldToScreen(outerX, outerY);

        ctx.beginPath();
        ctx.arc(sx, sy, isSelectedPoint ? 6 : 3.5, 0, 2 * Math.PI);

        // Sunlight Color scale: Red (<1.5h), Yellow (1.5h-3h), Green (>=3h)
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

    // 5. Draw Solar Fan / Shadowing Rays for Selected Point
    if (selectedPointResult) {
      const { point, shadowing } = selectedPointResult;
      const { sx: px, sy: py } = worldToScreen(point.x, point.y);

      // Draw rays
      for (const ray of shadowing.rays) {
        const dist = Math.min(ray.hitDistance, 25);
        const rad = (ray.worldAngleDeg * Math.PI) / 180;
        const targetWorldX = point.x + Math.cos(rad) * dist;
        const targetWorldY = point.y + Math.sin(rad) * dist;
        const { sx: rx, sy: ry } = worldToScreen(targetWorldX, targetWorldY);

        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(rx, ry);
        ctx.strokeStyle = ray.isFree ? 'rgba(52, 211, 153, 0.25)' : 'rgba(248, 113, 113, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }, [
    buildings,
    selectedBuildingId,
    analysisResults,
    selectedPointResult,
    viewState,
    showNormals,
    showShadowingLines,
    showSunlightLines,
  ]);

  // Mouse interaction handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setViewState((prev) => ({
      ...prev,
      scale: Math.max(2, Math.min(80, prev.scale * zoomFactor)),
    }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    // Check if clicked near an analysis point
    let clickedPoint: AnalysisPointResult | null = null;
    let minDist = 1.0; // 1 meter threshold

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
      // Simplified bounding box / point check
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
    const rect = canvasRef.current?.getBoundingClientRect();
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
    <div className="relative w-full h-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="w-full h-full cursor-crosshair block"
      />
    </div>
  );
};
