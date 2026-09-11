import polygonClipping from 'polygon-clipping';
import { Point2D, BuildingLoop } from '../../types/geometry';
import { APP_CONFIG } from '../../config/appConfig';
import { computePolygonArea, calculateSignedArea } from '../../utils/math2d/polygons';

export interface HardstandingPolygon {
  outer: Point2D[];
  holes: Point2D[][];
}

export interface HardstandingMeshResult {
  /** Zunifikowane i wygładzone (zaokrąglone na skrzyżowaniach) poligony siatki */
  polygons: HardstandingPolygon[];
  /** Łączna powierzchnia całej siatki utwardzeń w metrach kwadratowych */
  totalArea: number;
  /** Identyfikatory obiektów wchodzących w skład siatki */
  sourceBuildingIds: string[];
}

/**
 * Normalizuje i zamyka pierścień wielokąta dla polygon-clipping,
 * eliminując duplikaty punktów i zbyt małe krawędzie.
 */
function toNormalizedClippingRing(poly: Point2D[], precision: number = 1000): [number, number][] | null {
  if (!poly || poly.length < 3) return null;
  const ring: [number, number][] = [];
  for (const pt of poly) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const x = Math.round(pt.x * precision) / precision;
    const y = Math.round(pt.y * precision) / precision;
    if (ring.length === 0 || ring[ring.length - 1][0] !== x || ring[ring.length - 1][1] !== y) {
      ring.push([x, y]);
    }
  }
  if (ring.length >= 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
    ring.pop();
  }
  if (ring.length < 3) return null;
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/**
 * Wyznacza najkrótszą odległość punktu P od odcinka AB.
 */
function distancePointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Zwraca promień zaokrąglenia dla danego wierzchołka na podstawie najbliższej drogi.
 */
function getCornerRadiusForPoint(
  pt: Point2D,
  hardstandingBuildings: BuildingLoop[],
  defaultRadius: number
): number {
  let minDistance = Infinity;
  let chosenRadius = defaultRadius;

  for (const bldg of hardstandingBuildings) {
    const radius = bldg.roadCornerRadius ?? defaultRadius;
    if (bldg.vertices && bldg.vertices.length >= 2) {
      const n = bldg.vertices.length;
      for (let i = 0; i < n; i++) {
        const p1 = bldg.vertices[i];
        const p2 = bldg.vertices[(i + 1) % n];
        const dist = distancePointToSegment(pt, p1, p2);
        if (dist < minDistance) {
          minDistance = dist;
          chosenRadius = radius;
        }
      }
    }
  }

  return chosenRadius;
}

/**
 * Zaokrągla kąty wklęsłe (narożniki skrzyżowań/wcięć) w zadanym pierścieniu wielokąta.
 * @param ring Wierzchołki pierścienia (otwarta lista unikalnych wierzchołków bez zdublowanego końca)
 * @param isOuter Czy to pierścień zewnętrzny (CCW) czy otwór (CW)
 * @param hardstandingBuildings Obiekty źródłowe do przypisania promienia R
 */
export function filletConcaveCorners(
  ring: Point2D[],
  isOuter: boolean,
  hardstandingBuildings: BuildingLoop[],
  segmentsPerArc: number = 6
): Point2D[] {
  const n = ring.length;
  if (n < 3) return ring;

  // Upewniamy się, że orientacja pierścienia odpowiada konwencji:
  // Dla outer: CCW (signedArea > 0). Dla otworu: CW (signedArea < 0).
  const area = calculateSignedArea(ring);
  const isCurrentlyCCW = area > 0;
  const shouldReverse = isOuter ? !isCurrentlyCCW : isCurrentlyCCW;
  const rawPts = shouldReverse ? [...ring].reverse() : [...ring];

  // Czyszczenie mikro-odcinków i punktów współliniowych przed analizą łuków fillet
  const noDups: Point2D[] = [];
  for (let i = 0; i < rawPts.length; i++) {
    const pt = rawPts[i];
    if (noDups.length === 0) {
      noDups.push(pt);
      continue;
    }
    const prev = noDups[noDups.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.05) {
      noDups.push(pt);
    }
  }
  if (noDups.length > 2 && Math.hypot(noDups[0].x - noDups[noDups.length - 1].x, noDups[0].y - noDups[noDups.length - 1].y) <= 0.05) {
    noDups.pop();
  }

  // Usunięcie punktów współliniowych (collinear)
  const pts: Point2D[] = [];
  const m = noDups.length;
  for (let i = 0; i < m; i++) {
    const prev = noDups[(i - 1 + m) % m];
    const curr = noDups[i];
    const next = noDups[(i + 1) % m];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l1 = Math.hypot(d1x, d1y);
    const l2 = Math.hypot(d2x, d2y);
    if (l1 < 1e-4 || l2 < 1e-4) continue;
    const dot = (d1x * d2x + d1y * d2y) / (l1 * l2);
    // Jeśli punkt leży niemal idealnie na prostej (odchylenie < 2 stopnie)
    if (dot > 0.9994) continue;
    pts.push(curr);
  }
  if (pts.length < 3) return ring;

  const defaultRadius = APP_CONFIG.roadNetwork?.defaultCornerRadius ?? 5.0;
  const result: Point2D[] = [];
  const numPts = pts.length;

  for (let i = 0; i < numPts; i++) {
    const pPrev = pts[(i - 1 + numPts) % numPts];
    const pCurr = pts[i];
    const pNext = pts[(i + 1) % numPts];

    // Wektory krawędzi wchodzącej i wychodzącej
    const inDx = pCurr.x - pPrev.x;
    const inDy = pCurr.y - pPrev.y;
    const outDx = pNext.x - pCurr.x;
    const outDy = pNext.y - pCurr.y;

    const inLen = Math.hypot(inDx, inDy);
    const outLen = Math.hypot(outDx, outDy);

    if (inLen < 1e-4 || outLen < 1e-4) {
      result.push(pCurr);
      continue;
    }

    // Iloczyn wektorowy (2D cross product) krawędzi: inDir x outDir
    const cross = inDx * outDy - inDy * outDx;

    // W pierścieniu CCW:
    // cross > 0 => skręt w lewo (kąt wypukły, naturalny narożnik obrysu drogi)
    // cross < 0 => skręt w prawo (kąt wklęsły, czyli węzeł skrzyżowania / wcięcie krawężnika!)
    // W pierścieniu CW (otwór) sytuacja jest odwrotna.
    const isConcave = isOuter ? cross < -1e-4 : cross > 1e-4;

    if (!isConcave) {
      result.push(pCurr);
      continue;
    }

    // Narożnik jest wklęsły (skrzyżowanie dróg). Obliczamy promień zaokrąglenia R.
    const nominalR = getCornerRadiusForPoint(pCurr, hardstandingBuildings, defaultRadius);
    if (nominalR <= 0.05) {
      result.push(pCurr);
      continue;
    }

    // Wektor od pCurr do pPrev (u1) i od pCurr do pNext (u2)
    const u1x = -inDx / inLen;
    const u1y = -inDy / inLen;
    const u2x = outDx / outLen;
    const u2y = outDy / outLen;

    // Iloczyn skalarny: u1 . u2 = cos(theta)
    const dot = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
    const theta = Math.acos(dot); // kąt wewnętrzny narożnika (0 do PI)

    // Jeśli krawędzie są prawie równoległe (kąt < 5 st. lub > 175 st.), pomijamy fillet
    if (theta < 0.08 || theta > Math.PI - 0.08) {
      result.push(pCurr);
      continue;
    }

    // Kąt odchylenia beta = PI - theta
    // Odcinek styczny T = R * tan((PI - theta) / 2) = R / tan(theta / 2)
    const halfTheta = theta / 2;
    const tanHalf = Math.tan(halfTheta);
    if (tanHalf < 1e-4) {
      result.push(pCurr);
      continue;
    }

    const tangentT = nominalR / tanHalf;

    // Ograniczamy T do maksymalnie 45% długości sąsiednich krawędzi,
    // aby łuk nie nachodził na sąsiednie załamania krawężników.
    const maxT = Math.min(inLen, outLen) * 0.45;
    const effectiveT = Math.min(tangentT, maxT);
    const effectiveR = effectiveT * tanHalf;

    if (effectiveT < 0.02 || effectiveR < 0.02) {
      result.push(pCurr);
      continue;
    }

    // Punkty styczności:
    // pStart leży na krawędzi pPrev -> pCurr w odległości effectiveT od pCurr
    const pStart: Point2D = {
      x: pCurr.x + u1x * effectiveT,
      y: pCurr.y + u1y * effectiveT,
    };
    // pEnd leży na krawędzi pCurr -> pNext w odległości effectiveT od pCurr
    const pEnd: Point2D = {
      x: pCurr.x + u2x * effectiveT,
      y: pCurr.y + u2y * effectiveT,
    };

    // Wektor dwusiecznej narożnika
    const bisectX = u1x + u2x;
    const bisectY = u1y + u2y;
    const bisectLen = Math.hypot(bisectX, bisectY);
    if (bisectLen < 1e-5) {
      result.push(pCurr);
      continue;
    }

    const bDirX = bisectX / bisectLen;
    const bDirY = bisectY / bisectLen;

    // Odległość środka okręgu od pCurr wzdłuż dwusiecznej:
    // dCenter = R / sin(theta / 2)
    const dCenter = effectiveR / Math.sin(halfTheta);
    const center: Point2D = {
      x: pCurr.x + bDirX * dCenter,
      y: pCurr.y + bDirY * dCenter,
    };

    // Kąty promieni od środka okręgu do punktów styczności
    const angStart = Math.atan2(pStart.y - center.y, pStart.x - center.x);
    const angEnd = Math.atan2(pEnd.y - center.y, pEnd.x - center.x);

    // Wyznaczamy różnicę kątową wzdłuż kierunku skrętu
    let dAng = angEnd - angStart;
    while (dAng > Math.PI) dAng -= 2 * Math.PI;
    while (dAng < -Math.PI) dAng += 2 * Math.PI;

    // Generujemy punkty łuku od pStart do pEnd
    const steps = Math.max(3, segmentsPerArc);
    result.push(pStart);
    for (let s = 1; s < steps; s++) {
      const frac = s / steps;
      const ang = angStart + dAng * frac;
      result.push({
        x: center.x + Math.cos(ang) * effectiveR,
        y: center.y + Math.sin(ang) * effectiveR,
      });
    }
    result.push(pEnd);
  }

  return shouldReverse ? result.reverse() : result;
}

/**
 * Cache dla wyników siatki utwardzeń, by uniknąć re-kalkulacji co klatkę renderera.
 */
let cachedMeshKey = '';
let cachedMeshResult: HardstandingMeshResult | null = null;

function computeBuildingsMeshSignature(buildings: BuildingLoop[]): string {
  const parts: string[] = [];
  for (const b of buildings) {
    if (b.category === 'boundary' && b.areaType === 'utwardzenie' && b.isIncluded !== false) {
      const vLen = b.vertices?.length || 0;
      const first = vLen > 0 ? `${b.vertices[0].x.toFixed(2)},${b.vertices[0].y.toFixed(2)}` : '';
      const r = b.roadCornerRadius ?? 5;
      const w = b.sweepWidth ?? 0;
      parts.push(`${b.id}:${vLen}:${first}:${r}:${w}`);
    }
  }
  return parts.sort().join('|');
}

/**
 * Buduje zunifikowaną, niedestrukcyjną siatkę obszarów utwardzonych (dróg, wstęg, placów).
 * Łączy geometrie za pomocą polygon-clipping, usuwa szwy wewnętrzne i aplikuje zaokrąglenia łuków skrzyżowań.
 */
export function buildHardstandingMesh(
  buildings: BuildingLoop[],
  forceRefresh: boolean = false
): HardstandingMeshResult {
  const hardstandingBuildings = buildings.filter(
    (b) =>
      ((b.category === 'boundary' && b.areaType === 'utwardzenie') || (b.category === 'road' || b.roadSolveStatus !== undefined || (b.sweepWidth !== undefined && b.category !== 'building'))) &&
      b.isIncluded !== false &&
      b.vertices &&
      b.vertices.length >= 3
  );

  if (hardstandingBuildings.length === 0) {
    return {
      polygons: [],
      totalArea: 0,
      sourceBuildingIds: [],
    };
  }

  const signature = computeBuildingsMeshSignature(hardstandingBuildings);
  if (!forceRefresh && cachedMeshResult && cachedMeshKey === signature) {
    return cachedMeshResult;
  }

  // Przygotowanie wielokątów dla polygon-clipping
  const clipPolys: [number, number][][][] = [];
  for (const b of hardstandingBuildings) {
    const ring = toNormalizedClippingRing(b.vertices);
    if (ring) {
      clipPolys.push([ring]);
    }
  }

  if (clipPolys.length === 0) {
    const emptyResult = { polygons: [], totalArea: 0, sourceBuildingIds: [] };
    cachedMeshKey = signature;
    cachedMeshResult = emptyResult;
    return emptyResult;
  }

  let unionResult: polygonClipping.MultiPolygon;
  try {
    unionResult =
      clipPolys.length === 1
        ? (clipPolys as polygonClipping.MultiPolygon)
        : polygonClipping.union(clipPolys[0], ...clipPolys.slice(1));
  } catch (err) {
    console.warn('Błąd polygonClipping.union w buildHardstandingMesh, fallback do pojedynczych wielokątów:', err);
    unionResult = clipPolys as polygonClipping.MultiPolygon;
  }

  const segmentsPerArc = APP_CONFIG.roadNetwork?.filletSegmentsPerArc ?? 6;
  const resultPolygons: HardstandingPolygon[] = [];
  let totalArea = 0;

  for (const poly of unionResult) {
    if (!Array.isArray(poly) || poly.length === 0) continue;

    // 1. Zewnętrzny pierścień (poly[0])
    const rawOuter = poly[0];
    if (rawOuter.length < 3) continue;

    const isClosedOuter = rawOuter[0][0] === rawOuter[rawOuter.length - 1][0] && rawOuter[0][1] === rawOuter[rawOuter.length - 1][1];
    const outerEnd = isClosedOuter && rawOuter.length > 3 ? rawOuter.length - 1 : rawOuter.length;
    const outerPts: Point2D[] = rawOuter.slice(0, outerEnd).map(([x, y]) => ({ x, y }));

    // Zaokrąglenie wklęsłych narożników zewnętrznego pierścienia
    const filletedOuter = filletConcaveCorners(outerPts, true, hardstandingBuildings, segmentsPerArc);
    const outerArea = computePolygonArea(filletedOuter);
    let polyArea = outerArea;

    // 2. Otwory (poly[1..n])
    const filletedHoles: Point2D[][] = [];
    for (let hIdx = 1; hIdx < poly.length; hIdx++) {
      const rawHole = poly[hIdx];
      if (rawHole.length < 3) continue;
      const isClosedHole = rawHole[0][0] === rawHole[rawHole.length - 1][0] && rawHole[0][1] === rawHole[rawHole.length - 1][1];
      const holeEnd = isClosedHole && rawHole.length > 3 ? rawHole.length - 1 : rawHole.length;
      const holePts: Point2D[] = rawHole.slice(0, holeEnd).map(([x, y]) => ({ x, y }));

      const filletedHole = filletConcaveCorners(holePts, false, hardstandingBuildings, segmentsPerArc);
      const holeArea = computePolygonArea(filletedHole);
      // Mikroskopijne otwory (< 1 m²) to szum numeryczny z unii polygon-clipping
      // (styczne/prawie pokrywające się krawędzie wejściowych obiektów), a nie realne
      // wyspy zieleni — traktujemy je jako pokryte utwardzeniem zamiast zostawiać
      // jako dziurę, żeby nie zaniżać pola siatki i nie pokazywać fałszywej "wyspy".
      if (holeArea < 1.0) continue;
      polyArea -= holeArea;
      filletedHoles.push(filletedHole);
    }

    totalArea += Math.max(0, polyArea);
    resultPolygons.push({
      outer: filletedOuter,
      holes: filletedHoles,
    });
  }

  const finalResult: HardstandingMeshResult = {
    polygons: resultPolygons,
    totalArea,
    sourceBuildingIds: hardstandingBuildings.map((b) => b.id),
  };

  cachedMeshKey = signature;
  cachedMeshResult = finalResult;
  return finalResult;
}

/**
 * Oblicza pole powierzchni utwardzeń znajdujących się wewnątrz granic działek badanych (Pdz).
 * Wykonuje przecięcie przestrzenne zunifikowanych wielokątów utwardzeń z działką badaną.
 */
export function computeHardstandingAreaInPlot(
  meshPolygons: HardstandingPolygon[],
  plotBoundaries: Array<{ vertices: Point2D[] }>
): number {
  if (!meshPolygons || meshPolygons.length === 0 || !plotBoundaries || plotBoundaries.length === 0) {
    return 0;
  }

  const validBoundaries = plotBoundaries
    .map((b) => b.vertices)
    .filter((v) => Array.isArray(v) && v.length >= 3);

  if (validBoundaries.length === 0) return 0;

  const meshSubjectPolys: [number, number][][][] = [];
  for (const p of meshPolygons) {
    const outerRing = toNormalizedClippingRing(p.outer);
    if (!outerRing) continue;
    const polyRings: [number, number][][] = [outerRing];
    for (const hole of p.holes) {
      const holeRing = toNormalizedClippingRing(hole);
      if (holeRing) polyRings.push(holeRing);
    }
    meshSubjectPolys.push(polyRings);
  }

  if (meshSubjectPolys.length === 0) return 0;

  const plotClipPolys: [number, number][][][] = [];
  for (const bVerts of validBoundaries) {
    const ring = toNormalizedClippingRing(bVerts);
    if (ring) {
      plotClipPolys.push([ring]);
    }
  }

  if (plotClipPolys.length === 0) return 0;

  try {
    const plotUnion: polygonClipping.MultiPolygon =
      plotClipPolys.length === 1
        ? (plotClipPolys as polygonClipping.MultiPolygon)
        : polygonClipping.union(plotClipPolys[0], ...plotClipPolys.slice(1));

    const meshUnion: polygonClipping.MultiPolygon =
      meshSubjectPolys.length === 1
        ? (meshSubjectPolys as polygonClipping.MultiPolygon)
        : polygonClipping.union(meshSubjectPolys[0], ...meshSubjectPolys.slice(1));

    const intersection = polygonClipping.intersection(meshUnion, plotUnion);

    let areaInPlot = 0;
    for (const poly of intersection) {
      if (!Array.isArray(poly) || poly.length === 0) continue;
      const outerRing = poly[0];
      areaInPlot += computePolygonArea(outerRing.map(([x, y]) => ({ x, y })));
      for (let i = 1; i < poly.length; i++) {
        const holeRing = poly[i];
        areaInPlot -= computePolygonArea(holeRing.map(([x, y]) => ({ x, y })));
      }
    }

    return Math.max(0, areaInPlot);
  } catch (err) {
    console.warn('Błąd w computeHardstandingAreaInPlot:', err);
    return 0;
  }
}
