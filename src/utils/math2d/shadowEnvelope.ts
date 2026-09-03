import { Point2D, BuildingLoop, Edge2D, HourlyShadowLoop, ShadowAnalysisResult } from '../../types/geometry';
import { calculateSolarPosition } from '../solar';
import polygonClipping from 'polygon-clipping';
import { isPolygonCCW } from './polygons';
import { computeConvexHull, isPolygonConvex, unionPolygonLoops } from './polygons';

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
    (b) => b.isTested && b.isIncluded !== false && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3
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
    (b) => b.isTested && b.isIncluded !== false && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3
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
