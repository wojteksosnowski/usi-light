import { CadRenderContext } from '../types';

export function renderCadGrid(
  rc: CadRenderContext,
  rotationHover: {
    buildingId: string;
    segmentId: string;
    angleDeg: number;
    previewDeg: number;
    ratio: number;
    point: { x: number; y: number };
    originPoint?: { x: number; y: number };
    targetPoint?: { x: number; y: number };
  } | null,
  viewRotationMode: boolean,
  buildings: any[]
) {
  const { ctx, width, height, viewState, screenToWorld, worldToScreen, viewRotationDeg } = rc;

  // 1. Clean background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, width, height);

  // 2. Compute true world bounds of the screen viewport (all 4 corners for rotation support)
  const c1 = screenToWorld(0, 0);
  const c2 = screenToWorld(width, 0);
  const c3 = screenToWorld(width, height);
  const c4 = screenToWorld(0, height);

  const minWx = Math.min(c1.wx, c2.wx, c3.wx, c4.wx);
  const maxWx = Math.max(c1.wx, c2.wx, c3.wx, c4.wx);
  const minWy = Math.min(c1.wy, c2.wy, c3.wy, c4.wy);
  const maxWy = Math.max(c1.wy, c2.wy, c3.wy, c4.wy);

  const gridStep = Math.max(1, Math.pow(10, Math.floor(Math.log10(60 / Math.max(0.001, viewState.scale)))));
  const pad = gridStep * 2;

  const minGridX = Math.floor((minWx - pad) / gridStep) * gridStep;
  const maxGridX = Math.ceil((maxWx + pad) / gridStep) * gridStep;
  const minGridY = Math.floor((minWy - pad) / gridStep) * gridStep;
  const maxGridY = Math.ceil((maxWy + pad) / gridStep) * gridStep;

  // 3. Main CAD Grid Lines in world space
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = minGridX; gx <= maxGridX; gx += gridStep) {
    const p1 = worldToScreen(gx, minGridY);
    const p2 = worldToScreen(gx, maxGridY);
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
  }
  for (let gy = minGridY; gy <= maxGridY; gy += gridStep) {
    const p1 = worldToScreen(minGridX, gy);
    const p2 = worldToScreen(maxGridX, gy);
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
  }
  ctx.stroke();

  // Minor 1m Subgrid when zoomed in
  if (viewState.scale > 10) {
    ctx.strokeStyle = '#09101d';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let gx = minGridX; gx <= maxGridX; gx += 1) {
      if (gx % gridStep === 0) continue;
      const p1 = worldToScreen(gx, minGridY);
      const p2 = worldToScreen(gx, maxGridY);
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
    }
    for (let gy = minGridY; gy <= maxGridY; gy += 1) {
      if (gy % gridStep === 0) continue;
      const p1 = worldToScreen(minGridX, gy);
      const p2 = worldToScreen(maxGridX, gy);
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
    }
    ctx.stroke();
  }

  // 4. Origin Axes (X=0 and Y=0) in world space
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // X axis (y = 0)
  const xStart = worldToScreen(minGridX, 0);
  const xEnd = worldToScreen(maxGridX, 0);
  ctx.moveTo(xStart.sx, xStart.sy);
  ctx.lineTo(xEnd.sx, xEnd.sy);
  // Y axis (x = 0)
  const yStart = worldToScreen(0, minGridY);
  const yEnd = worldToScreen(0, maxGridY);
  ctx.moveTo(yStart.sx, yStart.sy);
  ctx.lineTo(yEnd.sx, yEnd.sy);
  ctx.stroke();

  // 5. Rotation tool guide overlay (Origin anchor + Direction arrow + Colored angle arc)
  if (viewRotationMode && rotationHover) {
    const bldg = buildings.find((b) => b.id === rotationHover.buildingId);
    const seg = bldg?.segments?.find((s: any) => s.id === rotationHover.segmentId);

    const originPt = rotationHover.originPoint || (rotationHover.ratio < 0.5 ? seg?.p1 : seg?.p2) || rotationHover.point;
    const targetPt = rotationHover.targetPoint || (rotationHover.ratio < 0.5 ? seg?.p2 : seg?.p1) || rotationHover.point;

    const originSc = worldToScreen(originPt.x, originPt.y);
    const targetSc = worldToScreen(targetPt.x, targetPt.y);
    const hoverSc = worldToScreen(rotationHover.point.x, rotationHover.point.y);

    ctx.save();

    // Draw full segment with highlight
    if (seg) {
      const p1Sc = worldToScreen(seg.p1.x, seg.p1.y);
      const p2Sc = worldToScreen(seg.p2.x, seg.p2.y);
      ctx.beginPath();
      ctx.moveTo(p1Sc.sx, p1Sc.sy);
      ctx.lineTo(p2Sc.sx, p2Sc.sy);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Direction vector on screen from originSc to targetSc
    const sdx = targetSc.sx - originSc.sx;
    const sdy = targetSc.sy - originSc.sy;
    const segScreenLen = Math.hypot(sdx, sdy);
    const angleScreen = Math.atan2(sdy, sdx);

    // Dynamic Colored Arc showing rotation angle
    const arcRadius = Math.min(36, Math.max(18, segScreenLen * 0.4));
    // Horizontal direction on screen (to the right: angle 0)
    const baseAngle = 0; // horizontal screen axis
    ctx.beginPath();
    ctx.arc(originSc.sx, originSc.sy, arcRadius, 0, angleScreen, angleScreen < 0);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Arc background fill
    ctx.beginPath();
    ctx.moveTo(originSc.sx, originSc.sy);
    ctx.arc(originSc.sx, originSc.sy, arcRadius, 0, angleScreen, angleScreen < 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fill();

    // Active directional arrow along segment (from origin to target)
    if (segScreenLen > 5) {
      ctx.beginPath();
      ctx.moveTo(originSc.sx, originSc.sy);
      ctx.lineTo(targetSc.sx, targetSc.sy);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Arrow head at target
      const arrowLen = 12;
      ctx.beginPath();
      ctx.moveTo(targetSc.sx, targetSc.sy);
      ctx.lineTo(
        targetSc.sx - Math.cos(angleScreen - Math.PI / 6) * arrowLen,
        targetSc.sy - Math.sin(angleScreen - Math.PI / 6) * arrowLen
      );
      ctx.lineTo(
        targetSc.sx - Math.cos(angleScreen + Math.PI / 6) * arrowLen,
        targetSc.sy - Math.sin(angleScreen + Math.PI / 6) * arrowLen
      );
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
    }

    // Origin Anchor Point Marker (glow + outer ring + central dot)
    ctx.beginPath();
    ctx.arc(originSc.sx, originSc.sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(originSc.sx, originSc.sy, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Tooltip Badge with Angle info
    const text = `Obrót widoku: ${rotationHover.previewDeg.toFixed(1)}°`;
    ctx.font = 'bold 11px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const badgeX = hoverSc.sx;
    const badgeY = hoverSc.sy - 24;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(badgeX - tw / 2 - 8, badgeY - 10, tw + 16, 20, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, badgeX, badgeY);

    ctx.restore();
  }

  // 6. Visual Scale Bar (bottom-right)
  const targetPixels = 100;
  const metersForTarget = targetPixels / Math.max(0.001, viewState.scale);
  const niceMeters = Math.max(1, Math.pow(10, Math.floor(Math.log10(metersForTarget))) * Math.round(metersForTarget / Math.pow(10, Math.floor(Math.log10(metersForTarget)))));
  const barPixels = niceMeters * viewState.scale;

  const barX = width - barPixels - 74;
  const barY = height - 20;

  if (barX > 50 && barPixels > 5) {
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + barPixels, barY);
    ctx.moveTo(barX, barY - 4);
    ctx.lineTo(barX, barY + 4);
    ctx.moveTo(barX + barPixels, barY - 4);
    ctx.lineTo(barX + barPixels, barY + 4);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    const label = niceMeters >= 1000 ? `${(niceMeters / 1000).toFixed(1)} km` : `${niceMeters} m`;
    ctx.fillText(label, barX + barPixels / 2, barY - 10);
    ctx.restore();
  }
}
