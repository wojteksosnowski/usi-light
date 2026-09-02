import { CadRenderContext } from '../types';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import { DirectionSnapResult } from '../../../utils/directionSnapping';
import { OsnapSnapResult, AnchorPoint, BuildingDragSnapResult } from '../../../utils/cadOsnapEngine';
import { APP_CONFIG } from '../../../config/appConfig';

export interface AcquiringState {
  point: Point2D;
  progress: number; // 0 to 1
  label?: string;
}

/**
 * Renders CAD OSNAP glyphs, Target Snap Halo, and OTRACK guidelines
 */
export function renderDrawingToolPreview(
  rc: CadRenderContext,
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'vertexEdit' | 'rotate' | 'union',
  drawingVertices: Point2D[],

  currentMouseWorld: Point2D | null,
  selectedBuilding?: BuildingLoop | null,
  hoveredVertexIndex?: number | null,
  hoveredMidpointIndex?: number | null,
  draggedVertexIndex?: number | null,
  directionSnapResult?: DirectionSnapResult | null,
  selectedVertexIndex?: number | null,
  osnapSnapResult?: OsnapSnapResult | null,
  acquiredAnchors?: AnchorPoint[],
  acquiringState?: AcquiringState | null,
  buildingDragSnap?: BuildingDragSnapResult | null
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

  // 1. Render Acquired OTRACK Anchors (K1, K2)
  if (acquiredAnchors && acquiredAnchors.length > 0) {
    ctx.save();
    for (let i = 0; i < acquiredAnchors.length; i++) {
      const anchor = acquiredAnchors[i];
      const s = worldToScreen(anchor.point.x, anchor.point.y);
      if (!Number.isFinite(s.sx) || !Number.isFinite(s.sy)) continue;

      // Outer glowing ring
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.fill();
      ctx.strokeStyle = APP_CONFIG.osnap?.otrackAnchorColor || '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Plus mark
      ctx.beginPath();
      ctx.moveTo(s.sx - 4.5, s.sy);
      ctx.lineTo(s.sx + 4.5, s.sy);
      ctx.moveTo(s.sx, s.sy - 4.5);
      ctx.lineTo(s.sx + 4.5, s.sy);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Small badge K1 / K2
      const label = `K${i + 1}`;
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = APP_CONFIG.osnap?.otrackAnchorColor || '#f59e0b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, s.sx, s.sy - 8);
    }
    ctx.restore();
  }

  // 2. Render Hover Acquisition Progress Ring (Hover timer 300 ms)
  if (acquiringState && acquiringState.progress > 0 && acquiringState.progress < 1) {
    const s = worldToScreen(acquiringState.point.x, acquiringState.point.y);
    if (Number.isFinite(s.sx) && Number.isFinite(s.sy)) {
      ctx.save();
      const r = 9;
      // Background ring track
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Progress arc
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + acquiringState.progress * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, r, startAngle, endAngle);
      ctx.strokeStyle = APP_CONFIG.osnap?.otrackAnchorColor || '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3. Render Advanced OSNAP / OTRACK Snap Result (Priority 1..6)
  if (osnapSnapResult) {
    const pSnap = worldToScreen(osnapSnapResult.snappedPoint.x, osnapSnapResult.snappedPoint.y);

    if (Number.isFinite(pSnap.sx) && Number.isFinite(pSnap.sy)) {
      ctx.save();

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

      // Render Active Rays for OTRACK
      if (osnapSnapResult.activeRays && osnapSnapResult.activeRays.length > 0) {
        for (const ray of osnapSnapResult.activeRays) {
          const r1 = worldToScreen(ray.p1.x, ray.p1.y);
          const r2 = worldToScreen(ray.p2.x, ray.p2.y);
          if (Number.isFinite(r1.sx) && Number.isFinite(r2.sx)) {
            ctx.beginPath();
            ctx.strokeStyle = APP_CONFIG.osnap?.otrackRayColor || '#818cf8';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.moveTo(r1.sx, r1.sy);
            ctx.lineTo(r2.sx, r2.sy);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // Render Extension guide line if available
      if (osnapSnapResult.rayLine) {
        const e1 = worldToScreen(osnapSnapResult.rayLine.p1.x, osnapSnapResult.rayLine.p1.y);
        const e2 = worldToScreen(osnapSnapResult.rayLine.p2.x, osnapSnapResult.rayLine.p2.y);
        if (Number.isFinite(e1.sx) && Number.isFinite(e2.sx)) {
          ctx.beginPath();
          ctx.strokeStyle = APP_CONFIG.osnap?.extensionColor || '#38bdf8';
          ctx.lineWidth = 1.2;
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
        // Default / OTRACK Ray Dot + Ring
        ctx.beginPath();
        ctx.arc(pSnap.sx, pSnap.sy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = APP_CONFIG.osnap?.otrackRayColor || '#818cf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Information Badge near cursor
      const badgeText = `${osnapSnapResult.label}`;
      ctx.font = 'bold 10px Inter, sans-serif';
      const tw = ctx.measureText(badgeText).width;
      const bx = pSnap.sx + 14;
      const by = pSnap.sy - 16;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle =
        snapType === 'endpoint'
          ? '#10b981'
          : snapType === 'midpoint'
          ? '#06b6d4'
          : snapType === 'otrack_intersection'
          ? '#f43f5e'
          : '#818cf8';
      ctx.lineWidth = 1;
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
      ctx.beginPath();
      ctx.strokeStyle = APP_CONFIG.directionSnapping.guideLineColor;
      ctx.lineWidth = APP_CONFIG.directionSnapping.guideLineWidth;
      ctx.setLineDash([...APP_CONFIG.directionSnapping.guideLineDash]);
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(pSnap.sx, pSnap.sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const relationLabel =
        directionSnapResult.relationType === 'perpendicular'
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

  // 6. Vertex Edit Mode handles and midpoint [+] insertions
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
          ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
          ctx.strokeStyle = '#f59e0b';
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
        ctx.fillStyle = isSelected ? '#f59e0b' : isHovered ? '#38bdf8' : '#0f172a';
        ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : '#38bdf8';
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.fill();
        ctx.stroke();

        ctx.font = isSelected ? 'bold 9px monospace' : 'bold 8.5px monospace';
        ctx.fillStyle = isSelected ? '#020617' : isHovered ? '#020617' : '#94a3b8';
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
      ctx.beginPath();
      ctx.arc(pS.sx, pS.sy, ringRadiusPx, 0, Math.PI * 2);
      ctx.strokeStyle = isRotating ? '#818cf8' : 'rgba(129, 140, 248, 0.45)';
      ctx.lineWidth = isRotating ? 2.5 : 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 7.2 Angle Tracking guideline ray when angle is snapped
      if (activeRotateAngleSnap && isRotating) {
        const rad = ((activeRotateAngleSnap.angleDeg) * Math.PI) / 180;
        const rayLen = ringRadiusPx * 1.8;
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

        ctx.beginPath();
        ctx.moveTo(pS.sx, pS.sy);
        ctx.arc(pS.sx, pS.sy, ringRadiusPx, startAngle, mouseAngle, false);
        ctx.fillStyle = 'rgba(129, 140, 248, 0.18)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(pS.sx, pS.sy);
        ctx.lineTo(mouseScreen.sx, mouseScreen.sy);
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const badgeAngle = (startAngle + mouseAngle) / 2;
        const badgeX = pS.sx + Math.cos(badgeAngle) * (ringRadiusPx + 22);
        const badgeY = pS.sy + Math.sin(badgeAngle) * (ringRadiusPx + 22);
        const trackingLabel = activeRotateAngleSnap ? ' [Śledzenie]' : '';
        const badgeText = `${rotAngleDeg >= 0 ? '+' : ''}${rotAngleDeg.toFixed(1)}°${trackingLabel}`;

        ctx.font = 'bold 11px monospace';
        const bw = ctx.measureText(badgeText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = activeRotateAngleSnap ? '#38bdf8' : '#818cf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX - bw / 2 - 6, badgeY - 10, bw + 12, 20, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = activeRotateAngleSnap ? '#7dd3fc' : '#c7d2fe';
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
