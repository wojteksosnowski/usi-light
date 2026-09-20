import { CadRenderContext } from '../types';
import { Point2D } from '../../../types/geometry';
import {
  getPolygonInteriorPoint,
  computePolygonDominantAngle,
  isPointInPolygon,
  splitSegmentByOccludingPolygons,
  distancePointToSegment,
  calculateOutwardNormal,
  isPolygonCCW,
  applyMatrixToContext,
  createViewportMatrix,
  computeGroupEnvelope,
  resolveScreenLabelPositions,
  ScreenLabelItem,
} from '@/utils/math2d';
import { detectBoundaryMergeGroups } from '@/utils/math2d/boundaryMerging';
import { isBuildingVariantActive, isBuildingDimmedInGroupMode } from '@/utils/geometrySelectors';

export interface EditingEdgeLengthState {
  buildingId: string;
  edgeIndex: number;
  currentLength: number;
  targetLength: number;
  inputStr: string;
  isFresh?: boolean;
  previewVertices?: any[];
}

// Global Path2D, AABB and Label Cache keyed by building reference and vertex version
export interface BuildingCachedGeometry {
  path: Path2D;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  /** Stały punkt wstawienia etykiety w układzie świata (metry) */
  labelAnchor: Point2D;
  /** Dominujący kąt krawędzi obiektu w radianach [-π/2, π/2] */
  dominantAngleRad: number;
  /** Minimalny próg skali zoom (viewState.scale), poniżej którego etykieta nie mieści się w geometrii */
  minScaleForLabel: number;
  /** Rozmiar karty etykiety (cardW, cardH) w pikselach */
  cardSize: { cardW: number; cardH: number };
  /** Pole powierzchni (shoelace) po bldg.vertices - liczone raz, używane m.in. przez etykiety działek. */
  area: number;
  /** Path2D per kondygnacja różniąca się od podstawy (tylko gdy storyPolygons.length > 1), w tej samej kolejności co bldg.storyPolygons. */
  storyPaths?: (Path2D | null)[];
  /** Path2D dla otworów (dziedzińców) każdej kondygnacji, równoległe do storyPaths. */
  storyHolePaths?: Path2D[][];
  /** Path2D per strefa (zonePolygons). */
  zonePaths?: Path2D[];
}

export const buildingGeoCache = new WeakMap<object, BuildingCachedGeometry>();


// Styl obiektów badanych (isTested=true) musi być wyraźnie bardziej eksponowany niż obiektów-przeszkód.
const TESTED_STROKE = { normal: '#0ea5e9', selected: '#0284c7' };
const TESTED_STROKE_WIDTH = { normal: 2.5, selected: 3.5 };
const TESTED_FILL = { normal: 'rgba(14, 165, 233, 0.16)', selected: 'rgba(14, 165, 233, 0.26)' };
const NON_TESTED_STROKE = { normal: '#cbd5e1', selected: '#94a3b8' };
const NON_TESTED_STROKE_WIDTH = { normal: 1, selected: 2 };
const NON_TESTED_FILL = { normal: 'rgba(203, 213, 225, 0.08)', selected: 'rgba(203, 213, 225, 0.12)' };

// Kolory obiektów 'boundary' (działka=czerwony, plac zabaw=bursztynowy, utwardzenie=stalowo-szary), z osobną wersją dla
// isTested=true ("obiekt badany", wyraźnie eksponowana) i isTested!=true (stonowana).
const BOUNDARY_RGB = { plot: '239, 68, 68', playground: '245, 158, 11', paved: '148, 163, 184' };
// Akcent "Inwestycja towarzysząca" (isAccompanyingInvestment) - rozłączny z isTested, niebieski (#3b82f6).
const ACCOMPANYING_RGB = '59, 130, 246';
function getBoundaryStyle(
  areaType: 'plot' | 'playground' | 'paved' = 'plot',
  isTested: boolean = false,
  isAccompanyingInvestment: boolean = false
) {
  const rgb = isAccompanyingInvestment ? ACCOMPANYING_RGB : BOUNDARY_RGB[areaType] || BOUNDARY_RGB.plot;
  const emphasized = isTested || isAccompanyingInvestment;
  const strokeOpacity = emphasized ? 0.9 : 0.65;
  const selectedStroke = isAccompanyingInvestment
    ? '#3b82f6'
    : areaType === 'playground'
    ? '#f59e0b'
    : areaType === 'paved'
    ? '#94a3b8'
    : '#ef4444';

  return {
    strokeSelected: emphasized ? selectedStroke : `rgba(${rgb}, 0.85)`,
    strokeDefault: `rgba(${rgb}, ${strokeOpacity})`,
    strokeWidthSelected: emphasized ? 2.5 : 1.8,
    strokeWidthDefault: emphasized ? 1.8 : 1.4,
    fillSelected: emphasized ? `rgba(${rgb}, 0.22)` : `rgba(${rgb}, 0.12)`,
    fillHover: emphasized ? `rgba(${rgb}, 0.16)` : `rgba(${rgb}, 0.08)`,
    fillDefault: emphasized ? `rgba(${rgb}, 0.10)` : `rgba(${rgb}, 0.05)`,
  };
}

// Path2D nie ma stanu zależnego od wywołania - jedna definicja modułowa zamiast tworzenia
// nowej funkcji-fabryki przy każdym cache miss w getOrComputeBuildingGeo.
function createSafePath2D(): Path2D {
  if (typeof Path2D !== 'undefined') {
    return new Path2D();
  }
  return {
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    arc: () => {},
    roundRect: () => {},
    rect: () => {},
  } as unknown as Path2D;
}

// Cache szerokości tekstu (ctx.measureText) kluczowany po (font, tekst) - deterministyczne,
// nie wymaga inwalidacji: ten sam font+tekst zawsze da tę samą szerokość.
const textWidthCache = new Map<string, number>();
function measureTextWidthCached(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}::${text}`;
  const cached = textWidthCache.get(key);
  if (cached !== undefined) return cached;
  const width = ctx.measureText(text).width;
  textWidthCache.set(key, width);
  return width;
}

/**
 * Rozmiar karty etykiety (cardW/cardH) danego budynku - reguła współdzielona przez rysowanie
 * etykiety, hit-test kliknięcia (getBuildingLabelHitAtPoint) i zakotwiczenie minipanelu
 * (getBuildingLabelScreenAnchor), żeby nie utrzymywać trzech kopii tej samej tabeli rozmiarów.
 */
export function getBuildingLabelCardSize(bldg: any): { cardW: number; cardH: number } {
  const isBoundary = bldg.category === 'boundary';
  const isPlayground = isBoundary && bldg.areaType === 'playground';
  const isBalcony = bldg.category === 'balcony';

  if (isBoundary) {
    const hasPlotNumber = !isPlayground && !!(bldg.plotNumber && bldg.plotNumber.trim());
    return hasPlotNumber ? { cardW: 90, cardH: 34 } : { cardW: 60, cardH: 22 };
  }
  if (isBalcony) {
    return { cardW: 75, cardH: 22 };
  }
  return { cardW: 55, cardH: 34 };
}

/**
 * Zbiera i rozmieszcza etykiety '+' / '-' trybu isLinkingMode dla budynku wybranego (selectedBuildingId)
 * względem pozostałych budynków w scenie. Współdzielone przez hit-testing i renderowanie.
 */
function collectLinkingModeLabels(
  buildings: any[],
  selectedBuildingId: string,
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  layerSettings: Record<string, any>,
  currentGroupId: string | null | undefined
): ReturnType<typeof resolveScreenLabelPositions> {
  const labelItems: ScreenLabelItem[] = [];
  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;
    if (!isBuildingVariantActive(bldg)) continue;
    const lyr = bldg.layer || 'Bariery';
    if (layerSettings[lyr]?.isVisible === false) continue;
    if (bldg.isVisible === false) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    const { sx, sy } = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

    const isMember = currentGroupId ? bldg.groupId === currentGroupId : bldg.id === selectedBuildingId;
    labelItems.push({
      id: bldg.id,
      originalAnchor: geo.labelAnchor,
      screenPos: { sx, sy },
      width: 28,
      height: 28,
      type: isMember ? 'minus' : 'plus',
    });
  }

  return resolveScreenLabelPositions(labelItems, 4);
}

/**
 * Sprawdza czy kliknięcie w punkcie ekranowym (screenX, screenY) w trybie isLinkingMode
 * trafiło w interaktywną etykietę '+' (dodaj do grupy) lub '-' (odłącz z grupy).
 */
export function getLinkingActionHitAtPoint(
  screenX: number,
  screenY: number,
  buildings: any[],
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  selectedBuildingId: string | null,
  layerSettings: Record<string, any> = {}
): { buildingId: string; action: 'add' | 'remove' } | null {
  if (!selectedBuildingId) return null;
  const selectedBldg = buildings.find((b) => b.id === selectedBuildingId);
  if (!selectedBldg) return null;

  const placedLabels = collectLinkingModeLabels(
    buildings,
    selectedBuildingId,
    worldToScreen,
    layerSettings,
    selectedBldg.groupId
  );

  for (let i = placedLabels.length - 1; i >= 0; i--) {
    const item = placedLabels[i];
    const halfW = item.width / 2 + 3;
    const halfH = item.height / 2 + 3;

    if (
      screenX >= item.placedScreenPos.sx - halfW &&
      screenX <= item.placedScreenPos.sx + halfW &&
      screenY >= item.placedScreenPos.sy - halfH &&
      screenY <= item.placedScreenPos.sy + halfH
    ) {
      return {
        buildingId: item.id,
        action: item.type === 'minus' ? 'remove' : 'add',
      };
    }
  }

  return null;
}

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
    if (!isBuildingVariantActive(bldg)) continue;

    const lyr = bldg.layer || 'Bariery';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;
    if (bldg.isVisible === false) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    // Szybkie odrzucenie O(1) po wyliczonym progu zoom
    if (scale < geo.minScaleForLabel) continue;

    const { sx: csx, sy: csy } = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
    if (!Number.isFinite(csx) || !Number.isFinite(csy)) continue;

    const { cardW, cardH } = geo.cardSize;
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
 * Zwraca ekranową pozycję dolnej krawędzi karty etykiety dla pojedynczego budynku
 * (ten sam rozmiar karty co getBuildingLabelHitAtPoint), do zakotwiczenia minipanelu etykiety.
 */
export function getBuildingLabelScreenAnchor(
  bldg: any,
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number }
): { sx: number; bottomSy: number } | null {
  if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) return null;

  const geo = getOrComputeBuildingGeo(bldg);
  if (!geo) return null;

  const { sx, sy } = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;

  const { cardH } = geo.cardSize;

  return { sx, bottomSy: sy + cardH / 2 };
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
  // Jeśli budynek ma storyPolygons (np. z modyfikatorów bay_window/terrace/donut/gate), użyj
  // WSZYSTKICH wpisów o bazowym storyIndex (== storyPolygons[0].storyIndex) — modyfikator "brama"
  // może rozciąć kondygnację bazową na kilka rozłącznych skrzydeł, każde jako osobny wpis w tablicy
  // ze wspólnym storyIndex; branie tylko pierwszego wpisu wypełniało tylko jedno skrzydło.
  const hasStoryPolygons =
    bldg.category !== 'boundary' &&
    Array.isArray(bldg.storyPolygons) &&
    bldg.storyPolygons.length > 0 &&
    bldg.storyPolygons[0].polygon?.length >= 3;

  const baseStoryIndex = hasStoryPolygons ? bldg.storyPolygons[0].storyIndex : undefined;
  const baseFootprints = hasStoryPolygons
    ? bldg.storyPolygons.filter((sf: any) => sf.storyIndex === baseStoryIndex && sf.polygon?.length >= 3)
    : null;

  const activeWings: { vertices: any[]; holes: any[][] }[] = baseFootprints
    ? baseFootprints.map((sf: any) => ({ vertices: sf.polygon, holes: sf.holes || [] }))
    : [{ vertices: bldg.vertices, holes: bldg.holes || [] }];

  const activeVertices = activeWings[0]?.vertices;
  if (!activeVertices || !Array.isArray(activeVertices) || activeVertices.length < 3) return null;

  const cacheKey = bldg;
  const cached = buildingGeoCache.get(cacheKey);
  if (cached) return cached;

  const path = createSafePath2D();
  let minX = Infinity;
  let minY = Infinity;


  let maxX = -Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let validCount = 0;
  let largestWingVertices = activeVertices;
  let largestWingSpan = -1;

  for (const wing of activeWings) {
    const verts = wing.vertices;
    if (!Array.isArray(verts) || verts.length < 3) continue;

    let wingMoved = false;
    let wingMinX = Infinity;
    let wingMaxX = -Infinity;
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
      if (!wingMoved) {
        path.moveTo(v.x, v.y);
        wingMoved = true;
      } else {
        path.lineTo(v.x, v.y);
      }
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.x < wingMinX) wingMinX = v.x;
      if (v.x > wingMaxX) wingMaxX = v.x;
      sumX += v.x;
      sumY += v.y;
      validCount++;
    }
    if (wingMoved) path.closePath();

    const wingSpan = wingMaxX - wingMinX;
    if (wingSpan > largestWingSpan) {
      largestWingSpan = wingSpan;
      largestWingVertices = verts;
    }

    // Dodaj podścieżki dla otworów tego skrzydła (Donut holes / dziedzińce)
    for (const hole of wing.holes) {
      if (Array.isArray(hole) && hole.length >= 3) {
        path.moveTo(hole[0].x, hole[0].y);
        for (let h = 1; h < hole.length; h++) {
          path.lineTo(hole[h].x, hole[h].y);
        }
        path.closePath();
      }
    }
  }

  if (validCount < 3) return null;

  const interior = getPolygonInteriorPoint(largestWingVertices);
  const dominantAngleRad = computePolygonDominantAngle(largestWingVertices);

  // Rozmiar karty etykiety w pikselach
  const cardSize = getBuildingLabelCardSize(bldg);

  // Wymiary obwiedni w metrach (przestrzeń świata)
  const spanX = Math.max(0.1, maxX - minX);
  const spanY = Math.max(0.1, maxY - minY);
  const maxSpan = Math.max(spanX, spanY);
  const minSpan = Math.min(spanX, spanY);

  // Minimalna skala (viewState.scale w px/m), przy której etykieta mieści się w geometrii
  // Etykieta mieści się, gdy:
  // a) Standardowy bounding box: cardW <= spanX * scale && cardH <= spanY * scale
  // b) Kształt wydłużony (wąskie skrzydło): cardW <= maxSpan * scale && cardH * 0.75 <= minSpan * scale
  const minScaleStandard = Math.max(cardSize.cardW / spanX, cardSize.cardH / spanY);
  const minScaleElongated = Math.max(cardSize.cardW / maxSpan, (cardSize.cardH * 0.75) / minSpan);
  const minScaleForLabel = Math.min(minScaleStandard, minScaleElongated);

  // Pole powierzchni (shoelace) po bldg.vertices (nie activeFootprint) - używane przez etykiety działek.
  let area = 0;
  const baseVerts = bldg.vertices;
  if (Array.isArray(baseVerts) && baseVerts.length >= 3) {
    for (let i = 0; i < baseVerts.length; i++) {
      const pA = baseVerts[i];
      const pB = baseVerts[(i + 1) % baseVerts.length];
      area += pA.x * pB.y - pB.x * pA.y;
    }
    area = Math.abs(area) / 2;
  }

  // Path2D dla kondygnacji różniących się od podstawy i ich otworów (raz, nie co klatkę).
  let storyPaths: (Path2D | null)[] | undefined;
  let storyHolePaths: Path2D[][] | undefined;
  if (Array.isArray(bldg.storyPolygons) && bldg.storyPolygons.length > 1) {
    storyPaths = [];
    storyHolePaths = [];
    for (const sf of bldg.storyPolygons) {
      if (!sf.polygon || sf.polygon.length < 3) {
        storyPaths.push(null);
        storyHolePaths.push([]);
        continue;
      }
      const poly = sf.polygon;
      const isDifferentFromBase =
        poly.length !== bldg.vertices.length ||
        Math.hypot(poly[0].x - bldg.vertices[0].x, poly[0].y - bldg.vertices[0].y) > 0.01;

      if (isDifferentFromBase) {
        const storyPath = createSafePath2D();
        storyPath.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          storyPath.lineTo(poly[i].x, poly[i].y);
        }
        storyPath.closePath();
        storyPaths.push(storyPath);
      } else {
        storyPaths.push(null);
      }

      const holePaths: Path2D[] = [];
      if (sf.holes && sf.holes.length > 0) {
        for (const hole of sf.holes) {
          if (hole.length < 3) continue;
          const holePath = createSafePath2D();
          holePath.moveTo(hole[0].x, hole[0].y);
          for (let h = 1; h < hole.length; h++) {
            holePath.lineTo(hole[h].x, hole[h].y);
          }
          holePath.closePath();
          holePaths.push(holePath);
        }
      }
      storyHolePaths.push(holePaths);
    }
  }

  // Path2D dla stref (zonePolygons), raz, nie co klatkę.
  let zonePaths: Path2D[] | undefined;
  if (Array.isArray(bldg.zonePolygons) && bldg.zonePolygons.length > 0) {
    zonePaths = [];
    for (const zf of bldg.zonePolygons) {
      if (!zf.polygon || zf.polygon.length < 3) {
        zonePaths.push(createSafePath2D());
        continue;
      }
      const poly = zf.polygon;
      const zonePath = createSafePath2D();
      zonePath.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) {
        zonePath.lineTo(poly[i].x, poly[i].y);
      }
      zonePath.closePath();

      if (zf.holes && zf.holes.length > 0) {
        for (const hole of zf.holes) {
          if (hole.length < 3) continue;
          zonePath.moveTo(hole[0].x, hole[0].y);
          for (let i = 1; i < hole.length; i++) {
            zonePath.lineTo(hole[i].x, hole[i].y);
          }
          zonePath.closePath();
        }
      }

      zonePaths.push(zonePath);
    }
  }


  const res: BuildingCachedGeometry = {
    path,
    minX,
    minY,
    maxX,
    maxY,
    centerX: interior.x,
    centerY: interior.y,
    labelAnchor: interior,
    dominantAngleRad,
    minScaleForLabel,
    cardSize,
    area,
    storyPaths,
    storyHolePaths,
    zonePaths,
  };
  buildingGeoCache.set(cacheKey, res);
  return res;
}

export { getOrComputeBuildingGeo };


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
  showAnalysisPoints: boolean = true,
  hoveredLabelBuildingId: string | null = null,
  openGroupId: string | null = null
) {

  const { ctx, worldToScreen, screenToWorld, width, height, viewState, viewRotationDeg } = rc;
  const s = viewState.scale;
  const viewRotRad = ((viewRotationDeg || 0) * Math.PI) / 180;

  // Viewport bounds in world space for culling
  const c1 = screenToWorld(0, 0);
  const c2 = screenToWorld(width, 0);
  const c3 = screenToWorld(width, height);
  const c4 = screenToWorld(0, height);
  const vpMinX = Math.min(c1.wx, c2.wx, c3.wx, c4.wx);
  const vpMaxX = Math.max(c1.wx, c2.wx, c3.wx, c4.wx);
  const vpMinY = Math.min(c1.wy, c2.wy, c3.wy, c4.wy);
  const vpMaxY = Math.max(c1.wy, c2.wy, c3.wy, c4.wy);

  // Grupy stykających się obiektów category='boundary' (dzielony areaType) do połączonego renderowania obwiedni.
  const boundaryMergeGroups = detectBoundaryMergeGroups(buildings);
  const isBuildingSelected = (id: string) => id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(id));
  const mergeableGroups = boundaryMergeGroups.filter((g) => {
    const selectedFlags = g.buildingIds.map(isBuildingSelected);
    return selectedFlags.every((v) => v) || selectedFlags.every((v) => !v);
  });
  const mergeableBoundaryIds = new Set<string>();
  for (const g of mergeableGroups) for (const id of g.buildingIds) mergeableBoundaryIds.add(id);

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

  // PERF (2026-09): to jest "Pass 1" - wypełnienia/kondygnacje/zaznaczenie. Istnieje osobne
  // "Pass 2" (druga pętla po `buildings` niżej: krawędzie/przesłonięcia/etykiety/ikony) z własnym
  // AABB cullingiem i redundantnym przeliczaniem tych samych flag (isBoundary/isSelected/lyr...).
  // Zmierzony test na 616 obiektach (Rynek Starego Miasta) pokazał że po optymalizacjach 1-4
  // (filtr AABB dla przesłonięć, cache Path2D kondygnacji/stref, cache pola działki, cache
  // measureText) render.layer.buildings spadł z p95 136ms do p95 64ms. Scalenie obu przejść
  // w jedną pętlę (jeden save/cull/setup per budynek) to kolejny potencjalny krok dalszej
  // redukcji narzutu - odłożone jako średnie-ryzyko (Pass 1 używa ctx.setTransform, Pass 2
  // pracuje w przestrzeni ekranu przez worldToScreen), wymaga dokładnego QA wizualnego przed/po.
  // Sprawdzenie, czy aktywny jest obiekt logiczny lub otwarta grupa
  const selectedBldgForGroup = selectedBuildingId ? buildings.find((b) => b.id === selectedBuildingId) : null;
  const activeLogicalGroupId = openGroupId || (selectedBldgForGroup?.groupId ? selectedBldgForGroup.groupId : null);

  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;

    // Filtrowanie wariantu A/B dla obiektów logicznych (gdy obiekt ma przypisany wariant różny od aktywnego)
    if (!isBuildingVariantActive(bldg)) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    // Viewport Culling check
    if (geo.maxX < vpMinX || geo.minX > vpMaxX || geo.maxY < vpMinY || geo.minY > vpMaxY) {
      continue;
    }

    const lyr = bldg.layer || 'Bariery';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;
    if (bldg.isVisible === false) continue;

    const isGhosted = lyrSetting.isGhosted === true;
    const isLocked = bldg.isLocked === true || lyrSetting.isLocked === true;
    const isSelected = bldg.id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(bldg.id));
    const isTested = bldg.isTested;
    const isIncluded = bldg.isIncluded !== false;

    // Przygaszanie obiektów, które nie wchodzą w skład otwartej grupy (wyłącznie w trybie edycji grupy)
    const isDimmed = isBuildingDimmedInGroupMode(bldg, openGroupId, isSelected);

    ctx.save();

    if (isDimmed) {
      ctx.globalAlpha = 0.28;
    }

    const vm = rc.viewportMatrix || createViewportMatrix(viewState.panX, viewState.panY, viewState.scale, viewRotationDeg);
    applyMatrixToContext(vm, ctx);

    const isBoundary = bldg.category === 'boundary';
    const areaType: 'plot' | 'playground' | 'paved' = bldg.areaType || 'plot';
    const isBalcony = bldg.category === 'balcony';

    if (isBoundary) {
      const bs = getBoundaryStyle(areaType, bldg.isTested === true, bldg.isAccompanyingInvestment === true);
      ctx.fillStyle = isSelected
        ? bs.fillSelected
        : bldg.id === hoveredBuildingId
        ? bs.fillHover
        : bs.fillDefault;
    } else if (isBalcony) {
      ctx.fillStyle = isSelected
        ? 'rgba(168, 85, 247, 0.25)'
        : bldg.id === hoveredBuildingId
        ? 'rgba(168, 85, 247, 0.18)'
        : 'rgba(168, 85, 247, 0.10)';
    } else if (bldg.id === hoveredBuildingId && !isSelected) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    } else if (isSelected) {
      ctx.fillStyle = isTested ? TESTED_FILL.selected : NON_TESTED_FILL.selected;
    } else if (isGhosted) {
      if (isTested) {
        ctx.fillStyle = 'rgba(14, 165, 233, 0.10)';
      } else if (isIncluded) {
        ctx.fillStyle = 'rgba(203, 213, 225, 0.06)';
      } else {
        ctx.fillStyle = 'rgba(203, 213, 225, 0.04)';
      }
    } else if (isTested) {
      ctx.fillStyle = isIncluded ? TESTED_FILL.normal : 'rgba(14, 165, 233, 0.08)';
    } else {
      ctx.fillStyle = isIncluded ? NON_TESTED_FILL.normal : 'rgba(203, 213, 225, 0.04)';
    }
    ctx.fill(geo.path, 'evenodd');

    // 1.1 Render 2.5D Story Polygons / Footprints (Warstwice kondygnacji uskokowych oraz otwory)
    // Path2D pobierane z cache (geo.storyPaths/storyHolePaths) zamiast budowane co klatkę.
    if (geo.storyPaths && Array.isArray(bldg.storyPolygons)) {
      for (let sfIdx = 0; sfIdx < bldg.storyPolygons.length; sfIdx++) {
        const storyPath = geo.storyPaths[sfIdx];
        if (storyPath) {
          ctx.lineWidth = 1.2 / s;
          ctx.strokeStyle = isSelected ? 'rgba(192, 132, 252, 0.85)' : 'rgba(168, 85, 247, 0.6)';
          ctx.setLineDash([4 / s, 2 / s]);
          ctx.stroke(storyPath);
          ctx.setLineDash([]);
        }

        const holePaths = geo.storyHolePaths?.[sfIdx];
        if (holePaths && holePaths.length > 0) {
          for (const holePath of holePaths) {
            ctx.lineWidth = 1.2 / s;
            ctx.strokeStyle = isSelected ? 'rgba(52, 211, 153, 0.85)' : 'rgba(16, 185, 129, 0.6)';
            ctx.setLineDash([4 / s, 2 / s]);
            ctx.stroke(holePath);
            ctx.setLineDash([]);
          }
        }
      }
    }

    // 1.2 Render Zone Polygons / Strefy (Linie obszaru wygenerowane przez modyfikator 'zone_offset')
    // Path2D pobierane z cache (geo.zonePaths) zamiast budowane co klatkę.
    if (geo.zonePaths && Array.isArray(bldg.zonePolygons)) {
      for (let zfIdx = 0; zfIdx < bldg.zonePolygons.length; zfIdx++) {
        const zf = bldg.zonePolygons[zfIdx];
        const zonePath = geo.zonePaths[zfIdx];
        if (!zonePath) continue;

        const isPlaygroundZone = zf.areaType === 'playground';
        const zoneFill = isPlaygroundZone
          ? isSelected ? 'rgba(245, 158, 11, 0.14)' : 'rgba(245, 158, 11, 0.07)'
          : isSelected ? 'rgba(56, 189, 248, 0.14)' : 'rgba(56, 189, 248, 0.07)';
        const zoneStroke = isPlaygroundZone
          ? isSelected ? 'rgba(245, 158, 11, 0.95)' : 'rgba(245, 158, 11, 0.75)'
          : isSelected ? 'rgba(56, 189, 248, 0.95)' : 'rgba(56, 189, 248, 0.75)';

        ctx.fillStyle = zoneFill;
        ctx.fill(zonePath, 'evenodd');

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
      ctx.strokeStyle = isBoundary
        ? getBoundaryStyle(areaType, bldg.isTested === true, bldg.isAccompanyingInvestment === true).strokeSelected
        : isBalcony
        ? '#c084fc'
        : isTested
        ? TESTED_STROKE.selected
        : NON_TESTED_STROKE.selected;
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
  // Kandydaci na "wyższe budynki" mogące przesłaniać krawędzie innych obiektów.
  // Budowane raz na klatkę (nie per-budynek/per-segment) - AABB (z buildingGeoCache) pozwala
  // później tanio odrzucić kandydatów, których obrys w ogóle nie przecina obrysu danego budynku
  // (przecięcie AABB to warunek konieczny nakładania/zawierania się wielokątów).
  interface TallCandidate {
    id: string;
    h: number;
    vertices: any[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  const tallCandidates: TallCandidate[] = [];
  for (const other of buildings) {
    if (!other || other.category === 'boundary') continue;
    if (!Array.isArray(other.vertices) || other.vertices.length < 3) continue;
    const otherGeo = getOrComputeBuildingGeo(other);
    if (!otherGeo) continue;
    tallCandidates.push({
      id: other.id,
      h: other.defaultHeight || 0,
      vertices: other.vertices,
      minX: otherGeo.minX,
      minY: otherGeo.minY,
      maxX: otherGeo.maxX,
      maxY: otherGeo.maxY,
    });
  }

  for (const bldg of buildings) {
    if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) continue;

    // Filtrowanie wariantu A/B dla obiektów logicznych (gdy obiekt ma przypisany wariant różny od aktywnego)
    if (!isBuildingVariantActive(bldg)) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    // Viewport Culling check
    if (geo.maxX < vpMinX || geo.minX > vpMaxX || geo.maxY < vpMinY || geo.minY > vpMaxY) {
      continue;
    }

    const lyr = bldg.layer || 'Bariery';
    const lyrSetting = layerSettings[lyr] || {};
    if (lyrSetting.isVisible === false) continue;
    if (bldg.isVisible === false) continue;

    const isGhosted = lyrSetting.isGhosted === true;
    const isLocked = bldg.isLocked === true || lyrSetting.isLocked === true;
    const isSelected = bldg.id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(bldg.id));
    const isTested = bldg.isTested;
    const isIncluded = bldg.isIncluded !== false;

    // Przygaszanie obiektów, które nie wchodzą w skład otwartej grupy (wyłącznie w trybie edycji grupy)
    const isDimmed = isBuildingDimmedInGroupMode(bldg, openGroupId, isSelected);

    const isSweep = Array.isArray(bldg.sweepPath) && bldg.sweepPath.length >= 2;
    const bldgIsBoundary = bldg.category === 'boundary';
    const bldgIsPlayground = bldgIsBoundary && bldg.areaType === 'playground';

    ctx.save();
    if (isDimmed) {
      ctx.globalAlpha = 0.28;
    }

    // Kandydaci na przesłaniające budynki, ograniczeni RAZ na budynek (nie per-segment) do tych,
    // których AABB w ogóle przecina AABB tego budynku - dużo mniejszy zbiór niż cała scena.
    const buildingLocalCandidates: TallCandidate[] =
      !bldgIsBoundary && !bldgIsPlayground
        ? tallCandidates.filter(
            (c) =>
              c.id !== bldg.id &&
              c.maxX >= geo.minX &&
              c.minX <= geo.maxX &&
              c.maxY >= geo.minY &&
              c.minY <= geo.maxY
          )
        : [];

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

        // Obiekty 'boundary' w grupie stykających się granic renderowane są jako jedna wspólna obwiednia
        // (patrz sekcja po pętli) - pomijamy tu ich standardowy per-building stroke.
        if (bldg.category === 'boundary' && mergeableBoundaryIds.has(bldg.id)) continue;

        const { sx: x1, sy: y1 } = worldToScreen(seg.p1.x, seg.p1.y);
        const { sx: x2, sy: y2 } = worldToScreen(seg.p2.x, seg.p2.y);
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        const isBoundary = bldgIsBoundary;
        const isPlayground = bldgIsPlayground;
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

          // B. Inne wyższe budynki w scenie, już ograniczone do kandydatów z przecinającym się AABB
          for (const other of buildingLocalCandidates) {
            if (other.h > segHTop + 0.05) {
              higherPolys.push(other.vertices);
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
        } else if (isBoundary) {
          const bs = getBoundaryStyle(bldg.areaType || 'plot', isTested === true, bldg.isAccompanyingInvestment === true);
          strokeColor = isSelected ? bs.strokeSelected : bs.strokeDefault;
          strokeWidth = isSelected ? bs.strokeWidthSelected : bs.strokeWidthDefault;
        } else if (isBalcony) {
          strokeColor = isSelected ? '#c084fc' : 'rgba(192, 132, 252, 0.75)';
          strokeWidth = isSelected ? 2.0 : 1.4;
        } else if (isGhosted) {
          if (isTested) {
            strokeColor = 'rgba(14, 165, 233, 0.55)';
            strokeWidth = 1.4;
          } else if (isIncluded) {
            strokeColor = 'rgba(148, 163, 184, 0.40)';
            strokeWidth = 0.8;
          } else {
            strokeColor = 'rgba(148, 163, 184, 0.35)';
            strokeWidth = 0.8;
          }
        } else if (!isIncluded) {
          strokeColor = 'rgba(148, 163, 184, 0.3)';
          strokeWidth = 0.8;
        } else if (isTested) {
          strokeColor = isSelected ? TESTED_STROKE.selected : TESTED_STROKE.normal;
          strokeWidth = isSelected ? TESTED_STROKE_WIDTH.selected : TESTED_STROKE_WIDTH.normal;
        } else {
          strokeColor = isSelected ? NON_TESTED_STROKE.selected : NON_TESTED_STROKE.normal;
          strokeWidth = isSelected ? NON_TESTED_STROKE_WIDTH.selected : NON_TESTED_STROKE_WIDTH.normal;
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
      }

      // Edge Length Badges on Selected Building (Interactive for editing)
      // Etykiety pokazują wyłącznie krawędzie geometrii źródłowej (bldg.vertices),
      // nie odcinki wygenerowane przez modyfikatory (uskok/wykusz/taras/donat/ścięcie).
      // Hidden during vertex editing and rotation to not obstruct handles/rotations
      if (isSelected && Array.isArray(bldg.vertices) && bldg.vertices.length >= 3 && !isVertexEditMode && !isRotateMode && !isLinkingMode) {
        const baseVertices = bldg.vertices;
        const nBase = baseVertices.length;
        const baseIsCCW = isPolygonCCW(baseVertices);

        for (let eIdx = 0; eIdx < nBase; eIdx++) {
          const isEditingThisEdge =
            editingEdgeLength?.buildingId === bldg.id && editingEdgeLength?.edgeIndex === eIdx;
          const isHoveredBadge =
            hoveredEdgeLengthBadge?.buildingId === bldg.id && hoveredEdgeLengthBadge?.edgeIndex === eIdx;

          let ep1 = baseVertices[eIdx];
          let ep2 = baseVertices[(eIdx + 1) % nBase];
          if (
            isEditingThisEdge &&
            editingEdgeLength?.previewVertices &&
            editingEdgeLength.previewVertices.length >= 3
          ) {
            const p1 = editingEdgeLength.previewVertices[eIdx];
            const p2 = editingEdgeLength.previewVertices[(eIdx + 1) % nBase];
            if (p1 && p2) {
              ep1 = p1;
              ep2 = p2;
            }
          }
          if (!ep1 || !ep2 || !Number.isFinite(ep1.x) || !Number.isFinite(ep1.y) || !Number.isFinite(ep2.x) || !Number.isFinite(ep2.y)) continue;

          const midX = (ep1.x + ep2.x) / 2;
          const midY = (ep1.y + ep2.y) / 2;
          const len = Math.hypot(ep2.x - ep1.x, ep2.y - ep1.y);

          // Wektor normalny krawędzi bazowej (na zewnątrz wielokąta)
          const normal = calculateOutwardNormal(ep1, ep2, baseIsCCW);
          const normX = normal.x;
          const normY = normal.y;

          // Punkty na ekranie (sm to środek s1/s2 - worldToScreen jest przekształceniem afinicznym)
          const s1 = worldToScreen(ep1.x, ep1.y);
          const s2 = worldToScreen(ep2.x, ep2.y);
          const sm = { sx: (s1.sx + s2.sx) / 2, sy: (s1.sy + s2.sy) / 2 };
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
            const tw = measureTextWidthCached(ctx, labelText);
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

    // Centroid Label for Building (schowane w trybie łączenia obiektów dla czystości interfejsu)
    if (geo && !isLinkingMode) {
      // Szybkie odrzucenie O(1) przy oddalonym zoomie
      if (viewState.scale >= geo.minScaleForLabel) {
        const cx = geo.labelAnchor.x;
        const cy = geo.labelAnchor.y;
        const { sx: csx, sy: csy } = worldToScreen(cx, cy);

        if (Number.isFinite(csx) && Number.isFinite(csy)) {
          const isBoundary = bldg.category === 'boundary';
          const isPlayground = isBoundary && bldg.areaType === 'playground';
          const isBalcony = bldg.category === 'balcony';
          const isLabelHovered = bldg.id === hoveredLabelBuildingId;

          // W widoku roboczym CAD wszystkie etykiety rysowane są w 100% poziomo (brak obrotu)
          ctx.save();
          ctx.translate(csx, csy);

          if (isBoundary) {
            // Pole działki / utwardzenia - z cache (liczone raz przy budowie geo, nie co klatkę)
            const isPaved = isBoundary && bldg.areaType === 'paved';
            const areaText = isPaved
              ? `Utwardzenie ${Math.round(geo.area)} m²`
              : `${Math.round(geo.area)} m²`;

            const hasPlotNumber = !isPlayground && !isPaved && !!(bldg.plotNumber && bldg.plotNumber.trim());
            const headerName = bldg.name && bldg.name.trim()
              ? bldg.name.trim()
              : hasPlotNumber
              ? bldg.plotNumber!.trim()
              : '';

            const showHeader = !!headerName;

            ctx.font = showHeader ? 'bold 12px Inter, sans-serif' : 'bold 11px Inter, monospace';
            const nameW = showHeader ? measureTextWidthCached(ctx, headerName) : 0;
            ctx.font = '10px Inter, monospace';
            const areaW = measureTextWidthCached(ctx, areaText);

            const cardW = showHeader ? Math.max(nameW, areaW) + 20 : areaW + 16;
            const cardH = showHeader ? 34 : 22;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = isLabelHovered
              ? '#38bdf8'
              : isPlayground
              ? (isSelected ? '#f59e0b' : 'rgba(245, 158, 11, 0.6)')
              : isPaved
              ? (isSelected ? '#94a3b8' : 'rgba(148, 163, 184, 0.5)')
              : (isSelected ? '#ef4444' : 'rgba(239, 68, 68, 0.5)');
            ctx.lineWidth = isLabelHovered ? 2 : isSelected ? 1.5 : 1;
            ctx.beginPath();
            ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
            ctx.fill();
            ctx.stroke();

            if (showHeader) {
              // Nazwa / Numer
              ctx.fillStyle = '#fca5a5';
              ctx.font = 'bold 12px Inter, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(headerName, 0, -6);

              // Powierzchnia
              ctx.fillStyle = '#cbd5e1';
              ctx.font = '10px Inter, monospace';
              ctx.fillText(areaText, 0, 8);
            } else {
              // Tylko powierzchnia / opis utwardzenia
              ctx.fillStyle = isPlayground ? '#fbbf24' : isPaved ? '#cbd5e1' : '#fca5a5';
              ctx.font = 'bold 11px Inter, monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(areaText, 0, 0);
            }
          } else if (isBalcony) {
            const balconyText = `Balkon ${bldg.defaultHeight}m`;

            ctx.font = 'bold 11px Inter, sans-serif';
            const textW = measureTextWidthCached(ctx, balconyText);
            const iconCount = (isLocked ? 1 : 0) + (isGhosted ? 1 : 0);
            const iconsW = iconCount * 14;
            const contentW = textW + (iconCount > 0 ? 6 + iconsW : 0);
            const cardW = contentW + 16;
            const cardH = 22;

            ctx.fillStyle = 'rgba(11, 19, 41, 0.9)';
            ctx.strokeStyle = isLabelHovered ? '#38bdf8' : isSelected ? '#c084fc' : 'rgba(192, 132, 252, 0.5)';
            ctx.lineWidth = isLabelHovered ? 2 : 1;
            ctx.beginPath();
            ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 5);
            ctx.fill();
            ctx.stroke();

            const startX = -contentW / 2;
            ctx.fillStyle = '#d8b4fe';
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(balconyText, startX, 0);

            let curIconX = startX + textW + 8;
            if (isLocked) {
              drawLucideLockIcon(ctx, curIconX, 0, '#fbbf24');
              curIconX += 13;
            }
            if (isGhosted) {
              drawLucideGhostIcon(ctx, curIconX, 0, '#c084fc');
            }
          } else {
            const heightText = `${bldg.defaultHeight}m`;

            // Powiększony opis wysokości budynku o 20% (13px -> 16px)
            ctx.font = 'bold 16px Inter, sans-serif';
            const textW = measureTextWidthCached(ctx, heightText);
            const iconCount = (isLocked ? 1 : 0) + (isGhosted ? 1 : 0);
            const iconsW = iconCount * 14;
            const contentW = textW + (iconCount > 0 ? 6 + iconsW : 0);

            // Kolorowe wskaźniki statusu [included: zielony, tested: indygo, cityCentre: pomarańczowy, typ: usługowy/garaż]
            const isIncluded = bldg.isIncluded !== false;
            const isService = bldg.buildingType === 'service';
            const isGarage = bldg.buildingType === 'garage';
            const isCityCentre = bldg.isCityCentre || (Array.isArray(bldg.segments) && bldg.segments.some((s: any) => s.isCityCentre));

            const dots: { color: string; active: boolean }[] = [
              { color: '#10b981', active: isIncluded },
              { color: '#6366f1', active: isTested },
              { color: '#f59e0b', active: isCityCentre },
            ];
            if (isService) {
              dots.push({ color: '#f59e0b', active: true });
            } else if (isGarage) {
              dots.push({ color: '#64748b', active: true });
            }

            const dotRadius = 2.5;
            const dotSpacing = 7;
            const totalDotsW = (dots.length - 1) * dotSpacing;
            const cardW = Math.max(contentW + 16, totalDotsW + 18, 42);
            const cardH = 34;

            ctx.fillStyle = 'rgba(11, 19, 41, 0.9)';
            ctx.strokeStyle = isLabelHovered
              ? '#38bdf8'
              : isTested
              ? 'rgba(99, 102, 241, 0.6)'
              : 'rgba(100, 116, 139, 0.4)';
            ctx.lineWidth = isLabelHovered ? 2 : 1;
            ctx.beginPath();
            ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
            ctx.fill();
            ctx.stroke();

            // Renderuj powiększony tekst wysokości
            const startX = -contentW / 2;
            ctx.fillStyle = isTested ? '#93c5fd' : '#f8fafc';
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(heightText, startX, -6);

            // Renderuj wektorowe ikony kłódki / ducha
            let curIconX = startX + textW + 8;
            if (isLocked) {
              drawLucideLockIcon(ctx, curIconX, -6, '#fbbf24');
              curIconX += 13;
            }
            if (isGhosted) {
              drawLucideGhostIcon(ctx, curIconX, -6, '#c084fc');
            }

            // Rząd kolorowych kropek statusu pod wysokością
            const startDotX = -totalDotsW / 2;
            const dotY = 8;

            for (let dIdx = 0; dIdx < dots.length; dIdx++) {
              const d = dots[dIdx];
              const dx = startDotX + dIdx * dotSpacing;
              ctx.beginPath();
              ctx.arc(dx, dotY, dotRadius, 0, 2 * Math.PI);
              ctx.fillStyle = d.active ? d.color : 'rgba(71, 85, 105, 0.4)';
              ctx.fill();
            }
          }

          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  // 2.5 Render Merged Boundary Envelopes (stykające się obiekty 'boundary' jako jedna obwiednia
  // + delikatna linia na wspólnej/ukrytej krawędzi)
  if (mergeableGroups.length > 0) {
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

    for (const group of mergeableGroups) {
      if (!group.outer || group.outer.length < 3) continue;
      const isSelected = isBuildingSelected(group.buildingIds[0]);
      const isPlayground = group.areaType === 'playground';

      ctx.save();
      ctx.setTransform(a, b, c, d, e, f);

      const envelopePath = new Path2D();
      envelopePath.moveTo(group.outer[0].x, group.outer[0].y);
      for (let i = 1; i < group.outer.length; i++) {
        envelopePath.lineTo(group.outer[i].x, group.outer[i].y);
      }
      envelopePath.closePath();
      // Otwory (np. wspólne podwórko po unii) dodane jako osobne podścieżki - rysowane tym samym
      // ctx.stroke(), więc kontur otworu jest widoczny; przy ewentualnym fill trzeba by użyć 'evenodd'.
      for (const hole of group.holes || []) {
        if (!hole || hole.length < 3) continue;
        envelopePath.moveTo(hole[0].x, hole[0].y);
        for (let i = 1; i < hole.length; i++) {
          envelopePath.lineTo(hole[i].x, hole[i].y);
        }
        envelopePath.closePath();
      }

      // Grupy łączone istnieją dla puli isTested albo isAccompanyingInvestment (patrz
      // detectBoundaryMergeGroups) - kolor akcentu dobieramy na podstawie `poolKind`, ustawionego
      // raz przy budowie grupy, więc renderer nie przeszukuje ponownie `buildings`.
      const bs = getBoundaryStyle(
        group.areaType || (isPlayground ? 'playground' : 'plot'),
        group.poolKind === 'tested',
        group.poolKind === 'accompanying'
      );
      ctx.lineWidth = (isSelected ? bs.strokeWidthSelected : bs.strokeWidthDefault) / s;
      ctx.strokeStyle = isSelected ? bs.strokeSelected : bs.strokeDefault;
      ctx.setLineDash([]);
      ctx.stroke(envelopePath);

      // Delikatna linia na wspólnej (ukrytej) krawędzi
      ctx.lineWidth = 0.8 / s;
      ctx.strokeStyle = isPlayground ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      ctx.setLineDash([3 / s, 2 / s]);
      for (const se of group.sharedEdges) {
        ctx.beginPath();
        ctx.moveTo(se.edge[0].x, se.edge[0].y);
        ctx.lineTo(se.edge[1].x, se.edge[1].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.restore();
    }
  }

  // 2.6 Render Group Envelope for Active Group Selection or Linking Mode
  const shouldRenderGroupEnvelope = (isLinkingMode && selectedBuildingId) || (!!activeLogicalGroupId && (!openGroupId || openGroupId === activeLogicalGroupId));
  if (shouldRenderGroupEnvelope) {
    const targetGroupId = activeLogicalGroupId;
    const activeGroupBuildings = targetGroupId
      ? buildings.filter((b) => b.groupId === targetGroupId && isBuildingVariantActive(b))
      : selectedBldgForGroup
      ? [selectedBldgForGroup]
      : [];

    if (activeGroupBuildings.length > 1 || (isLinkingMode && activeGroupBuildings.length > 0)) {
      const envelopeLoops = computeGroupEnvelope(activeGroupBuildings, 1.0);

      if (envelopeLoops.length > 0) {
        const rot = ((viewRotationDeg || 0) * Math.PI) / 180;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const a = s * cosR;
        const b = -s * sinR;
        const c = -s * sinR;
        const d = -s * cosR;
        const e = viewState.panX;
        const f = viewState.panY;

        ctx.save();
        ctx.setTransform(a, b, c, d, e, f);

        for (const loop of envelopeLoops) {
          if (!loop || loop.length < 3) continue;
          const path = new Path2D();
          path.moveTo(loop[0].x, loop[0].y);
          for (let i = 1; i < loop.length; i++) {
            path.lineTo(loop[i].x, loop[i].y);
          }
          path.closePath();

          ctx.fillStyle = isLinkingMode ? 'rgba(245, 158, 11, 0.12)' : 'rgba(56, 189, 248, 0.08)';
          ctx.fill(path);

          ctx.lineWidth = 2.0 / s;
          ctx.strokeStyle = isLinkingMode ? '#f59e0b' : '#38bdf8';
          ctx.setLineDash([6 / s, 4 / s]);
          ctx.stroke(path);
          ctx.setLineDash([]);
        }

        ctx.restore();
      }
    }
  }

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

  // 6. Linking Mode: Render Non-Overlapping Interactive '+' and '-' Action Badges
  if (isLinkingMode && selectedBuildingId) {
    const selectedBldg = buildings.find((b) => b.id === selectedBuildingId);
    if (selectedBldg) {
      const placedLabels = collectLinkingModeLabels(
        buildings,
        selectedBuildingId,
        worldToScreen,
        layerSettings,
        selectedBldg.groupId
      );

      for (const item of placedLabels) {
        const { sx, sy } = item.placedScreenPos;
        const isMinus = item.type === 'minus';
        const isHovered = item.id === hoveredLabelBuildingId || item.id === hoveredBuildingId;

        ctx.save();
        ctx.translate(sx, sy);

        const r = 13;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = isMinus
          ? isHovered
            ? 'rgba(239, 68, 68, 0.95)'
            : 'rgba(239, 68, 68, 0.85)'
          : isHovered
          ? 'rgba(99, 102, 241, 0.95)'
          : 'rgba(30, 41, 59, 0.9)';
        ctx.fill();

        ctx.lineWidth = isHovered ? 2 : 1.5;
        ctx.strokeStyle = isMinus ? '#fca5a5' : '#818cf8';
        ctx.stroke();

        ctx.font = 'bold 15px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isMinus ? '−' : '+', 0, 0);

        ctx.restore();
      }
    }
  }
}
