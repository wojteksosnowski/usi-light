import { Point2D, BuildingLoop, BuildingType } from '../../../types/geometry';
import { calculateSolarPosition, LinijkaSolarSystem } from '../../../utils/solar';
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
  calculateSignedArea,
} from '../../../utils/math2d/polygons';

export interface SolarAngles {
  azimuthDeg: number;
  elevationDeg: number;
  sunVector: { x: number; y: number };
  /** Mnożnik cienia na jednostkę wysokości (1.0 / tanElevation), prekalkulowany raz per próbka słońca. */
  shadowScale: number;
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
   * Prekalkulowany fingerprint geometrii (wszystkie wierzchołki + otwory), by uniknąć
   * powtarzalnej alokacji stringów przy każdym rzutowaniu cienia / klatce.
   */
  geomFingerprint?: string;
  /** Prekalkulowana flaga wypukłości wielokąta bazowego. */
  isConvex?: boolean;
  /**
   * Referencja do źródłowego obiektu `BuildingLoop`, do kluczowania cache'u cienia per
   * obiekt (patrz `buildingShadowCache` w `src/engine/buildingGeometryCache.ts`). Opcjonalna,
   * żeby nie wymagać jej od miejsc konstruujących tiery ręcznie (np. w testach).
   */
  bldgRef?: BuildingLoop;
  buildingType?: BuildingType;
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
  const defaultBldgType = bldg.buildingType ?? 'residential';

  if (bldg.computed?.representation2D?.masterplanTiers && bldg.computed.representation2D.masterplanTiers.length > 0) {
    return bldg.computed.representation2D.masterplanTiers.map((t) => ({
      buildingId: bldg.id,
      storyIndex: t.storyIndex,
      polygon: t.polygon as Point2D[],
      holes: (t.holes ?? []) as Point2D[][],
      hBottom: t.hBottom,
      hTop: t.hTop,
      isProposed,
      isSelected,
      isHovered,
      geomFingerprint: t.geomFingerprint,
      isConvex: t.isConvex,
      bldgRef: bldg,
      buildingType: (t.buildingType ?? defaultBldgType) as BuildingType,
    }));
  }

  if (bldg.computed?.representation2D?.storySlices && bldg.computed.representation2D.storySlices.length > 0) {
    const slices = bldg.computed.representation2D.storySlices;
    const tiers: MasterplanStoryTier[] = [];
    for (const s of slices) {
      if (!s.footprint.exterior || s.footprint.exterior.length < 3) continue;
      const poly = s.footprint.exterior as Point2D[];
      const holes = (s.footprint.holes as Point2D[][]) || [];
      tiers.push({
        buildingId: bldg.id,
        storyIndex: s.storyIndex,
        polygon: poly,
        holes,
        hBottom: s.elevationBottom,
        hTop: s.elevationTop,
        isProposed,
        isSelected,
        isHovered,
        geomFingerprint: polygonFingerprint(poly),
        isConvex: isPolygonConvex(poly),
        bldgRef: bldg,
        buildingType: defaultBldgType,
      });
    }
    if (tiers.length > 0) {
      return collapseIdenticalConsecutiveHeightRuns(
        tiers,
        (t) => t.polygon,
        (t) => t.holes,
        (t) => t.hBottom,
        (t) => t.hTop,
        (last, hBottom, hTop) => ({ ...last, hBottom, hTop }),
        (t) => t.buildingType
      );
    }
  }

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
        geomFingerprint: polygonFingerprint(sf.polygon),
        isConvex: isPolygonConvex(sf.polygon),
        bldgRef: bldg,
        buildingType: sf.buildingType ?? defaultBldgType,
      });
    }
    if (tiers.length > 0) {
      // Kolejne kondygnacje z identycznym obrysem (i dziurami oraz buildingType) scalamy w jeden tier obejmujący
      // pełny zakres wysokości — bezstratne dla cienia (patrz collapseIdenticalConsecutiveHeightRuns),
      // a redukuje liczbę tierów u źródła dla ground/roof rendererów i cache'u.
      return collapseIdenticalConsecutiveHeightRuns(
        tiers,
        (t) => t.polygon,
        (t) => t.holes,
        (t) => t.hBottom,
        (t) => t.hTop,
        (last, hBottom, hTop) => ({ ...last, hBottom, hTop }),
        (t) => t.buildingType
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
        geomFingerprint: polygonFingerprint(bldg.vertices),
        isConvex: isPolygonConvex(bldg.vertices),
        bldgRef: bldg,
        buildingType: defaultBldgType,
      },
    ];
  }

  return [];
}

let cachedLinijka: { key: string; inst: LinijkaSolarSystem } | null = null;
function getLinijkaInstance(lat: number, lon: number, date: 'spring' | 'autumn'): LinijkaSolarSystem {
  const k = `${lat}|${lon}|${date}`;
  if (cachedLinijka && cachedLinijka.key === k) return cachedLinijka.inst;
  const inst = new LinijkaSolarSystem(lat, lon, date);
  cachedLinijka = { key: k, inst };
  return inst;
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
    const linijkaSys = getLinijkaInstance(latitude, longitude, equinoxDate);
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

  return {
    azimuthDeg,
    elevationDeg: clampedElevationDeg,
    sunVector: { x: shadowDirX, y: shadowDirY },
    shadowScale,
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
  hBottom: number = 0,
  geomFingerprint?: string,
  isConvexKnown?: boolean
): Point2D[] {
  if (!polygon || polygon.length < 3) return [];

  const fp = geomFingerprint ?? polygonFingerprint(polygon);
  const cacheKey = `${fp}|${hTop.toFixed(2)}|${hBottom.toFixed(2)}|${solarAngles.azimuthDeg.toFixed(2)}|${solarAngles.elevationDeg.toFixed(2)}`;
  const cached = storyShadowCache.get(cacheKey);
  if (cached) return cached;

  const result = computeStoryShadowPolygonUncached(polygon, solarAngles, hTop, hBottom, isConvexKnown);

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
  hBottom: number = 0,
  geomFingerprint?: string,
  isConvexKnown?: boolean
): PolygonWithHoles[] {
  const outerShadow = computeStoryShadowPolygon(polygon, solarAngles, hTop, hBottom, geomFingerprint, isConvexKnown);
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
  hBottom: number,
  isConvexKnown?: boolean
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

  const isConvex = isConvexKnown !== undefined ? isConvexKnown : isPolygonConvex(polygon);

  // Dla wielokątów wypukłych: szybka otoczka wypukła
  if (isConvex) {
    const shadowPoints: Point2D[] = [
      ...polygon.map((v) => ({ x: v.x + baseOffset.dx, y: v.y + baseOffset.dy })),
      ...polygon.map((v) => ({ x: v.x + topOffset.dx, y: v.y + topOffset.dy })),
    ];
    return computeConvexHull(shadowPoints);
  }

  const shadowLoops: Point2D[][] = [];

  // Podstawa
  shadowLoops.push(polygon.map((p) => ({ x: p.x + baseOffset.dx, y: p.y + baseOffset.dy })));

  // Dach
  shadowLoops.push(polygon.map((p) => ({ x: p.x + topOffset.dx, y: p.y + topOffset.dy })));

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

      const ribbonLoop: Point2D[] = chainVertices.map((v) => ({ x: v.x + baseOffset.dx, y: v.y + baseOffset.dy }));
      for (let c = chainVertices.length - 1; c >= 0; c--) {
        ribbonLoop.push({ x: chainVertices[c].x + topOffset.dx, y: chainVertices[c].y + topOffset.dy });
      }
      shadowLoops.push(ribbonLoop);
    }
  }

  try {
    const unionResult = unionPolygonLoops(shadowLoops);
    if (unionResult.length > 0) {
      // Wybieramy poligon o największym polu powierzchni
      let bestLoop = unionResult[0];
      let maxArea = Math.abs(calculateSignedArea(bestLoop));
      for (const loop of unionResult) {
        const area = Math.abs(calculateSignedArea(loop));
        if (area > maxArea) {
          maxArea = area;
          bestLoop = loop;
        }
      }
      if (bestLoop.length >= 3) {
        return bestLoop;
      }
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

export { computeConvexHull };


