import { Point2D } from '../../types/geometry';
import { StoryFootprint } from '../../types/modifiers';
import { distance, squaredDistance } from '../../utils/math2d/vec2';

export interface IndexTargetResolution {
  isHole: boolean;
  holeIndex?: number;
  localIndex?: number;
}

/**
 * Rozwiązuje globalny indeks (krawędzi lub wierzchołka) na obrys zewnętrzny lub konkretny otwór
 * dziedzińca danej kondygnacji, zgodnie z konwencją: zewnętrzne 0..n-1, następnie kolejne otwory.
 */
export function resolveIndexTarget(footprint: StoryFootprint, globalIndex: number | undefined): IndexTargetResolution {
  const outerLen = footprint.polygon.length;
  if (globalIndex === undefined || globalIndex < outerLen || !footprint.holes) {
    return { isHole: false };
  }
  let offset = outerLen;
  for (let h = 0; h < footprint.holes.length; h++) {
    const hLen = footprint.holes[h].length;
    if (globalIndex < offset + hLen) {
      return { isHole: true, holeIndex: h, localIndex: globalIndex - offset };
    }
    offset += hLen;
  }
  return { isHole: false };
}

/**
 * Znajduje lokalny indeks krawędzi we fragmencie obrysu (jednym z kilku rozłącznych
 * fragmentów tej samej kondygnacji po przecięciu bramą), która geometrycznie odpowiada
 * krawędzi `originalEdgeIndex` z pierwotnego obrysu budynku (`baseVertices`). Konieczne,
 * bo po `gate` pozycja tablicowa i lokalna numeracja krawędzi we fragmencie przestają
 * odpowiadać oryginalnej numeracji — ta sama liczbowa wartość `edgeIndex` może istnieć
 * w KAŻDYM fragmencie, ale wskazywać zupełnie inną, niepowiązaną ścianę.
 * Zwraca lokalny indeks krawędzi o największym pokryciu z oryginalną krawędzią (w tolerancji),
 * albo `null`, jeśli dany fragment w ogóle nie zawiera fragmentu tej ściany.
 */
export function resolveFragmentEdgeIndex(
  fragment: StoryFootprint,
  originalEdgeIndex: number,
  baseVertices: Point2D[],
  tol = 0.01
): number | null {
  if (originalEdgeIndex < 0 || originalEdgeIndex >= baseVertices.length) return null;
  const a = baseVertices[originalEdgeIndex];
  const b = baseVertices[(originalEdgeIndex + 1) % baseVertices.length];
  const abLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (abLen < 1e-9) return null;
  const ux = (b.x - a.x) / abLen;
  const uy = (b.y - a.y) / abLen;

  let bestIdx: number | null = null;
  let bestOverlap = 0;
  const n = fragment.polygon.length;
  for (let i = 0; i < n; i++) {
    const p = fragment.polygon[i];
    const q = fragment.polygon[(i + 1) % n];

    const distP = Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
    const distQ = Math.abs((q.x - a.x) * uy - (q.y - a.y) * ux);
    if (distP > tol || distQ > tol) continue;

    const tp = (p.x - a.x) * ux + (p.y - a.y) * uy;
    const tq = (q.x - a.x) * ux + (q.y - a.y) * uy;
    const loT = Math.max(0, Math.min(tp, tq));
    const hiT = Math.min(abLen, Math.max(tp, tq));
    const overlap = hiT - loT;

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIdx = i;
    }
  }

  return bestOverlap > tol ? bestIdx : null;
}

/**
 * Odnajduje lokalny indeks krawędzi we fragmencie na podstawie DZIEDZICZONEGO ID (`footprint.edgeOrigins`),
 * zamiast dopasowania geometrycznego od zera. To właściwy mechanizm "dziedziczenia ID krawędzi":
 * `edgeOrigins[i]` niesie numer krawędzi z `baseVertices`, po której dziedziczy bieżąca krawędź `i`,
 * przekazywany krok po kroku przez potok (patrz `deriveEdgeOrigins` poniżej). Zwraca `null`, jeśli
 * `edgeOrigins` nie jest jeszcze dostępne (wywołujący powinien wtedy spaść na dopasowanie geometryczne
 * względem `baseVertices` jako fallback) albo żadna krawędź fragmentu nie dziedziczy po tym indeksie.
 */
export function findEdgeByOrigin(
  edgeOrigins: (number | null)[] | undefined,
  originalEdgeIndex: number
): number | null {
  if (!edgeOrigins) return null;
  const idx = edgeOrigins.indexOf(originalEdgeIndex);
  return idx >= 0 ? idx : null;
}

/**
 * Po operacji boolowskiej (`polygon-clipping` union/difference w `sanitizeStoryFootprint` i
 * `cutGateFromFootprint`), która odrzuca wszelkie metadane i może przenumerować/przestawić
 * wierzchołki, odtwarza `edgeOrigins` dla NOWEGO obrysu przez dopasowanie każdej nowej krawędzi
 * (kolinowość + maksymalne pokrycie) do krawędzi obrysu SPRZED operacji (już otagowanych).
 * To jest właściwe "dziedziczenie" — tag przechodzi z rodzica na potomka krok po kroku, zamiast
 * być zgadywany od nowa względem `baseVertices` po wielu krokach (co przy drobnych, prawie
 * współliniowych ścianach może dawać fałszywe dopasowania). Krawędzie bez pokrycia z żadną
 * krawędzią sprzed operacji (nowo powstałe, np. ściana tunelu bramy) dostają `null`.
 */
export function deriveEdgeOrigins(
  newPolygon: Point2D[],
  oldPolygon: Point2D[],
  oldEdgeOrigins: (number | null)[] | undefined,
  tol = 0.01
): (number | null)[] {
  const n = newPolygon.length;
  const m = oldPolygon.length;
  const origins: (number | null)[] = new Array(n).fill(null);
  if (m === 0) return origins;

  // Krawędzie, które nie znajdą pokrycia kolinearnego (patrz pętla niżej), a mimo to liczba krawędzi
  // się nie zmieniła (np. `miterOffsetPolygon` przesuwa KAŻDĄ krawędź równolegle — kolinearność z
  // oryginałem ginie, ale odpowiedniość pozycyjna i tak jest poprawna; podobnie `generateTerracePolygon`
  // dla dwóch krawędzi sąsiadujących z przesuniętym narożnikiem) dostają tag ze SWOJEJ pozycji jako
  // fallback, zamiast `null` — wciąż ta sama ściana, tylko zmieniona arytmetycznie, nie przez cięcie.
  const positionalFallback = n === m;

  for (let i = 0; i < n; i++) {
    const p = newPolygon[i];
    const q = newPolygon[(i + 1) % n];
    const pqLen = Math.hypot(q.x - p.x, q.y - p.y);
    if (pqLen < 1e-9) continue;
    const ux = (q.x - p.x) / pqLen;
    const uy = (q.y - p.y) / pqLen;

    let bestTag: number | null = null;
    let bestOverlap = 0;
    for (let j = 0; j < m; j++) {
      const a = oldPolygon[j];
      const b = oldPolygon[(j + 1) % m];

      const distA = Math.abs((a.x - p.x) * uy - (a.y - p.y) * ux);
      const distB = Math.abs((b.x - p.x) * uy - (b.y - p.y) * ux);
      if (distA > tol || distB > tol) continue;

      const ta = (a.x - p.x) * ux + (a.y - p.y) * uy;
      const tb = (b.x - p.x) * ux + (b.y - p.y) * uy;
      const loT = Math.max(0, Math.min(ta, tb));
      const hiT = Math.min(pqLen, Math.max(ta, tb));
      const overlap = hiT - loT;

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        // Brak `oldEdgeOrigins` oznacza utraconą linię dziedziczenia (np. po corner_cut, który jej
        // jeszcze nie prowadzi) — nie zgadujemy tagu z pozycji, zostaje `null` (nieznane pochodzenie).
        bestTag = oldEdgeOrigins ? oldEdgeOrigins[j] ?? null : null;
      }
    }

    if (bestOverlap > tol) {
      origins[i] = bestTag;
    } else if (positionalFallback) {
      origins[i] = oldEdgeOrigins ? oldEdgeOrigins[i] ?? null : i;
    }
  }

  return origins;
}

/**
 * Odpowiednik `deriveEdgeOrigins` dla otworów (dziedzińce/patio). Otwory nie mają odpowiednika
 * w `baseVertices` — każdy otwór ma WŁASNĄ, niezależną numerację nadawaną w chwili powstania
 * (np. przez `donut`). Dla każdego otworu WYNIKOWEGO dopasowuje najlepiej pokrywający się otwór
 * WEJŚCIOWY (po liczbie odziedziczonych krawędzi) i przenosi jego tagi przez `deriveEdgeOrigins`;
 * otwór bez pokrycia z żadnym otworem sprzed operacji jest traktowany jako nowo powstały i dostaje
 * świeżą tożsamość (0..n-1) — to samo uniwersalne dziedziczenie co dla obrysu zewnętrznego, ale
 * stosowane per-otwór, bo boolean-op (`sanitizeStoryFootprint`, `cutGateFromFootprint`) może
 * scalać/dzielić/przenumerowywać otwory niezależnie od obrysu zewnętrznego.
 */
export function deriveHoleOrigins(
  newHoles: Point2D[][],
  oldHoles: Point2D[][] | undefined,
  oldHoleOrigins: (number | null)[][] | undefined,
  tol = 0.01
): (number | null)[][] {
  return newHoles.map((newHole) => {
    if (!oldHoles || oldHoles.length === 0) {
      return newHole.map((_, i) => i);
    }

    let best: (number | null)[] | null = null;
    let bestScore = 0;
    for (let h = 0; h < oldHoles.length; h++) {
      const derived = deriveEdgeOrigins(newHole, oldHoles[h], oldHoleOrigins?.[h], tol);
      const score = derived.filter((t) => t !== null).length;
      if (score > bestScore) {
        bestScore = score;
        best = derived;
      }
    }

    return best && bestScore > 0 ? best : newHole.map((_, i) => i);
  });
}

/**
 * Znajduje lokalny indeks wierzchołka we fragmencie obrysu odpowiadający wierzchołkowi
 * `originalVertexIndex` z pierwotnego obrysu budynku. Zob. `resolveFragmentEdgeIndex`.
 */
export function resolveFragmentVertexIndex(
  fragment: StoryFootprint,
  originalVertexIndex: number,
  baseVertices: Point2D[],
  tol = 0.01
): number | null {
  if (originalVertexIndex < 0 || originalVertexIndex >= baseVertices.length) return null;
  const target = baseVertices[originalVertexIndex];

  let bestIdx: number | null = null;
  let bestDist = tol;
  for (let i = 0; i < fragment.polygon.length; i++) {
    const dist = distance(fragment.polygon[i], target);
    if (dist <= bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Cyklicznie wyrównuje wierzchołki nowego pierścienia (np. zwróconego przez polygon-clipping,
 * który sortuje leksykograficznie wg min X/Y) tak, aby wierzchołek początkowy [0] odpowiadał
 * punktowi startowemu pierścienia oryginalnego. Zapobiega to przeskakiwaniu indeksów krawędzi
 * przy obrocie bryły w scenie.
 */
export function alignRingStartToOriginal(
  newRing: Point2D[],
  originalRing: Point2D[] | undefined
): Point2D[] {
  if (!newRing || newRing.length < 3 || !originalRing || originalRing.length < 3) {
    return newRing;
  }
  const origStart = originalRing[0];
  let bestIdx = 0;
  let minDistSq = Infinity;

  for (let i = 0; i < newRing.length; i++) {
    const distSq = squaredDistance(newRing[i], origStart);
    if (distSq < minDistSq) {
      minDistSq = distSq;
      bestIdx = i;
    }
  }

  if (bestIdx === 0) return newRing;
  return [...newRing.slice(bestIdx), ...newRing.slice(0, bestIdx)];
}

