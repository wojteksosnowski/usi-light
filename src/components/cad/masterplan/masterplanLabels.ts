import { BuildingLoop, Point2D } from '@/types/geometry';
import { getOrComputeBuildingGeo } from '../renderers/buildingsRenderer';
import { MASTERPLAN_COLORS } from './renderers/masterplanGroundRenderer';

export interface MasterplanLabelLine {
  text: string;
  font: string;
  color: string;
}

export interface MasterplanLabelCandidate {
  id: string;
  buildingIds: string[];
  category: 'building' | 'boundary' | 'balcony' | 'composite';
  sx: number;
  sy: number;
  cardW: number;
  cardH: number;
  lines: MasterplanLabelLine[];
  shapeBoundsScreen: {
    minSx: number;
    maxSx: number;
    minSy: number;
    maxSy: number;
  };
  isSelected?: boolean;
  isHovered?: boolean;
  priority: number; // wyższa wartość = wyższy priorytet (np. zaznaczony budynek > budynek > obszar)
}

export interface MasterplanLabelLayoutOptions {
  padding?: number;
  gap?: number;
}

/**
 * Formatowanie tekstu wysokości budynku (np. 12m lub 15.5m)
 */
export function formatBuildingHeightLabel(height: number): string {
  const h = Math.max(0, height || 0);
  return h % 1 === 0 ? `${h}m` : `${h.toFixed(1)}m`;
}

/**
 * Sprawdza czy karta etykiety (cardW x cardH) mieści się w rozpiętości geometrii obiektu
 * przy danej skali - albo w standardowej orientacji, albo wzdłuż dłuższej osi (kształt wydłużony).
 * Współdzielone przez kandydatów typu 'building' i 'boundary'.
 */
function fitsLabelInSpan(cardW: number, cardH: number, spanX: number, spanY: number, scale: number): boolean {
  const maxSpan = Math.max(spanX, spanY);
  const minSpan = Math.min(spanX, spanY);
  const fitsStandard = cardW <= spanX * scale && cardH <= spanY * scale;
  const fitsElongated = cardW <= maxSpan * scale && cardH * 0.75 <= minSpan * scale;
  return fitsStandard || fitsElongated;
}

/**
 * Przygotowuje listę kandydatów etykiet do wyświetlenia w widoku Master Plan.
 * Korzysta z bufora geometrii obiektu (getOrComputeBuildingGeo) dla natychmiastowego testu zoomu O(1)
 * i stałego punktu wstawienia etykiety.
 */
export function buildMasterplanLabelCandidates(
  buildings: BuildingLoop[],
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  scale: number,
  selectedBuildingId?: string | null,
  selectedBuildingIds?: string[] | null,
  hoveredBuildingId?: string | null
): MasterplanLabelCandidate[] {
  const candidates: MasterplanLabelCandidate[] = [];
  const fontSize = Math.max(9, Math.min(13, 11 * scale));
  const primaryFont = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const subFont = `500 ${Math.max(8, fontSize - 2)}px Inter, system-ui, sans-serif`;

  for (const bldg of buildings) {
    if (!bldg.vertices || bldg.vertices.length < 3) continue;

    const geo = getOrComputeBuildingGeo(bldg);
    if (!geo) continue;

    const isBoundary = bldg.category === 'boundary';
    const isSelected =
      bldg.id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(bldg.id));
    const isHovered = bldg.id === hoveredBuildingId;

    if (!isBoundary) {
      // Budynek / Bryła
      const labelText = formatBuildingHeightLabel(bldg.defaultHeight || 0);
      const estTextWidth = labelText.length * (fontSize * 0.62);
      const cardW = estTextWidth + 12;
      const cardH = fontSize + 8;

      const spanX = Math.max(0.1, geo.maxX - geo.minX);
      const spanY = Math.max(0.1, geo.maxY - geo.minY);

      if (!fitsLabelInSpan(cardW, cardH, spanX, spanY, scale)) {
        continue;
      }

      const screenPt = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
      if (!Number.isFinite(screenPt.sx) || !Number.isFinite(screenPt.sy)) continue;

      const shapeBoundsScreen = {
        minSx: screenPt.sx - (spanX * scale) / 2,
        maxSx: screenPt.sx + (spanX * scale) / 2,
        minSy: screenPt.sy - (spanY * scale) / 2,
        maxSy: screenPt.sy + (spanY * scale) / 2,
      };

      candidates.push({
        id: bldg.id,
        buildingIds: [bldg.id],
        category: 'building',
        sx: screenPt.sx,
        sy: screenPt.sy,
        cardW,
        cardH,
        lines: [
          {
            text: labelText,
            font: primaryFont,
            color: '#334155',
          },
        ],
        shapeBoundsScreen,
        isSelected: !!isSelected,
        isHovered: !!isHovered,
        priority: isSelected ? 100 : isHovered ? 90 : bldg.isTested ? 80 : 50,
      });
    } else {
      // Obszar / Działka / Plac zabaw
      const hasPlotNumber = !!(bldg.plotNumber && bldg.plotNumber.trim());
      const isPlayground = bldg.areaType === 'playground';
      const isTested = bldg.isTested === true;

      if (!hasPlotNumber && !isPlayground && !isTested) {
        continue;
      }

      const headerText = hasPlotNumber
        ? bldg.plotNumber!.startsWith('Dz.')
          ? bldg.plotNumber!
          : `Dz. ${bldg.plotNumber}`
        : isPlayground
        ? 'Plac zabaw'
        : 'Obszar';

      const estTextWidth = headerText.length * (fontSize * 0.58);
      const cardW = estTextWidth + 12;
      const cardH = fontSize + 6;

      const spanX = Math.max(0.1, geo.maxX - geo.minX);
      const spanY = Math.max(0.1, geo.maxY - geo.minY);

      if (!fitsLabelInSpan(cardW, cardH, spanX, spanY, scale)) {
        continue;
      }

      const screenPt = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
      if (!Number.isFinite(screenPt.sx) || !Number.isFinite(screenPt.sy)) continue;

      const shapeBoundsScreen = {
        minSx: screenPt.sx - (spanX * scale) / 2,
        maxSx: screenPt.sx + (spanX * scale) / 2,
        minSy: screenPt.sy - (spanY * scale) / 2,
        maxSy: screenPt.sy + (spanY * scale) / 2,
      };

      candidates.push({
        id: bldg.id,
        buildingIds: [bldg.id],
        category: 'boundary',
        sx: screenPt.sx,
        sy: screenPt.sy,
        cardW,
        cardH,
        lines: [
          {
            text: headerText,
            font: subFont,
            color: '#64748b',
          },
        ],
        shapeBoundsScreen,
        isSelected: !!isSelected,
        isHovered: !!isHovered,
        priority: isSelected ? 70 : isTested ? 40 : 20,
      });
    }
  }

  return candidates;
}

/**
 * Sprawdza czy dwa prostokąty ekranowe etykiet nachodzą na siebie
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

  const overlapX = Math.abs(a.sx - b.sx) < aHalfW + bHalfW + gap;
  const overlapY = Math.abs(a.sy - b.sy) < aHalfH + bHalfH + gap;

  return overlapX && overlapY;
}

/**
 * Rozwiązuje kolizje i nakładanie się etykiet w widoku Master Plan.
 * Etykiety są stabilne i zakotwiczone w stałych punktach świata — brak dosuwania/nudgingu w osi Y.
 * W przypadku nakładania następuje scalenie w kartę wspólną (budynek + działka) lub priorytetyzacja.
 */
export function resolveMasterplanLabelCollisions(
  candidates: MasterplanLabelCandidate[],
  options: MasterplanLabelLayoutOptions = {}
): MasterplanLabelCandidate[] {
  if (candidates.length <= 1) return [...candidates];

  const gap = options.gap ?? 4;
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const result: MasterplanLabelCandidate[] = [];

  for (const item of sorted) {
    let handled = false;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i];

      if (checkLabelOverlap(item, existing, gap)) {
        // Scenariusz A: Budynek + Działka/Obszar lub w 100% współśrodkowe obiekty (< 8px) -> scalenie
        const isBuildingAndBoundary =
          (item.category === 'boundary' && existing.category === 'building') ||
          (item.category === 'building' && existing.category === 'boundary');

        const isVirtuallyCoincident =
          Math.abs(item.sx - existing.sx) < 8 && Math.abs(item.sy - existing.sy) < 8;

        if (isBuildingAndBoundary || isVirtuallyCoincident) {
          const primary = item.priority >= existing.priority ? item : existing;
          const secondary = item.priority < existing.priority ? item : existing;

          const mergedLines: MasterplanLabelLine[] = [];
          if (secondary.lines[0]) mergedLines.push(secondary.lines[0]);
          if (primary.lines[0]) mergedLines.push(primary.lines[0]);

          const mergedCardW = Math.max(primary.cardW, secondary.cardW) + 4;
          const mergedCardH = primary.cardH + secondary.cardH - 2;

          result[i] = {
            id: `${primary.id}_${secondary.id}`,
            buildingIds: [...primary.buildingIds, ...secondary.buildingIds],
            category: 'composite',
            sx: primary.sx,
            sy: primary.sy,
            cardW: mergedCardW,
            cardH: mergedCardH,
            lines: mergedLines,
            shapeBoundsScreen: primary.shapeBoundsScreen,
            isSelected: primary.isSelected || secondary.isSelected,
            isHovered: primary.isHovered || secondary.isHovered,
            priority: Math.max(primary.priority, secondary.priority),
          };

          handled = true;
          break;
        }

        // Przy nakładaniu dwóch obiektów tej samej kategorii (np. dwa bliskie budynki):
        // Wyższy priorytet (który jest już w result) pozostaje na swoim stałym miejscu,
        // a niższy jest pomijany, zapobiegając drganiom i przesunięciom etykiet.
        handled = true;
        break;
      }
    }

    if (!handled) {
      result.push(item);
    }
  }

  return result;
}


/**
 * Sprawdza czy punkt ekranowy (screenX, screenY) trafia w etykietę w widoku Master Plan.
 * Zwraca ID trafionego budynku lub null.
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
  const visibleBuildings = buildings.filter((b) => {
    if (!b.vertices || b.vertices.length < 3) return false;
    const lyr = b.layer || 'Domyślna (0)';
    return layerSettings[lyr]?.isVisible !== false;
  });

  const candidates = buildMasterplanLabelCandidates(
    visibleBuildings,
    worldToScreen,
    scale,
    selectedBuildingId,
    selectedBuildingIds,
    hoveredBuildingId
  );

  const resolved = resolveMasterplanLabelCollisions(candidates);
  const hitTolerance = 3;

  for (const label of resolved) {
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
 * Zwraca ekranową pozycję dolnej krawędzi karty etykiety w widoku Master Plan do zakotwiczenia minipanelu.
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

  const candidates = buildMasterplanLabelCandidates(
    buildings,
    worldToScreen,
    scale,
    selectedBuildingId,
    selectedBuildingIds,
    hoveredBuildingId
  );

  const resolved = resolveMasterplanLabelCollisions(candidates);
  const match = resolved.find((l) => l.buildingIds.includes(bldg.id) || l.id === bldg.id);
  if (match) {
    return { sx: match.sx, bottomSy: match.sy + match.cardH / 2 };
  }

  const geo = getOrComputeBuildingGeo(bldg);
  if (!geo) return null;
  const s = worldToScreen(geo.labelAnchor.x, geo.labelAnchor.y);
  if (!Number.isFinite(s.sx) || !Number.isFinite(s.sy)) return null;
  return { sx: s.sx, bottomSy: s.sy + 10 };
}


/**
 * Renderuje rozwiązane etykiety na Canvas 2D w estetyce Master Plan White.
 */
export function renderMasterplanLabels(
  ctx: CanvasRenderingContext2D,
  labels: MasterplanLabelCandidate[]
): void {
  if (labels.length === 0) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Rysowanie w pikselach ekranu
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const label of labels) {
    const halfW = label.cardW / 2;
    const halfH = label.cardH / 2;
    const x = label.sx - halfW;
    const y = label.sy - halfH;

    ctx.save();
    ctx.fillStyle = label.isHovered
      ? 'rgba(254, 243, 199, 0.96)'
      : 'rgba(255, 255, 255, 0.92)';

    ctx.strokeStyle = label.isSelected
      ? MASTERPLAN_COLORS.selectedOutline
      : label.isHovered
      ? '#f59e0b'
      : 'rgba(203, 213, 225, 0.85)';

    ctx.lineWidth = label.isSelected ? 1.5 : 0.75;

    ctx.beginPath();
    ctx.roundRect(x, y, label.cardW, label.cardH, 4);
    ctx.fill();
    ctx.stroke();

    if (label.lines.length === 1) {
      const line = label.lines[0];
      ctx.font = line.font;
      ctx.fillStyle = label.isSelected ? '#1d4ed8' : line.color;
      ctx.fillText(line.text, label.sx, label.sy);
    } else if (label.lines.length >= 2) {
      const lineSpacing = label.cardH / (label.lines.length + 1);
      label.lines.forEach((line, idx) => {
        ctx.font = line.font;
        ctx.fillStyle = label.isSelected ? '#1d4ed8' : line.color;
        const lineY = y + lineSpacing * (idx + 1);
        ctx.fillText(line.text, label.sx, lineY);
      });
    }

    ctx.restore();
  }

  ctx.restore();
}
