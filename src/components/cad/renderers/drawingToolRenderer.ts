import { CadRenderContext } from '../types';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import { generateSweepPolygon, SweepAlignment, getPolygonCentroid, getRotateHandleScreenPos } from '../../../utils/math2d';
import { OsnapSnapResult, BuildingDragSnapResult, EdgeDragSnapResult, DirectionSnapResult } from '../../../engine/snapping';
import { APP_CONFIG } from '../../../config/appConfig';

/**
 * Renders CAD OSNAP glyphs, Target Snap Halo, and OTRACK guidelines
 */
export function renderDrawingToolPreview(
  rc: CadRenderContext,
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'align' | 'union',
  drawingVertices: Point2D[],
  currentMouseWorld: Point2D | null,
  selectedBuilding?: BuildingLoop | null,
  hoveredVertexIndex?: number | null,
  hoveredMidpointIndex?: number | null,
  draggedVertexIndex?: number | null,
  directionSnapResult?: DirectionSnapResult | null,
  selectedVertexIndex?: number | null,
  osnapSnapResult?: OsnapSnapResult | null,
  buildingDragSnap?: BuildingDragSnapResult | EdgeDragSnapResult | null,
  sweepWidth: number = 5.0,
  sweepAlignment: SweepAlignment = 'center',
  allBuildings?: BuildingLoop[],
  alignPendingRef?: { buildingId: string; segmentId: string } | null,
  alignHoveredEdge?: { buildingId: string; segmentId: string } | null
) {
  const { ctx, worldToScreen } = rc;

  // 0. Render Building Drag Multi-Snap Guidelines & Target Markers (Collinear / Vertex-to-Vertex / Vertex-to-Edge)
  if (buildingDragSnap) {
    ctx.save();
    // Collinear Extension Guideline
    if (buildingDragSnap.guideline) {
      const g1 = worldToScreen(buildingDragSnap.guideline.p1.x, buildingDragSnap.guideline.p1.y);
      const g2 = worldToScreen(buildingDragSnap.guideline.p2.x, buildingDragSnap.guideline.p2.y);
      if (Number.isFinite(g1.sx) && Number.isFinite(g2.sx)) {
        ctx.beginPath();
        ctx.strokeStyle = APP_CONFIG.osnap?.collinearColor || '#a855f7';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(g1.sx, g1.sy);
        ctx.lineTo(g2.sx, g2.sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Second Collinear Extension Guideline (Dual-Collinear Lock)
    if ('secondGuideline' in buildingDragSnap && buildingDragSnap.secondGuideline) {
      const sg1 = worldToScreen(buildingDragSnap.secondGuideline.p1.x, buildingDragSnap.secondGuideline.p1.y);
      const sg2 = worldToScreen(buildingDragSnap.secondGuideline.p2.x, buildingDragSnap.secondGuideline.p2.y);
      if (Number.isFinite(sg1.sx) && Number.isFinite(sg2.sx)) {
        ctx.beginPath();
        ctx.strokeStyle = APP_CONFIG.osnap?.collinearColor || '#a855f7';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(sg1.sx, sg1.sy);
        ctx.lineTo(sg2.sx, sg2.sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Target point marker & snap halo
    if (buildingDragSnap.targetPoint) {
      const tp = worldToScreen(buildingDragSnap.targetPoint.x, buildingDragSnap.targetPoint.y);
      if (Number.isFinite(tp.sx) && Number.isFinite(tp.sy)) {
        // Glowing outer circle
        ctx.beginPath();
        ctx.arc(tp.sx, tp.sy, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
        ctx.fill();
        ctx.strokeStyle = APP_CONFIG.osnap?.collinearColor || '#a855f7';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(tp.sx, tp.sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    // Info badge for building drag snap
    if (currentMouseWorld) {
      const sm = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
      if (Number.isFinite(sm.sx) && Number.isFinite(sm.sy)) {
        const badgeText = `⇥ ${buildingDragSnap.label}`;
        ctx.font = 'bold 10.5px Inter, sans-serif';
        const tw = ctx.measureText(badgeText).width;
        const bx = sm.sx + 14;
        const by = sm.sy - 16;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by - 10, tw + 12, 20, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f3e8ff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx + 6, by);
      }
    }
    ctx.restore();
  }

  // 1. Render Advanced OSNAP / OTRACK Snap Result (Priority 1..6)
  if (osnapSnapResult) {
    const pSnap = worldToScreen(osnapSnapResult.snappedPoint.x, osnapSnapResult.snappedPoint.y);

    if (Number.isFinite(pSnap.sx) && Number.isFinite(pSnap.sy)) {
      ctx.save();

      // Highlight reference edge if available
      if (osnapSnapResult.cachedEdge) {
        const ce1 = worldToScreen(osnapSnapResult.cachedEdge.p1.x, osnapSnapResult.cachedEdge.p1.y);
        const ce2 = worldToScreen(osnapSnapResult.cachedEdge.p2.x, osnapSnapResult.cachedEdge.p2.y);
        if (Number.isFinite(ce1.sx) && Number.isFinite(ce2.sx)) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 5;
          ctx.moveTo(ce1.sx, ce1.sy);
          ctx.lineTo(ce2.sx, ce2.sy);
          ctx.stroke();

          ctx.beginPath();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.2;
          ctx.moveTo(ce1.sx, ce1.sy);
          ctx.lineTo(ce2.sx, ce2.sy);
          ctx.stroke();
        }
      }

      // Target Snap Halo & Magnet Elastic Line connecting mouse to snappedPoint
      if (currentMouseWorld) {
        const sm = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
        const distToMouse = Math.hypot(sm.sx - pSnap.sx, sm.sy - pSnap.sy);
        if (distToMouse > 2 && Number.isFinite(sm.sx) && Number.isFinite(sm.sy)) {
          // Magnet elastic connecting line
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 2]);
          ctx.moveTo(sm.sx, sm.sy);
          ctx.lineTo(pSnap.sx, pSnap.sy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Outer Glowing Target Halo Ring
      ctx.beginPath();
      ctx.arc(pSnap.sx, pSnap.sy, 11, 0, Math.PI * 2);
      ctx.fillStyle =
        osnapSnapResult.type === 'endpoint'
          ? 'rgba(16, 185, 129, 0.18)'
          : osnapSnapResult.type === 'midpoint'
          ? 'rgba(6, 182, 212, 0.18)'
          : osnapSnapResult.type === 'otrack_intersection'
          ? 'rgba(244, 63, 94, 0.18)'
          : 'rgba(56, 189, 248, 0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Render Active Rays for OTRACK (Rozróżnienie: statystyczne vs przedłużenia krawędzi)
      if (osnapSnapResult.activeRays && osnapSnapResult.activeRays.length > 0) {
        for (const ray of osnapSnapResult.activeRays) {
          const r1 = worldToScreen(ray.p1.x, ray.p1.y);
          const r2 = worldToScreen(ray.p2.x, ray.p2.y);
          if (Number.isFinite(r1.sx) && Number.isFinite(r2.sx)) {
            const isStatistical = ray.isStatistical ?? (ray.type === 'horizontal' || ray.type === 'vertical');
            const rayColor = isStatistical
              ? (APP_CONFIG.osnap?.statisticalRayColor || '#f59e0b')
              : (APP_CONFIG.osnap?.edgeRayColor || '#38bdf8');
            const rayDash = isStatistical ? [8, 4] : [5, 4];

            ctx.beginPath();
            ctx.strokeStyle = rayColor;
            ctx.lineWidth = 1.6;
            ctx.setLineDash(rayDash);
            ctx.moveTo(r1.sx, r1.sy);
            ctx.lineTo(r2.sx, r2.sy);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // Render Extension guide line if available (zawsze z konkretnej krawędzi - błękit)
      if (osnapSnapResult.rayLine) {
        const e1 = worldToScreen(osnapSnapResult.rayLine.p1.x, osnapSnapResult.rayLine.p1.y);
        const e2 = worldToScreen(osnapSnapResult.rayLine.p2.x, osnapSnapResult.rayLine.p2.y);
        if (Number.isFinite(e1.sx) && Number.isFinite(e2.sx)) {
          ctx.beginPath();
          ctx.strokeStyle = APP_CONFIG.osnap?.extensionColor || '#38bdf8';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 4]);
          ctx.moveTo(e1.sx, e1.sy);
          ctx.lineTo(e2.sx, e2.sy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Render CAD Glyph based on snap type
      const snapType = osnapSnapResult.type;
      const glyphSize = 10;
      const halfG = glyphSize / 2;

      if (snapType === 'endpoint') {
        // Square glyph (Green)
        ctx.beginPath();
        ctx.rect(pSnap.sx - halfG, pSnap.sy - halfG, glyphSize, glyphSize);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.fill();
        ctx.strokeStyle = APP_CONFIG.osnap?.endpointColor || '#10b981';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (snapType === 'midpoint') {
        // Triangle glyph (Cyan)
        ctx.beginPath();
        ctx.moveTo(pSnap.sx, pSnap.sy - halfG - 1);
        ctx.lineTo(pSnap.sx + halfG + 1, pSnap.sy + halfG);
        ctx.lineTo(pSnap.sx - halfG - 1, pSnap.sy + halfG);
        ctx.closePath();
        ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
        ctx.fill();
        ctx.strokeStyle = APP_CONFIG.osnap?.midpointColor || '#06b6d4';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (snapType === 'otrack_intersection') {
        // Intersection X / Hourglass glyph (Rose)
        ctx.beginPath();
        ctx.arc(pSnap.sx, pSnap.sy, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.3)';
        ctx.fill();
        ctx.strokeStyle = APP_CONFIG.osnap?.intersectionColor || '#f43f5e';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(pSnap.sx - 4, pSnap.sy - 4);
        ctx.lineTo(pSnap.sx + 4, pSnap.sy + 4);
        ctx.moveTo(pSnap.sx + 4, pSnap.sy - 4);
        ctx.lineTo(pSnap.sx - 4, pSnap.sy + 4);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (snapType === 'nearest') {
        // Hourglass / Bowtie glyph (Blue)
        ctx.beginPath();
        ctx.moveTo(pSnap.sx - halfG, pSnap.sy - halfG);
        ctx.lineTo(pSnap.sx + halfG, pSnap.sy + halfG);
        ctx.lineTo(pSnap.sx - halfG, pSnap.sy + halfG);
        ctx.lineTo(pSnap.sx + halfG, pSnap.sy - halfG);
        ctx.closePath();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
        ctx.fill();
        ctx.strokeStyle = APP_CONFIG.osnap?.nearestColor || '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      } else {
        // Default / OTRACK Ray Dot + Ring (Kolor zależny od typu: bursztyn vs błękit)
        const isStat = osnapSnapResult.isStatisticalGuide ?? true;
        const otrackColor = isStat
          ? (APP_CONFIG.osnap?.statisticalRayColor || '#f59e0b')
          : (APP_CONFIG.osnap?.edgeRayColor || '#38bdf8');

        ctx.beginPath();
        ctx.arc(pSnap.sx, pSnap.sy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = otrackColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Information Badge near cursor
      const isStatGuide = osnapSnapResult.isStatisticalGuide ?? (snapType === 'otrack_ray');
      const badgeBorder =
        snapType === 'endpoint'
          ? '#10b981'
          : snapType === 'midpoint'
          ? '#06b6d4'
          : snapType === 'otrack_intersection'
          ? '#f43f5e'
          : snapType === 'extension' || !isStatGuide
          ? '#38bdf8'
          : '#f59e0b';

      const badgeText = `${osnapSnapResult.label}`;
      ctx.font = 'bold 10px Inter, sans-serif';
      const tw = ctx.measureText(badgeText).width;
      const bx = pSnap.sx + 14;
      const by = pSnap.sy - 16;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = badgeBorder;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(bx, by - 10, tw + 12, 20, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + 6, by);

      ctx.restore();
    }
  } else if (directionSnapResult && currentMouseWorld) {
    // Fallback to Direction Snap result if no OSNAP hit
    const p1 = worldToScreen(directionSnapResult.guideLine.p1.x, directionSnapResult.guideLine.p1.y);
    const p2 = worldToScreen(directionSnapResult.guideLine.p2.x, directionSnapResult.guideLine.p2.y);
    const pSnap = worldToScreen(directionSnapResult.snappedPoint.x, directionSnapResult.snappedPoint.y);

    if (Number.isFinite(p1.sx) && Number.isFinite(p2.sx) && Number.isFinite(pSnap.sx)) {
      ctx.save();

      // Highlight reference edge if available
      if (directionSnapResult.sourceSegment) {
        const ss1 = worldToScreen(directionSnapResult.sourceSegment.p1.x, directionSnapResult.sourceSegment.p1.y);
        const ss2 = worldToScreen(directionSnapResult.sourceSegment.p2.x, directionSnapResult.sourceSegment.p2.y);
        if (Number.isFinite(ss1.sx) && Number.isFinite(ss2.sx)) {
          // Halo glow
          ctx.beginPath();
          ctx.strokeStyle = directionSnapResult.relationType === 'perpendicular'
            ? 'rgba(56, 189, 248, 0.45)'
            : 'rgba(99, 102, 241, 0.4)';
          ctx.lineWidth = 6;
          ctx.moveTo(ss1.sx, ss1.sy);
          ctx.lineTo(ss2.sx, ss2.sy);
          ctx.stroke();

          // Crisp inner highlight line
          ctx.beginPath();
          ctx.strokeStyle = directionSnapResult.relationType === 'perpendicular' ? '#38bdf8' : '#818cf8';
          ctx.lineWidth = 2.5;
          ctx.moveTo(ss1.sx, ss1.sy);
          ctx.lineTo(ss2.sx, ss2.sy);
          ctx.stroke();
        }
      }

      // Render Second Guide Line if this is an intersection of two guides
      if (directionSnapResult.secondGuideLine) {
        const sg = directionSnapResult.secondGuideLine;
        const sp1 = worldToScreen(sg.p1.x, sg.p1.y);
        const sp2 = worldToScreen(sg.p2.x, sg.p2.y);
        if (Number.isFinite(sp1.sx) && Number.isFinite(sp2.sx)) {
          ctx.beginPath();
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = APP_CONFIG.directionSnapping.guideLineWidth || 1.6;
          ctx.setLineDash([6, 4]);
          ctx.moveTo(sp1.sx, sp1.sy);
          ctx.lineTo(sp2.sx, sp2.sy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      const isIntersection = directionSnapResult.relationType === 'guide_intersection';
      const isStatistical = directionSnapResult.relationType === 'dominant' || directionSnapResult.isStatistical === true;
      const guideColor = isIntersection
        ? '#c084fc'
        : isStatistical
        ? (APP_CONFIG.directionSnapping.statisticalGuideColor || '#f59e0b')
        : (APP_CONFIG.directionSnapping.edgeGuideColor || '#38bdf8');
      const guideDash = isStatistical
        ? [...APP_CONFIG.directionSnapping.statisticalGuideDash]
        : [...APP_CONFIG.directionSnapping.edgeGuideDash];

      ctx.beginPath();
      ctx.strokeStyle = guideColor;
      ctx.lineWidth = APP_CONFIG.directionSnapping.guideLineWidth || 1.6;
      ctx.setLineDash(guideDash);
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      if (isIntersection) {
        // Intersection Glyphs (Hourglass / Crossed Rings)
        ctx.beginPath();
        ctx.arc(pSnap.sx, pSnap.sy, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(192, 132, 252, 0.35)';
        ctx.fill();
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(pSnap.sx - 4, pSnap.sy - 4);
        ctx.lineTo(pSnap.sx + 4, pSnap.sy + 4);
        ctx.moveTo(pSnap.sx + 4, pSnap.sy - 4);
        ctx.lineTo(pSnap.sx - 4, pSnap.sy + 4);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(pSnap.sx, pSnap.sy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = guideColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      const relationLabel = isIntersection
        ? '✕ Przecięcie 2 prowadnic'
        : directionSnapResult.relationType === 'perpendicular'
        ? '⟂ 90° (Prostopadły do ściany)'
        : directionSnapResult.relationType === 'parallel'
        ? '∥ (Równoległy do ściany)'
        : '📊 (Siatka statystyczna)';

      const distLabel = `${directionSnapResult.distanceFromOrigin.toFixed(2)} m`;
      const angleLabel = `${directionSnapResult.guideAngleDeg.toFixed(1)}°`;
      const badgeText = isIntersection
        ? (directionSnapResult.sourceLabel || `✕ Przecięcie osi (${directionSnapResult.guideAngleDeg.toFixed(1)}° ✕ ${directionSnapResult.secondGuideLine?.angleDeg?.toFixed(1) || ''}°)`)
        : `${relationLabel} | ${angleLabel} | ${distLabel}`;

      ctx.font = 'bold 10px Inter, sans-serif';
      const tw = ctx.measureText(badgeText).width;
      const bx = pSnap.sx + 12;
      const by = pSnap.sy - 16;

      ctx.fillStyle = APP_CONFIG.directionSnapping.badgeBgColor;
      ctx.strokeStyle = guideColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(bx, by - 10, tw + 12, 20, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isIntersection ? '#f3e8ff' : isStatistical ? '#fef3c7' : '#e0f2fe';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + 6, by);
      ctx.restore();
    }
  }

  // 4. Rectangle Preview (aligned with rotated view)
  if (drawingMode === 'rectangle' && drawingVertices.length === 1 && currentMouseWorld) {
    const p1 = drawingVertices[0];
    const p2 = currentMouseWorld;
    if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) return;

    const theta = ((rc.viewRotationDeg || 0) * Math.PI) / 180;
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

    const v0 = p1;
    const v1 = { x: p1.x + w * ux, y: p1.y + w * uy };
    const v2 = { x: p1.x + w * ux + h * vx, y: p1.y + w * uy + h * vy };
    const v3 = { x: p1.x + h * vx, y: p1.y + h * vy };

    const s0 = worldToScreen(v0.x, v0.y);
    const s1 = worldToScreen(v1.x, v1.y);
    const s2 = worldToScreen(v2.x, v2.y);
    const s3 = worldToScreen(v3.x, v3.y);

    if (!Number.isFinite(s0.sx) || !Number.isFinite(s2.sx)) return;

    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    ctx.moveTo(s0.sx, s0.sy);
    ctx.lineTo(s1.sx, s1.sy);
    ctx.lineTo(s2.sx, s2.sy);
    ctx.lineTo(s3.sx, s3.sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const wMeters = Math.abs(w);
    const hMeters = Math.abs(h);
    const dimText = `${wMeters.toFixed(1)}m × ${hMeters.toFixed(1)}m`;
    const midSx = (s0.sx + s2.sx) / 2;
    const midSy = (s0.sy + s2.sy) / 2;

    ctx.font = 'bold 12px Inter, sans-serif';
    const textWidth = ctx.measureText(dimText).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.roundRect(midSx - textWidth / 2 - 8, midSy - 12, textWidth + 16, 24, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dimText, midSx, midSy);
    ctx.restore();
  }

  // 5. Polyline Preview
  if (drawingMode === 'polyline' && drawingVertices.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();

    drawingVertices.forEach((v, idx) => {
      const { sx, sy } = worldToScreen(v.x, v.y);
      if (idx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });

    if (currentMouseWorld) {
      const { sx, sy } = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // Vertices markers
    const isNearStart =
      drawingVertices.length >= 3 &&
      currentMouseWorld &&
      (Math.hypot(
        worldToScreen(currentMouseWorld.x, currentMouseWorld.y).sx - worldToScreen(drawingVertices[0].x, drawingVertices[0].y).sx,
        worldToScreen(currentMouseWorld.x, currentMouseWorld.y).sy - worldToScreen(drawingVertices[0].x, drawingVertices[0].y).sy
      ) <= 15 || Math.hypot(currentMouseWorld.x - drawingVertices[0].x, currentMouseWorld.y - drawingVertices[0].y) <= 0.6);

    drawingVertices.forEach((v, idx) => {
      const { sx, sy } = worldToScreen(v.x, v.y);
      ctx.beginPath();
      const radius = idx === 0 ? (isNearStart ? 9 : 7) : 4;
      ctx.arc(sx, sy, radius, 0, 2 * Math.PI);
      ctx.fillStyle = idx === 0 ? (isNearStart ? '#10b981' : '#fbbf24') : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = idx === 0 && isNearStart ? '#ffffff' : '#020617';
      ctx.lineWidth = idx === 0 && isNearStart ? 2.5 : 1.5;
      ctx.stroke();

      if (idx === 0 && isNearStart) {
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, 2 * Math.PI);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Close preview line to 1st vertex
    if (drawingVertices.length >= 2 && currentMouseWorld) {
      const first = worldToScreen(drawingVertices[0].x, drawingVertices[0].y);
      const curr = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
      ctx.beginPath();
      ctx.setLineDash(isNearStart ? [] : [4, 4]);
      ctx.strokeStyle = isNearStart ? '#10b981' : 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = isNearStart ? 2.5 : 1.5;
      ctx.moveTo(curr.sx, curr.sy);
      ctx.lineTo(first.sx, first.sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 5.5. Sweep (Wstęga) Preview
  if (drawingMode === 'sweep' && drawingVertices.length > 0) {
    ctx.save();
    const activePolyline = [...drawingVertices, ...(currentMouseWorld ? [currentMouseWorld] : [])];

    // Render generated sweep polygon if at least 2 points
    if (activePolyline.length >= 2) {
      const sweepPolygon = generateSweepPolygon(activePolyline, sweepWidth, sweepAlignment);
      if (sweepPolygon.length >= 3) {
        ctx.beginPath();
        const p0 = worldToScreen(sweepPolygon[0].x, sweepPolygon[0].y);
        ctx.moveTo(p0.sx, p0.sy);
        for (let i = 1; i < sweepPolygon.length; i++) {
          const pt = worldToScreen(sweepPolygon[i].x, sweepPolygon[i].y);
          ctx.lineTo(pt.sx, pt.sy);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Render central baseline polyline axis
    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    activePolyline.forEach((v, idx) => {
      const { sx, sy } = worldToScreen(v.x, v.y);
      if (idx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Baseline vertex grips
    drawingVertices.forEach((v, idx) => {
      const { sx, sy } = worldToScreen(v.x, v.y);
      ctx.beginPath();
      ctx.arc(sx, sy, idx === 0 ? 6 : 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = idx === 0 ? '#f59e0b' : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Informative badge near mouse cursor
    if (currentMouseWorld) {
      const sm = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
      if (Number.isFinite(sm.sx) && Number.isFinite(sm.sy)) {
        const alignLabel = sweepAlignment === 'center' ? 'Oś' : sweepAlignment === 'left' ? 'Lewo' : 'Prawo';
        const badgeText = `Wstęga: szer. ${sweepWidth.toFixed(1)}m [${alignLabel}] | Enter: Zakończ`;
        ctx.font = 'bold 10.5px Inter, sans-serif';
        const tw = ctx.measureText(badgeText).width;
        const bx = sm.sx + 14;
        const by = sm.sy + 20;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(bx, by - 10, tw + 14, 22, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx + 7, by + 1);
      }
    }

    ctx.restore();
  }

  // 6. Vertex Edit Mode handles and midpoint [+] insertions (including Sweep spine path if present)
  if (selectedBuilding && drawingMode === 'vertexEdit') {
    const isSweep = Array.isArray(selectedBuilding.sweepPath) && selectedBuilding.sweepPath.length >= 2;
    const verts = isSweep ? selectedBuilding.sweepPath! : selectedBuilding.vertices;

    if (verts && verts.length >= 2) {
      ctx.save();

      // 0. Dla Wstęgi: renderuj linię osiową (kręgosłup) w kolorze błękitnym z kreskowaniem
      if (isSweep) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        for (let i = 0; i < verts.length; i++) {
          const pt = verts[i];
          const s = worldToScreen(pt.x, pt.y);
          if (i === 0) ctx.moveTo(s.sx, s.sy);
          else ctx.lineTo(s.sx, s.sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 1. Edge midpoints [+] handles
      const numMidpoints = isSweep ? verts.length - 1 : verts.length;
      for (let i = 0; i < numMidpoints; i++) {
        const v1 = verts[i];
        const v2 = isSweep ? verts[i + 1] : verts[(i + 1) % verts.length];
        const mx = (v1.x + v2.x) / 2;
        const my = (v1.y + v2.y) / 2;
        const { sx, sy } = worldToScreen(mx, my);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

        const isHovered = hoveredMidpointIndex === i;
        const r = isHovered ? 6 : 4.5;

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#10b981' : 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sx - 2.5, sy);
        ctx.lineTo(sx + 2.5, sy);
        ctx.moveTo(sx, sy - 2.5);
        ctx.lineTo(sx, sy + 2.5);
        ctx.strokeStyle = isHovered ? '#ffffff' : '#10b981';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 2. Vertex handles (draggable and selectable)
      // Perf: przy dużej liczbie wierzchołków większość to "zwykłe" uchwyty (nie selected/hovered/dragged) -
      // rysujemy je wszystkie jako jeden batchowany Path2D (jedno fill + jedno stroke) zamiast N par arc/fill/stroke.
      // Pojedyncze wyróżnione wierzchołki (selected/hovered) są rzadkie i rysowane indywidualnie jak dotychczas.
      const plainHandleR = 5.5;
      const batchedPlainPath = new Path2D();
      let hasBatchedPlain = false;
      const plainLabels: { sx: number; sy: number; text: string }[] = [];

      for (let i = 0; i < verts.length; i++) {
        const v = verts[i];
        const { sx, sy } = worldToScreen(v.x, v.y);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

        const isSelected = selectedVertexIndex === i;
        const isHovered = hoveredVertexIndex === i || draggedVertexIndex === i;

        if (!isSelected && !isHovered) {
          batchedPlainPath.moveTo(sx + plainHandleR, sy);
          batchedPlainPath.arc(sx, sy, plainHandleR, 0, Math.PI * 2);
          hasBatchedPlain = true;
          plainLabels.push({ sx, sy, text: `${i + 1}` });
          continue;
        }

        const r = isSelected ? 8.5 : 7.5;

        if (isSelected) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = isSweep ? 'rgba(56, 189, 248, 0.25)' : 'rgba(245, 158, 11, 0.25)';
          ctx.strokeStyle = isSweep ? '#38bdf8' : '#f59e0b';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 2]);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? (isSweep ? '#38bdf8' : '#f59e0b') : '#38bdf8';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.fill();
        ctx.stroke();

        ctx.font = isSelected ? 'bold 9px monospace' : 'bold 8.5px monospace';
        ctx.fillStyle = '#020617';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1}`, sx, sy);
      }

      if (hasBatchedPlain) {
        ctx.fillStyle = isSweep ? '#0369a1' : '#0f172a';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.fill(batchedPlainPath);
        ctx.stroke(batchedPlainPath);

        ctx.font = 'bold 8.5px monospace';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const label of plainLabels) {
          ctx.fillText(label.text, label.sx, label.sy);
        }
      }

      ctx.restore();
    }
  }

  // 7. Per-object rotate handle: shown above a plainly-selected (non-editing) building.
  // Dragging it rotates the object around its own centroid.
  if (drawingMode === 'none' && selectedBuilding && selectedBuilding.vertices && selectedBuilding.vertices.length >= 3) {
    const isHandleHovered = Boolean((selectedBuilding as any).isRotateHandleHovered);
    const isHandleRotating = Boolean((selectedBuilding as any).isRotating);
    const handleRotAngleDeg = (selectedBuilding as any).rotAngleDeg || 0;

    const centroid = getPolygonCentroid(selectedBuilding.vertices);
    const handlePos = getRotateHandleScreenPos(selectedBuilding, worldToScreen, rc.viewState.scale, rc.viewRotationDeg);
    const centroidScreen = worldToScreen(centroid.x, centroid.y);

    if (handlePos && Number.isFinite(centroidScreen.sx)) {
      const hx = handlePos.sx;
      const hy = handlePos.sy;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centroidScreen.sx, centroidScreen.sy);
      ctx.lineTo(hx, hy);
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      const isActive = isHandleHovered || isHandleRotating;
      const r = isHandleRotating ? 9 : isHandleHovered ? 8 : 6.5;

      if (isActive) {
        ctx.beginPath();
        ctx.arc(hx, hy, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(129, 140, 248, 0.25)';
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#818cf8' : 'rgba(30, 41, 59, 0.9)';
      ctx.strokeStyle = isActive ? '#ffffff' : '#818cf8';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = isActive ? '#ffffff' : '#c7d2fe';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⟳', hx, hy);

      if (isHandleRotating) {
        const badgeText = `${handleRotAngleDeg >= 0 ? '+' : ''}${handleRotAngleDeg.toFixed(1)}°`;
        ctx.font = 'bold 11px monospace';
        const bw = ctx.measureText(badgeText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(hx - bw / 2 - 6, hy - r - 26, bw + 12, 20, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#c7d2fe';
        ctx.fillText(badgeText, hx, hy - r - 16);
      }

      ctx.restore();
    }
  }

  // 8. Align tool: highlight the pending edge and the currently hovered edge.
  if (drawingMode === 'align' && Array.isArray(allBuildings)) {
    const drawEdgeHighlight = (ref: { buildingId: string; segmentId: string }, color: string) => {
      const bldg = allBuildings!.find((b) => b.id === ref.buildingId);
      const seg = bldg?.segments.find((s) => s.id === ref.segmentId);
      if (!seg) return;
      const s1 = worldToScreen(seg.p1.x, seg.p1.y);
      const s2 = worldToScreen(seg.p2.x, seg.p2.y);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(s1.sx, s1.sy);
      ctx.lineTo(s2.sx, s2.sy);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    };
    if (alignPendingRef) drawEdgeHighlight(alignPendingRef, '#f59e0b');
    if (alignHoveredEdge) drawEdgeHighlight(alignHoveredEdge, '#38bdf8');
  }
}
