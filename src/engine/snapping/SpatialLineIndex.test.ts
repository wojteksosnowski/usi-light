import { describe, it, expect } from 'vitest';
import { SpatialLineIndex } from './SpatialLineIndex';
import { createCachedLineEquation, CachedLineEquation } from '../../utils/lineBufferEngine';

function linearQuery(lineBuffer: CachedLineEquation[], minX: number, minY: number, maxX: number, maxY: number) {
  return lineBuffer.filter((e) => {
    const eMinX = Math.min(e.p1.x, e.p2.x);
    const eMaxX = Math.max(e.p1.x, e.p2.x);
    const eMinY = Math.min(e.p1.y, e.p2.y);
    const eMaxY = Math.max(e.p1.y, e.p2.y);
    return eMinX <= maxX && eMaxX >= minX && eMinY <= maxY && eMaxY >= minY;
  });
}

describe('SpatialLineIndex', () => {
  const lineBuffer: CachedLineEquation[] = [];
  for (let i = 0; i < 200; i++) {
    lineBuffer.push(
      createCachedLineEquation(`edge_${i}`, `bldg_${i % 5}`, i, { x: i, y: i }, { x: i + 1, y: i })
    );
  }

  it('rebuilds once per lineBuffer reference and returns the same candidates as a linear scan', () => {
    const index = new SpatialLineIndex();
    index.rebuildIfStale(lineBuffer);

    const queries: [number, number, number, number][] = [
      [5, -1, 7, 1],
      [0, 0, 0, 0],
      [150, 148, 160, 152],
      [-10, -10, -5, -5],
    ];

    for (const [minX, minY, maxX, maxY] of queries) {
      const fromIndex = new Set(index.queryBBox(minX, minY, maxX, maxY).map((e) => e.id));
      const fromLinear = new Set(linearQuery(lineBuffer, minX, minY, maxX, maxY).map((e) => e.id));
      expect(fromIndex).toEqual(fromLinear);
    }
  });

  it('does not rebuild when the lineBuffer reference is unchanged', () => {
    const index = new SpatialLineIndex();
    index.rebuildIfStale(lineBuffer);
    const firstResult = index.queryBBox(0, 0, 2, 2).map((e) => e.id);

    index.rebuildIfStale(lineBuffer);
    const secondResult = index.queryBBox(0, 0, 2, 2).map((e) => e.id);

    expect(secondResult).toEqual(firstResult);
  });

  it('rebuilds when given a new lineBuffer reference reflecting a geometry change', () => {
    const index = new SpatialLineIndex();
    index.rebuildIfStale(lineBuffer);

    const extraBuffer = [
      ...lineBuffer,
      createCachedLineEquation('extra_edge', 'bldg_extra', 0, { x: 500, y: 500 }, { x: 501, y: 500 }),
    ];
    index.rebuildIfStale(extraBuffer);

    const result = index.queryBBox(499, 499, 502, 501).map((e) => e.id);
    expect(result).toContain('extra_edge');
  });
});
