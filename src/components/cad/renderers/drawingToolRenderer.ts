import { CadRenderContext } from '../types';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import { generateSweepPolygon, SweepAlignment } from '../../../utils/math2d';
import { DirectionSnapResult } from '../../../utils/directionSnapping';
import { OsnapSnapResult, BuildingDragSnapResult, EdgeDragSnapResult } from '../../../engine/snapping';
import { APP_CONFIG } from '../../../config/appConfig';

/**
 * Renders CAD OSNAP glyphs, Target Snap Halo, and OTRACK guidelines
 */
export function renderDrawingToolPreview(
  rc: CadRenderContext,
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'rotate' | 'union',
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
  sweepAlignment: SweepAlignment = 'center'
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
        ? `✕ Przecięcie osi (${directionSnapResult.guideAngleDeg.toFixed(1)}° ✕ ${directionSnapResult.secondGuideLine?.angleDeg?.toFixed(1) || ''}°)`
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
  const isCreatingShape = ['rectangle', 'polyline', 'sweep', 'rotate', 'union'].includes(drawingMode);
  if (selectedBuilding && !isCreatingShape) {
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
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i];
        const { sx, sy } = worldToScreen(v.x, v.y);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

        const isSelected = selectedVertexIndex === i;
        const isHovered = hoveredVertexIndex === i || draggedVertexIndex === i;
        const r = isSelected ? 8.5 : isHovered ? 7.5 : 5.5;

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
        } else if (isHovered) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? (isSweep ? '#38bdf8' : '#f59e0b')
          : isHovered
          ? '#38bdf8'
          : (isSweep ? '#0369a1' : '#0f172a');
        ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : '#38bdf8';
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.fill();
        ctx.stroke();

        ctx.font = isSelected ? 'bold 9px monospace' : 'bold 8.5px monospace';
        ctx.fillStyle = isSelected ? '#020617' : isHovered ? '#020617' : '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1}`, sx, sy);
      }

      ctx.restore();
    }
  }

  // 7. Object Rotate Tool (with Movable Pivot Point, Vertex Grips & Angle Tracking)
  if (drawingMode === 'rotate' && selectedBuilding && selectedBuilding.vertices) {
    const verts = selectedBuilding.vertices;
    if (verts.length >= 3) {
      ctx.save();

      let pivot = (selectedBuilding as any).customPivot;
      if (!pivot) {
        let cx = 0;
        let cy = 0;
        for (const v of verts) {
          cx += v.x;
          cy += v.y;
        }
        pivot = { x: cx / verts.length, y: cy / verts.length };
      }

      const pS = worldToScreen(pivot.x, pivot.y);
      const isPivotHovered = (selectedBuilding as any).isPivotHovered;
      const isDraggingPivot = (selectedBuilding as any).isDraggingPivot;
      const isRotating = (selectedBuilding as any).isRotating;
      const rotAngleDeg = (selectedBuilding as any).rotAngleDeg || 0;
      const hoveredRotateVertexIndex = (selectedBuilding as any).hoveredRotateVertexIndex ?? null;
      const activeRotateAngleSnap = (selectedBuilding as any).activeRotateAngleSnap ?? null;

      // 7.1 Vertex Grips (Uchwyty na wierzchołkach do chwytania i obracania)
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i];
        const vs = worldToScreen(v.x, v.y);
        if (!Number.isFinite(vs.sx) || !Number.isFinite(vs.sy)) continue;

        const isHovered = hoveredRotateVertexIndex === i;
        const gr = isHovered ? 8 : 5.5;

        // Grip glow ring
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(vs.sx, vs.sy, gr + 5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(129, 140, 248, 0.25)';
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(vs.sx, vs.sy, gr, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#818cf8' : 'rgba(30, 41, 59, 0.9)';
        ctx.strokeStyle = isHovered ? '#ffffff' : '#818cf8';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Symbol or number inside
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = isHovered ? '#ffffff' : '#c7d2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⟳', vs.sx, vs.sy);
      }

      const ringRadiusPx = Math.max(45, Math.min(120, 3.5 * rc.viewState.scale));

      // 7.2 Protractor Dial (Podziałka kątowa i tarcza referencyjna wokół punktu obrotu)
      ctx.beginPath();
      ctx.arc(pS.sx, pS.sy, ringRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = isRotating ? 'rgba(99, 102, 241, 0.06)' : 'rgba(15, 23, 42, 0.35)';
      ctx.fill();
      ctx.strokeStyle = isRotating ? '#818cf8' : 'rgba(129, 140, 248, 0.45)';
      ctx.lineWidth = isRotating ? 2 : 1.5;
      ctx.setLineDash(isRotating ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tick marks on the protractor dial
      for (let deg = 0; deg < 360; deg += 15) {
        const isMajor = deg % 90 === 0;
        const isSemi = deg % 45 === 0;
        const tickLen = isMajor ? 8 : isSemi ? 5 : 3;
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const r1 = ringRadiusPx - tickLen;
        const r2 = ringRadiusPx;

        ctx.beginPath();
        ctx.moveTo(pS.sx + cos * r1, pS.sy + sin * r1);
        ctx.lineTo(pS.sx + cos * r2, pS.sy + sin * r2);
        ctx.strokeStyle = isMajor ? '#818cf8' : isSemi ? 'rgba(129, 140, 248, 0.6)' : 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.stroke();
      }

      // 7.3 Angle Tracking guideline ray when angle is snapped
      if (activeRotateAngleSnap && isRotating) {
        const rad = ((activeRotateAngleSnap.angleDeg) * Math.PI) / 180;
        const rayLen = ringRadiusPx * 2.0;
        const rx = pS.sx + Math.cos(rad) * rayLen;
        const ry = pS.sy + Math.sin(rad) * rayLen;

        ctx.beginPath();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.moveTo(pS.sx, pS.sy);
        ctx.lineTo(rx, ry);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (isRotating && currentMouseWorld) {
        const mouseScreen = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
        const mouseAngle = Math.atan2(mouseScreen.sy - pS.sy, mouseScreen.sx - pS.sx);
        const startAngle = (selectedBuilding as any).rotStartAngleScreen || 0;

        // Dynamic filled arc illustrating the rotation range
        ctx.beginPath();
        ctx.moveTo(pS.sx, pS.sy);
        ctx.arc(pS.sx, pS.sy, ringRadiusPx, startAngle, mouseAngle, false);
        ctx.fillStyle = 'rgba(129, 140, 248, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Start vector ray
        ctx.beginPath();
        ctx.moveTo(pS.sx, pS.sy);
        ctx.lineTo(pS.sx + Math.cos(startAngle) * ringRadiusPx, pS.sy + Math.sin(startAngle) * ringRadiusPx);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Current mouse ray
        ctx.beginPath();
        ctx.moveTo(pS.sx, pS.sy);
        ctx.lineTo(mouseScreen.sx, mouseScreen.sy);
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const badgeAngle = (startAngle + mouseAngle) / 2;
        const badgeX = pS.sx + Math.cos(badgeAngle) * (ringRadiusPx + 24);
        const badgeY = pS.sy + Math.sin(badgeAngle) * (ringRadiusPx + 24);
        const trackingLabel = activeRotateAngleSnap?.label
          ? ` [${activeRotateAngleSnap.label}]`
          : activeRotateAngleSnap
          ? ' [Śledzenie]'
          : '';
        const badgeText = `${rotAngleDeg >= 0 ? '+' : ''}${rotAngleDeg.toFixed(1)}°${trackingLabel}`;

        ctx.font = 'bold 11px monospace';
        const bw = ctx.measureText(badgeText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.strokeStyle = activeRotateAngleSnap ? '#38bdf8' : '#818cf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(badgeX - bw / 2 - 6, badgeY - 10, bw + 12, 20, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = activeRotateAngleSnap ? '#7dd3fc' : '#c7d2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, badgeX, badgeY);
      } else if (!isRotating && !isDraggingPivot) {
        // Idle state dial badge
        const badgeX = pS.sx;
        const badgeY = pS.sy - ringRadiusPx - 14;
        const currentRot = (selectedBuilding as any).transform?.rotationDeg || 0;
        const badgeText = `Kąt: ${currentRot.toFixed(1)}°`;

        ctx.font = 'bold 10px monospace';
        const bw = ctx.measureText(badgeText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX - bw / 2 - 5, badgeY - 9, bw + 10, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#c7d2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, badgeX, badgeY);
      }

      const pr = isPivotHovered || isDraggingPivot ? 10 : 8;

      if (isPivotHovered || isDraggingPivot) {
        ctx.beginPath();
        ctx.arc(pS.sx, pS.sy, pr + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pS.sx, pS.sy, pr, 0, Math.PI * 2);
      ctx.fillStyle = isPivotHovered || isDraggingPivot ? '#f59e0b' : '#0f172a';
      ctx.strokeStyle = isPivotHovered || isDraggingPivot ? '#ffffff' : '#f59e0b';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pS.sx - pr - 4, pS.sy);
      ctx.lineTo(pS.sx + pr + 4, pS.sy);
      ctx.moveTo(pS.sx, pS.sy - pr - 4);
      ctx.lineTo(pS.sx + pr + 4, pS.sy);
      ctx.strokeStyle = isPivotHovered || isDraggingPivot ? '#0f172a' : '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      if (!isRotating) {
        const pivotText = 'Punkt obrotu (przeciągnij)';
        ctx.font = 'bold 9.5px sans-serif';
        const ptw = ctx.measureText(pivotText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(pS.sx - ptw / 2 - 4, pS.sy - pr - 18, ptw + 8, 15, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pivotText, pS.sx, pS.sy - pr - 10);
      }

      ctx.restore();
    }
  }
}
