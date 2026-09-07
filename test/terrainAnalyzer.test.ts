import { describe, it, expect } from 'vitest';
import { sampleGrid, polygonCentroid } from '../src/modules/wfs-import/utils/terrainAnalyzer';
import { AaigridData } from '../src/modules/wfs-import/services/wcsGugikClient';

describe('Terrain Analyzer LiDAR Grid Logic', () => {
  const dummyGrid: AaigridData = {
    ncols: 4,
    nrows: 4,
    xllcorner: 100,
    yllcorner: 200,
    cellsize: 10,
    nodata: -9999,
    data: new Float32Array([
      110, 110, 110, 110,
      110, 125, 125, 110,
      110, 125, 125, 110,
      110, 110, 110, 110,
    ]),
  };

  it('samples grid values accurately by coordinates', () => {
    // Top-left: row 0, col 0 -> (100, 200)
    expect(sampleGrid(dummyGrid, 100, 200)).toBe(110);
    // Center roof: row 1, col 1 -> (110, 210)
    expect(sampleGrid(dummyGrid, 110, 210)).toBe(125);
  });

  it('returns nodata / NaN for coordinates outside grid boundary', () => {
    expect(sampleGrid(dummyGrid, 50, 50)).toBe(-9999);
  });

  it('calculates polygon centroid accurately', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    const centroid = polygonCentroid(square);
    expect(centroid.x).toBe(10);
    expect(centroid.y).toBe(10);
  });
});
