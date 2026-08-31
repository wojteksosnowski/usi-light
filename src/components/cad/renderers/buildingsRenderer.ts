import { CadRenderContext } from '../types';

export function renderBuildings(
  rc: CadRenderContext,
  buildings: any[],
  selectedBuildingId: string | null,
  hoveredBuildingId: string | null,
  hoveredEdge: { buildingId: string; edgeIndex: number } | null,
  isEditMode: boolean,
  showNormals: boolean,
  analysisResults: any[],
  selectedPointResult: any,
  activePointMode: 'shadowing' | 'sunlight',
  isLinkingMode: boolean,
  linkingSourceId: string | null,
  layerSettings: Record<string, any> = {}
) {
  const { ctx, worldToScreen } = rc;

  // 1. Render Building Fills
  for (const bldg of buildings) {
    const lyr = bldg.layer || 'Domyślna (0)';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;

    const isGhosted = lyrSetting.isGhosted === true;
    const isSelected = bldg.id === selectedBuildingId;
    const isHovered = bldg.id === hoveredBuildingId;
    const isTested = bldg.isTested;
    const isIncluded = bldg.isIncluded !== false;

    ctx.save();
    if (isGhosted) {
      ctx.globalAlpha = 0.35;
    }

    ctx.beginPath();
    bldg.vertices.forEach((v: any, idx: number) => {
      const { sx, sy } = worldToScreen(v.x, v.y);
      if (idx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();

    if (!isIncluded) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    } else if (isTested) {
      ctx.fillStyle = isSelected
        ? 'rgba(59, 130, 246, 0.30)'
        : isHovered
        ? 'rgba(59, 130, 246, 0.22)'
        : 'rgba(59, 130, 246, 0.16)';
    } else {
      ctx.fillStyle = isSelected
        ? 'rgba(148, 163, 184, 0.28)'
        : isHovered
        ? 'rgba(148, 163, 184, 0.22)'
        : 'rgba(71, 85, 105, 0.18)';
    }
    ctx.fill();

    if (isHovered) {
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // 2. Render Building Segments (Outlines & Edges)
  for (const bldg of buildings) {
    const lyr = bldg.layer || 'Domyślna (0)';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;

    const isGhosted = lyrSetting.isGhosted === true;
    const isLocked = lyrSetting.isLocked === true;
    const isSelected = bldg.id === selectedBuildingId;
    const isTested = bldg.isTested;
    const isIncluded = bldg.isIncluded !== false;

    ctx.save();
    if (isGhosted) {
      ctx.globalAlpha = 0.35;
    }

    for (let eIdx = 0; eIdx < bldg.segments.length; eIdx++) {
      const seg = bldg.segments[eIdx];
      const isEdgeHovered = isEditMode && hoveredEdge?.buildingId === bldg.id && hoveredEdge?.edgeIndex === eIdx;
      const { sx: x1, sy: y1 } = worldToScreen(seg.p1.x, seg.p1.y);
      const { sx: x2, sy: y2 } = worldToScreen(seg.p2.x, seg.p2.y);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);

      if (isEdgeHovered) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
      } else if (!isIncluded) {
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
        ctx.lineWidth = 1;
      } else if (isTested) {
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#60a5fa';
        ctx.lineWidth = isSelected ? 3 : 2;
      } else {
        ctx.strokeStyle = isSelected ? '#cbd5e1' : '#64748b';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
      }
      ctx.stroke();

      if (showNormals) {
        const midX = (seg.p1.x + seg.p2.x) / 2;
        const midY = (seg.p1.y + seg.p2.y) / 2;
        const normLen = 1.2;
        const nx = midX + seg.normal.x * normLen;
        const ny = midY + seg.normal.y * normLen;
        const { sx: msx, sy: msy } = worldToScreen(midX, midY);
        const { sx: nsx, sy: nsy } = worldToScreen(nx, ny);

        ctx.beginPath();
        ctx.moveTo(msx, msy);
        ctx.lineTo(nsx, nsy);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.stroke();

        const angle = Math.atan2(nsy - msy, nsx - msx);
        const headLen = 4;
        ctx.beginPath();
        ctx.moveTo(nsx, nsy);
        ctx.lineTo(nsx - headLen * Math.cos(angle - Math.PI / 6), nsy - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(nsx - headLen * Math.cos(angle + Math.PI / 6), nsy - headLen * Math.sin(angle + Math.PI / 6));
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
      }
    }

    // Centroid Label for Building
    if (bldg.vertices.length >= 3) {
      let cx = 0;
      let cy = 0;
      for (const v of bldg.vertices) {
        cx += v.x;
        cy += v.y;
      }
      cx /= bldg.vertices.length;
      cy /= bldg.vertices.length;
      const { sx: csx, sy: csy } = worldToScreen(cx, cy);

      const lockTag = isLocked ? ' 🔒' : '';
      const ghostTag = isGhosted ? ' 👻' : '';
      const title = `${bldg.name || (isTested ? 'Budynek Badany' : 'Budynek Sąsiedni')}${lockTag}${ghostTag}`;
      const sub = `H = ${bldg.defaultHeight}m • ${isTested ? 'BADANY' : 'PRZESZKODA'}`;
      ctx.font = 'bold 11px sans-serif';
      const w1 = ctx.measureText(title).width;
      ctx.font = '9px monospace';
      const w2 = ctx.measureText(sub).width;
      const maxW = Math.max(w1, w2);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = isTested ? 'rgba(59, 130, 246, 0.5)' : 'rgba(100, 116, 139, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(csx - maxW / 2 - 8, csy - 18, maxW + 16, 36, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isTested ? '#93c5fd' : '#e2e8f0';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, csx, csy - 5);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(sub, csx, csy + 9);
    }
    ctx.restore();
  }

  // 3. Group Links
  const groupCentroids = new Map<string, { x: number; y: number }[]>();
  for (const bldg of buildings) {
    if (bldg.groupId && bldg.vertices.length > 0) {
      const centroid = bldg.vertices.reduce(
        (acc: any, v: any) => ({ x: acc.x + v.x / bldg.vertices.length, y: acc.y + v.y / bldg.vertices.length }),
        { x: 0, y: 0 }
      );
      if (!groupCentroids.has(bldg.groupId)) {
        groupCentroids.set(bldg.groupId, []);
      }
      groupCentroids.get(bldg.groupId)!.push(centroid);
    }
  }

  groupCentroids.forEach((centroids) => {
    if (centroids.length >= 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);

      for (let i = 0; i < centroids.length - 1; i++) {
        const c1 = worldToScreen(centroids[i].x, centroids[i].y);
        const c2 = worldToScreen(centroids[i + 1].x, centroids[i + 1].y);
        ctx.beginPath();
        ctx.moveTo(c1.sx, c1.sy);
        ctx.lineTo(c2.sx, c2.sy);
        ctx.stroke();

        const midX = (c1.sx + c2.sx) / 2;
        const midY = (c1.sy + c2.sy) / 2;
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(midX, midY, 9, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔗', midX, midY + 1);
      }
      ctx.restore();
    }
  });

  // 4. Highlight Selected Analysis Point
  if (selectedPointResult) {
    const { point } = selectedPointResult;
    const { sx, sy } = worldToScreen(point.x, point.y);

    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sx, sy, 11, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Linking Mode Interactive Link Preview
  if (isLinkingMode && linkingSourceId) {
    const srcBldg = buildings.find((b) => b.id === linkingSourceId);
    if (srcBldg && srcBldg.vertices.length > 0) {
      const srcCentroid = srcBldg.vertices.reduce(
        (acc: any, v: any) => ({ x: acc.x + v.x / srcBldg.vertices.length, y: acc.y + v.y / srcBldg.vertices.length }),
        { x: 0, y: 0 }
      );
      const sc = worldToScreen(srcCentroid.x, srcCentroid.y);

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);

      for (const targetBldg of buildings) {
        if (targetBldg.id === linkingSourceId) continue;
        const targetCentroid = targetBldg.vertices.reduce(
          (acc: any, v: any) => ({ x: acc.x + v.x / targetBldg.vertices.length, y: acc.y + v.y / targetBldg.vertices.length }),
          { x: 0, y: 0 }
        );
        const tc = worldToScreen(targetCentroid.x, targetCentroid.y);

        ctx.beginPath();
        ctx.moveTo(sc.sx, sc.sy);
        ctx.lineTo(tc.sx, tc.sy);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
