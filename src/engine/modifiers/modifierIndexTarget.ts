import { StoryFootprint } from '../../types/modifiers';

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
