import { Point2D, BuildingLoop, Edge2D, HourlyShadowLoop, ShadowAnalysisResult } from '../../types/geometry';
import { calculateSolarPosition, getGlobalSolarLUT, GlobalSolarLUT, SolarMethodLUTData } from '../solar';
import polygonClipping from 'polygon-clipping';
import { isPolygonCCW } from './polygons';
import { computeConvexHull, isPolygonConvex, unionPolygonLoops, differencePolygonLoops } from './polygons';

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
 * Buduje precyzyjny wielokąt cienia dla pojedynczego budynku / bryły o wysokości hTop i podstawie hBase w danym momencie czasu.
 * Tworzy pełny rzut dachu i ścian pionowych na płaszczyznę terenu z uwzględnieniem paralaksy podstawy.
 *
 * @param polygon - obrys 2D bryły
 * @param sunAzimuthRad - azymut słońca w radianach
 * @param sunElevationRad - elewacja słońca w radianach
 * @param hTop - wysokość górnej krawędzi bryły (Htotal)
 * @param hBase - wysokość dolnej krawędzi bryły (Hbase, domyślnie 0)
 */
export function computeFastShadowPolygon(
  polygon: Point2D[],
  sunAzimuthRad: number,
  sunElevationRad: number,
  hTop: number,
  hBase: number = 0
): Point2D[] {
  if (!polygon || polygon.length < 3 || hTop <= 0 || sunElevationRad <= 0.001 || hTop <= hBase) {
    return polygon ? [...polygon] : [];
  }

  const topOffset = getShadowOffsetVector(sunAzimuthRad, sunElevationRad, hTop);
  const baseOffset = hBase > 0 ? getShadowOffsetVector(sunAzimuthRad, sunElevationRad, hBase) : { x: 0, y: 0 };

  if (topOffset.x === baseOffset.x && topOffset.y === baseOffset.y) return [...polygon];

  // Dla wielokątów wypukłych: otoczka wypukła (zrzutowana podstawa + zrzutowany dach)
  if (isPolygonConvex(polygon)) {
    const shadowPoints: Point2D[] = [
      ...polygon.map((v) => ({ x: v.x + baseOffset.x, y: v.y + baseOffset.y })),
      ...polygon.map((v) => ({ x: v.x + topOffset.x, y: v.y + topOffset.y })),
    ];
    return computeConvexHull(shadowPoints);
  }

  // Dla wielokątów wklęsłych: suma boolowska rzutu podstawy, rzutu dachu i wstęg ścian
  const clippingPolys: [number, number][][][] = [];

  // Podstawa (zrzutowana z uwzględnieniem hBase)
  const baseRing: [number, number][] = polygon.map((p) => [p.x + baseOffset.x, p.y + baseOffset.y]);
  baseRing.push([polygon[0].x + baseOffset.x, polygon[0].y + baseOffset.y]);
  clippingPolys.push([baseRing]);

  // Dach (zrzutowany z uwzględnieniem hTop)
  const roofRing: [number, number][] = polygon.map((p) => [p.x + topOffset.x, p.y + topOffset.y]);
  roofRing.push([polygon[0].x + topOffset.x, polygon[0].y + topOffset.y]);
  clippingPolys.push([roofRing]);

  // Ściany pionowe - zamiast generować dziesiątki pojedynczych czworokątów (quads),
  // łączymy przylegające krawędzie sylwetkowe w ciągłe wstęgi ścienne (Wall Ribbons).
  // Wstęga łączy zrzutowaną krawędź podstawy (baseOffset) ze zrzutowaną krawędzią dachu (topOffset).
  const isCCW = isPolygonCCW(polygon);
  const ring = isCCW ? polygon : [...polygon].reverse();
  const n = ring.length;
  const sunRayDir = { x: Math.sin(sunAzimuthRad), y: Math.cos(sunAzimuthRad) };

  const isSilEdge: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    const normX = p2.y - p1.y;
    const normY = -(p2.x - p1.x);
    const dot = normX * sunRayDir.x + normY * sunRayDir.y;
    isSilEdge[i] = dot < -1e-7;
  }

  const visited = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (isSilEdge[i] && !visited[i]) {
      let start = i;
      while (isSilEdge[(start - 1 + n) % n] && start !== (i + 1) % n) {
        start = (start - 1 + n) % n;
        if (start === i) break;
      }

      const chainVertices: Point2D[] = [ring[start]];
      let curr = start;
      while (isSilEdge[curr] && !visited[curr]) {
        visited[curr] = true;
        curr = (curr + 1) % n;
        chainVertices.push(ring[curr]);
      }

      const ribbonRing: [number, number][] = chainVertices.map((v) => [v.x + baseOffset.x, v.y + baseOffset.y]);
      for (let c = chainVertices.length - 1; c >= 0; c--) {
        ribbonRing.push([chainVertices[c].x + topOffset.x, chainVertices[c].y + topOffset.y]);
      }
      ribbonRing.push([chainVertices[0].x + baseOffset.x, chainVertices[0].y + baseOffset.y]);
      clippingPolys.push([ribbonRing]);
    }
  }

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    if (unionResult.length > 0 && unionResult[0].length > 0) {
      const ringRes = unionResult[0][0];
      const isClosed = ringRes[0][0] === ringRes[ringRes.length - 1][0] && ringRes[0][1] === ringRes[ringRes.length - 1][1];
      const sliceEnd = isClosed && ringRes.length > 3 ? ringRes.length - 1 : ringRes.length;
      return ringRes.slice(0, sliceEnd).map(([x, y]) => ({ x, y }));
    }
  } catch {
    // Fallback do otoczki wypukłej w razie błędu geometrii
  }

  const fallbackPoints: Point2D[] = [
    ...polygon.map((v) => ({ x: v.x + baseOffset.x, y: v.y + baseOffset.y })),
    ...polygon.map((v) => ({ x: v.x + topOffset.x, y: v.y + topOffset.y })),
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

  const analysis = computeFullShadowAnalysis(buildings, latitude, longitude, equinoxDate);
  return analysis.envelopeLoops;
}

/**
 * Kompleksowa analiza cienia obiektów badanych:
 * 1. Generuje obrysy cienia z progresywnym krokiem (domyślnie 0.25h = 15 minut dla wysokiej gładkości).
 * 2. Wyznacza łączną sumaryczną obwiednię cienia równonocy (envelopeLoops) bezpośrednio jako
 *    SUMĘ BOOLOWSKĄ (Boolean Union) wszystkich wygenerowanych obrysów składowych z odjęciem cienia blokującego.
 * 3. Mierzy czas wykonania operacji (calculationTimeMs).
 */
export function computeFullShadowAnalysis(
  buildings: BuildingLoop[],
  latitude: number = 52.23,
  longitude: number = 21.01,
  equinoxDate: 'spring' | 'autumn' = 'spring',
  stepHours: number = 0.25,
  sunlightMethod: 'raycasting' | 'segments' = 'raycasting'
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
      stepHours,
    };
  }

  // Budynki ograniczające ("negatywny cień")
  const blockingBuildings = buildings.filter(
    (b) => !b.isTested && b.isIncluded !== false && b.category !== 'boundary' && b.defaultHeight > 0 && b.vertices && b.vertices.length >= 3
  );

  // Prekalkulacja bazowych AABB dla budynków blokujących (eliminuje tysiące iteracji po wierzchołkach w każdej godzinie)
  const blockingWithAABB = blockingBuildings.map((bldg) => {
    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    for (let i = 0; i < bldg.vertices.length; i++) {
      const v = bldg.vertices[i];
      if (v.x < bMinX) bMinX = v.x;
      if (v.y < bMinY) bMinY = v.y;
      if (v.x > bMaxX) bMaxX = v.x;
      if (v.y > bMaxY) bMaxY = v.y;
    }
    return { bldg, bMinX, bMinY, bMaxX, bMaxY };
  });

  const solarLUT = getGlobalSolarLUT(latitude, longitude, equinoxDate);
  const noonHour = sunlightMethod === 'segments' ? 12.0 : solarLUT.astroSystem.solarNoonDecimal;

  const anyChildcare = testedBuildings.some((b) => b.segments.some((s) => s.buildingType === 'childcare'));
  const maxOffset = anyChildcare ? 4 : 5;

  const allOffsets: number[] = [];
  const step = Math.max(0.1, stepHours);
  for (let o = -maxOffset; o <= maxOffset + 1e-6; o += step) {
    allOffsets.push(Math.round(o * 1000) / 1000);
  }

  const hourlyShadows: HourlyShadowLoop[] = [];

  for (const offset of allOffsets) {
    const sData = solarLUT.getMethodData(offset, sunlightMethod);
    if (sData.elevationDeg <= 0.5) continue;

    const hour = noonHour + offset;
    const azRad = sData.azimuthDeg * (Math.PI / 180);
    const elevRad = sData.elevationDeg * (Math.PI / 180);
    const uShadow = sData.unitShadowVec;

    const hourPolys: Point2D[][] = [];
    for (const bldg of testedBuildings) {
      const isChildcare = bldg.segments.some((s) => s.buildingType === 'childcare');
      if (isChildcare && Math.abs(offset) > 4) continue;

      if (bldg.storyPolygons && bldg.storyPolygons.length > 1) {
        for (const sf of bldg.storyPolygons) {
          if (sf.polygon && sf.polygon.length >= 3 && sf.hTop > (sf.hBottom || 0)) {
            const p = computeFastShadowPolygon(sf.polygon, azRad, elevRad, sf.hTop, sf.hBottom || 0);
            if (p.length >= 3) hourPolys.push(p);
          }
        }
      } else {
        const fastKey = `${bldg.id}|${bldg.defaultHeight}|${sunlightMethod}|${offset}|${bldg.vertices[0].x.toFixed(2)},${bldg.vertices[0].y.toFixed(2)},${bldg.vertices.length}`;
        let poly = buildingFastShadowCache.get(fastKey);
        if (!poly) {
          poly = computeFastShadowPolygon(bldg.vertices, azRad, elevRad, bldg.defaultHeight, bldg.elevation || 0);
          if (buildingFastShadowCache.size > 5000) buildingFastShadowCache.clear();
          if (poly.length >= 3) buildingFastShadowCache.set(fastKey, poly);
        }

        if (poly.length >= 3) {
          hourPolys.push(poly);
        }
      }
    }

    if (hourPolys.length > 0) {
      let finalHourPolys: Point2D[][];

      if (blockingWithAABB.length > 0) {
        // Oblicz AABB dla wszystkich cieni badanych w tej godzinie
        let hMinX = Infinity, hMinY = Infinity, hMaxX = -Infinity, hMaxY = -Infinity;
        for (const poly of hourPolys) {
          for (let i = 0; i < poly.length; i++) {
            const pt = poly[i];
            if (pt.x < hMinX) hMinX = pt.x;
            if (pt.y < hMinY) hMinY = pt.y;
            if (pt.x > hMaxX) hMaxX = pt.x;
            if (pt.y > hMaxY) hMaxY = pt.y;
          }
        }

        const blockingHourPolys: Point2D[][] = [];
        for (let i = 0; i < blockingWithAABB.length; i++) {
          const item = blockingWithAABB[i];
          const bldg = item.bldg;
          const offX = bldg.defaultHeight * uShadow.x;
          const offY = bldg.defaultHeight * uShadow.y;

          const sMinX = Math.min(item.bMinX, item.bMinX + offX);
          const sMaxX = Math.max(item.bMaxX, item.bMaxX + offX);
          const sMinY = Math.min(item.bMinY, item.bMinY + offY);
          const sMaxY = Math.max(item.bMaxY, item.bMaxY + offY);

          // Jeśli AABB cienia blokującego nie nachodzi na AABB cieni badanych, pomiń
          if (sMaxX < hMinX || sMinX > hMaxX || sMaxY < hMinY || sMinY > hMaxY) {
            continue;
          }

          if (bldg.storyPolygons && bldg.storyPolygons.length > 1) {
            for (const sf of bldg.storyPolygons) {
              if (sf.polygon && sf.polygon.length >= 3 && sf.hTop > (sf.hBottom || 0)) {
                const p = computeFastShadowPolygon(sf.polygon, azRad, elevRad, sf.hTop, sf.hBottom || 0);
                if (p.length >= 3) blockingHourPolys.push(p);
              }
            }
          } else {
            const fastKey = `${bldg.id}|${bldg.defaultHeight}|${sunlightMethod}|${offset}|${bldg.vertices[0].x.toFixed(2)},${bldg.vertices[0].y.toFixed(2)},${bldg.vertices.length}`;
            let poly = buildingFastShadowCache.get(fastKey);
            if (!poly) {
              poly = computeFastShadowPolygon(bldg.vertices, azRad, elevRad, bldg.defaultHeight, bldg.elevation || 0);
              if (buildingFastShadowCache.size > 5000) buildingFastShadowCache.clear();
              if (poly.length >= 3) buildingFastShadowCache.set(fastKey, poly);
            }
            if (poly.length >= 3) {
              blockingHourPolys.push(poly);
            }
          }
        }

        if (blockingHourPolys.length > 0) {
          finalHourPolys = differencePolygonLoops(hourPolys, blockingHourPolys);
        } else {
          finalHourPolys = unionPolygonLoops(hourPolys);
        }
      } else {
        finalHourPolys = unionPolygonLoops(hourPolys);
      }

      if (finalHourPolys.length > 0) {
        hourlyShadows.push({
          hourOffset: offset,
          hourDecimal: hour,
          azimuthDeg: sData.azimuthDeg,
          elevationDeg: sData.elevationDeg,
          polygons: finalHourPolys,
        });
      }
    }
  }

  // Obwiednia maksymalna generowana ze scalenia obrysów godzinowych.
  // Zamiast wrzucać setki poligonów do jednej płaskiej unii, łączymy sąsiednie godziny hierarchicznie
  // (sąsiednie godziny mają ~95% wspólnego przekroju, co drastycznie redukuje geometrię na każdym szczeblu).
  let envelopeLoops: Point2D[][] = [];
  if (hourlyShadows.length > 0) {
    let currentHourBatches: Point2D[][][] = hourlyShadows.map((h) => h.polygons);
    while (currentHourBatches.length > 1) {
      const nextHourBatches: Point2D[][][] = [];
      for (let i = 0; i < currentHourBatches.length; i += 2) {
        if (i + 1 < currentHourBatches.length) {
          nextHourBatches.push(unionPolygonLoops([...currentHourBatches[i], ...currentHourBatches[i + 1]]));
        } else {
          nextHourBatches.push(currentHourBatches[i]);
        }
      }
      if (nextHourBatches.length === currentHourBatches.length) break;
      currentHourBatches = nextHourBatches;
    }
    envelopeLoops = currentHourBatches[0] || [];
  }

  const calculationTimeMs = performance.now() - t0;

  return {
    envelopeLoops,
    hourlyShadows,
    calculationTimeMs,
    stepHours: step,
  };
}

export interface LiveShadowResult {
  hourlyShadows: HourlyShadowLoop[];
  envelopeLoops: Point2D[];
}

/**
 * Szybkie wyznaczanie obrysów cienia oraz obwiedni maksymalnej dla wszystkich testowanych budynków.
 * Przeznaczone do renderowania live podczas interakcji użytkownika (drag/move) w 60 FPS.
 * Używa buildingFastShadowCache oraz generuje obwiednię bezpośrednio z sumy rzutów.
 */
export function computeHourlyShadowsLive(
  buildings: BuildingLoop[],
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  stepHours: number = 0.5,
  sunlightMethod: 'raycasting' | 'segments' = 'raycasting'
): { hourlyShadows: HourlyShadowLoop[]; envelopeLoops: Point2D[][] } {
  const testedBuildings = buildings.filter(
    (b) => b.isTested && b.isIncluded !== false && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3
  );
  if (testedBuildings.length === 0) return { hourlyShadows: [], envelopeLoops: [] };

  const blockingBuildings = buildings.filter(
    (b) => !b.isTested && b.isIncluded !== false && b.category !== 'boundary' && b.defaultHeight > 0 && b.vertices && b.vertices.length >= 3
  );

  const solarLUT = getGlobalSolarLUT(latitude, longitude, equinoxDate);
  const noonHour = sunlightMethod === 'segments' ? 12.0 : solarLUT.astroSystem.solarNoonDecimal;

  const anyChildcare = testedBuildings.some((b) => b.segments.some((s) => s.buildingType === 'childcare'));
  const maxOffset = anyChildcare ? 4 : 5;

  const result: HourlyShadowLoop[] = [];
  const allRenderedLoops: Point2D[][] = [];

  const step = Math.max(0.2, stepHours);
  for (let o = -maxOffset; o <= maxOffset + 1e-6; o += step) {
    const sData = solarLUT.getMethodData(o, sunlightMethod);
    if (sData.elevationDeg <= 0.5) continue;

    const hour = noonHour + o;
    const azRad   = sData.azimuthDeg * (Math.PI / 180);
    const elevRad = sData.elevationDeg * (Math.PI / 180);
    const uShadow = sData.unitShadowVec;

    const polys: Point2D[][] = [];
    for (const bldg of testedBuildings) {
      const fastKey = `${bldg.id}|${bldg.defaultHeight}|${sunlightMethod}|${o}|${bldg.vertices[0].x.toFixed(2)},${bldg.vertices[0].y.toFixed(2)},${bldg.vertices.length}`;
      let poly = buildingFastShadowCache.get(fastKey);
      if (!poly) {
        poly = computeFastShadowPolygon(bldg.vertices, azRad, elevRad, bldg.defaultHeight);
        if (buildingFastShadowCache.size > 5000) buildingFastShadowCache.clear();
        if (poly.length >= 3) buildingFastShadowCache.set(fastKey, poly);
      }
      if (poly.length >= 3) {
        polys.push(poly);
      }
    }

    if (polys.length > 0) {
      let finalPolys = polys;
      if (blockingBuildings.length > 0) {
        let hMinX = Infinity, hMinY = Infinity, hMaxX = -Infinity, hMaxY = -Infinity;
        for (const poly of polys) {
          for (const pt of poly) {
            if (pt.x < hMinX) hMinX = pt.x;
            if (pt.y < hMinY) hMinY = pt.y;
            if (pt.x > hMaxX) hMaxX = pt.x;
            if (pt.y > hMaxY) hMaxY = pt.y;
          }
        }

        const blockingPolys: Point2D[][] = [];
        for (const bldg of blockingBuildings) {
          const offsetVec = { x: bldg.defaultHeight * uShadow.x, y: bldg.defaultHeight * uShadow.y };
          let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
          for (const v of bldg.vertices) {
            if (v.x < bMinX) bMinX = v.x;
            if (v.y < bMinY) bMinY = v.y;
            if (v.x > bMaxX) bMaxX = v.x;
            if (v.y > bMaxY) bMaxY = v.y;
          }
          const sMinX = Math.min(bMinX, bMinX + offsetVec.x);
          const sMaxX = Math.max(bMaxX, bMaxX + offsetVec.x);
          const sMinY = Math.min(bMinY, bMinY + offsetVec.y);
          const sMaxY = Math.max(bMaxY, bMaxY + offsetVec.y);

          if (sMaxX < hMinX || sMinX > hMaxX || sMaxY < hMinY || sMinY > hMaxY) {
            continue;
          }

          const fastKey = `${bldg.id}|${bldg.defaultHeight}|${sunlightMethod}|${o}|${bldg.vertices[0].x.toFixed(2)},${bldg.vertices[0].y.toFixed(2)},${bldg.vertices.length}`;
          let poly = buildingFastShadowCache.get(fastKey);
          if (!poly) {
            poly = computeFastShadowPolygon(bldg.vertices, azRad, elevRad, bldg.defaultHeight);
            if (buildingFastShadowCache.size > 5000) buildingFastShadowCache.clear();
            if (poly.length >= 3) buildingFastShadowCache.set(fastKey, poly);
          }
          if (poly.length >= 3) {
            blockingPolys.push(poly);
          }
        }
        if (blockingPolys.length > 0) {
          finalPolys = differencePolygonLoops(polys, blockingPolys);
        }
      }

      if (finalPolys.length > 0) {
        result.push({
          hourOffset: o,
          hourDecimal: hour,
          azimuthDeg: sData.azimuthDeg,
          elevationDeg: sData.elevationDeg,
          polygons: finalPolys,
        });
        for (const p of finalHourPolysSafe(finalPolys)) {
          allRenderedLoops.push(p);
        }
      }
    }
  }

  // Obwiednia maksymalna na bieżąco z sumy wszystkich wyrenderowanych obrysów
  const envelopeLoops: Point2D[][] = allRenderedLoops.length > 0
    ? unionPolygonLoops(allRenderedLoops)
    : [];

  return { hourlyShadows: result, envelopeLoops };
}

function finalHourPolysSafe(polys: Point2D[][]): Point2D[][] {
  return polys.filter(p => p.length >= 3);
}
