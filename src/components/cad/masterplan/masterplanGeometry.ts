import { Point2D, BuildingLoop } from '../../../types/geometry';
import { calculateSolarPosition } from '../../../utils/solar';
import polygonClipping from 'polygon-clipping';
import {
  isPolygonCCW,
  isPolygonConvex,
  computeConvexHull,
  unionPolygonLoops,
  intersectionPolygonLoops,
} from '../../../utils/math2d/polygons';

export interface SolarAngles {
  azimuthDeg: number;
  elevationDeg: number;
  sunVector: { x: number; y: number };
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
    if (tiers.length > 0) return tiers;
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

  return {
    azimuthDeg: pos.azimuthDeg,
    elevationDeg: Math.max(1.0, pos.elevationDeg), // min 1 stopień by uniknąć dzielenia przez 0
    sunVector: { x: shadowDirX, y: shadowDirY },
  };
}

/**
 * Wylicza wektor przesunięcia cienia rzucanego na płaszczyznę o różnicy wysokości deltaH.
 */
export function computeShadowOffsetVector(
  deltaH: number,
  solarAngles: SolarAngles
): { dx: number; dy: number; length: number } {
  if (deltaH <= 0 || solarAngles.elevationDeg <= 0) {
    return { dx: 0, dy: 0, length: 0 };
  }

  const elevRad = (solarAngles.elevationDeg * Math.PI) / 180;
  const length = deltaH / Math.tan(elevRad);

  return {
    dx: solarAngles.sunVector.x * length,
    dy: solarAngles.sunVector.y * length,
    length,
  };
}

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
  const azRad = (solarAngles.azimuthDeg * Math.PI) / 180;
  const sunRayDir = { x: Math.sin(azRad), y: Math.cos(azRad) };

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

/** Odchyla azymut słońca o `deltaDeg`, przeliczając `sunVector` (elewacja zostaje bez zmian). */
function perturbAzimuth(solarAngles: SolarAngles, deltaDeg: number): SolarAngles {
  const azimuthDeg = solarAngles.azimuthDeg + deltaDeg;
  const azRad = (azimuthDeg * Math.PI) / 180;
  return {
    azimuthDeg,
    elevationDeg: solarAngles.elevationDeg,
    sunVector: { x: -Math.sin(azRad), y: -Math.cos(azRad) },
  };
}

export { computeConvexHull };

