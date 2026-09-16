import { BuildingLoop } from '../types/geometry';
import { computePointsBoundingBox, PolygonWithHoles } from '@/utils/math2d/polygons';

/**
 * Cache geometrii pochodnej per obiekt `BuildingLoop`, kluczowany przez tożsamość
 * referencji obiektu. Store (`useSceneStore`) konsekwentnie stosuje wzorzec
 * immutable-replace: każda mutacja geometrii budynku zwraca nowy obiekt, a budynki
 * nietknięte w danym update zachowują tę samą referencję. Dzięki temu `WeakMap`
 * inwaliduje się "za darmo" — bez jawnych flag dirty/wersji — i jest automatycznie
 * odśmiecany, gdy budynek zostaje zastąpiony lub usunięty ze sceny.
 */

export interface BuildingAABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const buildingAabbCache = new WeakMap<BuildingLoop, BuildingAABB>();

export function getBuildingAABB(bldg: BuildingLoop): BuildingAABB | null {
  if (!bldg.vertices || bldg.vertices.length < 3) return null;
  const cached = buildingAabbCache.get(bldg);
  if (cached) return cached;

  const { minX, maxX, minY, maxY } = computePointsBoundingBox(bldg.vertices);
  const aabb: BuildingAABB = { minX, maxX, minY, maxY };
  buildingAabbCache.set(bldg, aabb);
  return aabb;
}

/**
 * Cień budynku zależy od jego geometrii ORAZ pozycji słońca — klucz "kubełka"
 * pozycji słońca koduje wszystkie parametry wpływające na wynik, z `hourFraction`
 * zaokrąglonym do 5-minutowych kroków (dobry balans trafień cache vs. płynność
 * przy interaktywnym przeciąganiu suwaka godziny).
 */
export type SunBucketKey = string;

export function makeSunBucketKey(
  storyIndex: number,
  algorithm: string,
  method: string,
  lat: number,
  lng: number,
  equinoxDate: string,
  hourFraction: number,
  sampleOffsetMin: number,
  /** Dodatkowy dyskryminator klucza (np. wysokość odbierającej kondygnacji dla cieni dachowych,
   * gdzie ten sam budynek-przeszkoda daje różny ΔH względem różnych odbiorców). */
  extra: string = ''
): SunBucketKey {
  const hourBucket = Math.round(hourFraction * 12) / 12; // kroki co 5 minut (1/12 h)
  return `${storyIndex}|${algorithm}|${method}|${lat.toFixed(4)}|${lng.toFixed(4)}|${equinoxDate}|${hourBucket}|${sampleOffsetMin}|${extra}`;
}

export const buildingShadowCache = new WeakMap<BuildingLoop, Map<SunBucketKey, PolygonWithHoles[]>>();

export function getCachedBuildingShadow(
  bldg: BuildingLoop,
  key: SunBucketKey
): PolygonWithHoles[] | undefined {
  return buildingShadowCache.get(bldg)?.get(key);
}

export function setCachedBuildingShadow(
  bldg: BuildingLoop,
  key: SunBucketKey,
  shadow: PolygonWithHoles[]
): void {
  let inner = buildingShadowCache.get(bldg);
  if (!inner) {
    inner = new Map();
    buildingShadowCache.set(bldg, inner);
  }
  inner.set(key, shadow);
}

/**
 * Zwraca cień z cache'u dla `(bldg, key)`, licząc i zapisując go dopiero przy chybieniu.
 * Bez `bldg` (np. tier bez referencji do źródłowego budynku) liczy bez cache'owania.
 */
export function getOrComputeBuildingShadow(
  bldg: BuildingLoop | undefined,
  key: SunBucketKey,
  compute: () => PolygonWithHoles[]
): PolygonWithHoles[] {
  if (!bldg) return compute();
  const cached = getCachedBuildingShadow(bldg, key);
  if (cached) return cached;
  const result = compute();
  setCachedBuildingShadow(bldg, key, result);
  return result;
}

