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

    // 3. Render Buildings
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

      // Fill styling
      if (!isIncluded) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      } else if (isTested) {
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.28)' : 'rgba(59, 130, 246, 0.16)';
      } else {
        ctx.fillStyle = isSelected ? 'rgba(148, 163, 184, 0.25)' : 'rgba(71, 85, 105, 0.18)';
      }
      ctx.fill();

      // Clean Stroke (dashed if excluded from calculation)
      ctx.save();
      if (!isIncluded) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = isSelected ? '#94a3b8' : '#475569';
      } else {
        ctx.strokeStyle = isTested ? '#3b82f6' : '#64748b';
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

    // 4. Render Analytical Bands & Lines adjacent to building facades
    // Helper function for Purple-to-Orange sunlight color scale in 30-minute steps
    const getSunlightColor = (hours: number) => {
      // Step to nearest 0.5h (30 min)
      const steppedHours = Math.floor(hours * 2) / 2;
      
      // Color Palette: Deep Violet (0h) -> Purple (1h) -> Magenta/Pink (2h) -> Coral/Amber (3h) -> Bright Orange (4h+)
      if (steppedHours < 0.5) return '#3b0764'; // very dark purple (<30 min)
      if (steppedHours < 1.0) return '#581c87'; // dark violet (30 min)
      if (steppedHours < 1.5) return '#7e22ce'; // violet (1.0 h)
      if (steppedHours < 2.0) return '#a855f7'; // bright purple (1.5 h)
      if (steppedHours < 2.5) return '#c026d3'; // fuchsia / magenta (2.0 h)
      if (steppedHours < 3.0) return '#e11d48'; // rose / coral (2.5 h)
      if (steppedHours < 3.5) return '#ea580c'; // rich orange (3.0 h - standard met)
      if (steppedHours < 4.0) return '#f97316'; // vibrant orange (3.5 h)
      return '#fb923c'; // bright warm orange (4.0 h+)
    };

    // Group analysis points by segment for smooth continuous band rendering
    const pointsBySegment = new Map<string, typeof analysisResults>();
    for (const res of analysisResults) {
      if (!pointsBySegment.has(res.segmentId)) {
        pointsBySegment.set(res.segmentId, []);
      }
      pointsBySegment.get(res.segmentId)!.push(res);
    }

    const bandThickness = Math.max(3, Math.min(10, viewState.scale * 0.35)); // Screen pixels thickness
    const offsetDistance = 0.45; // meters in world space for outer sunlight band

    pointsBySegment.forEach((points) => {
      if (points.length < 2) return;

      // Sort points along segment by ratio
      points.sort((a, b) => a.shadowing.offsetRatio - b.shadowing.offsetRatio);

      for (let i = 0; i < points.length - 1; i++) {
        const pA = points[i];
        const pB = points[i + 1];

        // --- § 12 Shadowing Band (Inner facade ribbon / line) ---
        if (showShadowingLines) {
          const sA = worldToScreen(pA.point.x, pA.point.y);
          const sB = worldToScreen(pB.point.x, pB.point.y);

          ctx.beginPath();
          ctx.moveTo(sA.sx, sA.sy);
          ctx.lineTo(sB.sx, sB.sy);
          ctx.strokeStyle = pA.shadowing.isCompliant && pB.shadowing.isCompliant ? '#10b981' : '#f43f5e';
          ctx.lineWidth = bandThickness;
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // --- § 56 Sunlight Band (Outer facade ribbon in violet-to-orange scale) ---
        if (showSunlightLines) {
          const normA = pA.normal;
          const normB = pB.normal;

          const outA = {
            x: pA.point.x + normA.x * offsetDistance,
            y: pA.point.y + normA.y * offsetDistance,
          };
          const outB = {
            x: pB.point.x + normB.x * offsetDistance,
            y: pB.point.y + normB.y * offsetDistance,
          };

          const sOutA = worldToScreen(outA.x, outA.y);
          const sOutB = worldToScreen(outB.x, outB.y);

          const avgHours = (pA.sunlight.totalHours + pB.sunlight.totalHours) / 2;
          ctx.beginPath();
          ctx.moveTo(sOutA.sx, sOutA.sy);
          ctx.lineTo(sOutB.sx, sOutB.sy);
          ctx.strokeStyle = getSunlightColor(avgHours);
          ctx.lineWidth = bandThickness;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
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

    // 5. Render Ray Casting Fan for Selected Point — sector arc visualization
    if (selectedPointResult) {
      const { point, shadowing } = selectedPointResult;
      const { sx: px, sy: py } = worldToScreen(point.x, point.y);
      const rays = shadowing.rays;

      if (rays.length > 0) {
        // Group rays into continuous same-state sectors
        type RaySector = { isFree: boolean; rays: typeof rays };
        const sectorGroups: RaySector[] = [];
        let curSector: RaySector | null = null;

        for (const ray of rays) {
          if (!curSector || curSector.isFree !== ray.isFree) {
            curSector = { isFree: ray.isFree, rays: [] };
            sectorGroups.push(curSector);
          }
          curSector.rays.push(ray);
        }

        ctx.save();
        for (const sector of sectorGroups) {
          const first = sector.rays[0];
          const last = sector.rays[sector.rays.length - 1];
          const isFree = sector.isFree;

          // Compute reach distance for this sector:
          // - Free sector: show actual hit distance (or reqDistance as reference) in green
          // - Blocked sector: show reqDistance (= deltaH, how far it SHOULD be) in red
          // Use the closest-obstacle req distance for blocked, or min hitDistance for free
          let dist: number;
          if (isFree) {
            // For free sector, show the reqDistance of the nearest obstacle that WAS far enough,
            // or a fixed sensible distance if totally open sky (hitDistance = 999)
            const minReqInSector = sector.rays.reduce((mn, r) =>
              r.reqDistance > 0 ? Math.min(mn, r.reqDistance) : mn, 999
            );
            dist = Math.min(
              minReqInSector < 999 ? minReqInSector : 20.0,
              35.0
            );
          } else {
            // Blocked: length = reqDistance (the required clearance that is violated)
            const maxReq = sector.rays.reduce((mx, r) => Math.max(mx, r.reqDistance), 0);
            dist = Math.min(maxReq > 0 ? maxReq : 15.0, 35.0);
          }

          const strokeColor = isFree ? 'rgba(52, 211, 153, 0.7)' : 'rgba(244, 63, 94, 0.7)';
          const fillColor   = isFree ? 'rgba(52, 211, 153, 0.08)' : 'rgba(244, 63, 94, 0.08)';
          const lineWidth   = isFree ? 1.5 : 1.5;

          const startRad = (first.worldAngleDeg * Math.PI) / 180;
          const endRad   = (last.worldAngleDeg  * Math.PI) / 180;

          // First edge ray
          const x1 = point.x + Math.cos(startRad) * dist;
          const y1 = point.y + Math.sin(startRad) * dist;
          const { sx: sx1, sy: sy1 } = worldToScreen(x1, y1);

          // Last edge ray
          const x2 = point.x + Math.cos(endRad) * dist;
          const y2 = point.y + Math.sin(endRad) * dist;
          const { sx: sx2, sy: sy2 } = worldToScreen(x2, y2);

          // Radius in screen pixels
          const radiusPx = dist * viewState.scale;

          // Normalise arc direction: canvas arcs need start < end for CCW
          // worldAngleDeg may wrap; use angleDeg (relative to normal, -78..+78) for arc
          const startWorldRad = startRad;
          let   endWorldRad   = endRad;
          // Determine true angular sweep direction (always CCW from first to last in world)
          // We'll draw arc from min to max world angle of this sector
          const firstWorldDeg = first.worldAngleDeg;
          const lastWorldDeg  = last.worldAngleDeg;
          // Compute sweep (may cross 360)
          let sweep = ((lastWorldDeg - firstWorldDeg) + 360) % 360;
          if (sweep > 180) sweep = sweep - 360; // prefer short arc

          // Filled sector wedge
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx1, sy1);
          ctx.arc(px, py, radiusPx, startWorldRad, startWorldRad + sweep * (Math.PI / 180), sweep < 0);
          ctx.closePath();
          ctx.fillStyle = fillColor;
          ctx.fill();

          // Edge rays
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

          // Connecting arc at radius
          ctx.beginPath();
          ctx.arc(px, py, radiusPx, startWorldRad, startWorldRad + sweep * (Math.PI / 180), sweep < 0);
          ctx.stroke();

          // Small tick at reqDistance on free sectors to show required clearance reference
          if (isFree) {
            // Find median ray in sector to draw tick
            const midRay = sector.rays[Math.floor(sector.rays.length / 2)];
            const midRad = (midRay.worldAngleDeg * Math.PI) / 180;
            const txW = point.x + Math.cos(midRad) * dist;
            const tyW = point.y + Math.sin(midRad) * dist;
            const { sx: tsx, sy: tsy } = worldToScreen(txW, tyW);
            ctx.save();
            ctx.fillStyle = 'rgba(52, 211, 153, 0.9)';
            ctx.font = `bold ${Math.max(9, Math.min(12, viewState.scale * 0.3))}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${dist.toFixed(0)}m`, tsx, tsy - 10);
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
