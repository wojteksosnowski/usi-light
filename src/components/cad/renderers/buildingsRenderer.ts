import { CadRenderContext } from '../types';

export interface EditingEdgeLengthState {
  buildingId: string;
  edgeIndex: number;
  currentLength: number;
  targetLength: number;
  inputStr: string;
  isFresh?: boolean;
  previewVertices?: any[];
}

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
  layerSettings: Record<string, any> = {},
  editingEdgeLength?: EditingEdgeLengthState | null,
  hoveredEdgeLengthBadge?: { buildingId: string; edgeIndex: number } | null,
  pinnedPointResults: any[] = [],
  activePinnedPointId?: string | null,
  liveFacadeSnap?: { point: { x: number; y: number }; buildingId: string; segmentId: string; ratio: number } | null,
  facadePointMode?: boolean
) {
  const { ctx, worldToScreen } = rc;

  // 0. Render Dashed Ghost Preview for Edge Length Editing
  if (editingEdgeLength?.previewVertices && editingEdgeLength.previewVertices.length >= 3) {
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
    ctx.beginPath();
    const first = worldToScreen(editingEdgeLength.previewVertices[0].x, editingEdgeLength.previewVertices[0].y);
    ctx.moveTo(first.sx, first.sy);
    for (let i = 1; i < editingEdgeLength.previewVertices.length; i++) {
      const pt = worldToScreen(editingEdgeLength.previewVertices[i].x, editingEdgeLength.previewVertices[i].y);
      ctx.lineTo(pt.sx, pt.sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 1. Render Building Fills
  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;
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
    let validCount = 0;
    bldg.vertices.forEach((v: any) => {
      if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
      const { sx, sy } = worldToScreen(v.x, v.y);
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
      if (validCount === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
      validCount++;
    });
    if (validCount >= 3) {
      ctx.closePath();
    }

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
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;
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

    if (Array.isArray(bldg.segments)) {
      for (let eIdx = 0; eIdx < bldg.segments.length; eIdx++) {
        const seg = bldg.segments[eIdx];
        if (!seg || !seg.p1 || !seg.p2 || !Number.isFinite(seg.p1.x) || !Number.isFinite(seg.p1.y) || !Number.isFinite(seg.p2.x) || !Number.isFinite(seg.p2.y)) continue;
        const isEdgeHovered = isEditMode && hoveredEdge?.buildingId === bldg.id && hoveredEdge?.edgeIndex === eIdx;
        const { sx: x1, sy: y1 } = worldToScreen(seg.p1.x, seg.p1.y);
        const { sx: x2, sy: y2 } = worldToScreen(seg.p2.x, seg.p2.y);
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

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

        if (showNormals && seg.normal && Number.isFinite(seg.normal.x) && Number.isFinite(seg.normal.y)) {
          const midX = (seg.p1.x + seg.p2.x) / 2;
          const midY = (seg.p1.y + seg.p2.y) / 2;
          const normLen = 1.2;
          const nx = midX + seg.normal.x * normLen;
          const ny = midY + seg.normal.y * normLen;
          const { sx: msx, sy: msy } = worldToScreen(midX, midY);
          const { sx: nsx, sy: nsy } = worldToScreen(nx, ny);
          if (Number.isFinite(msx) && Number.isFinite(msy) && Number.isFinite(nsx) && Number.isFinite(nsy)) {
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

        // Edge Length Badge on Selected Building (Interactive for editing)
        if (isSelected && seg.p1 && seg.p2) {
          const midX = (seg.p1.x + seg.p2.x) / 2;
          const midY = (seg.p1.y + seg.p2.y) / 2;
          const len = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
          const { sx: msx, sy: msy } = worldToScreen(midX, midY);

          if (Number.isFinite(msx) && Number.isFinite(msy)) {
            const isEditingThisEdge =
              editingEdgeLength?.buildingId === bldg.id && editingEdgeLength?.edgeIndex === eIdx;
            const isHoveredBadge =
              hoveredEdgeLengthBadge?.buildingId === bldg.id && hoveredEdgeLengthBadge?.edgeIndex === eIdx;

            const labelText = isEditingThisEdge
              ? `[ ${editingEdgeLength.inputStr ? editingEdgeLength.inputStr : '_'}m ]`
              : `${len.toFixed(2)}m`;

            ctx.font = 'bold 10px Inter, monospace';
            const tw = ctx.measureText(labelText).width;
            const pw = tw + 10;
            const ph = 18;

            ctx.fillStyle = isEditingThisEdge
              ? '#f59e0b'
              : isHoveredBadge
              ? 'rgba(56, 189, 248, 0.95)'
              : 'rgba(15, 23, 42, 0.88)';
            ctx.strokeStyle = isEditingThisEdge ? '#fbbf24' : isHoveredBadge ? '#38bdf8' : 'rgba(56, 189, 248, 0.4)';
            ctx.lineWidth = isEditingThisEdge || isHoveredBadge ? 1.5 : 1;
            ctx.beginPath();
            ctx.roundRect(msx - pw / 2, msy - ph / 2, pw, ph, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isEditingThisEdge ? '#0f172a' : '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, msx, msy);
          }
        }
      }
    }

    // Centroid Label for Building
    if (bldg.vertices && bldg.vertices.length >= 3) {
      let cx = 0;
      let cy = 0;
      let count = 0;
      for (const v of bldg.vertices) {
        if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) {
          cx += v.x;
          cy += v.y;
          count++;
        }
      }
      if (count >= 3) {
        cx /= count;
        cy /= count;
        const { sx: csx, sy: csy } = worldToScreen(cx, cy);

        if (Number.isFinite(csx) && Number.isFinite(csy)) {
          const lockTag = isLocked ? ' 🔒' : '';
          const ghostTag = isGhosted ? ' 👻' : '';
          const heightText = `${bldg.defaultHeight}m${lockTag}${ghostTag}`;

          ctx.font = 'bold 13px Inter, sans-serif';
          const textW = ctx.measureText(heightText).width;

          // Status dots configuration: [included, tested, cityCentre, childcare]
          const isIncluded = bldg.isIncluded !== false;
          const isChildcare = bldg.buildingType === 'childcare' || bldg.segments.some((s: any) => s.buildingType === 'childcare');
          const isCityCentre = bldg.isCityCentre || bldg.segments.some((s: any) => s.isCityCentre);

          const dots: { color: string; active: boolean }[] = [
            { color: '#10b981', active: isIncluded },
            { color: '#6366f1', active: isTested },
            { color: '#f59e0b', active: isCityCentre },
          ];
          if (isChildcare) {
            dots.push({ color: '#c084fc', active: true });
          }

          const dotRadius = 2.5;
          const dotSpacing = 7;
          const totalDotsW = (dots.length - 1) * dotSpacing;
          const cardW = Math.max(textW + 16, totalDotsW + 18, 38);
          const cardH = 30;

          ctx.fillStyle = 'rgba(11, 19, 41, 0.9)';
          ctx.strokeStyle = isTested ? 'rgba(99, 102, 241, 0.6)' : 'rgba(100, 116, 139, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(csx - cardW / 2, csy - cardH / 2, cardW, cardH, 6);
          ctx.fill();
          ctx.stroke();

          // Height text (larger, bold)
          ctx.fillStyle = isTested ? '#93c5fd' : '#f8fafc';
          ctx.font = 'bold 13px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(heightText, csx, csy - 5);

          // Row of status dots under height
          const startDotX = csx - totalDotsW / 2;
          const dotY = csy + 7;

          for (let dIdx = 0; dIdx < dots.length; dIdx++) {
            const d = dots[dIdx];
            const dx = startDotX + dIdx * dotSpacing;
            ctx.beginPath();
            ctx.arc(dx, dotY, dotRadius, 0, 2 * Math.PI);
            ctx.fillStyle = d.active ? d.color : 'rgba(71, 85, 105, 0.4)';
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();
  }

  // 3. Render Group Links / Link Handles
  const groupBuildings = new Map<string, any[]>();
  buildings.forEach((b) => {
    if (b.groupId) {
      if (!groupBuildings.has(b.groupId)) groupBuildings.set(b.groupId, []);
      groupBuildings.get(b.groupId)!.push(b);
    }
  });

  groupBuildings.forEach((bldgs) => {
    if (bldgs.length < 2) return;
    for (let i = 0; i < bldgs.length - 1; i++) {
      const b1 = bldgs[i];
      const b2 = bldgs[i + 1];
      if (!b1.vertices?.length || !b2.vertices?.length) continue;

      const c1 = b1.vertices.reduce((acc: any, v: any) => ({ x: acc.x + v.x / b1.vertices.length, y: acc.y + v.y / b1.vertices.length }), { x: 0, y: 0 });
      const c2 = b2.vertices.reduce((acc: any, v: any) => ({ x: acc.x + v.x / b2.vertices.length, y: acc.y + v.y / b2.vertices.length }), { x: 0, y: 0 });

      const s1 = worldToScreen(c1.x, c1.y);
      const s2 = worldToScreen(c2.x, c2.y);

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(s1.sx, s1.sy);
      ctx.lineTo(s2.sx, s2.sy);
      ctx.stroke();

      const midX = (s1.sx + s2.sx) / 2;
      const midY = (s1.sy + s2.sy) / 2;
      if (Number.isFinite(midX) && Number.isFinite(midY)) {
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

  // 4. Render All Pinned Analysis Points (P1, P2, P3)
  if (pinnedPointResults && pinnedPointResults.length > 0) {
    pinnedPointResults.forEach((ptRes, pIdx) => {
      if (!ptRes || !ptRes.point) return;
      const { point } = ptRes;
      const { sx, sy } = worldToScreen(point.x, point.y);
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

      const isActive = activePinnedPointId ? ptRes.id === activePinnedPointId : (selectedPointResult?.id === ptRes.id);
      const label = ptRes.label || `P${pIdx + 1}`;

      ctx.save();
      if (isActive) {
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, 2 * Math.PI);
      ctx.fillStyle = isActive ? '#38bdf8' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = isActive ? '#ffffff' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      const badgeW = 20;
      const badgeH = 14;
      const badgeY = sy - 16;
      ctx.fillStyle = isActive ? '#0284c7' : 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = isActive ? '#38bdf8' : '#475569';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(sx - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, sx, badgeY);

      ctx.restore();
    });
  } else if (selectedPointResult) {
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

  // 5. Render Live Snapping Marker in facadePointMode
  if (facadePointMode && liveFacadeSnap) {
    const { sx, sy } = worldToScreen(liveFacadeSnap.point.x, liveFacadeSnap.point.y);
    if (Number.isFinite(sx) && Number.isFinite(sy)) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, 11, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.stroke();

      const snapLabel = `+ Punkt (${(liveFacadeSnap.ratio * 100).toFixed(0)}%)`;
      ctx.font = 'bold 10px Inter, sans-serif';
      const tw = ctx.measureText(snapLabel).width;
      const pw = tw + 10;
      const ph = 18;
      const py = sy - 18;

      ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
      ctx.beginPath();
      ctx.roundRect(sx - pw / 2, py - ph / 2, pw, ph, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(snapLabel, sx, py);

      ctx.restore();
    }
  }

  // 6. Linking Mode Interactive Link Preview
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
