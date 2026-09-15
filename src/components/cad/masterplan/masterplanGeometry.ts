import { Point2D, BuildingLoop } from '../../../types/geometry';
import { calculateSolarPosition } from '../../../utils/solar';
import polygonClipping from 'polygon-clipping';
import {
  isPolygonCCW,
  isPolygonConvex,
  computeConvexHull,
  unionPolygonLoops,
  intersectionPolygonLoops,
  differencePolygonLoops,
  collapseIdenticalConsecutiveHeightRuns,
} from '../../../utils/math2d/polygons';

export interface SolarAngles {
  azimuthDeg: number;
  elevationDeg: number;
  sunVector: { x: number; y: number };
  /** tan(elevationDeg) prekalkulowany raz per próbka słońca — computeShadowOffsetVector używa go liniowo (dzielenie), bez ponownego Math.tan(). */
  tanElevation: number;
}

export interface MasterplanStoryTier {
  buildingId: string;
  storyIndex: number;
  polygon: Point2D[];
  holes?: Point2D[][];
  hBottom: number;
  hTop: number;
  isProposed: boolean;
  isSelected: boolean;
  isHovered: boolean;
}

/**
 * Ekstrahuje wszystkie poziomy kondygnacji bryły (np. z modyfikatorów uskoków/tarasów/sztycy)
 * lub zwraca pojedynczą bryłę bazową, gdy storyPolygons nie są zdefiniowane.
 */
export function extractBuildingStoryTiers(
  bldg: BuildingLoop,
  selectedBuildingId: string | null = null,
  selectedBuildingIds: string[] = [],
  hoveredBuildingId: string | null = null
): MasterplanStoryTier[] {
  if (!bldg || bldg.category === 'boundary') return [];

  const isProposed = bldg.isTested === true;
  const isSelected = bldg.id === selectedBuildingId || (selectedBuildingIds && selectedBuildingIds.includes(bldg.id));
  const isHovered = bldg.id === hoveredBuildingId;
  const baseElevation = bldg.elevation ?? 0.0;
  const totalHeight = bldg.defaultHeight || 0.0;

  if (Array.isArray(bldg.storyPolygons) && bldg.storyPolygons.length > 0) {
    const tiers: MasterplanStoryTier[] = [];
    for (const sf of bldg.storyPolygons) {
      if (!sf.polygon || sf.polygon.length < 3) continue;
      const hTop = sf.hTop > 0 ? sf.hTop : baseElevation + totalHeight;
      const hBottom = sf.hBottom !== undefined ? sf.hBottom : baseElevation;
      tiers.push({
        buildingId: bldg.id,
        storyIndex: sf.storyIndex,
        polygon: sf.polygon,
        holes: sf.holes || [],
        hBottom,
        hTop,
        isProposed,
        isSelected,
        isHovered,
      });
    }
    if (tiers.length > 0) {
      // Kolejne kondygnacje z identycznym obrysem (i dziurami) scalamy w jeden tier obejmujący
      // pełny zakres wysokości — bezstratne dla cienia (patrz collapseIdenticalConsecutiveHeightRuns),
      // a redukuje liczbę tierów u źródła dla ground/roof rendererów i cache'u.
      return collapseIdenticalConsecutiveHeightRuns(
        tiers,
        (t) => t.polygon,
        (t) => t.holes,
        (t) => t.hBottom,
        (t) => t.hTop,
        (last, hBottom, hTop) => ({ ...last, hBottom, hTop })
      );
    }
  }

  if (Array.isArray(bldg.vertices) && bldg.vertices.length >= 3 && totalHeight > 0) {
    return [
      {
        buildingId: bldg.id,
        storyIndex: 0,
        polygon: bldg.vertices,
        holes: bldg.holes || [],
        hBottom: baseElevation,
        hTop: baseElevation + totalHeight,
        isProposed,
        isSelected,
        isHovered,
      },
    ];
  }

  return [];
}

/**
 * Pobiera kąty i wektor słońca dla zadanej geolokalizacji, daty i godziny (z opcjonalnym offsetem minutowym np. -1 lub +1).
 */
export function getMasterplanSolarAngles(
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn' = 'spring',
  hourFraction: number = 12.0,
  minuteOffset: number = 0
): SolarAngles {
  const month = equinoxDate === 'spring' ? 3 : 9;
  const day = equinoxDate === 'spring' ? 21 : 23;
  const effectiveHourFraction = hourFraction + minuteOffset / 60;

  const pos = calculateSolarPosition(latitude, longitude, month, day, effectiveHourFraction);
  const azRad = (pos.azimuthDeg * Math.PI) / 180;

  // Wektor padania cienia (w przeciwnym kierunku niż wektor biegnący do słońca):
  // Słońce na azymucie theta: światło idzie z kierunku theta, rzucając cień w kierunku [-sin(theta), -cos(theta)]
  // W konwencji CAD: Y jest w górę (Północ), X w prawo (Wschód).
  const shadowDirX = -Math.sin(azRad);
  const shadowDirY = -Math.cos(azRad);
  const elevationDeg = Math.max(1.0, pos.elevationDeg); // min 1 stopień by uniknąć dzielenia przez 0

  return {
    azimuthDeg: pos.azimuthDeg,
    elevationDeg,
    sunVector: { x: shadowDirX, y: shadowDirY },
    tanElevation: Math.tan((elevationDeg * Math.PI) / 180),
  };
}

/**
 * Wylicza wektor przesunięcia cienia rzucanego na płaszczyznę o różnicy wysokości deltaH.
 * Liniowe (dzielenie) — tanElevation jest prekalkulowane raz per próbka słońca w SolarAngles,
 * bez ponownego Math.tan() na każde wywołanie (ta funkcja jest wołana 2× per tier: top/base).
 */
export function computeShadowOffsetVector(
  deltaH: number,
  solarAngles: SolarAngles
): { dx: number; dy: number; length: number } {
  if (deltaH <= 0 || solarAngles.elevationDeg <= 0) {
    return { dx: 0, dy: 0, length: 0 };
  }

  const length = deltaH / solarAngles.tanElevation;

  return {
    dx: solarAngles.sunVector.x * length,
    dy: solarAngles.sunVector.y * length,
    length,
  };
}

/**
 * Odcisk geometrii poligonu (wszystkie współrzędne wierzchołków) — używany jako składnik klucza
 * cache'u w computeStoryShadowPolygon. Nie zależy od tożsamości wywołującego (tier/building), więc
 * cache działa przezroczyście dla wszystkich miejsc, które wołają tę funkcję.
 *
 * Uwaga: suma współrzędnych (Σx, Σy) jest NIEZMIENNIKIEM OBROTU wokół centroidu (obrót w miejscu
 * nie zmienia sumy = N × centroid) — użycie tylko sumy jako fingerprintu powodowało brak
 * odświeżania cienia przy obrocie budynku. Pełna lista współrzędnych jest wrażliwa na obrót,
 * translację i deformację.
 */
export function polygonFingerprint(polygon: Point2D[]): string {
  let s = String(polygon.length);
  for (const p of polygon) {
    s += `:${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  return s;
}

/**
 * Cache pojedynczego rzutowania cienia, wzorem `buildingFastShadowCache` w shadowEnvelope.ts.
 * Klucz zawiera realne hTop/hBottom/kąty użyte w wywołaniu (nie właściwości tiera) — poprawnie
 * różnicuje np. roof-shading, gdzie deltaH zależy od odbierającego dachu, i różne próbki penumbry
 * (różne azymuty) dla tego samego tiera.
 */
const storyShadowCache = new Map<string, Point2D[]>();

/**
 * Buduje precyzyjny wielokąt cienia dla pojedynczej kondygnacji/bryły o wysokości hTop i podstawie hBottom.
 * Obsługuje wielokąty wypukłe oraz wklęsłe (ze wstęgami ściennymi i wycinaniem otworów).
 */
export function computeStoryShadowPolygon(
  polygon: Point2D[],
  solarAngles: SolarAngles,
  hTop: number,
  hBottom: number = 0
): Point2D[] {
  if (!polygon || polygon.length < 3) return [];

  const cacheKey = `${polygonFingerprint(polygon)}|${hTop.toFixed(2)}|${hBottom.toFixed(2)}|${solarAngles.azimuthDeg.toFixed(2)}|${solarAngles.elevationDeg.toFixed(2)}`;
  const cached = storyShadowCache.get(cacheKey);
  if (cached) return cached;

  const result = computeStoryShadowPolygonUncached(polygon, solarAngles, hTop, hBottom);

  if (storyShadowCache.size > 5000) storyShadowCache.clear();
  storyShadowCache.set(cacheKey, result);
  return result;
}

/**
 * Cień bryły z dziurami (np. dziedziniec z modyfikatora "donut"): shadow(obrys) MINUS shadow(dziura),
 * liczone tą samą wysokością dla obu. computeStoryShadowPolygon (bez holes) traktuje tier jak pełny,
 * lity blok — dla pierścienia to zawyża cień (pokrywa cały wewnętrzny taras, nie tylko rzeczywistą
 * "ściankę"), bo ignoruje że światło przechodzi przez dziurę. Dowód: punkt p jest w cieniu pierścienia
 * ⟺ p jest w cieniu pełnego obrysu I promień do słońca nie jest zablokowany wyłącznie w obrębie dziury
 * ⟺ p ∈ shadow(obrys) \ shadow(dziura).
 */
export function computeStoryShadowPolygonWithHoles(
  polygon: Point2D[],
  holes: Point2D[][] | undefined,
  solarAngles: SolarAngles,
  hTop: number,
  hBottom: number = 0
): Point2D[][] {
  const outerShadow = computeStoryShadowPolygon(polygon, solarAngles, hTop, hBottom);
  if (outerShadow.length < 3) return [];
  if (!holes || holes.length === 0) return [outerShadow];

  const holeShadows = holes
    .filter((h) => h.length >= 3)
    .map((h) => computeStoryShadowPolygon(h, solarAngles, hTop, hBottom))
    .filter((s) => s.length >= 3);

  if (holeShadows.length === 0) return [outerShadow];
  const mergedHoles = holeShadows.length > 1 ? unionPolygonLoops(holeShadows) : holeShadows;
  return differencePolygonLoops([outerShadow], mergedHoles);
}

function computeStoryShadowPolygonUncached(
  polygon: Point2D[],
  solarAngles: SolarAngles,
  hTop: number,
  hBottom: number
): Point2D[] {
  const effectiveBottom = Math.max(0, hBottom);
  if (!polygon || polygon.length < 3 || hTop <= 0 || solarAngles.elevationDeg <= 0.001 || hTop <= effectiveBottom) {
    return [];
  }

  const topOffset = computeShadowOffsetVector(hTop, solarAngles);
  const baseOffset = effectiveBottom > 0 ? computeShadowOffsetVector(effectiveBottom, solarAngles) : { dx: 0, dy: 0, length: 0 };

  if (Math.hypot(topOffset.dx - baseOffset.dx, topOffset.dy - baseOffset.dy) < 0.01) {
    return [];
  }

  // Dla wielokątów wypukłych: szybka otoczka wypukła
  if (isPolygonConvex(polygon)) {
    const shadowPoints: Point2D[] = [
      ...polygon.map((v) => ({ x: v.x + baseOffset.dx, y: v.y + baseOffset.dy })),
      ...polygon.map((v) => ({ x: v.x + topOffset.dx, y: v.y + topOffset.dy })),
    ];
    return computeConvexHull(shadowPoints);
  }

  // Dla wielokątów wklęsłych: suma boolowska rzutu podstawy, rzutu dachu i wstęg ściennych (Wall Ribbons)
  const clippingPolys: [number, number][][][] = [];

  // Podstawa
  const baseRing: [number, number][] = polygon.map((p) => [p.x + baseOffset.dx, p.y + baseOffset.dy]);
  baseRing.push([polygon[0].x + baseOffset.dx, polygon[0].y + baseOffset.dy]);
  clippingPolys.push([baseRing]);

  // Dach
  const roofRing: [number, number][] = polygon.map((p) => [p.x + topOffset.dx, p.y + topOffset.dy]);
  roofRing.push([polygon[0].x + topOffset.dx, polygon[0].y + topOffset.dy]);
  clippingPolys.push([roofRing]);

  // Wstęgi ścienne wzdłuż krawędzi sylwetkowych
  const isCCW = isPolygonCCW(polygon);
  const ring = isCCW ? polygon : [...polygon].reverse();
  const n = ring.length;
  // sunRayDir = -sunVector (już prekalkulowany w SolarAngles) — bez ponownego sin/cos.
  const sunRayDir = { x: -solarAngles.sunVector.x, y: -solarAngles.sunVector.y };

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

      const ribbonRing: [number, number][] = chainVertices.map((v) => [v.x + baseOffset.dx, v.y + baseOffset.dy]);
      for (let c = chainVertices.length - 1; c >= 0; c--) {
        ribbonRing.push([chainVertices[c].x + topOffset.dx, chainVertices[c].y + topOffset.dy]);
      }
      ribbonRing.push([chainVertices[0].x + baseOffset.dx, chainVertices[0].y + baseOffset.dy]);
      clippingPolys.push([ribbonRing]);
    }
  }

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    if (unionResult.length > 0 && unionResult[0].length > 0) {
      const ringRes = unionResult[0][0];
      const isClosed =
        ringRes[0][0] === ringRes[ringRes.length - 1][0] && ringRes[0][1] === ringRes[ringRes.length - 1][1];
      const sliceEnd = isClosed && ringRes.length > 3 ? ringRes.length - 1 : ringRes.length;
      return ringRes.slice(0, sliceEnd).map(([x, y]) => ({ x, y }));
    }
  } catch {
    // Fallback do otoczki wypukłej w razie błędu geometrii
  }

  const fallbackPoints: Point2D[] = [
    ...polygon.map((v) => ({ x: v.x + baseOffset.dx, y: v.y + baseOffset.dy })),
    ...polygon.map((v) => ({ x: v.x + topOffset.dx, y: v.y + topOffset.dy })),
  ];
  return computeConvexHull(fallbackPoints);
}

/**
 * Tworzy wielokąt obwiedni cienia (sweep polygon) poprzez połączenie podstawy i wierzchołków przesuniętych o wektor cienia.
 */
export function buildShadowSweepPolygon(
  vertices: Point2D[],
  offsetVector: { dx: number; dy: number }
): Point2D[] {
  const n = vertices.length;
  if (n < 3) return [];

  const { dx, dy } = offsetVector;
  if (Math.hypot(dx, dy) < 0.01) {
    return [...vertices];
  }

  const allPts: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    allPts.push(vertices[i]);
    allPts.push({ x: vertices[i].x + dx, y: vertices[i].y + dy });
  }

  return computeConvexHull(allPts);
}

export interface SoftShadowResult {
  umbra: Point2D[][];
  penumbraOuter: Point2D[][];
}

/**
 * Wariant "soft" cienia kondygnacji: umbra = przecięcie dwóch hard-shadowów liczonych pod
 * azymutem odchylonym o ±promień kątowy tarczy słonecznej, penumbraOuter = ich unia.
 * Fizycznie poprawne: przy hBottom≈0 (styk ściany z gruntem) offset dla obu azymutów wynosi {0,0}
 * niezależnie od kąta, więc penumbra ma tam szerokość zero z definicji geometrii — bez potrzeby
 * śledzenia, który wierzchołek scalonego poligonu pochodzi z podstawy a który z dachu.
 * Koszt: 2× computeStoryShadowPolygon (liniowe, bez pierwiastków) + 1 intersection + 1 union.
 */
export function computeSoftStoryShadowPolygon(
  polygon: Point2D[],
  solarAngles: SolarAngles,
  hTop: number,
  hBottom: number = 0,
  sunAngularRadiusDeg: number = 0.267
): SoftShadowResult {
  const anglesMin = perturbAzimuth(solarAngles, -sunAngularRadiusDeg);
  const anglesMax = perturbAzimuth(solarAngles, sunAngularRadiusDeg);

  const polyMin = computeStoryShadowPolygon(polygon, anglesMin, hTop, hBottom);
  const polyMax = computeStoryShadowPolygon(polygon, anglesMax, hTop, hBottom);

  if (polyMin.length < 3 && polyMax.length < 3) return { umbra: [], penumbraOuter: [] };
  if (polyMin.length < 3 || polyMax.length < 3) {
    const single = polyMin.length >= 3 ? [polyMin] : [polyMax];
    return { umbra: single, penumbraOuter: single };
  }

  const umbra = intersectionPolygonLoops([polyMin], [polyMax]);
  const penumbraOuter = unionPolygonLoops([polyMin, polyMax]);
  return { umbra, penumbraOuter };
}

/**
 * Wariant soft z dziurami: różnica (obrys minus dziura) liczona OSOBNO dla każdego wariantu azymutu,
 * a dopiero potem przecięcie (umbra)/unia (penumbraOuter) — różnica i przecięcie/unia nie są
 * przemienne, więc kolejność ma znaczenie (patrz computeStoryShadowPolygonWithHoles).
 */
export function computeSoftStoryShadowPolygonWithHoles(
  polygon: Point2D[],
  holes: Point2D[][] | undefined,
  solarAngles: SolarAngles,
  hTop: number,
  hBottom: number = 0,
  sunAngularRadiusDeg: number = 0.267
): SoftShadowResult {
  const anglesMin = perturbAzimuth(solarAngles, -sunAngularRadiusDeg);
  const anglesMax = perturbAzimuth(solarAngles, sunAngularRadiusDeg);

  const ringMin = computeStoryShadowPolygonWithHoles(polygon, holes, anglesMin, hTop, hBottom);
  const ringMax = computeStoryShadowPolygonWithHoles(polygon, holes, anglesMax, hTop, hBottom);

  if (ringMin.length === 0 && ringMax.length === 0) return { umbra: [], penumbraOuter: [] };
  if (ringMin.length === 0) return { umbra: ringMax, penumbraOuter: ringMax };
  if (ringMax.length === 0) return { umbra: ringMin, penumbraOuter: ringMin };

  const umbra = intersectionPolygonLoops(ringMin, ringMax);
  const penumbraOuter = unionPolygonLoops([...ringMin, ...ringMax]);
  return { umbra, penumbraOuter };
}

/** Odchyla azymut słońca o `deltaDeg`, przeliczając `sunVector` (elewacja zostaje bez zmian). */
function perturbAzimuth(solarAngles: SolarAngles, deltaDeg: number): SolarAngles {
  const azimuthDeg = solarAngles.azimuthDeg + deltaDeg;
  const azRad = (azimuthDeg * Math.PI) / 180;
  return {
    azimuthDeg,
    elevationDeg: solarAngles.elevationDeg,
    tanElevation: solarAngles.tanElevation, // elewacja niezmieniona — reużyj bez ponownego Math.tan()
    sunVector: { x: -Math.sin(azRad), y: -Math.cos(azRad) },
  };
}

export { computeConvexHull };

