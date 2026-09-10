import { StoryFootprint } from '../../types/modifiers';

export interface GlobalIndexOption {
  value: number;
  label: string;
}

/**
 * Buduje listę opcji indeksowanych globalnie (obrys zewnętrzny 0..n-1, następnie kolejne otwory dziedzińca),
 * zgodnie z konwencją indeksowania używaną przez modyfikatory (bay_window/terrace/corner_cut).
 * `kind` steruje wyłącznie etykietami — 'edge' dla krawędzi, 'vertex' dla narożników.
 */
export function buildGlobalIndexOptions(
  outerCount: number,
  storyPolygons: StoryFootprint[],
  kind: 'edge' | 'vertex'
): GlobalIndexOption[] {
  const outerLabel = kind === 'edge' ? (i: number) => `Ściana zewnętrzna #${i + 1}` : (i: number) => `Narożnik zewnętrzny #${i + 1}`;
  const holeLabel =
    kind === 'edge'
      ? (hIdx: number, lIdx: number) => `Dziedziniec #${hIdx + 1} - Krawędź #${lIdx + 1}`
      : (hIdx: number, lIdx: number) => `Dziedziniec #${hIdx + 1} - Narożnik #${lIdx + 1}`;

  const list: GlobalIndexOption[] = [];
  for (let i = 0; i < outerCount; i++) {
    list.push({ value: i, label: outerLabel(i) });
  }

  const sampleStoryWithHoles = storyPolygons.find((sp) => sp.holes && sp.holes.length > 0);
  if (sampleStoryWithHoles && sampleStoryWithHoles.holes) {
    let currGlobal = outerCount;
    sampleStoryWithHoles.holes.forEach((hole, hIdx) => {
      hole.forEach((_, lIdx) => {
        list.push({ value: currGlobal, label: holeLabel(hIdx, lIdx) });
        currGlobal++;
      });
    });
  }
  return list;
}
