import { CadRenderContext } from '../types';
import { Point2D } from '../../../types/geometry';
import { getPolygonInteriorPoint, isPointInPolygon, splitSegmentByOccludingPolygons, distancePointToSegment } from '@/utils/math2d';

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
 * Sprawdza czy kliknięcie w punkcie ekranowym (screenX, screenY) trafiło w etykietę/kartę obiektu.
 */
export function getBuildingLabelHitAtPoint(
  screenX: number,
  screenY: number,
  buildings: any[],
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  scale: number,
  layerSettings: Record<string, any> = {}
): string | null {
  for (let i = buildings.length - 1; i >= 0; i--) {
    const bldg = buildings[i];
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;

    const lyr = bldg.layer || 'Bariery';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    const { sx: csx, sy: csy } = worldToScreen(geo.centerX, geo.centerY);
    if (!Number.isFinite(csx) || !Number.isFinite(csy)) continue;

    const screenBldgW = (geo.maxX - geo.minX) * scale;
    const screenBldgH = (geo.maxY - geo.minY) * scale;

    const isBoundary = bldg.category === 'boundary';
    const isPlayground = isBoundary && bldg.areaType === 'playground';
    const isBalcony = bldg.category === 'balcony';

    let cardW = 42;
    let cardH = 34;

    if (isBoundary) {
      const hasPlotNumber = !isPlayground && !!(bldg.plotNumber && bldg.plotNumber.trim());
      const showHeader = hasPlotNumber;
      cardW = showHeader ? 90 : 60;
      cardH = showHeader ? 34 : 22;
    } else if (isBalcony) {
      cardW = 75;
      cardH = 22;
    } else {
      cardW = 55;
      cardH = 34;
    }

    if (cardW > screenBldgW || cardH > screenBldgH) continue;

    const halfW = cardW / 2;
    const halfH = cardH / 2;
    if (
      screenX >= csx - halfW &&
      screenX <= csx + halfW &&
      screenY >= csy - halfH &&
      screenY <= csy + halfH
    ) {
      return bldg.id;
    }
  }
  return null;
}

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
  // If building has storyPolygons (e.g. from modifiers like bay_window), use storyPolygons[0] for base interior rendering
  const activeVertices =
    bldg.category !== 'boundary' &&
    Array.isArray(bldg.storyPolygons) &&
    bldg.storyPolygons.length > 0 &&
    bldg.storyPolygons[0].polygon?.length >= 3
      ? bldg.storyPolygons[0].polygon
      : bldg.vertices;

  if (!activeVertices || !Array.isArray(activeVertices) || activeVertices.length < 3) return null;

  const cacheKey = bldg;
  const cached = buildingGeoCache.get(cacheKey);
  if (cached) return cached;

  const path = new Path2D();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let validCount = 0;

  for (let i = 0; i < activeVertices.length; i++) {
    const v = activeVertices[i];
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

  const interior = getPolygonInteriorPoint(activeVertices);

  const res: BuildingCachedGeometry = {
    path,
    minX,
    minY,
    maxX,
    maxY,
    centerX: interior.x,
    centerY: interior.y,
  };
  buildingGeoCache.set(cacheKey, res);
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
  selectedBuildingIds: string[] = [],
  showAnalysisPoints: boolean = true
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
    const isPlayground = isBoundary && bldg.areaType === 'playground';
    const isBalcony = bldg.category === 'balcony';

    if (isPlayground) {
      ctx.fillStyle = isSelected
        ? 'rgba(245, 158, 11, 0.18)'
        : bldg.id === hoveredBuildingId
        ? 'rgba(245, 158, 11, 0.12)'
        : 'rgba(245, 158, 11, 0.05)';
    } else if (isBoundary) {
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

    // 1.1 Render 2.5D Story Polygons / Footprints (Warstwice kondygnacji uskokowych)
    if (Array.isArray(bldg.storyPolygons) && bldg.storyPolygons.length > 1) {
      for (const sf of bldg.storyPolygons) {
        if (!sf.polygon || sf.polygon.length < 3) continue;
        const poly = sf.polygon;
        const isDifferentFromBase =
          poly.length !== bldg.vertices.length ||
          Math.hypot(poly[0].x - bldg.vertices[0].x, poly[0].y - bldg.vertices[0].y) > 0.01;

        if (isDifferentFromBase) {
          const storyPath = new Path2D();
          storyPath.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) {
            storyPath.lineTo(poly[i].x, poly[i].y);
          }
          storyPath.closePath();

          ctx.lineWidth = 1.2 / s;
          ctx.strokeStyle = isSelected ? 'rgba(192, 132, 252, 0.85)' : 'rgba(168, 85, 247, 0.6)';
          ctx.setLineDash([4 / s, 2 / s]);
          ctx.stroke(storyPath);
          ctx.setLineDash([]);
        }
      }
    }

    // 1.2 Render Zone Polygons / Strefy (Linie obszaru wygenerowane przez modyfikator 'zone_offset')
    if (Array.isArray(bldg.zonePolygons) && bldg.zonePolygons.length > 0) {
      for (const zf of bldg.zonePolygons) {
        if (!zf.polygon || zf.polygon.length < 3) continue;
        const poly = zf.polygon;
        const zonePath = new Path2D();
        zonePath.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          zonePath.lineTo(poly[i].x, poly[i].y);
        }
        zonePath.closePath();

        const isPlaygroundZone = zf.areaType === 'playground';
        const zoneFill = isPlaygroundZone
          ? isSelected ? 'rgba(245, 158, 11, 0.14)' : 'rgba(245, 158, 11, 0.07)'
          : isSelected ? 'rgba(56, 189, 248, 0.14)' : 'rgba(56, 189, 248, 0.07)';
        const zoneStroke = isPlaygroundZone
          ? isSelected ? 'rgba(245, 158, 11, 0.95)' : 'rgba(245, 158, 11, 0.75)'
          : isSelected ? 'rgba(56, 189, 248, 0.95)' : 'rgba(56, 189, 248, 0.75)';

        ctx.fillStyle = zoneFill;
        ctx.fill(zonePath);

        ctx.lineWidth = (isSelected ? 1.8 : 1.3) / s;
        ctx.strokeStyle = zoneStroke;
        ctx.setLineDash([5 / s, 3 / s]);
        ctx.stroke(zonePath);
        ctx.setLineDash([]);
      }
    }

    // Linking mode highlight
    if (isLinkingMode && linkingSourceId && bldg.id !== linkingSourceId) {
      ctx.lineWidth = 3 / s;
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([6 / s, 4 / s]);
      ctx.stroke(geo.path);
    } else if (isSelected) {
      ctx.lineWidth = (isBoundary ? 2.0 : 2.5) / s;
      ctx.strokeStyle = isPlayground
        ? '#f59e0b'
        : isBoundary
        ? '#ef4444'
        : isBalcony
        ? '#c084fc'
        : isTested
        ? '#60a5fa'
        : '#94a3b8';
      if (isBoundary) {
        ctx.setLineDash([]);
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

    const isSweep = Array.isArray(bldg.sweepPath) && bldg.sweepPath.length >= 2;

    // Render osi generującej Wstęgi w trybie edycji krawędzi (isEditMode lub zaznaczony obiekt)
    if (isSweep && isSelected) {
      for (let sIdx = 0; sIdx < bldg.sweepPath!.length - 1; sIdx++) {
        const sp1 = bldg.sweepPath![sIdx];
        const sp2 = bldg.sweepPath![sIdx + 1];
        const { sx: sx1, sy: sy1 } = worldToScreen(sp1.x, sp1.y);
        const { sx: sx2, sy: sy2 } = worldToScreen(sp2.x, sp2.y);
        const isSpineHovered = hoveredEdge?.buildingId === bldg.id && hoveredEdge?.edgeIndex === sIdx;

        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.strokeStyle = isSpineHovered ? '#38bdf8' : '#f59e0b';
        ctx.lineWidth = isSpineHovered ? 4.5 : 2.5;
        ctx.setLineDash(isSpineHovered ? [] : [6, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (Array.isArray(bldg.segments)) {
      // Base edge endpoints if building has base vertices and hoveredEdge is active
      const hasBaseVerts = Array.isArray(bldg.vertices) && bldg.vertices.length >= 3;
      let baseHoverP1: Point2D | null = null;
      let baseHoverP2: Point2D | null = null;
      if (
        !isSweep &&
        (isEditMode || isSelected) &&
        hoveredEdge &&
        hoveredEdge.buildingId === bldg.id &&
        hasBaseVerts &&
        hoveredEdge.edgeIndex >= 0 &&
        hoveredEdge.edgeIndex < bldg.vertices.length
      ) {
        baseHoverP1 = bldg.vertices[hoveredEdge.edgeIndex];
        baseHoverP2 = bldg.vertices[(hoveredEdge.edgeIndex + 1) % bldg.vertices.length];
      }

      for (let eIdx = 0; eIdx < bldg.segments.length; eIdx++) {
        const seg = bldg.segments[eIdx];
        if (!seg || !seg.p1 || !seg.p2 || !Number.isFinite(seg.p1.x) || !Number.isFinite(seg.p1.y) || !Number.isFinite(seg.p2.x) || !Number.isFinite(seg.p2.y)) continue;
        
        let isEdgeHovered = false;
        if (baseHoverP1 && baseHoverP2) {
          if (bldg.segments.length === bldg.vertices.length) {
            isEdgeHovered = hoveredEdge?.edgeIndex === eIdx;
          } else {
            // Check if segment is collinear and lies on or belongs to the base edge
            const d1 = distancePointToSegment(seg.p1, baseHoverP1, baseHoverP2);
            const d2 = distancePointToSegment(seg.p2, baseHoverP1, baseHoverP2);
            isEdgeHovered = d1 < 0.05 && d2 < 0.05;
          }
        }

        const { sx: x1, sy: y1 } = worldToScreen(seg.p1.x, seg.p1.y);
        const { sx: x2, sy: y2 } = worldToScreen(seg.p2.x, seg.p2.y);
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        const isBoundary = bldg.category === 'boundary';
        const isPlayground = isBoundary && bldg.areaType === 'playground';
        const isBalcony = bldg.category === 'balcony';
        const bldgMaxH = bldg.defaultHeight || 0;
        const segHTop = seg.hTop ?? bldgMaxH;

        // Zbierz wielokąty wszystkich wyższych kondygnacji (tego samego lub innych budynków)
        const higherPolys: any[] = [];
        if (!isBoundary && !isPlayground) {
          // A. Wyższe kondygnacje tego samego budynku (np. nadwieszenia, wykusze powyżej)
          if (Array.isArray(bldg.storyPolygons)) {
            for (const sf of bldg.storyPolygons) {
              if (sf.hTop > segHTop + 0.05 && Array.isArray(sf.polygon) && sf.polygon.length >= 3) {
                higherPolys.push(sf.polygon);
              }
            }
          }

          // B. Inne wyższe budynki w scenie
          for (const otherBldg of buildings) {
            if (otherBldg.id === bldg.id || otherBldg.category === 'boundary') continue;
            const otherH = otherBldg.defaultHeight || 0;
            if (otherH > segHTop + 0.05) {
              if (Array.isArray(otherBldg.vertices) && otherBldg.vertices.length >= 3) {
                higherPolys.push(otherBldg.vertices);
              }
            }
          }
        }

        // Analityczny podział odcinka na części widoczne i zakryte
        const parts = (!isBoundary && !isPlayground && higherPolys.length > 0)
          ? splitSegmentByOccludingPolygons(seg.p1, seg.p2, higherPolys, isPointInPolygon)
          : [{ p1: seg.p1, p2: seg.p2, isOccluded: false }];

        // Ustal kolor i grubość dla całej krawędzi
        let strokeColor = '#64748b';
        let strokeWidth = isSelected ? 2.5 : 1.5;

        if (isEdgeHovered) {
          strokeColor = '#38bdf8';
          strokeWidth = 4;
        } else if (isPlayground) {
          strokeColor = isSelected ? '#f59e0b' : 'rgba(245, 158, 11, 0.85)';
          strokeWidth = isSelected ? 2.5 : 1.8;
        } else if (isBoundary) {
          strokeColor = isSelected ? '#ef4444' : 'rgba(239, 68, 68, 0.85)';
          strokeWidth = isSelected ? 2.5 : 1.8;
        } else if (isBalcony) {
          strokeColor = isSelected ? '#c084fc' : 'rgba(192, 132, 252, 0.75)';
          strokeWidth = isSelected ? 2.0 : 1.4;
        } else if (isGhosted) {
          if (isTested) {
            strokeColor = 'rgba(96, 165, 250, 0.55)';
            strokeWidth = 1.2;
          } else if (isIncluded) {
            strokeColor = 'rgba(148, 163, 184, 0.55)';
            strokeWidth = 1.2;
          } else {
            strokeColor = 'rgba(148, 163, 184, 0.50)';
            strokeWidth = 1.0;
          }
        } else if (!isIncluded) {
          strokeColor = 'rgba(71, 85, 105, 0.4)';
          strokeWidth = 1;
        } else if (isTested) {
          strokeColor = isSelected ? '#3b82f6' : '#60a5fa';
          strokeWidth = isSelected ? 3 : 2;
        } else {
          strokeColor = isSelected ? '#cbd5e1' : '#64748b';
          strokeWidth = isSelected ? 2.5 : 1.5;
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;

        // Renderowanie poszczególnych pododcinków
        for (const part of parts) {
          const { sx: px1, sy: py1 } = worldToScreen(part.p1.x, part.p1.y);
          const { sx: px2, sy: py2 } = worldToScreen(part.p2.x, part.p2.y);
          if (!Number.isFinite(px1) || !Number.isFinite(py1) || !Number.isFinite(px2) || !Number.isFinite(py2)) continue;

          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);

          if (isPlayground || isBoundary) {
            ctx.setLineDash([]);
          } else if (isBalcony || part.isOccluded) {
            ctx.setLineDash([4, 3]);
          } else {
            ctx.setLineDash([]);
          }

          ctx.stroke();
          ctx.setLineDash([]);
        }

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

          let ep1 = seg.p1;
          let ep2 = seg.p2;
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
              ep1 = p1;
              ep2 = p2;
            }
          }

          const midX = (ep1.x + ep2.x) / 2;
          const midY = (ep1.y + ep2.y) / 2;
          const len = Math.hypot(ep2.x - ep1.x, ep2.y - ep1.y);

          // Wektor normalny krawędzi (na zewnątrz wielokąta)
          const normX = seg.normal?.x ?? 0;
          const normY = seg.normal?.y ?? 0;

          // Punkty na ekranie
          const s1 = worldToScreen(ep1.x, ep1.y);
          const s2 = worldToScreen(ep2.x, ep2.y);
          const sm = worldToScreen(midX, midY);
          const sn = worldToScreen(midX + normX, midY + normY);

          // Normalna w przestrzeni ekranu
          let screenNormX = sn.sx - sm.sx;
          let screenNormY = sn.sy - sm.sy;
          const screenNormLen = Math.hypot(screenNormX, screenNormY);
          if (screenNormLen > 1e-4) {
            screenNormX /= screenNormLen;
            screenNormY /= screenNormLen;
          } else {
            screenNormX = 0;
            screenNormY = -1;
          }

          const edgeScreenLen = Math.hypot(s2.sx - s1.sx, s2.sy - s1.sy);

          // Odsunięcie na zewnątrz krawędzi (skalowane z długością krawędzi na ekranie, aby etykieta nie odlatywała przy zoom-out)
          const offsetPx = Math.max(8, Math.min(18, edgeScreenLen * 0.15 + 6));
          const badgeSx = sm.sx + screenNormX * offsetPx;
          const badgeSy = sm.sy + screenNormY * offsetPx;

          if (Number.isFinite(badgeSx) && Number.isFinite(badgeSy)) {
            const labelText = isEditingThisEdge
              ? `[ ${editingEdgeLength.inputStr ? editingEdgeLength.inputStr : '_'}m ]`
              : `${len.toFixed(2)}m`;

            // Obliczenie kąta krawędzi na ekranie
            let edgeAngle = Math.atan2(s2.sy - s1.sy, s2.sx - s1.sx);

            // Normalizacja kąta do [-π/2, π/2], aby tekst był zawsze czytelny (nie do góry nogami)
            if (edgeAngle > Math.PI / 2) {
              edgeAngle -= Math.PI;
            } else if (edgeAngle < -Math.PI / 2) {
              edgeAngle += Math.PI;
            }

            ctx.font = 'bold 10px Inter, monospace';
            const tw = ctx.measureText(labelText).width;
            const pw = tw + 10;
            const ph = 18;

            ctx.save();
            ctx.translate(badgeSx, badgeSy);
            ctx.rotate(edgeAngle);

            ctx.fillStyle = isEditingThisEdge
              ? '#f59e0b'
              : isHoveredBadge
              ? 'rgba(56, 189, 248, 0.95)'
              : 'rgba(15, 23, 42, 0.88)';
            ctx.strokeStyle = isEditingThisEdge ? '#fbbf24' : isHoveredBadge ? '#38bdf8' : 'rgba(56, 189, 248, 0.4)';
            ctx.lineWidth = isEditingThisEdge || isHoveredBadge ? 1.5 : 1;
            ctx.beginPath();
            ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isEditingThisEdge ? '#0f172a' : '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, 0, 0);

            ctx.restore();
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
        const isPlayground = isBoundary && bldg.areaType === 'playground';
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

          const hasPlotNumber = !isPlayground && !!(bldg.plotNumber && bldg.plotNumber.trim());
          const headerName = hasPlotNumber
            ? (bldg.plotNumber!.startsWith('Dz.') ? bldg.plotNumber! : `Dz. ${bldg.plotNumber}`)
            : '';

          const showHeader = hasPlotNumber;

          ctx.font = showHeader ? 'bold 12px Inter, sans-serif' : 'bold 11px Inter, monospace';
          const nameW = showHeader ? ctx.measureText(headerName).width : 0;
          ctx.font = '10px Inter, monospace';
          const areaW = ctx.measureText(areaText).width;

          const cardW = showHeader ? Math.max(nameW, areaW) + 20 : areaW + 16;
          const cardH = showHeader ? 34 : 22;

          // Nie pokazuj etykiety jeśli nie mieści się w obiekcie
          if (cardW <= screenBldgW && cardH <= screenBldgH) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = isPlayground
              ? (isSelected ? '#f59e0b' : 'rgba(245, 158, 11, 0.6)')
              : (isSelected ? '#ef4444' : 'rgba(239, 68, 68, 0.5)');
            ctx.lineWidth = isSelected ? 1.5 : 1;
            ctx.beginPath();
            ctx.roundRect(csx - cardW / 2, csy - cardH / 2, cardW, cardH, 6);
            ctx.fill();
            ctx.stroke();

            if (showHeader) {
              // Nazwa / Numer
              ctx.fillStyle = '#fca5a5';
              ctx.font = 'bold 12px Inter, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(headerName, csx, csy - 6);

              // Powierzchnia
              ctx.fillStyle = '#cbd5e1';
              ctx.font = '10px Inter, monospace';
              ctx.fillText(areaText, csx, csy + 8);
            } else {
              // Tylko powierzchnia
              ctx.fillStyle = isPlayground ? '#fbbf24' : '#fca5a5';
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
  if (showAnalysisPoints && pinnedPointResults && pinnedPointResults.length > 0) {
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
  } else if (showAnalysisPoints && selectedPointResult) {
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
