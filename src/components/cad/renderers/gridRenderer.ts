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
  } | null,
  viewRotationMode: boolean,
  buildings: any[]
) {
  const { ctx, width, height, viewState, screenToWorld, worldToScreen } = rc;

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

  // Rotation tool guide overlay
  if (viewRotationMode && rotationHover) {
    const { sx, sy } = worldToScreen(rotationHover.point.x, rotationHover.point.y);
    const bldg = buildings.find((b) => b.id === rotationHover.buildingId);
    const seg = bldg?.segments.find((s: any) => s.id === rotationHover.segmentId);
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy - 12);
    ctx.lineTo(sx + 12, sy + 12);
    ctx.moveTo(sx - 12, sy + 12);
    ctx.lineTo(sx + 12, sy - 12);
    ctx.stroke();
    ctx.setLineDash([]);
    const text = `Obrót widoku: ${rotationHover.previewDeg.toFixed(1)}°`;
    ctx.font = 'bold 11px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    ctx.beginPath();
    ctx.roundRect(sx - tw / 2 - 8, sy - 28, tw + 16, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx, sy - 19);

    if (seg) {
      const p1 = worldToScreen(seg.p1.x, seg.p1.y);
      const p2 = worldToScreen(seg.p2.x, seg.p2.y);
      const end = rotationHover.ratio >= 0.5 ? p2 : p1;
      const other = rotationHover.ratio >= 0.5 ? p1 : p2;
      const dx = end.sx - other.sx;
      const dy = end.sy - other.sy;
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.stroke();

      const arrowLen = 10;
      ctx.beginPath();
      ctx.moveTo(end.sx, end.sy);
      ctx.lineTo(end.sx - Math.cos(angle - Math.PI / 6) * arrowLen, end.sy - Math.sin(angle - Math.PI / 6) * arrowLen);
      ctx.lineTo(end.sx - Math.cos(angle + Math.PI / 6) * arrowLen, end.sy - Math.sin(angle + Math.PI / 6) * arrowLen);
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
    }
    ctx.restore();
  }

  // Visual Scale Bar (bottom-right)
  const targetPixels = 100;
  const metersForTarget = targetPixels / Math.max(0.001, viewState.scale);
  const niceMeters = Math.max(1, Math.pow(10, Math.floor(Math.log10(metersForTarget))) * Math.round(metersForTarget / Math.pow(10, Math.floor(Math.log10(metersForTarget)))));
  const barPixels = niceMeters * viewState.scale;

  const barX = width - barPixels - 24;
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
