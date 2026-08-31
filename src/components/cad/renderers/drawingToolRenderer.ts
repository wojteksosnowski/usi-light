import { CadRenderContext } from '../types';
import { BuildingLoop } from '../../../types/geometry';
import { DirectionSnapResult } from '../../../utils/directionSnapping';
import { APP_CONFIG } from '../../../config/appConfig';

export function renderDrawingToolPreview(
  rc: CadRenderContext,
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'vertexEdit' | 'rotate',
  drawingVertices: any[],
  currentMouseWorld: any,
  selectedBuilding?: BuildingLoop | null,
  hoveredVertexIndex?: number | null,
  hoveredMidpointIndex?: number | null,
  draggedVertexIndex?: number | null,
  directionSnapResult?: DirectionSnapResult | null
) {
  const { ctx, worldToScreen } = rc;

  // Render Direction Snapping Guide Line and Badge
  if (directionSnapResult && currentMouseWorld) {
    const p1 = worldToScreen(directionSnapResult.guideLine.p1.x, directionSnapResult.guideLine.p1.y);
    const p2 = worldToScreen(directionSnapResult.guideLine.p2.x, directionSnapResult.guideLine.p2.y);
    const pSnap = worldToScreen(directionSnapResult.snappedPoint.x, directionSnapResult.snappedPoint.y);

    if (Number.isFinite(p1.sx) && Number.isFinite(p2.sx) && Number.isFinite(pSnap.sx)) {
      ctx.save();
      // Infinite guide line
      ctx.beginPath();
      ctx.strokeStyle = APP_CONFIG.directionSnapping.guideLineColor;
      ctx.lineWidth = APP_CONFIG.directionSnapping.guideLineWidth;
      ctx.setLineDash([...APP_CONFIG.directionSnapping.guideLineDash]);
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Snap point cross / dot
      ctx.beginPath();
      ctx.arc(pSnap.sx, pSnap.sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Info badge near mouse
      const relationLabel = directionSnapResult.relationType === 'perpendicular'
        ? '⟂ 90° (Prostopadły)'
        : directionSnapResult.relationType === 'parallel'
        ? '∥ (Równoległy)'
        : '⊞ (Siatka główna)';

      const distLabel = `${directionSnapResult.distanceFromOrigin.toFixed(2)} m`;
      const angleLabel = `${directionSnapResult.guideAngleDeg.toFixed(1)}°`;
      const badgeText = `${relationLabel} | ${angleLabel} | ${distLabel}`;

      ctx.font = 'bold 10px Inter, sans-serif';
      const tw = ctx.measureText(badgeText).width;
      const bx = pSnap.sx + 12;
      const by = pSnap.sy - 16;

      ctx.fillStyle = APP_CONFIG.directionSnapping.badgeBgColor;
      ctx.strokeStyle = APP_CONFIG.directionSnapping.badgeBorderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by - 10, tw + 12, 20, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e0f2fe';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + 6, by);

      ctx.restore();
    }
  }


  // Rectangle Preview (aligned with rotated view)
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

  // Polyline Preview
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

      // Tooltip/ring over start point if ready to close
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

  // Vertex Edit Mode handles and midpoint [+] insertions
  if (drawingMode === 'vertexEdit' && selectedBuilding && selectedBuilding.vertices) {
    const verts = selectedBuilding.vertices;
    if (verts.length >= 3) {
      ctx.save();

      // 1. Edge midpoints [+] handles
      for (let i = 0; i < verts.length; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % verts.length];
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

        // Draw small '+'
        ctx.beginPath();
        ctx.moveTo(sx - 2.5, sy);
        ctx.lineTo(sx + 2.5, sy);
        ctx.moveTo(sx, sy - 2.5);
        ctx.lineTo(sx, sy + 2.5);
        ctx.strokeStyle = isHovered ? '#ffffff' : '#10b981';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 2. Vertex handles (draggable)
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i];
        const { sx, sy } = worldToScreen(v.x, v.y);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

        const isHovered = hoveredVertexIndex === i || draggedVertexIndex === i;
        const r = isHovered ? 7.5 : 5.5;

        if (isHovered) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#38bdf8' : '#0f172a';
        ctx.strokeStyle = isHovered ? '#ffffff' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Vertex index number
        ctx.font = 'bold 8.5px monospace';
        ctx.fillStyle = isHovered ? '#020617' : '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1}`, sx, sy);

        // Delete indicator badge [x] on hover if polygon has more than 3 vertices
        if (isHovered && verts.length > 3 && draggedVertexIndex === null) {
          const dx = sx + 13;
          const dy = sy - 13;
          ctx.beginPath();
          ctx.arc(dx, dy, 7.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(dx - 3, dy - 3);
          ctx.lineTo(dx + 3, dy + 3);
          ctx.moveTo(dx + 3, dy - 3);
          ctx.lineTo(dx - 3, dy + 3);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  // 4. Object Rotate Tool (with Movable Pivot Point & Angle Arc)
  if (drawingMode === 'rotate' && selectedBuilding && selectedBuilding.vertices) {
    const verts = selectedBuilding.vertices;
    if (verts.length >= 3) {
      ctx.save();

      // Compute centroid if no custom pivot passed
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

      // Rotation track / guide circle around pivot
      const ringRadiusPx = Math.max(45, Math.min(120, 3.5 * rc.viewState.scale));
      ctx.beginPath();
      ctx.arc(pS.sx, pS.sy, ringRadiusPx, 0, Math.PI * 2);
      ctx.strokeStyle = isRotating ? '#818cf8' : 'rgba(129, 140, 248, 0.45)';
      ctx.lineWidth = isRotating ? 2.5 : 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // If rotating, draw swept arc and angle label
      if (isRotating && currentMouseWorld) {
        const mouseScreen = worldToScreen(currentMouseWorld.x, currentMouseWorld.y);
        const mouseAngle = Math.atan2(mouseScreen.sy - pS.sy, mouseScreen.sx - pS.sx);
        const startAngle = (selectedBuilding as any).rotStartAngleScreen || 0;

        ctx.beginPath();
        ctx.moveTo(pS.sx, pS.sy);
        ctx.arc(pS.sx, pS.sy, ringRadiusPx, startAngle, mouseAngle, false);
        ctx.fillStyle = 'rgba(129, 140, 248, 0.18)';
        ctx.fill();

        // Ray to cursor
        ctx.beginPath();
        ctx.moveTo(pS.sx, pS.sy);
        ctx.lineTo(mouseScreen.sx, mouseScreen.sy);
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Angle Badge
        const badgeAngle = (startAngle + mouseAngle) / 2;
        const badgeX = pS.sx + Math.cos(badgeAngle) * (ringRadiusPx + 22);
        const badgeY = pS.sy + Math.sin(badgeAngle) * (ringRadiusPx + 22);
        const badgeText = `${rotAngleDeg >= 0 ? '+' : ''}${rotAngleDeg.toFixed(1)}°`;

        ctx.font = 'bold 11px monospace';
        const bw = ctx.measureText(badgeText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX - bw / 2 - 6, badgeY - 10, bw + 12, 20, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#c7d2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, badgeX, badgeY);
      }

      // Movable Pivot Point Handle
      const pr = isPivotHovered || isDraggingPivot ? 10 : 8;

      if (isPivotHovered || isDraggingPivot) {
        ctx.beginPath();
        ctx.arc(pS.sx, pS.sy, pr + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Center disc
      ctx.beginPath();
      ctx.arc(pS.sx, pS.sy, pr, 0, Math.PI * 2);
      ctx.fillStyle = isPivotHovered || isDraggingPivot ? '#f59e0b' : '#0f172a';
      ctx.strokeStyle = isPivotHovered || isDraggingPivot ? '#ffffff' : '#f59e0b';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      // Crosshair lines inside pivot
      ctx.beginPath();
      ctx.moveTo(pS.sx - pr - 4, pS.sy);
      ctx.lineTo(pS.sx + pr + 4, pS.sy);
      ctx.moveTo(pS.sx, pS.sy - pr - 4);
      ctx.lineTo(pS.sx, pS.sy + pr + 4);
      ctx.strokeStyle = isPivotHovered || isDraggingPivot ? '#0f172a' : '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Pivot label tooltip
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
