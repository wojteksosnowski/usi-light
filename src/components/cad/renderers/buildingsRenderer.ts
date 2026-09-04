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

// Global Path2D and AABB cache keyed by building reference and vertex version
interface BuildingCachedGeometry {
  path: Path2D;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

const buildingGeoCache = new WeakMap<object, BuildingCachedGeometry>();

/**
 * Renders Lucide-style Lock icon on canvas
 */
function drawLucideLockIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string = '#fbbf24') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Body: rounded rect (width 10, height 7)
  const w = 10;
  const h = 7;
  const rx = cx - w / 2;
  const ry = cy - 0.5;
  ctx.beginPath();
  ctx.roundRect(rx, ry, w, h, 2);
  ctx.stroke();

  // Shackle: arch
  ctx.beginPath();
  ctx.arc(cx, cy - 1, 3.2, Math.PI, 0, false);
  ctx.lineTo(cx + 3.2, cy - 0.5);
  ctx.moveTo(cx - 3.2, cy - 1);
  ctx.lineTo(cx - 3.2, cy - 0.5);
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders Lucide-style Ghost icon on canvas
 */
function drawLucideGhostIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string = '#c084fc') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Head and wavy body (width 10, height 11)
  const r = 4.5;
  const topY = cy - 2;
  ctx.beginPath();
  ctx.arc(cx, topY, r, Math.PI, 0, false);
  ctx.lineTo(cx + r, cy + 4.5);
  ctx.lineTo(cx + 2.25, cy + 2.5);
  ctx.lineTo(cx, cy + 4.5);
  ctx.lineTo(cx - 2.25, cy + 2.5);
  ctx.lineTo(cx - r, cy + 4.5);
  ctx.closePath();
  ctx.stroke();

  // Eyes
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx - 1.8, cy - 2, 0.8, 0, Math.PI * 2);
  ctx.arc(cx + 1.8, cy - 2, 0.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function getOrComputeBuildingGeo(bldg: any): BuildingCachedGeometry | null {
  if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) return null;
  const cached = buildingGeoCache.get(bldg);
  if (cached) return cached;

  const path = new Path2D();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let validCount = 0;

  for (let i = 0; i < bldg.vertices.length; i++) {
    const v = bldg.vertices[i];
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
    if (validCount === 0) {
      path.moveTo(v.x, v.y);
    } else {
      path.lineTo(v.x, v.y);
    }
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    sumX += v.x;
    sumY += v.y;
    validCount++;
  }
  path.closePath();

  if (validCount < 3) return null;

  const res: BuildingCachedGeometry = {
    path,
    minX,
    minY,
    maxX,
    maxY,
    centerX: sumX / validCount,
    centerY: sumY / validCount,
  };
  buildingGeoCache.set(bldg, res);
  return res;
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
  facadePointMode?: boolean,
  isVertexEditMode?: boolean,
  isRotateMode?: boolean,
  selectedBuildingIds: string[] = []
) {

  const { ctx, worldToScreen, screenToWorld, width, height, viewState, viewRotationDeg } = rc;

  // Viewport bounds in world space for culling
  const c1 = screenToWorld(0, 0);
  const c2 = screenToWorld(width, 0);
  const c3 = screenToWorld(width, height);
  const c4 = screenToWorld(0, height);
  const vpMinX = Math.min(c1.wx, c2.wx, c3.wx, c4.wx);
  const vpMaxX = Math.max(c1.wx, c2.wx, c3.wx, c4.wx);
  const vpMinY = Math.min(c1.wy, c2.wy, c3.wy, c4.wy);
  const vpMaxY = Math.max(c1.wy, c2.wy, c3.wy, c4.wy);

  // 0. Render Dashed Ghost Preview for Edge Length Editing
  if (editingEdgeLength?.previewVertices && editingEdgeLength.previewVertices.length >= 3) {
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    const first = worldToScreen(editingEdgeLength.previewVertices[0].x, editingEdgeLength.previewVertices[0].y);
    ctx.moveTo(first.sx, first.sy);
    for (let i = 1; i < editingEdgeLength.previewVertices.length; i++) {
      const pt = worldToScreen(editingEdgeLength.previewVertices[i].x, editingEdgeLength.previewVertices[i].y);
      ctx.lineTo(pt.sx, pt.sy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    // Viewport Culling check
    if (geo.maxX < vpMinX || geo.minX > vpMaxX || geo.maxY < vpMinY || geo.minY > vpMaxY) {
      continue;
    }

    const lyr = bldg.layer || 'Bariery';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;

    const isGhosted = lyrSetting.isGhosted === true;
    const isLocked = lyrSetting.isLocked === true;
    const isSelected = bldg.id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(bldg.id));
    const isTested = bldg.isTested;
    const isIncluded = bldg.isIncluded !== false;

    ctx.save();

    // Matrix transforming world (wx, wy) -> screen (sx, sy):
    // According to worldToScreen(wx, wy):
    // rx = wx * cos - wy * sin
    // ry = wx * sin + wy * cos
    // sx = panX + rx * scale = panX + scale * cos * wx - scale * sin * wy
    // sy = panY - ry * scale = panY - scale * sin * wx - scale * cos * wy
    const rot = ((viewRotationDeg || 0) * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const s = viewState.scale;

    const a = s * cosR;
    const b = -s * sinR;
    const c = -s * sinR;
    const d = -s * cosR;
    const e = viewState.panX;
    const f = viewState.panY;

    ctx.setTransform(a, b, c, d, e, f);

    const isBoundary = bldg.category === 'boundary';
    const isBalcony = bldg.category === 'balcony';

    if (isBoundary) {
      ctx.fillStyle = isSelected
        ? 'rgba(239, 68, 68, 0.12)'
        : bldg.id === hoveredBuildingId
        ? 'rgba(239, 68, 68, 0.08)'
        : 'rgba(239, 68, 68, 0.03)';
    } else if (isBalcony) {
      ctx.fillStyle = isSelected
        ? 'rgba(168, 85, 247, 0.25)'
        : bldg.id === hoveredBuildingId
        ? 'rgba(168, 85, 247, 0.18)'
        : 'rgba(168, 85, 247, 0.10)';
    } else if (bldg.id === hoveredBuildingId && !isSelected) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    } else if (isSelected) {
      ctx.fillStyle = isTested ? 'rgba(59, 130, 246, 0.22)' : 'rgba(148, 163, 184, 0.2)';
    } else if (isGhosted) {
      if (isTested) {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.14)';
      } else if (isIncluded) {
        ctx.fillStyle = 'rgba(51, 65, 85, 0.25)';
      } else {
        ctx.fillStyle = 'rgba(71, 85, 105, 0.20)';
      }
    } else if (isTested) {
      ctx.fillStyle = isIncluded ? 'rgba(96, 165, 250, 0.12)' : 'rgba(100, 116, 139, 0.08)';
    } else {
      ctx.fillStyle = isIncluded ? 'rgba(51, 65, 85, 0.25)' : 'rgba(30, 41, 59, 0.15)';
    }
    ctx.fill(geo.path);

    // Linking mode highlight
    if (isLinkingMode && linkingSourceId && bldg.id !== linkingSourceId) {
      ctx.lineWidth = 3 / s;
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([6 / s, 4 / s]);
      ctx.stroke(geo.path);
    } else if (isSelected) {
      ctx.lineWidth = (isBoundary ? 2.0 : 2.5) / s;
      ctx.strokeStyle = isBoundary
        ? '#ef4444'
        : isBalcony
        ? '#c084fc'
        : isTested
        ? '#60a5fa'
        : '#94a3b8';
      if (isBoundary) {
        ctx.setLineDash([8 / s, 4 / s]);
      }
      ctx.stroke(geo.path);
      if (isBoundary) {
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  // 2. Render Outer Edge Strokes & Interactive Edge Hovering
  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    // Viewport Culling check
    if (geo.maxX < vpMinX || geo.minX > vpMaxX || geo.maxY < vpMinY || geo.minY > vpMaxY) {
      continue;
    }

    const lyr = bldg.layer || 'Bariery';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;

    const isGhosted = lyrSetting.isGhosted === true;
    const isLocked = lyrSetting.isLocked === true;
    const isSelected = bldg.id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(bldg.id));
    const isTested = bldg.isTested;
    const isIncluded = bldg.isIncluded !== false;

    ctx.save();

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

        const isBoundary = bldg.category === 'boundary';
        const isBalcony = bldg.category === 'balcony';

        if (isBoundary) {
          ctx.setLineDash([]); // Granica rysowana ciągłą linią
        } else if (isBalcony) {
          ctx.setLineDash([4, 3]);
        } else {
          ctx.setLineDash([]);
        }

        if (isEdgeHovered) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 4;
        } else if (isBoundary) {
          ctx.strokeStyle = isSelected ? '#ef4444' : 'rgba(239, 68, 68, 0.85)';
          ctx.lineWidth = isSelected ? 2.5 : 1.8;
        } else if (isBalcony) {
          ctx.strokeStyle = isSelected ? '#c084fc' : 'rgba(192, 132, 252, 0.75)';
          ctx.lineWidth = isSelected ? 2.0 : 1.4;
        } else if (isGhosted) {
          if (isTested) {
            ctx.strokeStyle = 'rgba(96, 165, 250, 0.55)';
            ctx.lineWidth = 1.2;
          } else if (isIncluded) {
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
            ctx.lineWidth = 1.2;
          } else {
            // Delicate visible contour for non-tested non-included ghost
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.50)';
            ctx.lineWidth = 1.0;
          }
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
        ctx.setLineDash([]);

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
        // Hidden during vertex editing and rotation to not obstruct handles/rotations
        if (isSelected && seg.p1 && seg.p2 && !isVertexEditMode && !isRotateMode) {
          const isEditingThisEdge =

            editingEdgeLength?.buildingId === bldg.id && editingEdgeLength?.edgeIndex === eIdx;
          const isHoveredBadge =
            hoveredEdgeLengthBadge?.buildingId === bldg.id && hoveredEdgeLengthBadge?.edgeIndex === eIdx;

          let midX = (seg.p1.x + seg.p2.x) / 2;
          let midY = (seg.p1.y + seg.p2.y) / 2;
          if (
            isEditingThisEdge &&
            editingEdgeLength?.previewVertices &&
            editingEdgeLength.previewVertices.length >= 3
          ) {
            const p1 = editingEdgeLength.previewVertices[eIdx];
            const p2 =
              editingEdgeLength.previewVertices[
                (eIdx + 1) % editingEdgeLength.previewVertices.length
              ];
            if (p1 && p2) {
              midX = (p1.x + p2.x) / 2;
              midY = (p1.y + p2.y) / 2;
            }
          }

          const len = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
          const { sx: msx, sy: msy } = worldToScreen(midX, midY);

          if (Number.isFinite(msx) && Number.isFinite(msy)) {
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
    if (geo) {
      const cx = geo.centerX;
      const cy = geo.centerY;
      const { sx: csx, sy: csy } = worldToScreen(cx, cy);

      const screenBldgW = (geo.maxX - geo.minX) * viewState.scale;
      const screenBldgH = (geo.maxY - geo.minY) * viewState.scale;

      if (Number.isFinite(csx) && Number.isFinite(csy)) {
        const isBoundary = bldg.category === 'boundary';
        const isBalcony = bldg.category === 'balcony';

        if (isBoundary) {
          // Oblicz pole działki
          let bndArea = 0;
          for (let i = 0; i < bldg.vertices.length; i++) {
            const pA = bldg.vertices[i];
            const pB = bldg.vertices[(i + 1) % bldg.vertices.length];
            bndArea += pA.x * pB.y - pB.x * pA.y;
          }
          bndArea = Math.abs(bndArea) / 2;
          const areaText = `${Math.round(bndArea)} m²`;

          const hasPlotNumber = !!(bldg.plotNumber && bldg.plotNumber.trim());
          const plotName = hasPlotNumber
            ? (bldg.plotNumber!.startsWith('Dz.') ? bldg.plotNumber! : `Dz. ${bldg.plotNumber}`)
            : '';

          ctx.font = hasPlotNumber ? 'bold 12px Inter, sans-serif' : 'bold 11px Inter, monospace';
          const nameW = hasPlotNumber ? ctx.measureText(plotName).width : 0;
          ctx.font = '10px Inter, monospace';
          const areaW = ctx.measureText(areaText).width;

          const cardW = hasPlotNumber ? Math.max(nameW, areaW) + 20 : areaW + 16;
          const cardH = hasPlotNumber ? 34 : 22;

          // Nie pokazuj etykiety jeśli nie mieści się w obiekcie
          if (cardW <= screenBldgW && cardH <= screenBldgH) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = isSelected ? '#ef4444' : 'rgba(239, 68, 68, 0.5)';
            ctx.lineWidth = isSelected ? 1.5 : 1;
            ctx.beginPath();
            ctx.roundRect(csx - cardW / 2, csy - cardH / 2, cardW, cardH, 6);
            ctx.fill();
            ctx.stroke();

            if (hasPlotNumber) {
              // Numer działki
              ctx.fillStyle = '#fca5a5';
              ctx.font = 'bold 12px Inter, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(plotName, csx, csy - 6);

              // Powierzchnia działki
              ctx.fillStyle = '#cbd5e1';
              ctx.font = '10px Inter, monospace';
              ctx.fillText(areaText, csx, csy + 8);
            } else {
              // Tylko powierzchnia
              ctx.fillStyle = '#fca5a5';
              ctx.font = 'bold 11px Inter, monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(areaText, csx, csy);
            }
          }
        } else if (isBalcony) {
          const balconyText = `Balkon ${bldg.defaultHeight}m`;

          ctx.font = 'bold 11px Inter, sans-serif';
          const textW = ctx.measureText(balconyText).width;
          const iconCount = (isLocked ? 1 : 0) + (isGhosted ? 1 : 0);
          const iconsW = iconCount * 14;
          const contentW = textW + (iconCount > 0 ? 6 + iconsW : 0);
          const cardW = contentW + 16;
          const cardH = 22;

          // Nie pokazuj etykiety jeśli nie mieści się w obiekcie
          if (cardW <= screenBldgW && cardH <= screenBldgH) {
            ctx.fillStyle = 'rgba(11, 19, 41, 0.9)';
            ctx.strokeStyle = isSelected ? '#c084fc' : 'rgba(192, 132, 252, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(csx - cardW / 2, csy - cardH / 2, cardW, cardH, 5);
            ctx.fill();
            ctx.stroke();

            const startX = csx - contentW / 2;
            ctx.fillStyle = '#d8b4fe';
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(balconyText, startX, csy);

            let curIconX = startX + textW + 8;
            if (isLocked) {
              drawLucideLockIcon(ctx, curIconX, csy, '#fbbf24');
              curIconX += 13;
            }
            if (isGhosted) {
              drawLucideGhostIcon(ctx, curIconX, csy, '#c084fc');
            }
          }
        } else {
          const heightText = `${bldg.defaultHeight}m`;

          // Powiększony opis wysokości budynku o 20% (13px -> 16px)
          ctx.font = 'bold 16px Inter, sans-serif';
          const textW = ctx.measureText(heightText).width;
          const iconCount = (isLocked ? 1 : 0) + (isGhosted ? 1 : 0);
          const iconsW = iconCount * 14;
          const contentW = textW + (iconCount > 0 ? 6 + iconsW : 0);

          // Kolorowe wskaźniki statusu [included: zielony, tested: indygo, cityCentre: pomarańczowy, childcare: fioletowy]
          const isIncluded = bldg.isIncluded !== false;
          const isChildcare = bldg.buildingType === 'childcare' || (Array.isArray(bldg.segments) && bldg.segments.some((s: any) => s.buildingType === 'childcare'));
          const isCityCentre = bldg.isCityCentre || (Array.isArray(bldg.segments) && bldg.segments.some((s: any) => s.isCityCentre));

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
          const cardW = Math.max(contentW + 16, totalDotsW + 18, 42);
          const cardH = 34;

          // Nie pokazuj etykiety jeśli nie mieści się w obiekcie
          if (cardW <= screenBldgW && cardH <= screenBldgH) {
            ctx.fillStyle = 'rgba(11, 19, 41, 0.9)';
            ctx.strokeStyle = isTested ? 'rgba(99, 102, 241, 0.6)' : 'rgba(100, 116, 139, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(csx - cardW / 2, csy - cardH / 2, cardW, cardH, 6);
            ctx.fill();
            ctx.stroke();

            // Renderuj powiększony tekst wysokości
            const startX = csx - contentW / 2;
            ctx.fillStyle = isTested ? '#93c5fd' : '#f8fafc';
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(heightText, startX, csy - 6);

            // Renderuj wektorowe ikony kłódki / ducha
            let curIconX = startX + textW + 8;
            if (isLocked) {
              drawLucideLockIcon(ctx, curIconX, csy - 6, '#fbbf24');
              curIconX += 13;
            }
            if (isGhosted) {
              drawLucideGhostIcon(ctx, curIconX, csy - 6, '#c084fc');
            }

            // Rząd kolorowych kropek statusu pod wysokością
            const startDotX = csx - totalDotsW / 2;
            const dotY = csy + 8;

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
