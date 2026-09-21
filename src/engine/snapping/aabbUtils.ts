import { Point2D } from '../../types/geometry';

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Oblicza bounding box otaczający wszystkie punkty, opcjonalnie rozszerzony o `padding`
 * w każdym kierunku. Konsoliduje ręczną akumulację min/max powtórzoną w SpatialLineIndex.ts
 * (bbox pojedynczej krawędzi) i objectDragSnap.ts (bbox przemieszczanej bryły / krawędzi
 * przeciąganej z progiem snapowania).
 */
export function computeAABB(points: Point2D[], padding = 0): AABB {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}
