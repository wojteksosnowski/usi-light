import { Point2D } from '../../types/geometry';
import { StoryFootprint } from '../../types/modifiers';
import { distance } from '../../utils/math2d/vec2';

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
