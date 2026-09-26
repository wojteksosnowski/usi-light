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
  if (bldg.computed?.representation2D?.bounds2D) {
    const b = bldg.computed.representation2D.bounds2D;
    return { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y };
  }
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
 *
 * ZNANY PROBLEM (2026-09-26, zgłoszenie użytkownika — flicker na dachu WFS
 * "146510_8.0501.115_BUD" w Canvas Masterplan, `reference/speed/war-geo.json`):
 * to 5-minutowe kwantowanie jest DYSKRETNE — kształt cienia na dachu (Δ-wysokość,
 * `masterplanShadowCache.getCachedRoofShadowSamples`) potrafi "skoczyć" o dziesiątki
 * punktów procentowych pokrycia dachu między dwoma SĄSIEDNIMI kubełkami, jeśli
 * krawędź cienia sąsiedniego, wyższego budynku przemiata dany dach wystarczająco
 * szybko względem tempa zmiany azymutu słońca. Potwierdzone empirycznie oboma
 * metodami słonecznymi (`raycasting` i `segments`/Linijka — zjawisko nie zależy
 * od konkretnego modelu słonecznego, tylko od tej wspólnej warstwy cache'u) —
 * zmierzone skoki do ~50 punktów procentowych pokrycia dachu w jednym 5-minutowym
 * kroku (patrz `masterplanRoofFlicker.test.ts`, blok "targeted repro on
 * 146510_8.0501.115_BUD", detektor "BUCKET-TO-BUCKET JUMP DETECTION" — obecnie
 * celowo failing test dokumentujący ten błąd, dopóki nie zostanie naprawiony).
 *
 * To NIE jest błąd geometrii/boolowskich operacji — każdy pojedynczy kubełek jest
 * wewnętrznie spójny i policzony bez fallbacku do polygon-clipping. To jest realna
 * luka między ziarnistością kwantowania a czułością krawędzi cienia dla niektórych
 * (małych, blisko sąsiadującego wyższego budynku) dachów.
 *
 * Właściwe miejsce naprawy: warstwa renderująca (`masterplanRoofsRenderer.ts`),
 * NIE ta funkcja cache'u. Próba dodania cross-fade (alpha blend dwóch sąsiednich
 * kubełków) bezpośrednio tutaj / w `masterplanShadowCache.ts`, sterowana
 * `performance.now()`, została wypróbowana i COFNIĘTA (2026-09-26) — złamała
 * dane dla dowolnego wywołującego szybszego niż okno przejścia (w tym testy:
 * `poz.json` regression 0→58 fałszywych anomalii), bo stan czasu rzeczywistego
 * nie powinien żyć w współdzielonej funkcji cache'u czytanej też programowo/wsadowo.
 * Renderer ma już prawdziwą pętlę klatek (realne delty czasu) — to on powinien
 * przechowywać "narysowałem kubełek N w zeszłej klatce, teraz jest N+1, blenduj
 * przez kolejne kilka klatek" jako stan lokalny, podczas gdy ta funkcja cache'u
 * powinna nadal zwracać dokładną, niezblendowaną geometrię kubełka — żeby żaden
 * konsument odczytujący pole powierzchni z cienia nigdy nie dostał podwójnie
 * zliczonego wyniku.
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

