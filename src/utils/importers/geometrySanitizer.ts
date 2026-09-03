import { Point2D, FacadeSegment } from '../../types/geometry';
import { isPolygonCCW, calculateOutwardNormal } from '../math2d';
import { computeLineEquation } from '../segmentStatistics';

export interface SanitizePolygonOptions {
  minEdgeLength?: number; // Domyślnie 0.05 m
  minVertices?: number; // Domyślnie 3
  forceCCW?: boolean; // Domyślnie true (konwencja brył w silniku)
  defaultHeight?: number; // Domyślnie 15 m
  hWindowBottom?: number; // Domyślnie 0.85 m
  buildingId?: string;
  buildingType?: 'residential' | 'childcare';
  isCityCentre?: boolean;
}

export interface SanitizedPolygonResult {
  valid: boolean;
  vertices: Point2D[];
  segments: FacadeSegment[];
  isCCW: boolean;
  warnings?: string[];
}

/**
 * Uniwersalny potok sanityzacji geometrii 2D (dla DXF, GeoJSON oraz ręcznego wprowadzania):
 * 1. Odrzucenie punktów nienumerycznych / NaN / Infinity.
 * 2. Usunięcie zduplikowanych sąsiednich wierzchołków (squaredDistance < eps^2).
 * 3. Usunięcie wierzchołka zamykającego pętlę (p[last] == p[0]), aby reprezentacja była cykliczna.
 * 4. Filtracja odcinków o długości poniżej progu tolerancji (minEdgeLength).
 * 5. Wymuszenie orientacji CCW (przeliczenie wektorów normalnych na zewnątrz).
 * 6. Wygenerowanie segmentów z równaniami prostych Ax + By + C = 0.
 */
export function sanitizePolygon(
  rawPoints: Point2D[],
  options: SanitizePolygonOptions = {}
): SanitizedPolygonResult {
  const {
    minEdgeLength = 0.05,
    minVertices = 3,
    forceCCW = true,
    defaultHeight = 15.0,
    hWindowBottom = 0.85,
    buildingId = `bldg-${Date.now()}`,
    buildingType = 'residential',
    isCityCentre = false,
  } = options;

  const warnings: string[] = [];

  if (!rawPoints || !Array.isArray(rawPoints) || rawPoints.length < minVertices) {
    return { valid: false, vertices: [], segments: [], isCCW: true, warnings: ['Zbyt mała liczba wierzchołków'] };
  }

  // 1. Odrzucenie niepoprawnych punktów
  const finitePoints: Point2D[] = [];
  for (const pt of rawPoints) {
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      finitePoints.push({ x: pt.x, y: pt.y });
    }
  }

  if (finitePoints.length < minVertices) {
    return { valid: false, vertices: [], segments: [], isCCW: true, warnings: ['Brak wystarczającej liczby poprawnych punktów'] };
  }

  // 2. Usunięcie powtórzonego wierzchołka zamykającego
  const pFirst = finitePoints[0];
  const pLast = finitePoints[finitePoints.length - 1];
  const closeDistSq = (pFirst.x - pLast.x) ** 2 + (pFirst.y - pLast.y) ** 2;
  if (finitePoints.length > 3 && closeDistSq < 1e-6) {
    finitePoints.pop();
  }

  // 3. Usunięcie zduplikowanych sąsiednich wierzchołków
  const deduplicated: Point2D[] = [];
  const epsSq = minEdgeLength * minEdgeLength * 0.01; // ~0.005 m
  for (let i = 0; i < finitePoints.length; i++) {
    const cur = finitePoints[i];
    const prev = deduplicated[deduplicated.length - 1];
    if (!prev) {
      deduplicated.push(cur);
      continue;
    }
    const dSq = (cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2;
    if (dSq >= epsSq) {
      deduplicated.push(cur);
    }
  }

  // Sprawdź również odległość ostatniego punktu od pierwszego po deduplikacji
  if (deduplicated.length > 2) {
    const dSqFirstLast =
      (deduplicated[0].x - deduplicated[deduplicated.length - 1].x) ** 2 +
      (deduplicated[0].y - deduplicated[deduplicated.length - 1].y) ** 2;
    if (dSqFirstLast < epsSq) {
      deduplicated.pop();
    }
  }

  if (deduplicated.length < minVertices) {
    return {
      valid: false,
      vertices: [],
      segments: [],
      isCCW: true,
      warnings: ['Po usunięciu duplikatów liczba wierzchołków spadła poniżej minimum'],
    };
  }

  // 4. Sprawdzenie orientacji i ewentualne odwrócenie do CCW
  let currentIsCCW = isPolygonCCW(deduplicated);
  let finalVertices = deduplicated;

  if (forceCCW && !currentIsCCW) {
    finalVertices = [...deduplicated].reverse();
    currentIsCCW = true;
    warnings.push('Odwrócono orientację wielokąta do CCW (przeciwnie do ruchu wskazówek zegara).');
  }

  // 5. Budowa segmentów
  const segments: FacadeSegment[] = [];
  const n = finalVertices.length;
  for (let i = 0; i < n; i++) {
    const p1 = finalVertices[i];
    const p2 = finalVertices[(i + 1) % n];
    const normal = calculateOutwardNormal(p1, p2, currentIsCCW);
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    segments.push({
      id: `${buildingId}-seg-${i + 1}`,
      p1,
      p2,
      normal,
      length: len,
      angleRad: Math.atan2(p2.y - p1.y, p2.x - p1.x),
      hTop: defaultHeight,
      hWindowBottom,
      isCityCentre,
      buildingType,
      lineEquation: computeLineEquation(p1, p2, normal),
    });
  }

  return {
    valid: true,
    vertices: finalVertices,
    segments,
    isCCW: currentIsCCW,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
