import { Point2D, Vector2D, BuildingLoop, Edge2D, HourlyShadowLoop, ShadowAnalysisResult } from '../types/geometry';
import { calculateSolarPosition } from './solar';
import polygonClipping from 'polygon-clipping';


/**
 * Calculates the signed area of a 2D polygon using the Shoelace formula / Green's theorem.
 * Positive => Counter-Clockwise (CCW)
 * Negative => Clockwise (CW)
 */
export function calculateSignedArea(points: Point2D[]): number {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
      continue;
    }
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
}

export function isPolygonCCW(points: Point2D[]): boolean {
  if (!points || points.length < 3) return true;
  return calculateSignedArea(points) > 0;
}

/**
 * Calculates the outward unit normal vector for segment P1->P2.
 * For a CCW polygon, the outward normal is ( (y2-y1)/L, -(x2-x1)/L ).
 * For a CW polygon, we flip the normal to keep it pointing outward.
 */
export function calculateOutwardNormal(
  p1: Point2D,
  p2: Point2D,
  polygonIsCCW: boolean = true
): Vector2D {
  if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
    return { x: 0, y: 1 };
  }
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);

  if (length < 1e-9) {
    return { x: 0, y: 1 };
  }

  // Base normal for CCW: (dy / L, -dx / L)
  let nx = dy / length;
  let ny = -dx / length;

  if (!polygonIsCCW) {
    nx = -nx;
    ny = -ny;
  }

  return { x: nx, y: ny };
}

/**
 * Checks if a point is inside a polygon using ray casting algorithm.
 */
export function isPointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !vertices || vertices.length < 3) {
    return false;
  }
  let inside = false;
  const { x, y } = point;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    if (!vi || !vj || !Number.isFinite(vi.x) || !Number.isFinite(vi.y) || !Number.isFinite(vj.x) || !Number.isFinite(vj.y)) {
      continue;
    }
    const xi = vi.x,
      yi = vi.y;
    const xj = vj.x,
      yj = vj.y;

    const denom = yj - yi;
    if (Math.abs(denom) < 1e-9) {
      continue;
    }

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Ray-segment intersection in 2D.
 * Ray: R(t) = origin + t * dir, t >= 0
 * Segment: S(u) = p1 + u * (p2 - p1), u in [0, 1]
 */
export function raySegmentIntersection(
  origin: Point2D,
  dir: Vector2D,
  p1: Point2D,
  p2: Point2D
): { hit: boolean; distance: number; point?: Point2D } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const cross = dir.x * dy - dir.y * dx;
  if (Math.abs(cross) < 1e-9) {
    return { hit: false, distance: Infinity }; // Parallel
  }

  const ox = p1.x - origin.x;
  const oy = p1.y - origin.y;

  const t = (ox * dy - oy * dx) / cross;
  const u = (ox * dir.y - oy * dir.x) / cross;

  if (t >= 1e-5 && u >= 0 && u <= 1) {
    return {
      hit: true,
      distance: t,
      point: {
        x: origin.x + t * dir.x,
        y: origin.y + t * dir.y,
      },
    };
  }

  return { hit: false, distance: Infinity };
}

/**
 * Distance from point P to line segment AB.
 */
export function distancePointToSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): number {
  if (!p || !a || !b || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    return Infinity;
  }
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/**
 * Generates sampled test points along a segment with a given interval in meters.
 */
export function sampleSegmentPoints(
  p1: Point2D,
  p2: Point2D,
  interval: number = 0.5
): { point: Point2D; ratio: number }[] {
  if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
    return [{ point: p1 || { x: 0, y: 0 }, ratio: 0.5 }];
  }
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (len < 1e-6) return [{ point: p1, ratio: 0.5 }];

  const safeInterval = Math.max(0.01, interval);
  const count = Math.max(1, Math.round(len / safeInterval));
  const points: { point: Point2D; ratio: number }[] = [];

  // Sample interior points along the segment (avoiding degenerate 0.0 and 1.0 exact corner vertices)
  for (let i = 0; i < count; i++) {
    const ratio = (i + 0.5) / count;
    points.push({
      point: {
        x: p1.x + ratio * (p2.x - p1.x),
        y: p1.y + ratio * (p2.y - p1.y),
      },
      ratio,
    });
  }

  return points;
}

/**
 * Analityczne przecięcie odcinka AB z kołem o środku w punkcie P i promieniu R.
 * Zwraca część odcinka znajdującą się wewnątrz koła [p1, p2] lub null jeśli odcinek jest w całości na zewnątrz.
 */
export function clipSegmentToCircle(
  center: Point2D,
  radius: number,
  a: Point2D,
  b: Point2D
): { p1: Point2D; p2: Point2D; t1: number; t2: number } | null {

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) {
    const d = Math.hypot(a.x - center.x, a.y - center.y);
    return d <= radius + 1e-4 ? { p1: a, p2: a, t1: 0, t2: 0 } : null;
  }

  const ox = a.x - center.x;
  const oy = a.y - center.y;
  const B = 2 * (ox * dx + oy * dy);
  const C = ox * ox + oy * oy - radius * radius;
  const disc = B * B - 4 * len2 * C;

  const daSq = ox * ox + oy * oy;
  const dbSq = (b.x - center.x) ** 2 + (b.y - center.y) ** 2;
  const rSq = radius * radius;

  let tMin = 0;
  let tMax = 1;

  if (daSq <= rSq + 1e-4 && dbSq <= rSq + 1e-4) {
    // Przypadek 1: Oba wierzchołki wewnątrz okręgu
    tMin = 0;
    tMax = 1;
  } else if (disc >= 0) {
    const sq = Math.sqrt(disc);
    const root1 = (-B - sq) / (2 * len2);
    const root2 = (-B + sq) / (2 * len2);
    const rA = Math.min(root1, root2);
    const rB = Math.max(root1, root2);

    // Część wspólna [0, 1] oraz [rA, rB]
    tMin = Math.max(0, rA);
    tMax = Math.min(1, rB);

    if (tMax < tMin - 1e-6) return null; // Całkowicie poza
  } else {
    // Brak przecięcia
    return null;
  }

  return {
    p1: { x: a.x + tMin * dx, y: a.y + tMin * dy },
    p2: { x: a.x + tMax * dx, y: a.y + tMax * dy },
    t1: tMin,
    t2: tMax,
  };
}

/**
 * Czysto analityczne sprawdzenie czy wektor kierunkowy 'dir' leży w stożku kątowym
 * wyznaczonym przez odcinek C1-C2 względem punktu obserwacji 'origin' (bez raycastingu).
 */
export function isDirectionInSegmentCone(
  origin: Point2D,
  dir: Vector2D,
  c1: Point2D,
  c2: Point2D
): boolean {
  const v1x = c1.x - origin.x;
  const v1y = c1.y - origin.y;
  const v2x = c2.x - origin.x;
  const v2y = c2.y - origin.y;

  // Sprawdzenie zwrotu (kierunek musi być skierowany w stronę odcinka)
  if (dir.x * (v1x + v2x) + dir.y * (v1y + v2y) <= 0) {
    return false;
  }

  const cross12 = v1x * v2y - v1y * v2x;

  if (cross12 > 1e-9) {
    // v1 -> v2 jest CCW
    const c1d = v1x * dir.y - v1y * dir.x;
    const dv2 = dir.x * v2y - dir.y * v2x;
    return c1d >= -1e-7 && dv2 >= -1e-7;
  } else if (cross12 < -1e-9) {
    // v1 -> v2 jest CW
    const c2d = v2x * dir.y - v2y * dir.x;
    const dv1 = dir.x * v1y - dir.y * v1x;
    return c2d >= -1e-7 && dv1 >= -1e-7;
  } else {
    // Punkty c1 i c2 są współliniowe z origin
    const dot1 = dir.x * v1x + dir.y * v1y;
    return dot1 > 0;
  }
}

/**
 * Computes the 2D convex hull of a set of 2D points using Andrew's monotone chain algorithm.
 * Time complexity: O(n log n).
 * Returns vertices in counter-clockwise order.
 */
export function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  // Lower hull
  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove the last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

/**
 * Zwraca wektor przesunięcia cienia na płaszczyźnie poziomej.
 * @param sunAzimuthRad - azymut słońca w radianach (0 = Północ, Pi/2 = Wschód, Pi = Południe, 3Pi/2 = Zachód)
 * @param sunElevationRad - kąt wzniesienia słońca nad horyzontem w radianach
 * @param height - wysokość budynku/ściany
 */
export function getShadowOffsetVector(
  sunAzimuthRad: number,
  sunElevationRad: number,
  height: number
): Point2D {
  if (sunElevationRad <= 0.001 || height <= 0) {
    return { x: 0, y: 0 };
  }

  // Długość rzutu cienia na ziemię: L = H / tan(elewacja)
  const shadowLength = height / Math.tan(sunElevationRad);

  // Wektor cienia skierowany przeciwnie do kierunku padania promieni słonecznych:
  // Kierunek do słońca na płaszczyźnie poziomej: (sin(azimuth), cos(azimuth))
  // Kierunek cienia: przeciwny do źródła światła
  const dx = -Math.sin(sunAzimuthRad) * shadowLength;
  const dy = -Math.cos(sunAzimuthRad) * shadowLength;

  return { x: dx, y: dy };
}

/**
 * Ekstrakcja krawędzi sylwetkowych (Silhouette Edges) z poligonu budynku.
 * Filtruje krawędzie wewnętrzne i zwraca wyłącznie te, które graniczą ze strefą światła i cienia.
 * 
 * Złożoność: O(N) zamiast sprawdzania wszystkich par wierzchołków.
 */
export function extractSilhouetteEdges(
  polygon: Point2D[],
  sunRayDir: Point2D // Znormalizowany wektor 2D kierunku światła (od słońca do sceny)
): Edge2D[] {
  const n = polygon?.length || 0;
  if (n < 3) return [];

  const isCCW = isPolygonCCW(polygon);
  const silhouetteEdges: Edge2D[] = [];

  // Sprawdzamy orientację krawędzi względem promienia słońca (Backface Culling)
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // Wektor krawędzi: (dx, dy)
    const edgeX = p2.x - p1.x;
    const edgeY = p2.y - p1.y;

    // Wektor normalny zewnętrzny
    let normX = edgeY;
    let normY = -edgeX;
    if (!isCCW) {
      normX = -normX;
      normY = -normY;
    }

    // Iloczyn skalarny wektora normalnego z wektorem promieni słonecznych
    const dot = normX * sunRayDir.x + normY * sunRayDir.y;

    // Jeśli krawędź jest skierowana ku słońcu (dot < 0), jest oświetlona i rzuca zewnętrzny cień
    if (dot < 0) {
      silhouetteEdges.push({ p1, p2 });
    }
  }

  return silhouetteEdges;
}

/**
 * Sprawdza czy wielokąt 2D jest ściśle wypukły (Convex).
 */
export function isPolygonConvex(polygon: Point2D[]): boolean {
  const n = polygon?.length || 0;
  if (n < 3) return false;
  let prevCross = 0;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const p3 = polygon[(i + 2) % n];
    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x;
    const dy2 = p3.y - p2.y;
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) > 1e-7) {
      if (prevCross === 0) {
        prevCross = cross;
      } else if ((cross > 0 && prevCross < 0) || (cross < 0 && prevCross > 0)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Buduje precyzyjny wielokąt cienia dla pojedynczego budynku o stałej wysokości w danym momencie czasu.
 * Tworzy pełny rzut dachu i ścian pionowych na płaszczyznę terenu.
 */
export function computeFastShadowPolygon(
  polygon: Point2D[],
  sunAzimuthRad: number,
  sunElevationRad: number,
  height: number
): Point2D[] {
  if (!polygon || polygon.length < 3 || height <= 0 || sunElevationRad <= 0.001) {
    return polygon ? [...polygon] : [];
  }

  const offset = getShadowOffsetVector(sunAzimuthRad, sunElevationRad, height);
  if (offset.x === 0 && offset.y === 0) return [...polygon];

  // Dla wielokątów wypukłych: otoczka wypukła (podstawa + zrzutowany dach)
  if (isPolygonConvex(polygon)) {
    const shadowPoints: Point2D[] = [
      ...polygon,
      ...polygon.map((v) => ({ x: v.x + offset.x, y: v.y + offset.y })),
    ];
    return computeConvexHull(shadowPoints);
  }

  // Dla wielokątów wklęsłych: suma boolowska podstawy, rzutu dachu i czworokątów ścian
  const clippingPolys: [number, number][][][] = [];

  // Podstawa
  const baseRing: [number, number][] = polygon.map((p) => [p.x, p.y]);
  baseRing.push([polygon[0].x, polygon[0].y]);
  clippingPolys.push([baseRing]);

  // Dach
  const roofRing: [number, number][] = polygon.map((p) => [p.x + offset.x, p.y + offset.y]);
  roofRing.push([polygon[0].x + offset.x, polygon[0].y + offset.y]);
  clippingPolys.push([roofRing]);

  // Ściany pionowe
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const quadRing: [number, number][] = [
      [p1.x, p1.y],
      [p2.x, p2.y],
      [p2.x + offset.x, p2.y + offset.y],
      [p1.x + offset.x, p1.y + offset.y],
      [p1.x, p1.y],
    ];
    clippingPolys.push([quadRing]);
  }

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    if (unionResult.length > 0 && unionResult[0].length > 0) {
      const ring = unionResult[0][0];
      const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
      const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
      return ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y }));
    }
  } catch {
    // Fallback do otoczki wypukłej w razie błędu geometrii
  }

  const fallbackPoints: Point2D[] = [
    ...polygon,
    ...polygon.map((v) => ({ x: v.x + offset.x, y: v.y + offset.y })),
  ];
  return computeConvexHull(fallbackPoints);
}

const buildingEnvelopeCache = new Map<string, Point2D[]>();
const buildingFastShadowCache = new Map<string, Point2D[]>();

/**
 * Wyznacza obwiednię maksymalnego zasięgu cienia (Shadow Envelope) rzucanego przez budynek
 * w oknie czasowym równonocy (§ 56 WT) w oparciu o pełne godziny od górowania słońca (0, +-1h, +-2h, +-3h, +-4h, +-5h).
 */
export function computeBuildingShadowEnvelope(
  building: BuildingLoop,
  latitude: number = 52.23,
  equinoxDate: 'spring' | 'autumn' = 'spring',
  isChildcare: boolean = false,
  longitude: number = 21.01
): Point2D[] {
  const vertices = building.vertices;
  if (!vertices || vertices.length < 3) return [];

  const height = building.defaultHeight;
  if (height <= 0) return [...vertices];

  const cacheKey = `${building.id}|${height}|${latitude}|${longitude}|${equinoxDate}|${isChildcare}|${vertices[0].x.toFixed(2)},${vertices[0].y.toFixed(2)},${vertices.length}`;
  const cached = buildingEnvelopeCache.get(cacheKey);
  if (cached) return cached;

  const month = equinoxDate === 'autumn' ? 9 : 3;
  const day = equinoxDate === 'autumn' ? 23 : 21;

  const noonPos = calculateSolarPosition(latitude, longitude, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;
  const hourOffsets = isChildcare ? [-4, 4] : [-5, 5];

  const isConvex = isPolygonConvex(vertices);

  if (isConvex) {
    const shadowPoints: Point2D[] = [...vertices];

    for (const offset of hourOffsets) {
      const hour = noonHour + offset;
      const pos = calculateSolarPosition(latitude, longitude, month, day, hour);
      if (pos.elevationDeg > 0.5) {
        const azRad = pos.azimuthDeg * (Math.PI / 180);
        const elevRad = pos.elevationDeg * (Math.PI / 180);
        const sOffset = getShadowOffsetVector(azRad, elevRad, height);
        for (const v of vertices) {
          shadowPoints.push({ x: v.x + sOffset.x, y: v.y + sOffset.y });
        }
      }
    }

    const result = computeConvexHull(shadowPoints);
    if (buildingEnvelopeCache.size > 2000) buildingEnvelopeCache.clear();
    buildingEnvelopeCache.set(cacheKey, result);
    return result;
  }

  // Dla wielokątów wklęsłych: unia obrysów godzinowych
  const hourlyPolys: Point2D[][] = [];
  for (const offset of hourOffsets) {
    const hour = noonHour + offset;
    const pos = calculateSolarPosition(latitude, longitude, month, day, hour);
    if (pos.elevationDeg > 0.5) {
      const azRad = pos.azimuthDeg * (Math.PI / 180);
      const elevRad = pos.elevationDeg * (Math.PI / 180);
      const poly = computeFastShadowPolygon(vertices, azRad, elevRad, height);
      if (poly.length >= 3) {
        hourlyPolys.push(poly);
      }
    }
  }

  const unionResult = unionPolygonLoops(hourlyPolys);
  const result = unionResult.length > 0 ? unionResult[0] : computeConvexHull(vertices);
  if (buildingEnvelopeCache.size > 2000) buildingEnvelopeCache.clear();
  buildingEnvelopeCache.set(cacheKey, result);
  return result;
}

/**
 * Pomocnicza funkcja łącząca poligony za pomocą polygonClipping.union
 */
function unionPolygonLoops(polygons: Point2D[][]): Point2D[][] {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return polygons;

  const clippingPolys: [number, number][][][] = [];
  for (const poly of polygons) {
    if (poly.length >= 3) {
      const ring: [number, number][] = poly.map((p) => [p.x, p.y]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      clippingPolys.push([ring]);
    }
  }

  if (clippingPolys.length === 0) return [];

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    const resultLoops: Point2D[][] = [];

    for (const polygon of unionResult) {
      for (const ring of polygon) {
        if (ring.length >= 3) {
          const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
          const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
          resultLoops.push(ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y })));
        }
      }
    }
    return resultLoops;
  } catch {
    return polygons;
  }
}

/**
 * Wyznacza sumę boolowską (Boolean Union) zakresów cienia wszystkich obiektów badanych.
 * Zwraca tablicę pętli konturów (Point2D[][]), zachowując rozłączne obiekty, wcięcia i otwory.
 */
export function computeCombinedShadowEnvelope(
  buildings: BuildingLoop[],
  latitude: number = 52.23,
  equinoxDate: 'spring' | 'autumn' = 'spring',
  longitude: number = 21.01
): Point2D[][] {
  const testedBuildings = buildings.filter(
    (b) => b.isTested && b.isIncluded !== false && b.vertices && b.vertices.length >= 3
  );
  if (testedBuildings.length === 0) return [];

  const buildingPolys: Point2D[][] = [];
  for (const bldg of testedBuildings) {
    const isChildcare = bldg.segments.some((s) => s.buildingType === 'childcare');
    const env = computeBuildingShadowEnvelope(bldg, latitude, equinoxDate, isChildcare, longitude);
    if (env.length >= 3) {
      buildingPolys.push(env);
    }
  }

  return unionPolygonLoops(buildingPolys);
}

/**
 * Kompleksowa analiza cienia obiektów badanych:
 * 1. Wyznacza łączną sumaryczną obwiednię cienia równonocy (envelopeLoops).
 * 2. Generuje godzinowe obrysy cienia dla każdej pełnej godziny od górowania słońca (0, +-1h, +-2h, +-3h, +-4h, +-5h).
 * 3. Mierzy czas wykonania operacji (calculationTimeMs).
 */
export function computeFullShadowAnalysis(
  buildings: BuildingLoop[],
  latitude: number = 52.23,
  longitude: number = 21.01,
  equinoxDate: 'spring' | 'autumn' = 'spring'
): ShadowAnalysisResult {
  const t0 = performance.now();

  const testedBuildings = buildings.filter(
    (b) => b.isTested && b.isIncluded !== false && b.vertices && b.vertices.length >= 3
  );

  if (testedBuildings.length === 0) {
    return {
      envelopeLoops: [],
      hourlyShadows: [],
      calculationTimeMs: performance.now() - t0,
    };
  }

  const month = equinoxDate === 'autumn' ? 9 : 3;
  const day = equinoxDate === 'autumn' ? 23 : 21;

  const noonPos = calculateSolarPosition(latitude, longitude, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;

  // 1. Obwiednia sumaryczna
  const buildingEnvelopes: Point2D[][] = [];
  for (const bldg of testedBuildings) {
    const isChildcare = bldg.segments.some((s) => s.buildingType === 'childcare');
    const env = computeBuildingShadowEnvelope(bldg, latitude, equinoxDate, isChildcare, longitude);
    if (env.length >= 3) {
      buildingEnvelopes.push(env);
    }
  }
  const envelopeLoops = unionPolygonLoops(buildingEnvelopes);

  // 2. Obrysy godzinowe krańcowe dla kroków: -5h oraz +5h
  const anyChildcare = testedBuildings.some((b) => b.segments.some((s) => s.buildingType === 'childcare'));
  const allOffsets = anyChildcare ? [-4, 4] : [-5, 5];
  const hourlyShadows: HourlyShadowLoop[] = [];

  for (const offset of allOffsets) {
    const hour = noonHour + offset;
    const pos = calculateSolarPosition(latitude, longitude, month, day, hour);
    if (pos.elevationDeg > 0.5) {
      const azRad = pos.azimuthDeg * (Math.PI / 180);
      const elevRad = pos.elevationDeg * (Math.PI / 180);

      const hourPolys: Point2D[][] = [];
      for (const bldg of testedBuildings) {
        const isChildcare = bldg.segments.some((s) => s.buildingType === 'childcare');
        if (isChildcare && Math.abs(offset) > 4) continue;

        const fastKey = `${bldg.id}|${bldg.defaultHeight}|${azRad.toFixed(3)}|${elevRad.toFixed(3)}|${bldg.vertices[0].x.toFixed(2)},${bldg.vertices[0].y.toFixed(2)},${bldg.vertices.length}`;
        let poly = buildingFastShadowCache.get(fastKey);
        if (!poly) {
          poly = computeFastShadowPolygon(bldg.vertices, azRad, elevRad, bldg.defaultHeight);
          if (buildingFastShadowCache.size > 5000) buildingFastShadowCache.clear();
          if (poly.length >= 3) buildingFastShadowCache.set(fastKey, poly);
        }

        if (poly.length >= 3) {
          hourPolys.push(poly);
        }
      }

      if (hourPolys.length > 0) {
        hourlyShadows.push({
          hourOffset: offset,
          hourDecimal: hour,
          azimuthDeg: pos.azimuthDeg,
          elevationDeg: pos.elevationDeg,
          polygons: unionPolygonLoops(hourPolys),
        });
      }
    }
  }

  const calculationTimeMs = performance.now() - t0;

  return {
    envelopeLoops,
    hourlyShadows,
    calculationTimeMs,
  };
}



/**
 * Offsets a single polygon edge parallel to itself while preserving adjacent edge directions.
 * @param vertices Cyclic vertices of the polygon
 * @param edgeIndex Index of edge to offset (from vertices[edgeIndex] to vertices[(edgeIndex+1)%n])
 * @param delta Vector displacement { x, y } in world units (meters)
 */
export function offsetPolygonEdge(
  vertices: Point2D[],
  edgeIndex: number,
  delta: Point2D
): Point2D[] {
  const n = vertices.length;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n) return vertices;

  const isCCW = isPolygonCCW(vertices);
  const v1 = vertices[edgeIndex];
  const v2 = vertices[(edgeIndex + 1) % n];
  const normal = calculateOutwardNormal(v1, v2, isCCW);

  // Normal displacement (projection of mouse delta onto edge normal)
  const d = delta.x * normal.x + delta.y * normal.y;
  if (Math.abs(d) < 1e-6) return vertices;

  // Previous edge V0 -> V1
  const prevIdx = (edgeIndex - 1 + n) % n;
  const v0 = vertices[prevIdx];
  const dPrev = { x: v1.x - v0.x, y: v1.y - v0.y };
  const denomPrev = dPrev.x * normal.x + dPrev.y * normal.y;

  let newV1: Point2D;
  if (Math.abs(denomPrev) > 1e-4) {
    const factor = d / denomPrev;
    newV1 = { x: v1.x + factor * dPrev.x, y: v1.y + factor * dPrev.y };
  } else {
    newV1 = { x: v1.x + d * normal.x, y: v1.y + d * normal.y };
  }

  // Next edge V2 -> V3
  const nextIdx = (edgeIndex + 2) % n;
  const v3 = vertices[nextIdx];
  const dNext = { x: v3.x - v2.x, y: v3.y - v2.y };
  const denomNext = dNext.x * normal.x + dNext.y * normal.y;

  let newV2: Point2D;
  if (Math.abs(denomNext) > 1e-4) {
    const factor = d / denomNext;
    newV2 = { x: v2.x + factor * dNext.x, y: v2.y + factor * dNext.y };
  } else {
    newV2 = { x: v2.x + d * normal.x, y: v2.y + d * normal.y };
  }

  // Sanity check: minimum edge length
  const newEdgeLen = Math.hypot(newV2.x - newV1.x, newV2.y - newV1.y);
  if (newEdgeLen < 0.1) return vertices;

  const newVerts = [...vertices];
  newVerts[edgeIndex] = newV1;
  newVerts[(edgeIndex + 1) % n] = newV2;

  // Verify non-zero area
  let area = 0;
  for (let i = 0; i < n; i++) {
    const pA = newVerts[i];
    const pB = newVerts[(i + 1) % n];
    area += pA.x * pB.y - pB.x * pA.y;
  }
  if (Math.abs(area) < 0.2) return vertices;

  return newVerts;
}

/**
 * Updates a BuildingLoop's segments and winding when its vertices change.
 */
export function updateBuildingWithNewVertices(
  building: BuildingLoop,
  newVertices: Point2D[]
): BuildingLoop {
  const isCCW = isPolygonCCW(newVertices);
  const updatedSegments = newVertices.map((p1, idx) => {
    const p2 = newVertices[(idx + 1) % newVertices.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const normal = calculateOutwardNormal(p1, p2, isCCW);
    const existingSeg = building.segments[idx] || building.segments[0];

    return {
      ...existingSeg,
      id: existingSeg ? existingSeg.id : `${building.id}-seg-${idx + 1}`,
      p1,
      p2,
      normal,
      length: len,
      angleRad: Math.atan2(dy, dx),
    };
  });

  return {
    ...building,
    vertices: newVertices,
    segments: updatedSegments,
    isClockwise: !isCCW,
  };
}

/**
 * Computes closest point on line segment AB to point P.
 */
export function closestPointOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return { ...a };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

export interface LinearDimensionResult {
  p1: Point2D;
  p2: Point2D;
  distance: number;
  isParallel: boolean;
}

/**
 * Computes linear dimension between two line segments S1=[A1, B1] and S2=[A2, B2].
 * If segments are parallel, connects mutually projected overlapping points.
 * If segments are non-parallel, connects the pair of closest points on the segments.
 */
export function computeLinearDimension(
  a1: Point2D,
  b1: Point2D,
  a2: Point2D,
  b2: Point2D
): LinearDimensionResult {
  const v1 = { x: b1.x - a1.x, y: b1.y - a1.y };
  const v2 = { x: b2.x - a2.x, y: b2.y - a2.y };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 < 1e-5 || len2 < 1e-5) {
    return { p1: a1, p2: a2, distance: Math.hypot(a2.x - a1.x, a2.y - a1.y), isParallel: false };
  }

  const cross = Math.abs(v1.x * v2.y - v1.y * v2.x) / (len1 * len2);
  const isParallel = cross < 0.05; // ~3 degrees tolerance

  if (isParallel) {
    // Project midpoint of s1 onto s2
    const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    const proj1 = closestPointOnSegment(mid1, a2, b2);
    // Project midpoint of s2 onto s1
    const mid2 = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
    const proj2 = closestPointOnSegment(mid2, a1, b1);

    const d1 = Math.hypot(mid1.x - proj1.x, mid1.y - proj1.y);
    const d2 = Math.hypot(proj2.x - mid2.x, proj2.y - mid2.y);

    const u1 = ((mid1.x - a2.x) * v2.x + (mid1.y - a2.y) * v2.y) / (len2 * len2);
    const u2 = ((mid2.x - a1.x) * v1.x + (mid2.y - a1.y) * v1.y) / (len1 * len1);

    if (u1 >= 0.02 && u1 <= 0.98) {
      return { p1: closestPointOnSegment(proj1, a1, b1), p2: proj1, distance: d1, isParallel: true };
    }
    if (u2 >= 0.02 && u2 <= 0.98) {
      return { p1: proj2, p2: closestPointOnSegment(proj2, a2, b2), distance: d2, isParallel: true };
    }
  }

  // Non-parallel or non-overlapping: test all endpoint pairings to find closest distance
  const candidates: { p1: Point2D; p2: Point2D; d: number }[] = [];

  const c1_a1 = closestPointOnSegment(a1, a2, b2);
  candidates.push({ p1: a1, p2: c1_a1, d: Math.hypot(a1.x - c1_a1.x, a1.y - c1_a1.y) });

  const c1_b1 = closestPointOnSegment(b1, a2, b2);
  candidates.push({ p1: b1, p2: c1_b1, d: Math.hypot(b1.x - c1_b1.x, b1.y - c1_b1.y) });

  const c2_a2 = closestPointOnSegment(a2, a1, b1);
  candidates.push({ p1: c2_a2, p2: a2, d: Math.hypot(c2_a2.x - a2.x, c2_a2.y - a2.y) });

  const c2_b2 = closestPointOnSegment(b2, a1, b1);
  candidates.push({ p1: c2_b2, p2: b2, d: Math.hypot(c2_b2.x - b2.x, c2_b2.y - b2.y) });

  const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const c_mid1 = closestPointOnSegment(mid1, a2, b2);
  candidates.push({ p1: mid1, p2: c_mid1, d: Math.hypot(mid1.x - c_mid1.x, mid1.y - c_mid1.y) });

  const mid2 = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
  const c_mid2 = closestPointOnSegment(mid2, a1, b1);
  candidates.push({ p1: c_mid2, p2: mid2, d: Math.hypot(c_mid2.x - mid2.x, c_mid2.y - mid2.y) });

  candidates.sort((a, b) => a.d - b.d);
  return { p1: candidates[0].p1, p2: candidates[0].p2, distance: candidates[0].d, isParallel };
}

export interface AngularDimensionResult {
  angleDeg: number;
  intersection: Point2D;
  mid1: Point2D;
  mid2: Point2D;
  ang1: number;
  ang2: number;
  isParallel: boolean;
  touchRadiusWorld: number;
  touchPoint1: Point2D;
  touchPoint2: Point2D;
}

/**
 * Computes angular dimension between two line segments S1=[A1, B1] and S2=[A2, B2].
 */
export function computeAngularDimension(
  a1: Point2D,
  b1: Point2D,
  a2: Point2D,
  b2: Point2D
): AngularDimensionResult {
  const v1 = { x: b1.x - a1.x, y: b1.y - a1.y };
  const v2 = { x: b2.x - a2.x, y: b2.y - a2.y };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 < 1e-5 || len2 < 1e-5) {
    return {
      angleDeg: 0,
      intersection: a1,
      mid1: a1,
      mid2: a2,
      ang1: 0,
      ang2: 0,
      isParallel: true,
      touchRadiusWorld: 2.0,
      touchPoint1: a1,
      touchPoint2: a2,
    };
  }

  const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const rawAngleRad = Math.acos(clampedDot);
  let angleDeg = (rawAngleRad * 180) / Math.PI;
  if (angleDeg > 90) angleDeg = 180 - angleDeg; // Standard acute angle between two lines

  const denom = v1.x * v2.y - v1.y * v2.x;
  const isParallel = Math.abs(denom) < 1e-5 || angleDeg < 0.2;

  let intersection: Point2D;
  if (isParallel) {
    intersection = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
  } else {
    const t = ((a2.x - a1.x) * v2.y - (a2.y - a1.y) * v2.x) / denom;
    intersection = { x: a1.x + t * v1.x, y: a1.y + t * v1.y };
  }

  const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const mid2 = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };

  // Determine vector directions along the segment rays away from intersection
  const ang1 = Math.atan2(mid1.y - intersection.y, mid1.x - intersection.x);
  const ang2 = Math.atan2(mid2.y - intersection.y, mid2.x - intersection.x);

  // Distance from intersection to midpoints of both segments to keep the arc close to midpoints
  const dMid1 = Math.hypot(mid1.x - intersection.x, mid1.y - intersection.y);
  const dMid2 = Math.hypot(mid2.x - intersection.x, mid2.y - intersection.y);
  const touchRadiusWorld = Math.max((dMid1 + dMid2) / 2, 1.5);

  const touchPoint1 = {
    x: intersection.x + Math.cos(ang1) * touchRadiusWorld,
    y: intersection.y + Math.sin(ang1) * touchRadiusWorld,
  };
  const touchPoint2 = {
    x: intersection.x + Math.cos(ang2) * touchRadiusWorld,
    y: intersection.y + Math.sin(ang2) * touchRadiusWorld,
  };

  return {
    angleDeg,
    intersection,
    mid1,
    mid2,
    ang1,
    ang2,
    isParallel,
    touchRadiusWorld,
    touchPoint1,
    touchPoint2,
  };
}

/**
 * Oblicza pole powierzchni wielokąta 2D (wzór Gaussa / Shoelace formula).
 */
export function computePolygonArea(vertices: Point2D[]): number {
  if (!vertices || vertices.length < 3) return 0;
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Zmienia długość wybranej krawędzi wielokąta z zachowaniem stałego początku (V_i)
 * i równoległym przesunięciem (offsetem) kolejnego doczepionego odcinka (V_{i+1} -> V_{i+2}).
 */
export function adjustEdgeLength(
  vertices: Point2D[],
  edgeIndex: number,
  newLength: number
): Point2D[] {
  const n = vertices.length;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n || newLength <= 0.01) {
    return vertices;
  }

  const p1 = vertices[edgeIndex]; // Fixed start
  const nextIdx = (edgeIndex + 1) % n;
  const p2 = vertices[nextIdx];   // Old end

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const currentLen = Math.hypot(dx, dy);
  if (currentLen < 1e-4) return vertices;

  const ux = dx / currentLen;
  const uy = dy / currentLen;

  // New end point of edgeIndex
  const newP2 = {
    x: p1.x + ux * newLength,
    y: p1.y + uy * newLength,
  };

  // Translation delta for the following attached segment(s)
  const shiftX = newP2.x - p2.x;
  const shiftY = newP2.y - p2.y;

  // Clone vertices
  const result = vertices.map((v) => ({ ...v }));

  // Set the new end point for edgeIndex
  result[nextIdx] = newP2;

  // Shift subsequent vertex (edgeIndex + 2) to translate the attached edge parallel
  const afterNextIdx = (edgeIndex + 2) % n;
  result[afterNextIdx] = {
    x: vertices[afterNextIdx].x + shiftX,
    y: vertices[afterNextIdx].y + shiftY,
  };

  return result;
}


