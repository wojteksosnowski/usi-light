import { CadRenderContext } from '../types';
import { computeLinearDimension, computeAngularDimension } from '../../../utils/math2d';

export function renderDimensions(
  rc: CadRenderContext,
  buildings: any[],
  dimensions: any[],
  isDimensionMode: boolean,
  dimensionPendingRef: any,
  dimHoveredEdge: any,
  dimensionType: string,
  selectedBuildingId: string | null
) {
  const { ctx, worldToScreen, width, height } = rc;

  // 1. Existing Saved Dimensions
  if (dimensions.length > 0) {
    ctx.save();
    for (const dim of dimensions) {
      const bldg1 = buildings.find((b) => b.id === dim.ref1.buildingId);
      const bldg2 = buildings.find((b) => b.id === dim.ref2.buildingId);
      const seg1 = bldg1?.segments.find((s: any) => s.id === dim.ref1.segmentId);
      const seg2 = bldg2?.segments.find((s: any) => s.id === dim.ref2.segmentId);
      if (!seg1 || !seg2) continue;

      if (dim.type === 'linear') {
        const res = computeLinearDimension(seg1.p1, seg1.p2, seg2.p1, seg2.p2);
        const s1 = worldToScreen(res.p1.x, res.p1.y);
        const s2 = worldToScreen(res.p2.x, res.p2.y);
        if (!Number.isFinite(s1.sx) || !Number.isFinite(s1.sy) || !Number.isFinite(s2.sx) || !Number.isFinite(s2.sy)) continue;

        // Viewport culling for dimension
        const pad = 60;
        if (
          (s1.sx < -pad && s2.sx < -pad) ||
          (s1.sx > width + pad && s2.sx > width + pad) ||
          (s1.sy < -pad && s2.sy < -pad) ||
          (s1.sy > height + pad && s2.sy > height + pad)
        ) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(s1.sx, s1.sy);
        ctx.lineTo(s2.sx, s2.sy);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        const angle = Math.atan2(s2.sy - s1.sy, s2.sx - s1.sx);
        const perpAngle = angle + Math.PI / 2;
        const tickLen = 6;

        [s1, s2].forEach((s) => {
          ctx.beginPath();
          ctx.moveTo(s.sx - Math.cos(perpAngle) * tickLen, s.sy - Math.sin(perpAngle) * tickLen);
          ctx.lineTo(s.sx + Math.cos(perpAngle) * tickLen, s.sy + Math.sin(perpAngle) * tickLen);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.0;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(s.sx, s.sy, 3, 0, 2 * Math.PI);
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
        });

        const midSx = (s1.sx + s2.sx) / 2;
        const midSy = (s1.sy + s2.sy) / 2;
        const labelText = `${res.distance.toFixed(2)} m`;

        ctx.font = 'bold 11px monospace';
        const lw = ctx.measureText(labelText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(midSx - lw / 2 - 5, midSy - 9, lw + 10, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, midSx, midSy);
      } else {
        const res = computeAngularDimension(seg1.p1, seg1.p2, seg2.p1, seg2.p2);
        const sI = worldToScreen(res.intersection.x, res.intersection.y);

        // Screen angles (y is down, so screenAngle = -worldAngle)
        const theta1 = -res.ang1;
        const theta2 = -res.ang2;
        const delta = Math.atan2(Math.sin(theta2 - theta1), Math.cos(theta2 - theta1));

        // Radius scaled to touch at least one segment, min 28px
        const r = Math.max(res.touchRadiusWorld * rc.viewState.scale, 28);

        // Extension guide rays from intersection along both segment vectors
        ctx.beginPath();
        ctx.moveTo(sI.sx, sI.sy);
        ctx.lineTo(sI.sx + Math.cos(theta1) * (r + 10), sI.sy + Math.sin(theta1) * (r + 10));
        ctx.moveTo(sI.sx, sI.sy);
        ctx.lineTo(sI.sx + Math.cos(theta2) * (r + 10), sI.sy + Math.sin(theta2) * (r + 10));
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Continuous interior arc connecting the two rays and touching segments
        ctx.beginPath();
        ctx.arc(sI.sx, sI.sy, r, theta1, theta1 + delta, delta < 0);
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Label positioned on the interior bisector
        const labelAngle = theta1 + delta / 2;
        const labelX = sI.sx + Math.cos(labelAngle) * (r + 14);
        const labelY = sI.sy + Math.sin(labelAngle) * (r + 14);
        const labelText = `${res.angleDeg.toFixed(1)}°`;

        ctx.font = 'bold 11px monospace';
        const lw = ctx.measureText(labelText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(labelX - lw / 2 - 5, labelY - 9, lw + 10, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f3e8ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, labelX, labelY);
      }
    }
    ctx.restore();
  }

  // 2. Active Dimension Tool Interactive Guide & Live Preview
  if (isDimensionMode) {
    ctx.save();

    if (dimensionPendingRef) {
      const bldg1 = buildings.find((b) => b.id === dimensionPendingRef.buildingId);
      const seg1 = bldg1?.segments.find((s: any) => s.id === dimensionPendingRef.segmentId);
      if (seg1) {
        const s1_p1 = worldToScreen(seg1.p1.x, seg1.p1.y);
        const s1_p2 = worldToScreen(seg1.p2.x, seg1.p2.y);

        ctx.beginPath();
        ctx.moveTo(s1_p1.sx, s1_p1.sy);
        ctx.lineTo(s1_p2.sx, s1_p2.sy);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 5;
        ctx.stroke();

        const midS = worldToScreen((seg1.p1.x + seg1.p2.x) / 2, (seg1.p1.y + seg1.p2.y) / 2);
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        const hint = '1. Początek wymiaru';
        const hw = ctx.measureText(hint).width;
        ctx.beginPath();
        ctx.roundRect(midS.sx - hw / 2 - 5, midS.sy - 20, hw + 10, 16, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hint, midS.sx, midS.sy - 12);
      }
    }

    if (dimHoveredEdge) {
      const hBldg = buildings.find((b) => b.id === dimHoveredEdge.buildingId);
      const hSeg = hBldg?.segments.find((s: any) => s.id === dimHoveredEdge.segmentId);
      if (hSeg) {
        const hs1 = worldToScreen(hSeg.p1.x, hSeg.p1.y);
        const hs2 = worldToScreen(hSeg.p2.x, hSeg.p2.y);

        ctx.beginPath();
        ctx.moveTo(hs1.sx, hs1.sy);
        ctx.lineTo(hs2.sx, hs2.sy);
        ctx.strokeStyle = dimensionPendingRef ? '#34d399' : '#38bdf8';
        ctx.lineWidth = 4;
        ctx.stroke();

        if (dimensionPendingRef) {
          const bldg1 = buildings.find((b) => b.id === dimensionPendingRef.buildingId);
          const seg1 = bldg1?.segments.find((s: any) => s.id === dimensionPendingRef.segmentId);
          if (seg1) {
            if (dimensionType === 'linear') {
              const res = computeLinearDimension(seg1.p1, seg1.p2, hSeg.p1, hSeg.p2);
              const s1 = worldToScreen(res.p1.x, res.p1.y);
              const s2 = worldToScreen(res.p2.x, res.p2.y);

              ctx.beginPath();
              ctx.moveTo(s1.sx, s1.sy);
              ctx.lineTo(s2.sx, s2.sy);
              ctx.strokeStyle = '#34d399';
              ctx.lineWidth = 2.0;
              ctx.setLineDash([4, 4]);
              ctx.stroke();
              ctx.setLineDash([]);

              const midSx = (s1.sx + s2.sx) / 2;
              const midSy = (s1.sy + s2.sy) / 2;
              const prevLabel = `${res.distance.toFixed(2)} m (Kliknij koniec)`;
              ctx.font = 'bold 11px sans-serif';
              const pw = ctx.measureText(prevLabel).width;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
              ctx.strokeStyle = '#34d399';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(midSx - pw / 2 - 6, midSy - 10, pw + 12, 20, 4);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = '#6ee7b7';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(prevLabel, midSx, midSy);
            } else {
              const res = computeAngularDimension(seg1.p1, seg1.p2, hSeg.p1, hSeg.p2);
              const prevLabel = `${res.angleDeg.toFixed(1)}° (Kliknij koniec)`;
              const midS = worldToScreen((hSeg.p1.x + hSeg.p2.x) / 2, (hSeg.p1.y + hSeg.p2.y) / 2);

              ctx.font = 'bold 11px sans-serif';
              const pw = ctx.measureText(prevLabel).width;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
              ctx.strokeStyle = '#c084fc';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(midS.sx - pw / 2 - 6, midS.sy - 10, pw + 12, 20, 4);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = '#e9d5ff';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(prevLabel, midS.sx, midS.sy);
            }
          }
        }
      }
    }
    ctx.restore();
  }
}
