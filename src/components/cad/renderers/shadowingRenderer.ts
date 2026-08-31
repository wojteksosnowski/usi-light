import { CadRenderContext } from '../types';

export function renderShadowingVisualization(
  rc: CadRenderContext,
  selectedPointResult: any,
  buildings: any[]
) {
  const { ctx, worldToScreen, viewRotationDeg, viewState } = rc;
  const { point, shadowing } = selectedPointResult;
  const { sx: px, sy: py } = worldToScreen(point.x, point.y);
  const sectors = shadowing.sectors;

  if (!sectors || sectors.length === 0) return;

  const normalWorldDeg = (Math.atan2(selectedPointResult.normal.y, selectedPointResult.normal.x) * 180) / Math.PI;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate((-viewRotationDeg * Math.PI) / 180);
  ctx.scale(viewState.scale, -viewState.scale);
  ctx.lineWidth = 1 / viewState.scale;

  for (let sIdx = 0; sIdx < sectors.length; sIdx++) {
    const sector = sectors[sIdx];
    const isFree = sector.isFree;
    const isTolerated = (sector as any).isTolerated === true;
    const startRelDeg = sector.startAngleDeg;
    const endRelDeg = sector.endAngleDeg;
    const spanDeg = sector.spanDeg;

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
      strokeColor = 'rgba(234, 179, 8, 0.9)';
      fillColor   = 'rgba(234, 179, 8, 0.18)';
      textColor   = '#facc15';
    }

    const lineWidth = 1.5 / viewState.scale;
    const startRad = ((normalWorldDeg + startRelDeg) * Math.PI) / 180;
    const endRad = ((normalWorldDeg + endRelDeg) * Math.PI) / 180;
    const radius = dist;

    // 1. Filled sector wedge
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(startRad) * radius, Math.sin(startRad) * radius);
    ctx.arc(0, 0, radius, startRad, endRad, false);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // 2. Edge rays
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(startRad) * radius, Math.sin(startRad) * radius);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(endRad) * radius, Math.sin(endRad) * radius);
    ctx.stroke();

    // 3. Connecting arc at radius
    ctx.beginPath();
    ctx.arc(0, 0, radius, startRad, endRad, false);
    ctx.stroke();

    // 4. Sector Angle Label inside the sector (e.g. "58.0°" or "34.5°") + distance label
    {
      let midRad = (startRad + endRad) / 2;
      if (Math.abs(endRad - startRad) > Math.PI) {
        midRad += Math.PI;
      }

      const labelDist = Math.max(2.5, dist * 0.65);
      const viewRotRad = (viewRotationDeg * Math.PI) / 180;
      const screenMidRad = midRad + viewRotRad;
      const labelScreen = {
        sx: px + Math.cos(screenMidRad) * labelDist * viewState.scale,
        sy: py - Math.sin(screenMidRad) * labelDist * viewState.scale,
      };
      const tickScreen = {
        sx: px + Math.cos(screenMidRad) * radius * viewState.scale,
        sy: py - Math.sin(screenMidRad) * radius * viewState.scale,
      };

      const labelAngle = Math.atan2(-Math.sin(screenMidRad), Math.cos(screenMidRad));

      ctx.save();
      ctx.resetTransform();
      ctx.translate(labelScreen.sx, labelScreen.sy);
      ctx.rotate(labelAngle);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const angleText = `${spanDeg.toFixed(1)}°`;
      const textWidth = ctx.measureText(angleText).width;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-textWidth / 2 - 5, -9, textWidth + 10, 18, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.fillText(angleText, 0, 0);

      if (isFree || dist >= 10) {
        ctx.fillStyle = strokeColor;
        ctx.font = 'bold 9px monospace';
        const tickOffset = Math.max(12, viewState.scale * 0.25);
        const tickDx = tickScreen.sx - labelScreen.sx;
        const tickDy = tickScreen.sy - labelScreen.sy;
        const tickLength = Math.hypot(tickDx, tickDy) || 1;
        const tickX = (tickDx / tickLength) * tickOffset;
        const tickY = (tickDy / tickLength) * tickOffset;
        ctx.fillText(`${dist.toFixed(0)}m`, tickX, tickY);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
