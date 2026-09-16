import { Point2D, BuildingLoop } from '../../../types/geometry';
import { calculateSolarPosition, LinijkaSolarSystem } from '../../../utils/solar';
import polygonClipping from 'polygon-clipping';
import {
  isPolygonCCW,
  isPolygonConvex,
  computeConvexHull,
  unionPolygonLoops,
  intersectionPolygonLoops,
  differencePolygonLoops,
  collapseIdenticalConsecutiveHeightRuns,
  PolygonWithHoles,
  unionPolygonsWithHoles,
  differencePolygonsWithHoles,
  intersectionPolygonsWithHoles,
} from '../../../utils/math2d/polygons';

export interface SolarAngles {
  azimuthDeg: number;
  elevationDeg: number;
  sunVector: { x: number; y: number };
  /** Mnożnik cienia na jednostkę wysokości (1.0 / tanElevation), prekalkulowany raz per próbka słońca. */
  shadowScale: number;
  /** Stały współczynnik rozproszenia stożka półcienia: tan(sunAngularRadius) / tan(elevation) — promień tarczy słońca per jednostka wysokości nad płaszczyzną rzutowania. */
  kBlur: number;
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
  /**
   * Referencja do źródłowego obiektu `BuildingLoop`, do kluczowania cache'u cienia per
   * obiekt (patrz `buildingShadowCache` w `src/engine/buildingGeometryCache.ts`). Opcjonalna,
   * żeby nie wymagać jej od miejsc konstruujących tiery ręcznie (np. w testach).
   */
  bldgRef?: BuildingLoop;
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
        bldgRef: bldg,
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
        bldgRef: bldg,
      },
    ];
  }

  return [];
}

/**
 * Pobiera kąty i wektor słońca dla zadanej geolokalizacji, daty, godziny i metody (astro vs linijka).
 * (z opcjonalnym offsetem minutowym np. -1 lub +1).
 */
export function getMasterplanSolarAngles(
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn' = 'spring',
  hourFraction: number = 12.0,
  minuteOffset: number = 0,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): SolarAngles {
  const isLinijka = method === 'segments' || method === 'linijka';
  const effectiveHourFraction = hourFraction + minuteOffset / 60;

  let azimuthDeg: number;
  let elevationDeg: number;

  if (isLinijka) {
    const linijkaSys = new LinijkaSolarSystem(latitude, longitude, equinoxDate);
    azimuthDeg = linijkaSys.getAzimuthForHour(effectiveHourFraction);
    elevationDeg = linijkaSys.getElevationForAzimuth(azimuthDeg);
  } else {
    const month = equinoxDate === 'spring' ? 3 : 9;
    const day = equinoxDate === 'spring' ? 21 : 23;
    const pos = calculateSolarPosition(latitude, longitude, month, day, effectiveHourFraction);
    azimuthDeg = pos.azimuthDeg;
    elevationDeg = pos.elevationDeg;
  }

  const azRad = (azimuthDeg * Math.PI) / 180;

  // Wektor padania cienia (w przeciwnym kierunku niż wektor biegnący do słońca):
  // Słońce na azymucie theta: światło idzie z kierunku theta, rzucając cień w kierunku [-sin(theta), -cos(theta)]
  // W konwencji CAD: Y jest w górę (Północ), X w prawo (Wschód).
  const shadowDirX = -Math.sin(azRad);
  const shadowDirY = -Math.cos(azRad);
  const clampedElevationDeg = Math.max(1.0, elevationDeg); // min 1 stopień by uniknąć dzielenia przez 0
  const tanElevation = Math.tan((clampedElevationDeg * Math.PI) / 180);
  const shadowScale = 1.0 / tanElevation;

  // Stały kąt półcienia dla widoku Masterplan (1.25 stopnia)
  const sunAngularRadiusDeg = 1.25;
  const tanSunRadius = Math.tan((sunAngularRadiusDeg * Math.PI) / 180);
  const kBlur = tanSunRadius * shadowScale;

  return {
    azimuthDeg,
    elevationDeg: clampedElevationDeg,
    sunVector: { x: shadowDirX, y: shadowDirY },
    shadowScale,
    kBlur,
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

  const length = deltaH * solarAngles.shadowScale;

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
 * Cień bryły z dziurami (np. dziedziniec z modyfikatora "donut"):
 * W modelu fizycznym (zgodnym z podglądem 3D / Three.js), światło słoneczne wpada
 * przez górny otwór w dachu (aperturę na wysokości hTop) i porusza się w dół szybu dziedzińca.
 * Promienie padające na wewnętrzne ściany dziedzińca są blokowane, a do płaszczyzny bazowej
 * dociera wyłącznie wiązka przechodząca przez przekrój otworu bazowego i szczytowego:
 * LightPatch = (H + baseOffset) ∩ (H + topOffset).
 * Cień kondygnacji to cień pełnego obrysu MINUS plama światła wewnątrz dziedzińca:
 * StoryShadow = Sweep(Outer) \ LightPatch.
 * Dzięki temu:
 * - Ściana południowa dziedzińca rzuca fizyczny cień na dno dziedzińca,
 * - Północna część dziedzińca jest prawidłowo oświetlona,
 * - Żadne światło nie wycieka poza budynek (brak prześwitów w cieniu ściany północnej).
 */
export function computeStoryShadowPolygonWithHoles(
  polygon: Point2D[],
  holes: Point2D[][] | undefined,
  solarAngles: SolarAngles,
  hTop: number,
  hBottom: number = 0
): PolygonWithHoles[] {
  const outerShadow = computeStoryShadowPolygon(polygon, solarAngles, hTop, hBottom);
  if (outerShadow.length < 3) return [];
  if (!holes || holes.length === 0) return [{ outer: outerShadow, holes: [] }];

  const validHoles = holes.filter((h) => h && h.length >= 3);
  if (validHoles.length === 0) return [{ outer: outerShadow, holes: [] }];

  const effectiveBottom = Math.max(0, hBottom);
  const topOffset = computeShadowOffsetVector(hTop, solarAngles);
  const baseOffset = effectiveBottom > 0 ? computeShadowOffsetVector(effectiveBottom, solarAngles) : { dx: 0, dy: 0, length: 0 };

  // Plama światła to przekrój otworu dolnego i górnego: (H + baseOffset) ∩ (H + topOffset)
  const lightApertures: PolygonWithHoles[] = [];
  for (const hole of validHoles) {
    const hBase: PolygonWithHoles = {
      outer: hole.map((p) => ({ x: p.x + baseOffset.dx, y: p.y + baseOffset.dy })),
      holes: [],
    };
    const hTopPoly: PolygonWithHoles = {
      outer: hole.map((p) => ({ x: p.x + topOffset.dx, y: p.y + topOffset.dy })),
      holes: [],
    };
    const inter = intersectionPolygonsWithHoles([hBase], [hTopPoly]);
    lightApertures.push(...inter);
  }

  if (lightApertures.length === 0) return [{ outer: outerShadow, holes: [] }];
  const mergedApertures = lightApertures.length > 1 ? unionPolygonsWithHoles(lightApertures) : lightApertures;
  return differencePolygonsWithHoles([{ outer: outerShadow, holes: [] }], mergedApertures);
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
    const polygonLoops: Point2D[][] = [];
    for (const poly of clippingPolys) {
      if (poly && poly.length > 0) {
        polygonLoops.push(poly[0].slice(0, -1).map(([x, y]) => ({ x, y })));
      }
    }
    const unionResult = unionPolygonLoops(polygonLoops);
    if (unionResult.length > 0 && unionResult[0].length >= 3) {
      return unionResult[0];
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

export interface SoftShadowEnvelopeResult {
  umbra: PolygonWithHoles[];
  penumbra: PolygonWithHoles[];
}

const SOFT_SHADOW_DISC_SEGMENTS = 8;

/** Jednostkowy okrąg (promień 1) prekalkulowany raz przy starcie modułu — buildSunDiscPolygon tylko skaluje i przesuwa, bez Math.cos/sin per wywołanie. */
const SOFT_SHADOW_UNIT_CIRCLE: Point2D[] = Array.from({ length: SOFT_SHADOW_DISC_SEGMENTS }, (_, i) => {
  const theta = (i / SOFT_SHADOW_DISC_SEGMENTS) * Math.PI * 2;
  return { x: Math.cos(theta), y: Math.sin(theta) };
});

/** Aproksymacja tarczy słońca rzutowanej na płaszczyznę: N-kąt foremny wokół danego wierzchołka cienia. */
function buildSunDiscPolygon(center: Point2D, radius: number): Point2D[] {
  return SOFT_SHADOW_UNIT_CIRCLE.map((u) => ({ x: center.x + u.x * radius, y: center.y + u.y * radius }));
}

/** Tarcze słońca wokół każdego wierzchołka dachu (już przesuniętego o topOffset) — współdzielone przez ścieżkę wypukłą i ogólną. */
function buildRoofSunDiscs(polygon: Point2D[], topOffset: { dx: number; dy: number }, radius: number): Point2D[][] {
  return polygon.map((v) => buildSunDiscPolygon({ x: v.x + topOffset.dx, y: v.y + topOffset.dy }, radius));
}

/**
 * Miękki cień (penumbra) jako promienista tarcza słońca wokół każdego przesuniętego wierzchołka dachu:
 * - Wierzchołki podstawy (hBottom) pozostają ostre (przesunięte o baseOffset), jak w umbrze.
 * - Każdy wierzchołek dachu (hTop) otoczony jest N-kątną tarczą o promieniu rBlur = hTop * kBlur —
 *   `hTop` to tu wysokość WZGLĘDEM płaszczyzny, na którą pada cień (dla gruntu: wysokość absolutna;
 *   dla cienia na dach niższego budynku: różnica wysokości absolutnych, przekazywana przez wywołującego).
 * - Penumbra to unia tych tarcz z umbrą — geometrycznie zawiera umbrę w całości, więc kolejność
 *   rysowania (penumbra pod spodem, umbra na wierzchu) jest zawsze poprawna.
 * - Dla wielokątów wypukłych bez dziur: szybka ścieżka przez computeConvexHull, bez unii boolowskiej.
 */
export function computeSoftShadowEnvelopeWithHoles(
  polygon: Point2D[],
  holes: Point2D[][] | undefined,
  solarAngles: SolarAngles,
  hTop: number,
  hBottom: number = 0
): SoftShadowEnvelopeResult {
  if (!polygon || polygon.length < 3 || hTop <= 0) {
    return { umbra: [], penumbra: [] };
  }

  const effectiveBottom = Math.max(0, hBottom);
  if (hTop - effectiveBottom <= 0.05) return { umbra: [], penumbra: [] };

  const umbra = computeStoryShadowPolygonWithHoles(polygon, holes, solarAngles, hTop, hBottom);
  const rBlur = hTop * (solarAngles.kBlur || 0.02);
  if (umbra.length === 0 || rBlur <= 0.001) {
    return { umbra, penumbra: umbra };
  }

  const topOffset = computeShadowOffsetVector(hTop, solarAngles);
  const hasHoles = holes && holes.length > 0 && holes.some((h) => h && h.length >= 3);

  // Ścieżka szybka: wielokąty wypukłe bez dziur — otoczka wypukła punktów bazowych
  // i tarcz słońca rozstawionych wokół każdego wierzchołka dachu, bez unii boolowskiej.
  const roofDiscs = buildRoofSunDiscs(polygon, topOffset, rBlur);

  if (!hasHoles && isPolygonConvex(polygon)) {
    const baseOffset = effectiveBottom > 0 ? computeShadowOffsetVector(effectiveBottom, solarAngles) : { dx: 0, dy: 0, length: 0 };
    const basePts = polygon.map((v) => ({ x: v.x + baseOffset.dx, y: v.y + baseOffset.dy }));
    const penumbraHull = computeConvexHull([...basePts, ...roofDiscs.flat()]);
    return {
      umbra,
      penumbra: penumbraHull.length >= 3 ? [{ outer: penumbraHull, holes: [] }] : umbra,
    };
  }

  // Ścieżka ogólna (wklęsłe i/lub z dziurami): unia tarcz słońca wokół każdego przesuniętego
  // wierzchołka dachu z bazowym cieniem (umbra) — jedna spójna metoda, bez przekłamywania sunVector.
  const discs: PolygonWithHoles[] = roofDiscs.map((outer) => ({ outer, holes: [] }));
  const penumbra = unionPolygonsWithHoles([...umbra, ...discs]);
  return { umbra, penumbra: penumbra.length > 0 ? penumbra : umbra };
}

export { computeConvexHull };

