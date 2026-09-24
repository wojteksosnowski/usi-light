import { Point2D, BuildingLoop, Edge2D, HourlyShadowLoop, ShadowAnalysisResult } from '../../types/geometry';
import { isBuildingVariantActive } from '../geometrySelectors';
import { calculateSolarPosition, getGlobalSolarLUT, GlobalSolarLUT, SolarMethodLUTData } from '../solar';
import polygonClipping from 'polygon-clipping';
import {
  computeConvexHull,
  isPolygonConvex,
  isPolygonCCW,
  unionPolygonLoops,
  differencePolygonLoops,
  intersectionPolygonLoops,
  collapseIdenticalConsecutiveHeightRuns,
  computePointsBoundingBox,
} from './polygons';
import { StoryFootprint } from '../../types/modifiers';

/**
 * Unia obwiedni godzinowych (patrz `computeFullShadowAnalysis`/`computeHourlyShadowsLive`).
 *
 * Wcześniej: unia HIERARCHICZNA (parami, poziom po poziomie zamiast jednej płaskiej unii —
 * pomysł: mniej geometrii do przetworzenia na każdym szczeblu). Usunięta — zweryfikowałem
 * bezpośrednio na `reference/shadow-bug1.json`, że hierarchiczna redukcja parami daje INNY
 * (niepoprawny — "zaleczający się" nad footprintem sąsiednich budynków) wynik niż jedna płaska
 * unia tych samych poligonów wejściowych, mimo że każda pojedyncza godzina z osobna jest
 * poprawna (0 naruszeń per-godzinę, 63 naruszenia po unii hierarchicznej, 0 po unii płaskiej —
 * identyczne wejście). Najbardziej prawdopodobna przyczyna: redukcja parami wymusza mnóstwo
 * unii DOKŁADNIE-DWÓCH pętli, co trafia w szybką ścieżkę `fastUnionTwoSimpleLoops`
 * (`polygonBooleanTwo.ts`) zamiast w w pełni sprawdzoną wsadową `polygon-clipping.union` (którą
 * dostaje płaska unia, bo AABB-klastrowanie w `unionPolygonLoops` zwykle grupuje wszystkie
 * nachodzące na siebie godzinowe obrysy w jeden większy klaster >2 elementów). Płaska unia jest
 * wystarczająco szybka dla realnych scen (nie ma tu setek godzinowych partii), więc nie ma
 * powodu ryzykować poprawność dla wydajności.
 */
function unionLoopsHierarchical(batches: Point2D[][][]): Point2D[][] {
  return unionPolygonLoops(batches.flat());
}

/**
 * Odcisk geometrii poligonu (wszystkie współrzędne, nie tylko pierwszy wierzchołek) — używany jako
 * składnik klucza `buildingFastShadowCache`. Klucz oparty tylko o pierwszy wierzchołek + liczbę
 * wierzchołków jest podatny na fałszywe cache-hity po obrocie/edycji budynku, gdy pierwszy
 * wierzchołek i liczba wierzchołków akurat się nie zmieniają (ten sam bug, który naprawiono w
 * masterplanGeometry.ts's polygonFingerprint dla cieni Masterplanu).
 */
function polygonVerticesFingerprint(vertices: Point2D[]): string {
  let s = String(vertices.length);
  for (const p of vertices) {
    s += `:${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  return s;
}

/**
 * Cache poligonu cienia per-piętro (storyPolygons), wzorem `buildingFastShadowCache` — bez niego
 * budynki z modyfikatorami (uskoki/tarasy) nie miały żadnego cache'owania cienia, przeliczane od
 * zera na każdą klatkę podczas przeciągania (patrz Krok 4 planu optymalizacji "zasięgu cienia").
 */
const storyShadowPolyCache = new Map<string, Point2D[]>();
const storyShadowWithHolesCache = new Map<string, Point2D[][]>();

function getCachedFastShadowPolygon(
  polygon: Point2D[],
  azRad: number,
  elevRad: number,
  hTop: number,
  hBottom: number,
  geomFingerprint?: string,
  isConvex?: boolean
): Point2D[] {
  const fp = geomFingerprint || polygonVerticesFingerprint(polygon);
  const key = `${fp}|${hTop.toFixed(2)}|${hBottom.toFixed(2)}|${azRad.toFixed(4)}|${elevRad.toFixed(4)}`;
  const cached = storyShadowPolyCache.get(key);
  if (cached) return cached;
  const result = computeFastShadowPolygon(polygon, azRad, elevRad, hTop, hBottom, isConvex);
  if (storyShadowPolyCache.size > 5000) storyShadowPolyCache.clear();
  storyShadowPolyCache.set(key, result);
  return result;
}

export function computeFastShadowPolygonWithHoles(
  polygon: Point2D[],
  holes: Point2D[][] | undefined,
  azRad: number,
  elevRad: number,
  hTop: number,
  hBottom: number = 0,
  isConvexKnown?: boolean
): Point2D[][] {
  const outerShadow = computeFastShadowPolygon(polygon, azRad, elevRad, hTop, hBottom, isConvexKnown);
  if (outerShadow.length < 3) return [];
  if (!holes || holes.length === 0) return [outerShadow];

  const validHoles = holes.filter((h) => h && h.length >= 3);
  if (validHoles.length === 0) return [outerShadow];

  const effectiveBottom = Math.max(0, hBottom);
  const topOffset = getShadowOffsetVector(azRad, elevRad, hTop);
  const baseOffset = effectiveBottom > 0 ? getShadowOffsetVector(azRad, elevRad, effectiveBottom) : { x: 0, y: 0 };

  const lightApertures: Point2D[][] = [];
  for (const hole of validHoles) {
    const hBase = hole.map((p) => ({ x: p.x + baseOffset.x, y: p.y + baseOffset.y }));
    const hTopPoly = hole.map((p) => ({ x: p.x + topOffset.x, y: p.y + topOffset.y }));
    const inter = intersectionPolygonLoops([hBase], [hTopPoly]);
    lightApertures.push(...inter);
  }

  if (lightApertures.length === 0) return [outerShadow];
  const mergedApertures = lightApertures.length > 1 ? unionPolygonLoops(lightApertures) : lightApertures;
  return differencePolygonLoops([outerShadow], mergedApertures);
}

function getCachedFastShadowPolygonWithHoles(
  polygon: Point2D[],
  holes: Point2D[][] | undefined,
  azRad: number,
  elevRad: number,
  hTop: number,
  hBottom: number,
  geomFingerprint?: string,
  holesFingerprint?: string,
  isConvex?: boolean
): Point2D[][] {
  if (!holes || holes.length === 0) {
    const single = getCachedFastShadowPolygon(polygon, azRad, elevRad, hTop, hBottom, geomFingerprint, isConvex);
    return single.length >= 3 ? [single] : [];
  }

  const fp = geomFingerprint || polygonVerticesFingerprint(polygon);
  const holesKey = holesFingerprint || holes.map(polygonVerticesFingerprint).join(';');
  const key = `${fp}#${holesKey}|${hTop.toFixed(2)}|${hBottom.toFixed(2)}|${azRad.toFixed(4)}|${elevRad.toFixed(4)}`;
  const cached = storyShadowWithHolesCache.get(key);
  if (cached) return cached;

  const result = computeFastShadowPolygonWithHoles(polygon, holes, azRad, elevRad, hTop, hBottom, isConvex);
  if (storyShadowWithHolesCache.size > 5000) storyShadowWithHolesCache.clear();
  storyShadowWithHolesCache.set(key, result);
  return result;
}

/**
 * Zwraca wektor przesunięcia cienia na płaszczyźnie poziomej.
 * @param sunAzimuthRad - azymut słońca w radianach (0 = Północ, Pi/2 = Wschód, Pi = Południe, 3Pi/2 = Zachód)
 * @param sunElevationRad - kąt wzniesienia słońca nad horyzontem w radianach
 * @param height - wysokość budynku/ściany
 */
export interface PreparedShadowBuilding {
  bldg: BuildingLoop;
  collapsedStories?: StoryFootprint[];
  bMinX: number;
  bMinY: number;
  bMaxX: number;
  bMaxY: number;
  hBase: number;
  hTop: number;
  isConvex: boolean;
  geomFingerprint: string;
}

export function prepareShadowBuilding(bldg: BuildingLoop): PreparedShadowBuilding | null {
  if (!bldg.vertices || bldg.vertices.length < 3) return null;
  const hBase = bldg.elevation ?? 0.0;

  let collapsedStories: StoryFootprint[] | undefined = undefined;
  let hTop = hBase + (bldg.defaultHeight ?? 0);

  if (bldg.storyPolygons && bldg.storyPolygons.length > 0) {
    collapsedStories = collapseIdenticalConsecutiveHeightRuns<StoryFootprint>(
      bldg.storyPolygons,
      (sf) => sf.polygon,
      (sf) => sf.holes,
      (sf) => sf.hBottom,
      (sf) => sf.hTop,
      (last, hBottom, hTop) => ({ ...last, hBottom, hTop })
    );
    let maxTop = 0;
    for (let i = 0; i < collapsedStories.length; i++) {
      const sf = collapsedStories[i];
      if (sf.hTop > maxTop) {
        maxTop = sf.hTop;
      }
      if (sf.polygon && sf.polygon.length >= 3) {
        sf.geomFingerprint = polygonVerticesFingerprint(sf.polygon);
        sf.isConvex = isPolygonConvex(sf.polygon);
      }
      if (sf.holes && sf.holes.length > 0) {
        sf.holesFingerprint = sf.holes.map(polygonVerticesFingerprint).join(';');
      }
    }
    hTop = Math.max(0, hBase + maxTop);
  }

  if (hTop <= 0) return null;

  const { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY } = computePointsBoundingBox(bldg.vertices);

  const isConvex = isPolygonConvex(bldg.vertices);
  const geomFingerprint = polygonVerticesFingerprint(bldg.vertices);

  return {
    bldg,
    collapsedStories,
    bMinX,
    bMinY,
    bMaxX,
    bMaxY,
    hBase,
    hTop,
    isConvex,
    geomFingerprint,
  };
}

/**
 * Dopisuje do `out` poligony cienia dla przygotowanego budynku: per-piętro (z wcześniej scalonymi kondygnacjami
 * z pre-collapsem, cache: storyShadowPolyCache/storyShadowWithHolesCache) lub — w braku storyPolygons —
 * poligon rzutu z legacy cache (buildingFastShadowCache), keszowany po (id, wysokości, metodzie, offsecie godzinowym).
 */
export function collectBuildingShadowPolysPrepared(
  prep: PreparedShadowBuilding,
  azRad: number,
  elevRad: number,
  sunlightMethod: 'raycasting' | 'segments',
  offsetKey: number,
  out: Point2D[][]
): void {
  const { bldg, collapsedStories, hBase, hTop, geomFingerprint, isConvex } = prep;
  if (collapsedStories && collapsedStories.length > 0) {
    for (let i = 0; i < collapsedStories.length; i++) {
      const sf = collapsedStories[i];
      if (sf.polygon && sf.polygon.length >= 3 && sf.hTop > 0 && sf.hTop > (sf.hBottom || 0)) {
        if (sf.holes && sf.holes.length > 0) {
          const polys = getCachedFastShadowPolygonWithHoles(
            sf.polygon,
            sf.holes,
            azRad,
            elevRad,
            sf.hTop,
            sf.hBottom || 0,
            sf.geomFingerprint,
            sf.holesFingerprint,
            sf.isConvex
          );
          for (let k = 0; k < polys.length; k++) {
            if (polys[k].length >= 3) out.push(polys[k]);
          }
        } else {
          const p = getCachedFastShadowPolygon(
            sf.polygon,
            azRad,
            elevRad,
            sf.hTop,
            sf.hBottom || 0,
            sf.geomFingerprint,
            sf.isConvex
          );
          if (p.length >= 3) out.push(p);
        }
      }
    }
    return;
  }

  const fastKey = `${bldg.id}|${hTop}|${hBase}|${sunlightMethod}|${offsetKey}|${geomFingerprint}`;
  let poly = buildingFastShadowCache.get(fastKey);
  if (!poly) {
    poly = computeFastShadowPolygon(bldg.vertices, azRad, elevRad, hTop, hBase, isConvex);
    if (buildingFastShadowCache.size > 5000) buildingFastShadowCache.clear();
    if (poly.length >= 3) buildingFastShadowCache.set(fastKey, poly);
  }
  if (poly.length >= 3) out.push(poly);
}

/**
 * Legacy wrapper dla pojedynczego budynku.
 */
function collectBuildingShadowPolys(
  bldg: BuildingLoop,
  azRad: number,
  elevRad: number,
  sunlightMethod: 'raycasting' | 'segments',
  offsetKey: number,
  out: Point2D[][]
): void {
  const prep = prepareShadowBuilding(bldg);
  if (prep) {
    collectBuildingShadowPolysPrepared(prep, azRad, elevRad, sunlightMethod, offsetKey, out);
  }
}

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
 *
 */
export function computeFastShadowPolygon(
  polygon: Point2D[],
  sunAzimuthRad: number,
  sunElevationRad: number,
  hTop: number,
  hBase: number = 0,
  isConvexKnown?: boolean
): Point2D[] {
  const effectiveBase = Math.max(0, hBase);
  if (!polygon || polygon.length < 3 || hTop <= 0 || sunElevationRad <= 0.001 || hTop <= effectiveBase) {
    return [];
  }

  const topOffset = getShadowOffsetVector(sunAzimuthRad, sunElevationRad, hTop);
  const baseOffset = effectiveBase > 0 ? getShadowOffsetVector(sunAzimuthRad, sunElevationRad, effectiveBase) : { x: 0, y: 0 };

  if (topOffset.x === baseOffset.x && topOffset.y === baseOffset.y) return [];

  // Dla wielokątów wypukłych: otoczka wypukła (zrzutowana podstawa + zrzutowany dach)
  const isConvex = isConvexKnown !== undefined ? isConvexKnown : isPolygonConvex(polygon);
  if (isConvex) {
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

  // Ściany pionowe — każda krawędź konturu dostaje własny równoległobok (quad) między
  // zrzutowaną podstawą a zrzutowanym dachem. Wcześniej: klasyfikacja krawędzi na
  // "sylwetkowe" (dot < 0 względem kierunku słońca) + łączenie sąsiednich w ciągłe wstęgi,
  // jako optymalizacja (mniej poligonów do unii). Dla złożonych, wklęsłych konturów
  // (100+ wierzchołków) ta klasyfikacja/łańcuchowanie realnie gubiła ściany — samo-cień
  // budynku z głębokim dziedzińcem/wnęką potrafił nie pokrywać jej w pojedynczej godzinie,
  // mimo że fizycznie ściany dookoła dziedzińca powinny go zasłaniać. `polygon-clipping`
  // scala wszystkie quady (razem z podstawą i dachem) w jeden spójny kształt tak samo jak
  // wstęgi — bez ryzyka pominięcia żadnej ściany. Zdiagnozowane i zweryfikowane na
  // `reference/shadow-bug1.json` / `146508_8.1505.27_BUD`.
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const quad: [number, number][] = [
      [p1.x + baseOffset.x, p1.y + baseOffset.y],
      [p2.x + baseOffset.x, p2.y + baseOffset.y],
      [p2.x + topOffset.x, p2.y + topOffset.y],
      [p1.x + topOffset.x, p1.y + topOffset.y],
      [p1.x + baseOffset.x, p1.y + baseOffset.y],
    ];
    clippingPolys.push([quad]);
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

  const hBase = building.elevation ?? 0.0;
  const hTop = hBase + building.defaultHeight;
  if (hTop <= 0) return [];

  const effectiveBase = Math.max(0, hBase);
  if (hTop <= effectiveBase) return [];

  const cacheKey = `${building.id}|${hTop}|${hBase}|${latitude}|${longitude}|${equinoxDate}|${isChildcare}|${polygonVerticesFingerprint(vertices)}`;
  const cached = buildingEnvelopeCache.get(cacheKey);
  if (cached) return cached;

  const month = equinoxDate === 'autumn' ? 9 : 3;
  const day = equinoxDate === 'autumn' ? 23 : 21;

  const noonPos = calculateSolarPosition(latitude, longitude, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;
  const hourOffsets = isChildcare ? [-4, 4] : [-5, 5];

  const isConvex = isPolygonConvex(vertices);

  if (isConvex) {
    const shadowPoints: Point2D[] = [];

    for (const offset of hourOffsets) {
      const hour = noonHour + offset;
      const pos = calculateSolarPosition(latitude, longitude, month, day, hour);
      if (pos.elevationDeg > 0.5) {
        const azRad = pos.azimuthDeg * (Math.PI / 180);
        const elevRad = pos.elevationDeg * (Math.PI / 180);
        const sOffsetTop = getShadowOffsetVector(azRad, elevRad, hTop);
        const sOffsetBase = effectiveBase > 0 ? getShadowOffsetVector(azRad, elevRad, effectiveBase) : { x: 0, y: 0 };
        for (const v of vertices) {
          shadowPoints.push({ x: v.x + sOffsetBase.x, y: v.y + sOffsetBase.y });
          shadowPoints.push({ x: v.x + sOffsetTop.x, y: v.y + sOffsetTop.y });
        }
      }
    }

    const result = shadowPoints.length > 0 ? computeConvexHull(shadowPoints) : [];
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
      const poly = computeFastShadowPolygon(vertices, azRad, elevRad, hTop, hBase);
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

export interface CardinalAABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Oblicza absolutną maksymalną wysokość obiektu od płaszczyzny z=0 (uwzględniając ewentualne storyPolygons).
 */
export function getBuildingAbsoluteHmax(bldg: BuildingLoop): number {
  const hBase = bldg.elevation ?? 0;
  if (bldg.storyPolygons && bldg.storyPolygons.length > 0) {
    let maxTop = 0;
    for (let i = 0; i < bldg.storyPolygons.length; i++) {
      if (bldg.storyPolygons[i].hTop > maxTop) {
        maxTop = bldg.storyPolygons[i].hTop;
      }
    }
    return Math.max(0, hBase + maxTop);
  }
  return Math.max(0, hBase + (bldg.defaultHeight ?? 0));
}

/**
 * Wyznacza kardynalne AABB obejmujące bryłę rzucającą cień oraz cień przez nią rzucany:
 * - Wschód-Zachód (X): rzut poranny (-5*Hmax) i popołudniowy (+5*Hmax) -> [minX - 5*Hmax, maxX + 5*Hmax]
 * - Północ-Południe (Y): cień rzucany wyłącznie na północ (+Y) -> [minY, maxY + 1.5*Hmax]
 */
export function computeBuildingShadowReachAABB(bldg: BuildingLoop): CardinalAABB | null {
  if (!bldg.vertices || bldg.vertices.length < 3) return null;
  const hMax = getBuildingAbsoluteHmax(bldg);
  if (hMax <= 0) return null;

  const { minX, minY, maxX, maxY } = computePointsBoundingBox(bldg.vertices);

  return {
    minX: minX - hMax * 5.0,
    maxX: maxX + hMax * 5.0,
    minY: minY,
    maxY: maxY + hMax * 1.5,
  };
}

/**
 * Wyznacza jedno zbiorcze AABB dla wszystkich obiektów badanych w projekcie
 * wraz z ich maksymalnym zasięgiem cienia.
 */
export function computeProjectShadowReachAABB(testedBuildings: BuildingLoop[]): CardinalAABB | null {
  if (testedBuildings.length === 0) return null;

  let baseMinX = Infinity, baseMinY = Infinity, baseMaxX = -Infinity, baseMaxY = -Infinity;
  let maxProjectH = 0;

  for (const bldg of testedBuildings) {
    const hMax = getBuildingAbsoluteHmax(bldg);
    if (hMax > maxProjectH) maxProjectH = hMax;
    for (let i = 0; i < bldg.vertices.length; i++) {
      const v = bldg.vertices[i];
      if (v.x < baseMinX) baseMinX = v.x;
      if (v.y < baseMinY) baseMinY = v.y;
      if (v.x > baseMaxX) baseMaxX = v.x;
      if (v.y > baseMaxY) baseMaxY = v.y;
    }
  }

  if (!Number.isFinite(baseMinX)) return null;

  return {
    minX: baseMinX - maxProjectH * 5.0,
    maxX: baseMaxX + maxProjectH * 5.0,
    minY: baseMinY,
    maxY: baseMaxY + maxProjectH * 1.5,
  };
}

/**
 * Sprawdza przecięcie dwóch kardynalnych AABB.
 */
export function doAABBsOverlap(a: CardinalAABB, b: CardinalAABB): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

/**
 * Odsiewa kandydatów na budynki blokujące ("negatywny cień") do tych, których kardynalne AABB
 * zasięgu cienia przecina się z co najmniej jednym AABB zasięgu cienia budynków badanych.
 */
function filterBlockingBuildingsByReach(
  candidateBlocking: BuildingLoop[],
  testedReachAABBs: CardinalAABB[]
): BuildingLoop[] {
  if (testedReachAABBs.length === 0) return candidateBlocking;
  return candidateBlocking.filter((bldg) => {
    const bAABB = computeBuildingShadowReachAABB(bldg);
    if (!bAABB) return false;
    for (let i = 0; i < testedReachAABBs.length; i++) {
      if (doAABBsOverlap(bAABB, testedReachAABBs[i])) return true;
    }
    return false;
  });
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
    (b) => {
      if (!isBuildingVariantActive(b)) return false;
      return b.isTested && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && ((b.elevation ?? 0) + b.defaultHeight) > 0;
    }
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
    (b) => {
      if (!isBuildingVariantActive(b)) return false;
      return b.isTested && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && ((b.elevation ?? 0) + b.defaultHeight) > 0;
    }
  );

  if (testedBuildings.length === 0) {
    return {
      envelopeLoops: [],
      hourlyShadows: [],
      calculationTimeMs: performance.now() - t0,
      stepHours,
    };
  }

  // Budynki ograniczające ("negatywny cień") odsiane wstępnie przez kardynalne AABB zasięgu cienia
  const candidateBlocking = buildings.filter(
    (b) => {
      if (!isBuildingVariantActive(b)) return false;
      return !b.isTested && b.category !== 'boundary' && b.defaultHeight > 0 && b.vertices && b.vertices.length >= 3 && ((b.elevation ?? 0) + b.defaultHeight) > 0;
    }
  );

  const testedReachAABBs = testedBuildings
    .map(computeBuildingShadowReachAABB)
    .filter((a): a is CardinalAABB => a !== null);

  const blockingBuildings = filterBlockingBuildingsByReach(candidateBlocking, testedReachAABBs);

  // Pre-collapsing kondygnacji i pre-kalkulacja parametrów RAZ przed pętlą godzinową
  const preparedTested = testedBuildings
    .map((b) => prepareShadowBuilding(b))
    .filter((p): p is PreparedShadowBuilding => p !== null);

  const preparedBlocking = blockingBuildings
    .map((b) => prepareShadowBuilding(b))
    .filter((p): p is PreparedShadowBuilding => p !== null);

  const solarLUT = getGlobalSolarLUT(latitude, longitude, equinoxDate);
  const noonHour = sunlightMethod === 'segments' ? 12.0 : solarLUT.astroSystem.solarNoonDecimal;

  const maxOffset = 5;

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
    for (let i = 0; i < preparedTested.length; i++) {
      collectBuildingShadowPolysPrepared(preparedTested[i], azRad, elevRad, sunlightMethod, offset, hourPolys);
    }

    if (hourPolys.length > 0) {
      const mergedHourTested = unionPolygonLoops(hourPolys);
      if (mergedHourTested.length > 0) {
        let finalHourPolys = mergedHourTested;

        if (preparedBlocking.length > 0) {
          // Oblicz AABB dla każdego z poligonów mergedHourTested z osobna
          const testedPolyAABBs = mergedHourTested.map(computePointsBoundingBox);

          const blockingHourPolys: Point2D[][] = [];
          for (let i = 0; i < preparedBlocking.length; i++) {
            const item = preparedBlocking[i];
            const offX = item.hTop * uShadow.x;
            const offY = item.hTop * uShadow.y;

            const sMinX = Math.min(item.bMinX, item.bMinX + offX);
            const sMaxX = Math.max(item.bMaxX, item.bMaxX + offX);
            const sMinY = Math.min(item.bMinY, item.bMinY + offY);
            const sMaxY = Math.max(item.bMaxY, item.bMaxY + offY);

            // Sprawdź czy cień blokujący przecina AABB któregokolwiek z badanych poligonów w tej godzinie
            let overlapsAny = false;
            for (let j = 0; j < testedPolyAABBs.length; j++) {
              const tb = testedPolyAABBs[j];
              if (!(sMaxX < tb.minX || sMinX > tb.maxX || sMaxY < tb.minY || sMinY > tb.maxY)) {
                overlapsAny = true;
                break;
              }
            }
            if (!overlapsAny) {
              continue;
            }

            collectBuildingShadowPolysPrepared(item, azRad, elevRad, sunlightMethod, offset, blockingHourPolys);
          }

          if (blockingHourPolys.length > 0) {
            finalHourPolys = differencePolygonLoops(mergedHourTested, blockingHourPolys);
          }
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
  }

  // Obwiednia maksymalna generowana ze scalenia obrysów godzinowych — unia hierarchiczna
  // (patrz unionLoopsHierarchical) zamiast jednej płaskiej unii wszystkich godzin naraz.
  const envelopeLoops: Point2D[][] = unionLoopsHierarchical(hourlyShadows.map((h) => h.polygons));

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
    (b) => {
      if (!isBuildingVariantActive(b)) return false;
      return b.isTested && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && ((b.elevation ?? 0) + b.defaultHeight) > 0;
    }
  );
  if (testedBuildings.length === 0) return { hourlyShadows: [], envelopeLoops: [] };

  const testedReachAABBs = testedBuildings
    .map(computeBuildingShadowReachAABB)
    .filter((a): a is CardinalAABB => a !== null);

  const candidateBlocking = buildings.filter(
    (b) => {
      if (!isBuildingVariantActive(b)) return false;
      return !b.isTested && b.category !== 'boundary' && b.defaultHeight > 0 && b.vertices && b.vertices.length >= 3 && ((b.elevation ?? 0) + b.defaultHeight) > 0;
    }
  );

  const blockingBuildings = filterBlockingBuildingsByReach(candidateBlocking, testedReachAABBs);

  const preparedTested = testedBuildings
    .map((b) => prepareShadowBuilding(b))
    .filter((p): p is PreparedShadowBuilding => p !== null);

  const preparedBlocking = blockingBuildings
    .map((b) => prepareShadowBuilding(b))
    .filter((p): p is PreparedShadowBuilding => p !== null);

  const solarLUT = getGlobalSolarLUT(latitude, longitude, equinoxDate);
  const noonHour = sunlightMethod === 'segments' ? 12.0 : solarLUT.astroSystem.solarNoonDecimal;

  const maxOffset = 5;

  const result: HourlyShadowLoop[] = [];

  const step = Math.max(0.2, stepHours);
  for (let o = -maxOffset; o <= maxOffset + 1e-6; o += step) {
    const sData = solarLUT.getMethodData(o, sunlightMethod);
    if (sData.elevationDeg <= 0.5) continue;

    const hour = noonHour + o;
    const azRad   = sData.azimuthDeg * (Math.PI / 180);
    const elevRad = sData.elevationDeg * (Math.PI / 180);
    const uShadow = sData.unitShadowVec;

    const polys: Point2D[][] = [];
    for (let i = 0; i < preparedTested.length; i++) {
      collectBuildingShadowPolysPrepared(preparedTested[i], azRad, elevRad, sunlightMethod, o, polys);
    }

    if (polys.length > 0) {
      const mergedHourTested = unionPolygonLoops(polys);
      if (mergedHourTested.length > 0) {
        let finalPolys = mergedHourTested;

        if (preparedBlocking.length > 0) {
          const testedPolyAABBs = mergedHourTested.map(computePointsBoundingBox);

          const blockingPolys: Point2D[][] = [];
          for (let i = 0; i < preparedBlocking.length; i++) {
            const item = preparedBlocking[i];
            const offsetVec = { x: item.hTop * uShadow.x, y: item.hTop * uShadow.y };
            const sMinX = Math.min(item.bMinX, item.bMinX + offsetVec.x);
            const sMaxX = Math.max(item.bMaxX, item.bMaxX + offsetVec.x);
            const sMinY = Math.min(item.bMinY, item.bMinY + offsetVec.y);
            const sMaxY = Math.max(item.bMaxY, item.bMaxY + offsetVec.y);

            let overlapsAny = false;
            for (let j = 0; j < testedPolyAABBs.length; j++) {
              const tb = testedPolyAABBs[j];
              if (!(sMaxX < tb.minX || sMinX > tb.maxX || sMaxY < tb.minY || sMinY > tb.maxY)) {
                overlapsAny = true;
                break;
              }
            }
            if (!overlapsAny) {
              continue;
            }

            collectBuildingShadowPolysPrepared(item, azRad, elevRad, sunlightMethod, o, blockingPolys);
          }
          if (blockingPolys.length > 0) {
            finalPolys = differencePolygonLoops(mergedHourTested, blockingPolys);
          }
        }

        if (finalPolys.length > 0) {
          result.push({
            hourOffset: o,
            hourDecimal: hour,
            azimuthDeg: sData.azimuthDeg,
            elevationDeg: sData.elevationDeg,
            polygons: finalHourPolysSafe(finalPolys),
          });
        }
      }
    }
  }

  // Obwiednia maksymalna: unia hierarchiczna per godzina (patrz unionLoopsHierarchical), zamiast
  // jednej płaskiej unii wszystkich poligonów ze wszystkich godzin naraz.
  const envelopeLoops: Point2D[][] = unionLoopsHierarchical(result.map((h) => h.polygons));

  return { hourlyShadows: result, envelopeLoops };
}

function finalHourPolysSafe(polys: Point2D[][]): Point2D[][] {
  return polys.filter(p => p.length >= 3);
}
