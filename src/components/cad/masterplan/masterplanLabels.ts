import { BuildingLoop, Point2D } from '@/types/geometry';
import { getOrComputeBuildingGeo } from '../renderers/buildingsRenderer';
import { MASTERPLAN_COLORS } from './renderers/masterplanGroundRenderer';
import { filterActiveVariantBuildings } from '@/utils/geometrySelectors';
import { getCompoundObjectSummary } from '@/utils/compoundObjectPipeline';

const LABEL_FONT_SIZE = 11;
const BUILDING_LABEL_TEXT_H = LABEL_FONT_SIZE + 6;
const AREA_LABEL_TEXT_H = LABEL_FONT_SIZE + 4;

export interface MasterplanLabelCandidate {
  id: string;
  buildingIds: string[];
  category: 'building' | 'boundary' | 'composite';
  text: string;
  sx: number;
  sy: number;
  angleRad: number;
  cardW: number;
  cardH: number;
  isSelected?: boolean;
  isHovered?: boolean;
  priority: number;
}

/**
 * Formatowanie tekstu wysokości budynku (np. 12m lub 15.5m)
 */
export function formatBuildingHeightLabel(height: number): string {
  const h = Math.max(0, height || 0);
  return h % 1 === 0 ? `${h}m` : `${h.toFixed(1)}m`;
}

/**
 * Wyznacza czytelną nazwę dla obszaru (działka, plac zabaw, nazwa własna).
 * Zwraca pusty ciąg, jeśli obiekt nie posiada zdefiniowanej nazwy lub funkcji.
 */
export function getAreaLabelText(bldg: Partial<BuildingLoop>): string {
  if (bldg.name && bldg.name.trim()) {
    return bldg.name.trim();
  }
  if (bldg.plotNumber && bldg.plotNumber.trim()) {
    return bldg.plotNumber.trim();
  }
  if (bldg.areaType === 'playground') return 'Plac zabaw';
  if (bldg.areaType === 'paved') return 'Utwardzenie';
  return '';
}

/**
 * Normalizuje kąt obrotu tekstu do zakresu [-π/2, π/2], aby tekst nigdy nie był do góry nogami.
 */
function normalizeReadableAngle(angleRad: number): number {
  let angle = angleRad;
  while (angle > Math.PI / 2) angle -= Math.PI;
  while (angle < -Math.PI / 2) angle += Math.PI;
  return angle;
}

/**
 * Przygotowuje listę prostych etykiet Master Plan.
 * Budynki: wysokość na środku (w tym zagregowana etykieta dla połączonych obiektów logicznych).
 * Obszary: sama nazwa obrócona do głównego kierunku obiektu.
 */
export function buildMasterplanLabelCandidates(
  buildings: BuildingLoop[],
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  scale: number,
  selectedBuildingId?: string | null,
  selectedBuildingIds?: string[] | null,
  hoveredBuildingId?: string | null,
  viewRotationDeg: number = 0
): MasterplanLabelCandidate[] {
  const candidates: MasterplanLabelCandidate[] = [];
  const viewRotRad = (viewRotationDeg * Math.PI) / 180;

  const activeBuildings = filterActiveVariantBuildings(buildings);

  // Grupowanie obiektów według groupId
  const groupMap = new Map<string, BuildingLoop[]>();
  const independentBuildings: BuildingLoop[] = [];

  for (const bldg of activeBuildings) {
    if (bldg.groupId && bldg.category !== 'boundary') {
      const list = groupMap.get(bldg.groupId) || [];
      list.push(bldg);
      groupMap.set(bldg.groupId, list);
    } else {
      independentBuildings.push(bldg);
    }
  }

  // 1. Etykiety dla obiektów logicznych (połączonych brył wieloczęściowych)
  for (const [groupId, gBldgs] of groupMap.entries()) {
    const summary = getCompoundObjectSummary(gBldgs);
    if (!summary) continue;

    const isGroupSelected = gBldgs.some(
      (b) => b.id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(b.id))
    );
    const isGroupHovered = gBldgs.some((b) => b.id === hoveredBuildingId);

    const spanX = Math.max(0.1, summary.bbox.maxX - summary.bbox.minX);
    const spanY = Math.max(0.1, summary.bbox.maxY - summary.bbox.minY);
    const maxSpan = Math.max(spanX, spanY);
    const minSpan = Math.min(spanX, spanY);

    const heightText =
      summary.minHeight === summary.maxHeight
        ? formatBuildingHeightLabel(summary.maxHeight)
        : `${formatBuildingHeightLabel(summary.minHeight)}-${formatBuildingHeightLabel(summary.maxHeight)}`;

    const textW = heightText.length * 7 + 10;
    const textH = BUILDING_LABEL_TEXT_H;

    if (maxSpan * scale < textW || minSpan * scale < textH) {
      continue;
    }

    const pt = worldToScreen(summary.labelAnchor.x, summary.labelAnchor.y);
    if (!Number.isFinite(pt.sx) || !Number.isFinite(pt.sy)) continue;

    candidates.push({
      id: `group-${groupId}`,
      buildingIds: gBldgs.map((b) => b.id),
      category: 'composite',
      text: heightText,
      sx: pt.sx,
      sy: pt.sy,
      angleRad: 0,
      cardW: textW,
      cardH: textH,
      isSelected: !!isGroupSelected,
      isHovered: !!isGroupHovered,
      priority: isGroupSelected ? 105 : isGroupHovered ? 95 : summary.isTested ? 85 : 55,
    });
  }

  // 2. Etykiety dla niezależnych obiektów pojedynczych i granic
  for (let i = 0; i < independentBuildings.length; i++) {
    const bldg = independentBuildings[i];
    if (!bldg.vertices || bldg.vertices.length < 3) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    const spanX = Math.max(0.1, geo.maxX - geo.minX);
    const spanY = Math.max(0.1, geo.maxY - geo.minY);
    const maxSpan = Math.max(spanX, spanY);
    const minSpan = Math.min(spanX, spanY);

    const isBoundary = bldg.category === 'boundary';
    const isSelected =
      bldg.id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(bldg.id));
    const isHovered = bldg.id === hoveredBuildingId;

    if (!isBoundary) {
      // Budynek: tylko wysokość na środku
      const text = formatBuildingHeightLabel(bldg.defaultHeight || 0);
      const textW = text.length * 7 + 10;
      const textH = BUILDING_LABEL_TEXT_H;

      // Sprawdzenie czy mieści się w geometrii budynku
      if (maxSpan * scale < textW || minSpan * scale < textH) {
        continue;
      }

      const pt = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
      if (!Number.isFinite(pt.sx) || !Number.isFinite(pt.sy)) continue;

      candidates.push({
        id: bldg.id,
        buildingIds: [bldg.id],
        category: 'building',
        text,
        sx: pt.sx,
        sy: pt.sy,
        angleRad: 0,
        cardW: textW,
        cardH: textH,
        isSelected: !!isSelected,
        isHovered: !!isHovered,
        priority: isSelected ? 100 : isHovered ? 90 : bldg.isTested ? 80 : 50,
      });
    } else {
      // Obszar: sama nazwa obrócona do głównego kierunku obiektu
      const text = getAreaLabelText(bldg);
      if (!text) continue; // Pomijamy nienazwane obszary, by nie zaśmiecać widoku

      const textW = text.length * 6.5 + 8;
      const textH = AREA_LABEL_TEXT_H;

      // Sprawdzenie czy mieści się w geometrii obszaru wzdłuż dłuższego boku
      if (maxSpan * scale < textW || minSpan * scale < textH) {
        continue;
      }

      const pt = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
      if (!Number.isFinite(pt.sx) || !Number.isFinite(pt.sy)) continue;

      // Skorygowany kąt obrotu na ekranie z uwzględnieniem odwrócenia osi Y Canvasa (+Y w dół)
      const angleRad = normalizeReadableAngle(-(geo.dominantAngleRad + viewRotRad));

      candidates.push({
        id: bldg.id,
        buildingIds: [bldg.id],
        category: 'boundary',
        text,
        sx: pt.sx,
        sy: pt.sy,
        angleRad,
        cardW: textW,
        cardH: textH,
        isSelected: !!isSelected,
        isHovered: !!isHovered,
        priority: isSelected ? 70 : isHovered ? 60 : bldg.isTested ? 40 : 20,
      });
    }
  }

  return candidates;
}

/**
 * Sprawdza nakładanie się dwóch etykiet
 */
export function checkLabelOverlap(
  a: MasterplanLabelCandidate,
  b: MasterplanLabelCandidate,
  gap: number = 4
): boolean {
  const aHalfW = a.cardW / 2;
  const aHalfH = a.cardH / 2;
  const bHalfW = b.cardW / 2;
  const bHalfH = b.cardH / 2;

  return (
    Math.abs(a.sx - b.sx) < aHalfW + bHalfW + gap &&
    Math.abs(a.sy - b.sy) < aHalfH + bHalfH + gap
  );
}

/**
 * Szybkie usuwanie nakładających się etykiet z priorytetyzacją
 */
export function resolveMasterplanLabelCollisions(
  candidates: MasterplanLabelCandidate[]
): MasterplanLabelCandidate[] {
  if (candidates.length <= 1) return [...candidates];

  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const result: MasterplanLabelCandidate[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    let overlaps = false;

    for (let j = 0; j < result.length; j++) {
      if (checkLabelOverlap(item, result[j])) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Hit-testing etykiet Master Plan
 */
export function getMasterplanLabelHitAtPoint(
  screenX: number,
  screenY: number,
  buildings: BuildingLoop[],
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  scale: number,
  selectedBuildingId?: string | null,
  selectedBuildingIds?: string[] | null,
  hoveredBuildingId?: string | null,
  layerSettings: Record<string, any> = {}
): string | null {
  const visible = buildings.filter((b) => {
    if (!b.vertices || b.vertices.length < 3) return false;
    const lyr = b.layer || 'Domyślna (0)';
    return layerSettings[lyr]?.isVisible !== false;
  });

  const candidates = buildMasterplanLabelCandidates(
    visible,
    worldToScreen,
    scale,
    selectedBuildingId,
    selectedBuildingIds,
    hoveredBuildingId
  );

  const resolved = resolveMasterplanLabelCollisions(candidates);
  const hitTolerance = 4;

  for (let i = 0; i < resolved.length; i++) {
    const label = resolved[i];
    const halfW = label.cardW / 2 + hitTolerance;
    const halfH = label.cardH / 2 + hitTolerance;

    if (
      screenX >= label.sx - halfW &&
      screenX <= label.sx + halfW &&
      screenY >= label.sy - halfH &&
      screenY <= label.sy + halfH
    ) {
      return label.buildingIds[0] || label.id;
    }
  }

  return null;
}

/**
 * Ekranowy punkt kotwiczenia dla minipanelu
 */
export function getMasterplanLabelScreenAnchor(
  bldg: BuildingLoop,
  buildings: BuildingLoop[],
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  scale: number,
  selectedBuildingId?: string | null,
  selectedBuildingIds?: string[] | null,
  hoveredBuildingId?: string | null
): { sx: number; bottomSy: number } | null {
  if (!bldg || !bldg.vertices || bldg.vertices.length < 3) return null;

  const geo = getOrComputeBuildingGeo(bldg);
  if (!geo) return null;

  const s = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
  if (!Number.isFinite(s.sx) || !Number.isFinite(s.sy)) return null;

  const cardH = bldg.category === 'boundary' ? AREA_LABEL_TEXT_H : BUILDING_LABEL_TEXT_H;
  return { sx: s.sx, bottomSy: s.sy + cardH / 2 };
}

/**
 * Renderuje etykiety na Canvas 2D w estetyce Master Plan White:
 * - Budynki: prosta plakietka wysokości
 * - Obszary: sam tekst obrócony do osi obiektu z delikatnym obrysem
 */
export function renderMasterplanLabels(
  ctx: CanvasRenderingContext2D,
  labels: MasterplanLabelCandidate[]
): void {
  if (labels.length === 0) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Piksele ekranu
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];

    ctx.save();
    ctx.translate(label.sx, label.sy);
    if (label.angleRad) {
      ctx.rotate(label.angleRad);
    }

    if (label.category === 'building') {
      const halfW = label.cardW / 2;
      const halfH = label.cardH / 2;

      ctx.fillStyle = label.isHovered
        ? 'rgba(254, 243, 199, 0.95)'
        : 'rgba(255, 255, 255, 0.92)';
      ctx.strokeStyle = label.isSelected
        ? MASTERPLAN_COLORS.selectedOutline
        : label.isHovered
        ? '#f59e0b'
        : 'rgba(203, 213, 225, 0.85)';
      ctx.lineWidth = label.isSelected ? 1.5 : 0.75;

      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, label.cardW, label.cardH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = label.isSelected ? '#1d4ed8' : '#334155';
      ctx.fillText(label.text, 0, 0);
    } else {
      // Obszar: czysty tekst obrócony wzdłuż obiektu z jasnym halo
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(label.text, 0, 0);

      ctx.fillStyle = label.isSelected
        ? '#1d4ed8'
        : label.isHovered
        ? '#b45309'
        : '#475569';
      ctx.fillText(label.text, 0, 0);
    }

    ctx.restore();
  }

  ctx.restore();
}
