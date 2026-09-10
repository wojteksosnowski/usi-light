import polygonClipping from 'polygon-clipping';
import { BuildingLoop, FacadeSegment, Point2D } from '../../types/geometry';
import {
  CornerCutMode,
  CornerCutScope,
  StoryFootprint,
  ZoneCornerType,
  ZoneFootprint,
} from '../../types/modifiers';
import { miterOffsetPolygon, offsetPolygonWithJoin, PolygonJoinType } from '../../utils/math2d/miterOffset';
import { calculateSignedArea, isPolygonCCW } from '../../utils/math2d/polygons';
import { calculateOutwardNormal, distance } from '../../utils/math2d/vec2';
import { computeLineEquation, rebuildBuildingSegments } from '../../utils/segmentStatistics';
import { calculateBuildingFloors } from '../../utils/buildingFloorCalculator';
import { applyModifier, ModifierApplyContext } from './modifierRegistry';

export interface ModifierPipelineResult {
  storyPolygons: StoryFootprint[];
  zonePolygons: ZoneFootprint[];
  segments: FacadeSegment[];
}

/**
 * Generuje wierzchołki strefy (obszaru) na podstawie bazowego obrysu i modyfikatora 'zone_offset'
 */
export function generateZonePolygon(vertices: Point2D[], distance: number): Point2D[] {
  if (!vertices || vertices.length < 3 || Math.abs(distance) < 1e-4) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }
  return miterOffsetPolygon(vertices, distance);
}

function zoneJoinTypeFor(cornerType: ZoneCornerType | undefined): PolygonJoinType {
  if (cornerType === 'round') return 'round';
  if (cornerType === 'chamfer') return 'bevel';
  return 'miter';
}

/**
 * Generuje pas strefy (obszar między krawędzią obiektu a linią offsetu) na podstawie
 * bazowego obrysu i modyfikatora 'zone_offset'. Zwraca zewnętrzną i wewnętrzną granicę pasa.
 */
export function generateZoneBand(
  vertices: Point2D[],
  distance: number,
  cornerType?: ZoneCornerType
): { outer: Point2D[]; inner: Point2D[] } {
  const base = vertices ? vertices.map((p) => ({ ...p })) : [];
  if (!vertices || vertices.length < 3 || Math.abs(distance) < 1e-4) {
    return { outer: base, inner: base };
  }
  const offset = offsetPolygonWithJoin(vertices, distance, zoneJoinTypeFor(cornerType));
  return distance >= 0 ? { outer: offset, inner: base } : { outer: base, inner: offset };
}

/**
 * Generuje wielokąt z uskokiem / cofnięciem pojedynczej krawędzi (Taras)
 */
export function generateTerracePolygon(
  vertices: Point2D[],
  depth: number,
  targetEdgeIndex?: number
): Point2D[] {
  if (!vertices || vertices.length < 3 || Math.abs(depth) < 1e-4) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }

  const n = vertices.length;
  const isCCW = isPolygonCCW(vertices);

  // Wybierz krawędź docelową (wskazaną lub domyślnie najdłuższą)
  let bestEdgeIdx = 0;
  let maxEdgeLen = 0;

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (len > maxEdgeLen) {
      maxEdgeLen = len;
      bestEdgeIdx = i;
    }
  }

  const edgeIdx =
    targetEdgeIndex !== undefined && targetEdgeIndex >= 0 && targetEdgeIndex < n
      ? targetEdgeIndex
      : bestEdgeIdx;

  const prevIdx = (edgeIdx - 1 + n) % n;
  const nextIdx = (edgeIdx + 1) % n;
  const nextNextIdx = (edgeIdx + 2) % n;

  const pPrev = vertices[prevIdx];
  const p1 = vertices[edgeIdx];
  const p2 = vertices[nextIdx];
  const pNext = vertices[nextNextIdx];

  // Normalna krawędzi modyfikowanej (skierowana na zewnątrz)
  const norm = calculateOutwardNormal(p1, p2, isCCW);

  // Normalna krawędzi poprzedniej (pPrev -> p1)
  const normPrev = calculateOutwardNormal(pPrev, p1, isCCW);

  // Normalna krawędzi następnej (p2 -> pNext)
  const normNext = calculateOutwardNormal(p2, pNext, isCCW);

  // Równanie prostej przesuniętej krawędzi target:
  // norm.x * x + norm.y * y = C_target
  const cTarget = norm.x * p1.x + norm.y * p1.y + depth;

  // Równanie prostej krawędzi poprzedniej (nieprzesunięta):
  const cPrev = normPrev.x * p1.x + normPrev.y * p1.y;

  // Równanie prostej krawędzi następnej (nieprzesunięta):
  const cNext = normNext.x * p2.x + normNext.y * p2.y;

  const cleanZero = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

  // Punkt przecięcia prostej przesuniętej z prostą poprzednią -> nowy p1'
  const det1 = norm.x * normPrev.y - norm.y * normPrev.x;
  let newP1: Point2D;
  if (Math.abs(det1) > 1e-5) {
    newP1 = {
      x: cleanZero((cTarget * normPrev.y - cPrev * norm.y) / det1),
      y: cleanZero((norm.x * cPrev - normPrev.x * cTarget) / det1),
    };
  } else {
    newP1 = {
      x: cleanZero(p1.x + norm.x * depth),
      y: cleanZero(p1.y + norm.y * depth),
    };
  }

  // Punkt przecięcia prostej przesuniętej z prostą następną -> nowy p2'
  const det2 = norm.x * normNext.y - norm.y * normNext.x;
  let newP2: Point2D;
  if (Math.abs(det2) > 1e-5) {
    newP2 = {
      x: cleanZero((cTarget * normNext.y - cNext * norm.y) / det2),
      y: cleanZero((norm.x * cNext - normNext.x * cTarget) / det2),
    };
  } else {
    newP2 = {
      x: cleanZero(p2.x + norm.x * depth),
      y: cleanZero(p2.y + norm.y * depth),
    };
  }

  const result: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    if (i === edgeIdx) {
      result.push(newP1);
    } else if (i === nextIdx) {
      result.push(newP2);
    } else {
      result.push({ x: cleanZero(vertices[i].x), y: cleanZero(vertices[i].y) });
    }
  }

  // Walidacja wyniku: sprawdzenie czy pole i orientacja nie uległy inwersji
  const origArea = Math.abs(calculateSignedArea(vertices));
  const newArea = calculateSignedArea(result);
  const newAbsArea = Math.abs(newArea);
  const orientationKept = isCCW ? newArea > 0 : newArea < 0;

  if (!orientationKept || newAbsArea < 0.5 || (depth < 0 && newAbsArea > origArea * 1.05)) {
    return vertices.map((p) => ({ ...p }));
  }

  return result;
}

/**
 * Generuje wewnętrzny otwór / dziedziniec / patio na podstawie odsunięcia obrysu do wnętrza (Donat)
 */
export function generateDonutHoles(vertices: Point2D[], offset: number): Point2D[][] {
  if (!vertices || vertices.length < 3 || Math.abs(offset) < 1e-4) {
    return [];
  }

  // Odsunięcie do wewnątrz ma wartość ujemną
  const inwardOffset = offset > 0 ? -offset : offset;
  const holePoly = miterOffsetPolygon(vertices, inwardOffset);

  if (!holePoly || holePoly.length < 3) {
    return [];
  }

  const origArea = Math.abs(calculateSignedArea(vertices));
  const holeArea = Math.abs(calculateSignedArea(holePoly));

  // Otwór musi być mniejszy niż obrys bazowy i posiadać co najmniej 1 m² powierzchni
  if (holeArea < 1.0 || holeArea >= origArea * 0.95) {
    return [];
  }

  return [holePoly];
}

/**
 * Generuje wielokąt z dodanym wykuszem (Bay Window) na wybranej krawędzi wielokąta
 */
export function generateBayWindowPolygon(
  vertices: Point2D[],
  width: number,
  projection: number,
  targetEdgeIndex?: number,
  sideAngle: number = 45,
  positionRatio: number = 0.5
): Point2D[] {
  if (!vertices || vertices.length < 3 || Math.abs(projection) < 1e-4 || width <= 1e-3) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }

  const n = vertices.length;
  const isCCW = isPolygonCCW(vertices);

  // Wybierz krawędź docelową (wskazaną lub domyślnie najdłuższą)
  let bestEdgeIdx = 0;
  let maxEdgeLen = 0;

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (len > maxEdgeLen) {
      maxEdgeLen = len;
      bestEdgeIdx = i;
    }
  }

  const edgeIdx = targetEdgeIndex !== undefined && targetEdgeIndex >= 0 && targetEdgeIndex < n
    ? targetEdgeIndex
    : bestEdgeIdx;

  const p1 = vertices[edgeIdx];
  const p2 = vertices[(edgeIdx + 1) % n];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const edgeLen = Math.hypot(dx, dy);

  if (edgeLen < 1e-4) {
    return vertices.map((p) => ({ ...p }));
  }

  // Wektor jednostkowy wzdłuż krawędzi u = (ux, uy)
  const ux = dx / edgeLen;
  const uy = dy / edgeLen;

  // Normalna jednostkowa skierowana na zewnątrz
  const normal = calculateOutwardNormal(p1, p2, isCCW);
  const nx = normal.x;
  const ny = normal.y;

  // Obliczenie wcięcia bocznego (sideInset) w zależności od kąta nachylenia boków (90, 60, 45, 30)
  let sideInset = 0;
  if (sideAngle < 89.9) {
    const angleRad = (Math.max(15, Math.min(89, sideAngle)) * Math.PI) / 180;
    sideInset = Math.abs(projection) / Math.tan(angleRad);
  }

  let effWidth = width;
  let totalBaseLen = effWidth + 2 * sideInset;
  if (totalBaseLen > edgeLen * 0.95) {
    const scaleFactor = (edgeLen * 0.95) / totalBaseLen;
    effWidth *= scaleFactor;
    sideInset *= scaleFactor;
    totalBaseLen = effWidth + 2 * sideInset;
  }

  const availMargin = Math.max(0, edgeLen - totalBaseLen);
  const clampedPosRatio = Math.max(0, Math.min(1, positionRatio ?? 0.5));
  const startMargin = availMargin * clampedPosRatio;

  const b1: Point2D = {
    x: p1.x + ux * startMargin,
    y: p1.y + uy * startMargin,
  };
  const b2: Point2D = {
    x: p1.x + ux * (startMargin + totalBaseLen),
    y: p1.y + uy * (startMargin + totalBaseLen),
  };

  const w1: Point2D = {
    x: b1.x + nx * projection + ux * sideInset,
    y: b1.y + ny * projection + uy * sideInset,
  };
  const w2: Point2D = {
    x: b2.x + nx * projection - ux * sideInset,
    y: b2.y + ny * projection - uy * sideInset,
  };

  const result: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    result.push({ ...vertices[i] });
    if (i === edgeIdx) {
      result.push(b1);
      result.push(w1);
      result.push(w2);
      result.push(b2);
    }
  }

  return result;
}

const CORNER_CUT_ARC_SEGMENTS = 8;

/**
 * Generuje wielokąt ze ściętym narożnikiem / narożnikami (Ścięcie narożnika)
 * Tryby: chamfer (ukośne ścięcie), fillet (zaokrąglenie), notch (wycięcie karo)
 */
export function generateCornerCutPolygon(
  vertices: Point2D[],
  d: number,
  mode: CornerCutMode,
  scope: CornerCutScope,
  targetIndex?: number
): Point2D[] {
  if (!vertices || vertices.length < 3 || d <= 1e-4) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }

  const n = vertices.length;
  const origSignedArea = calculateSignedArea(vertices);
  const isCCW = origSignedArea > 0;

  const targetIndices = new Set<number>();
  if (scope === 'all') {
    for (let i = 0; i < n; i++) targetIndices.add(i);
  } else if (scope === 'edge') {
    const e = targetIndex !== undefined && targetIndex >= 0 && targetIndex < n ? targetIndex : 0;
    targetIndices.add(e);
    targetIndices.add((e + 1) % n);
  } else {
    const v = targetIndex !== undefined && targetIndex >= 0 && targetIndex < n ? targetIndex : 0;
    targetIndices.add(v);
  }

  const result: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    if (!targetIndices.has(i)) {
      result.push({ ...vertices[i] });
      continue;
    }

    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    const lenPrev = distance(curr, prev);
    const lenNext = distance(curr, next);
    const dEff = Math.min(d, lenPrev / 2, lenNext / 2);

    if (dEff <= 1e-4) {
      result.push({ ...curr });
      continue;
    }

    const uPrevX = (prev.x - curr.x) / lenPrev;
    const uPrevY = (prev.y - curr.y) / lenPrev;
    const uNextX = (next.x - curr.x) / lenNext;
    const uNextY = (next.y - curr.y) / lenNext;

    const A: Point2D = { x: curr.x + uPrevX * dEff, y: curr.y + uPrevY * dEff };
    const B: Point2D = { x: curr.x + uNextX * dEff, y: curr.y + uNextY * dEff };

    if (mode === 'chamfer') {
      result.push(A, B);
    } else if (mode === 'fillet') {
      result.push(A);
      for (let s = 1; s < CORNER_CUT_ARC_SEGMENTS; s++) {
        const t = s / CORNER_CUT_ARC_SEGMENTS;
        const omt = 1 - t;
        result.push({
          x: omt * omt * A.x + 2 * t * omt * curr.x + t * t * B.x,
          y: omt * omt * A.y + 2 * t * omt * curr.y + t * t * B.y,
        });
      }
      result.push(B);
    } else {
      // notch: wycięcie karo (romb) - M jest odbiciem curr przez środek A-B
      const M: Point2D = { x: A.x + B.x - curr.x, y: A.y + B.y - curr.y };
      result.push(A, M, B);
    }
  }

  const origArea = Math.abs(origSignedArea);
  const newArea = calculateSignedArea(result);
  const orientationKept = isCCW ? newArea > 0 : newArea < 0;

  if (!orientationKept || Math.abs(newArea) < 0.01 || Math.abs(newArea) > origArea * 1.05) {
    return vertices.map((p) => ({ ...p }));
  }

  return result;
}

/**
 * Oblicza liczbę kondygnacji oraz wysokości spodu i wierzchu dla każdej kondygnacji
 */
export function computeStoryHeightIntervals(building: BuildingLoop): { hBottom: number; hTop: number }[] {
  const elevation = building.elevation ?? 0.0;
  const totalHeight = building.defaultHeight || 15.0;
  const firstH = building.firstFloorHeight ?? 3.0;
  const typicalH = building.typicalFloorHeight ?? 3.0;

  const floorCalc = calculateBuildingFloors(totalHeight, firstH, typicalH, elevation, building.storeysCount);
  return floorCalc.intervals.map((iv) => ({
    hBottom: iv.hBottom,
    hTop: iv.hTop,
  }));
}

export interface StoryModifierStep {
  storyIndex: number;      // Indeks kondygnacji 0 .. K-1
  stepMultiplier: number;  // Mnożnik kroku dla kaskad (1, 2, 3...)
  isTopLevel: boolean;     // Czy to najwyższa kondygnacja w zakresie
  isBottomLevel: boolean;  // Czy to najniższa kondygnacja w zakresie
}

export interface StoryModifierResolutionOptions {
  cascade?: boolean;       // Czy mnożnik rośnie schodkowo (np. dla Tarasu)
}

/**
 * Uniwersalny resolver zakresu i mnożników kondygnacji dla wszystkich modyfikatorów.
 *
 * @param totalStories - Całkowita liczba kondygnacji K budynku
 * @param storiesCount - Parametr selektora:
 *   < 0 : N kondygnacji od góry (poddasze / penthouse)
 *   > 0 : N kondygnacji od dołu (parter / podcień)
 *   === 0 : Wszystkie kondygnacje (cała bryła)
 * @param options - Opcje (np. cascade: true dla kaskadowego tarasu)
 */
export function resolveStoryModifierSteps(
  totalStories: number,
  storiesCount: number = 0,
  options: StoryModifierResolutionOptions = {}
): StoryModifierStep[] {
  const K = Math.max(1, totalStories);
  const cascade = options.cascade ?? false;

  let startIdx = 0;
  let endIdx = K - 1;

  if (storiesCount < 0) {
    const n = Math.min(K, Math.abs(storiesCount));
    startIdx = Math.max(0, K - n);
    endIdx = K - 1;
  } else if (storiesCount > 0) {
    startIdx = 0;
    endIdx = Math.min(K - 1, storiesCount - 1);
  }

  const result: StoryModifierStep[] = [];

  for (let s = startIdx; s <= endIdx; s++) {
    let stepMultiplier = 1;
    if (cascade) {
      if (storiesCount < 0) {
        // Rośnie ku górze: najniższa w zakresie -> 1, kolejna -> 2 ... najwyższa -> count
        stepMultiplier = s - startIdx + 1;
      } else if (storiesCount > 0) {
        // Rośnie ku dołowi: parter -> count, ... najwyższa w zakresie -> 1
        stepMultiplier = endIdx - s + 1;
      } else {
        // Cała bryła: schodkowa piramida od parteru ku górze (1, 2, 3...)
        stepMultiplier = s + 1;
      }
    }

    result.push({
      storyIndex: s,
      stepMultiplier,
      isTopLevel: s === endIdx,
      isBottomLevel: s === startIdx,
    });
  }

  return result;
}

function toClosedRing(pts: Point2D[]): [number, number][] {
  if (!pts || pts.length === 0) return [];
  const ring: [number, number][] = pts.map((p) => [p.x, p.y]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-6) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

function fromClosedRing(ring: [number, number][], enforceCCW = true): Point2D[] {
  if (!ring || ring.length < 3) return [];
  const isClosed =
    Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1e-6;
  const raw = isClosed ? ring.slice(0, -1) : ring;

  // Usuń punkty powtarzające się / zdegenerowane krawędzie o długości < 1e-4m
  const pts: Point2D[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(p[0] - prev.x, p[1] - prev.y) > 1e-4) {
      pts.push({
        x: Math.abs(p[0]) < 1e-9 ? 0 : p[0],
        y: Math.abs(p[1]) < 1e-9 ? 0 : p[1],
      });
    }
  }
  // Sprawdź czy ostatni nie jest zbieżny z pierwszym
  if (pts.length >= 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-4) {
    pts.pop();
  }
  if (pts.length < 3) return [];

  if (enforceCCW) {
    const ccw = isPolygonCCW(pts);
    return ccw ? pts : [...pts].reverse();
  }
  return pts;
}

/**
 * Uniwersalny mechanizm docinający i sanityzujący geometrię obrysu kondygnacji.
 * 1. Czyści samoprzecięcia w obrysie zewnętrznym (boolean union).
 * 2. Przycina otwory (holes) względem obrysu zewnętrznego.
 *    Gdy otwór (np. dziedziniec z Donata) przecina ścianę zewnętrzną (np. przez uskok Tarasu),
 *    zostaje scalony z obrysem w otwarty dziedziniec (kształt U / C), eliminując przecinające się linie.
 * 3. Odrzuca otwory leżące poza obrysem kondygnacji.
 */
export function sanitizeStoryFootprint(footprint: StoryFootprint): StoryFootprint {
  if (!footprint.polygon || footprint.polygon.length < 3) {
    return footprint;
  }

  try {
    const outerRing = toClosedRing(footprint.polygon);
    if (outerRing.length < 4) return footprint;

    // 1. Jeśli brak otworów, czyścimy obrys zewnętrzny
    if (!footprint.holes || footprint.holes.length === 0) {
      const cleaned = polygonClipping.union([[outerRing]]);
      if (cleaned && cleaned.length > 0 && cleaned[0].length > 0) {
        let bestPoly = cleaned[0][0];
        let maxA = 0;
        for (const p of cleaned) {
          if (p && p[0]) {
            const pts = fromClosedRing(p[0]);
            const a = Math.abs(calculateSignedArea(pts));
            if (a > maxA) {
              maxA = a;
              bestPoly = p[0];
            }
          }
        }
        return {
          ...footprint,
          polygon: fromClosedRing(bestPoly, true),
          holes: [],
        };
      }
      return footprint;
    }

    // 2. Jeśli są otwory: wykonujemy boolean difference (outer - holes)
    const validHoles = footprint.holes.filter((h) => h && h.length >= 3);
    if (validHoles.length === 0) {
      return {
        ...footprint,
        polygon: fromClosedRing(outerRing, true),
        holes: [],
      };
    }

    const holePolys = validHoles.map((h) => [[toClosedRing(h)]] as [number, number][][][]);

    // Łączymy wszystkie otwory w jeden zbiór
    const holesUnion =
      holePolys.length === 1
        ? holePolys[0]
        : polygonClipping.union(holePolys[0], ...holePolys.slice(1));

    // Odejmujemy otwory od obrysu zewnętrznego
    const diff = polygonClipping.difference([[outerRing]], holesUnion);

    if (!diff || diff.length === 0) {
      return footprint;
    }

    // diff to MultiPolygon: [ [outerRing, ...holeRings], ... ]
    let bestPolygonIdx = 0;
    let maxArea = 0;
    for (let i = 0; i < diff.length; i++) {
      const poly = diff[i];
      if (poly && poly.length > 0) {
        const outerPts = fromClosedRing(poly[0]);
        const a = Math.abs(calculateSignedArea(outerPts));
        if (a > maxArea) {
          maxArea = a;
          bestPolygonIdx = i;
        }
      }
    }

    const selectedPoly = diff[bestPolygonIdx];
    const sanitizedOuter = fromClosedRing(selectedPoly[0], true);
    const sanitizedHoles: Point2D[][] = [];

    // Pozostałe pierścienie wewnętrzne (jeśli hole był całkowicie wewnątrz)
    for (let h = 1; h < selectedPoly.length; h++) {
      const holePts = fromClosedRing(selectedPoly[h], true);
      if (holePts.length >= 3) {
        const hArea = Math.abs(calculateSignedArea(holePts));
        if (hArea >= 0.5) {
          sanitizedHoles.push(holePts);
        }
      }
    }

    return {
      ...footprint,
      polygon: sanitizedOuter,
      holes: sanitizedHoles,
    };
  } catch {
    return footprint;
  }
}

/**
 * Główny potok przetwarzania modyfikatorów na budynku:
 * 1. Inicjalizuje obrysy kondygnacji (story footprints 0..K-1) z geometrii bazowej
 * 2. Nakłada po kolei aktywne modyfikatory ze stosu (Uskok, Strefa, Wykusz, Taras, Donat)
 * 3. Ekstrahuje pionowe krawędzie ścian (zewnętrznych i wewnętrznych dziedzińca) i scala współliniowe odcinki w segmenty [Hbase, Htotal]
 */
export function applyBuildingModifiers(building: BuildingLoop): ModifierPipelineResult {
  const baseVertices = building.vertices || [];
  if (baseVertices.length < 3) {
    return { storyPolygons: [], zonePolygons: [], segments: building.segments || [] };
  }

  const activeModifiers = (building.modifiers || []).filter((m) => m.enabled);

  // 1. Obiekty typu Obszar (boundary) nie posiadają kondygnacji 3D ani modyfikatorów budynkowych —
  //    obsługują wyłącznie zone_offset, ale samą aplikację delegują do rejestru (modifierRegistry.ts),
  //    tak samo jak budynki, zamiast duplikować logikę generateZoneBand tutaj.
  if (building.category === 'boundary') {
    const zoneFootprints: ZoneFootprint[] = [];
    const boundaryCtx: ModifierApplyContext = { storyFootprints: [], zoneFootprints, baseVertices, K: 0, building };
    for (const modifier of activeModifiers) {
      if (modifier.type === 'zone_offset') {
        applyModifier(modifier, boundaryCtx);
      }
    }
    const rebuilt = rebuildBuildingSegments(building, baseVertices);
    return {
      storyPolygons: [],
      zonePolygons: zoneFootprints,
      segments: rebuilt.segments,
    };
  }

  // 2. Budynki bez aktywnych modyfikatorów
  if (activeModifiers.length === 0) {
    const rebuilt = rebuildBuildingSegments(building, baseVertices);
    return {
      storyPolygons: [],
      zonePolygons: [],
      segments: rebuilt.segments,
    };
  }

  const heightIntervals = computeStoryHeightIntervals(building);
  const K = heightIntervals.length;

  // Inicjalizacja obrysów kondygnacji
  const storyFootprints: StoryFootprint[] = heightIntervals.map((interval, idx) => ({
    storyIndex: idx,
    hBottom: interval.hBottom,
    hTop: interval.hTop,
    polygon: baseVertices.map((p) => ({ ...p })),
    holes: [],
  }));

  const zoneFootprints: ZoneFootprint[] = [];

  // 2. Aplikacja modyfikatorów — dispatch przez rejestr (modifierRegistry.ts), nie if/else po typie.
  const applyCtx: ModifierApplyContext = { storyFootprints, zoneFootprints, baseVertices, K, building };
  for (const modifier of activeModifiers) {
    applyModifier(modifier, applyCtx);
  }

  // 2.5 Sanityzacja i uniwersalne docinanie boolowskie kondygnacji
  const sanitizedStoryFootprints = storyFootprints.map(sanitizeStoryFootprint);

  // 3. Ekstrakcja krawędzi pionowych ścian i scalanie w pionie
  interface RawEdge {
    p1: Point2D;
    p2: Point2D;
    hBottom: number;
    hTop: number;
    storyIndex: number;
    isHole?: boolean;
  }

  const rawEdges: RawEdge[] = [];

  sanitizedStoryFootprints.forEach((sf) => {
    // Krawędzie zewnętrzne
    const poly = sf.polygon;
    const m = poly.length;
    for (let j = 0; j < m; j++) {
      rawEdges.push({
        p1: poly[j],
        p2: poly[(j + 1) % m],
        hBottom: sf.hBottom,
        hTop: sf.hTop,
        storyIndex: sf.storyIndex,
        isHole: false,
      });
    }

    // Krawędzie wewnętrznych otworów (dziedzińce / patio)
    if (sf.holes && sf.holes.length > 0) {
      sf.holes.forEach((hole) => {
        const hm = hole.length;
        for (let j = 0; j < hm; j++) {
          rawEdges.push({
            p1: hole[j],
            p2: hole[(j + 1) % hm],
            hBottom: sf.hBottom,
            hTop: sf.hTop,
            storyIndex: sf.storyIndex,
            isHole: true,
          });
        }
      });
    }
  });

  // Scalanie identycznych krawędzi (te same p1 i p2 w granicach tolerancji)
  interface MergedSegment {
    p1: Point2D;
    p2: Point2D;
    hBase: number;
    hTop: number;
    isHole?: boolean;
  }

  const merged: MergedSegment[] = [];
  const TOL = 0.005; // 5mm tolerancja geometrii

  for (const edge of rawEdges) {
    const existing = merged.find(
      (m) =>
        m.isHole === edge.isHole &&
        Math.hypot(m.p1.x - edge.p1.x, m.p1.y - edge.p1.y) < TOL &&
        Math.hypot(m.p2.x - edge.p2.x, m.p2.y - edge.p2.y) < TOL
    );

    if (existing) {
      existing.hBase = Math.min(existing.hBase, edge.hBottom);
      existing.hTop = Math.max(existing.hTop, edge.hTop);
    } else {
      merged.push({
        p1: { ...edge.p1 },
        p2: { ...edge.p2 },
        hBase: edge.hBottom,
        hTop: edge.hTop,
        isHole: edge.isHole,
      });
    }
  }

  // Tworzenie obiektów FacadeSegment
  const segments: FacadeSegment[] = merged.map((m, idx) => {
    const isCCW = isPolygonCCW(sanitizedStoryFootprints[0]?.polygon || baseVertices);
    // Dla ściany otworu (patio) normalna jest zwrócona do środka dziedzińca
    const normal = m.isHole
      ? calculateOutwardNormal(m.p1, m.p2, !isCCW)
      : calculateOutwardNormal(m.p1, m.p2, isCCW);
    const len = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y);

    return {
      id: `${building.id}_seg_${idx + 1}`,
      p1: m.p1,
      p2: m.p2,
      normal,
      length: len,
      angleRad: Math.atan2(m.p2.y - m.p1.y, m.p2.x - m.p1.x),
      hTop: m.hTop,
      hBase: m.hBase,
      hWindowBottom: building.hWindowBottom ?? 0.85,
      isCityCentre: building.isCityCentre ?? false,
      buildingType: building.buildingType ?? 'residential',
      lineEquation: computeLineEquation(m.p1, m.p2, normal),
    };
  });

  // Sortuj segmenty od najniższego Htop do najwyższego
  segments.sort((a, b) => a.hTop - b.hTop);

  return {
    storyPolygons: sanitizedStoryFootprints,
    zonePolygons: zoneFootprints,
    segments,
  };
}
