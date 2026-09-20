import { BuildingLoop, Point2D, CadLayerSettings } from '../types/geometry';
import { isBuildingVariantActive, filterActiveVariantBuildings } from './geometrySelectors';
import { computePointsBoundingBox, computePolygonArea, getPolygonInteriorPoint } from './math2d/polygons';
import { computeGroupEnvelope } from './math2d/groupEnvelope';

export interface CompoundObjectSummary {
  groupId: string;
  name: string;
  buildings: BuildingLoop[];
  totalPz: number;
  maxHeight: number;
  minHeight: number;
  elevation: number;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  envelopeLoops: Point2D[][];
  labelAnchor: Point2D;
  isTested: boolean;
  isIncluded: boolean;
  isCityCentre: boolean;
}

/**
 * Zwraca listę wszystkich budynków widocznych na scenie, odfiltrowując:
 * 1. Elementy nieaktywnych wariantów A/B grup logicznych.
 * 2. Elementy z warstw oznaczonych jako ukryte (isVisible === false).
 */
export function getEffectiveSceneBuildings(
  buildings: BuildingLoop[],
  layerSettings?: Record<string, CadLayerSettings>
): BuildingLoop[] {
  if (!buildings || buildings.length === 0) return [];
  return buildings.filter((b) => {
    if (!isBuildingVariantActive(b)) return false;
    if (layerSettings) {
      const lyr = b.layer || 'Domyślna (0)';
      if (layerSettings[lyr]?.isVisible === false) return false;
    }
    return true;
  });
}

/**
 * Zwraca wyłącznie obiekty składowe aktywnego wariantu dla danej grupy logicznej.
 */
export function getCompoundGroupBuildings(
  buildings: BuildingLoop[],
  groupId: string | null | undefined
): BuildingLoop[] {
  if (!groupId || !buildings || buildings.length === 0) return [];
  const activeBuildings = filterActiveVariantBuildings(buildings);
  return activeBuildings.filter((b) => b.groupId === groupId && b.category !== 'boundary');
}

/**
 * Wyznacza zagregowane metryki, obwiednię i punkt kotwiczenia etykiety dla grupy logicznej.
 */
export function getCompoundObjectSummary(
  groupBuildings: BuildingLoop[]
): CompoundObjectSummary | null {
  const activeBuildings = filterActiveVariantBuildings(groupBuildings).filter(
    (b) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3
  );

  if (activeBuildings.length === 0) return null;

  const first = activeBuildings[0];
  const groupId = first.groupId || first.id;
  const name = first.name.replace(/\s*\(cz\..*?\)/g, '') || `Grupa ${groupId}`;

  let totalPz = 0;
  let maxHeight = 0;
  let minHeight = Infinity;
  let elevation = 0;
  const allVertices: Point2D[] = [];

  let isTested = false;
  let isIncluded = true;
  let isCityCentre = false;

  for (const b of activeBuildings) {
    const area = computePolygonArea(b.vertices);
    totalPz += area;
    const h = b.defaultHeight || 0;
    if (h > maxHeight) maxHeight = h;
    if (h < minHeight) minHeight = h;
    elevation = Math.min(elevation, b.elevation ?? 0);
    allVertices.push(...b.vertices);

    if (b.isTested) isTested = true;
    if (b.isIncluded === false) isIncluded = false;
    if (b.isCityCentre) isCityCentre = true;
  }

  if (minHeight === Infinity) minHeight = 0;

  const bbox = computePointsBoundingBox(allVertices);
  const envelopeLoops = computeGroupEnvelope(activeBuildings, 0.8);

  // Wyznacz punkt kotwiczenia etykiety: wnętrze największej pętli obwiedni lub centroid
  let labelAnchor: Point2D = {
    x: (bbox.minX + bbox.maxX) / 2,
    y: (bbox.minY + bbox.maxY) / 2,
  };

  if (envelopeLoops.length > 0) {
    // Wybierz pętlę o największym polu
    let maxArea = -1;
    let bestLoop = envelopeLoops[0];
    for (const loop of envelopeLoops) {
      const a = computePolygonArea(loop);
      if (a > maxArea) {
        maxArea = a;
        bestLoop = loop;
      }
    }
    labelAnchor = getPolygonInteriorPoint(bestLoop);
  }

  return {
    groupId,
    name,
    buildings: activeBuildings,
    totalPz,
    maxHeight,
    minHeight,
    elevation,
    bbox,
    envelopeLoops,
    labelAnchor,
    isTested,
    isIncluded,
    isCityCentre,
  };
}
