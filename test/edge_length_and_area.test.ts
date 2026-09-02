import { describe, it, expect } from 'vitest';
import { computePolygonArea, adjustEdgeLength, computeBuildingsUnionArea } from '../src/utils/math2d';
import { Point2D } from '../src/types/geometry';

describe('Polygon Area and Edge Length Adjustment', () => {
  it('computes accurate polygon area using Shoelace formula', () => {
    // 10m x 20m rectangle => 200 m²
    const rect: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    expect(computePolygonArea(rect)).toBeCloseTo(200, 2);

    // Triangle base 10, height 10 => 50 m²
    const triangle: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(computePolygonArea(triangle)).toBeCloseTo(50, 2);
  });

  it('adjusts edge length with fixed start and parallel offset of attached edge', () => {
    // 10m x 20m rectangle
    const rect: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];

    // Expand edge 0 (from (0,0)->(10,0)) from 10m to 15m
    const adjusted = adjustEdgeLength(rect, 0, 15);
    // V0 remains (0,0)
    expect(adjusted[0]).toEqual({ x: 0, y: 0 });
    // V1 moves to (15,0)
    expect(adjusted[1].x).toBeCloseTo(15, 2);
    expect(adjusted[1].y).toBeCloseTo(0, 2);
    // V2 (attached to edge 1) shifts by +5 along X => (15, 20)
    expect(adjusted[2].x).toBeCloseTo(15, 2);
    expect(adjusted[2].y).toBeCloseTo(20, 2);
    // V3 remains (0, 20)
    expect(adjusted[3]).toEqual({ x: 0, y: 20 });

    // New area should be 15 * 20 = 300 m²
    expect(computePolygonArea(adjusted)).toBeCloseTo(300, 2);
  });

  it('strictly preserves the direction (angles) of all segments in L-shaped and non-rectangular polygons', () => {
    // L-shaped polygon (6 vertices)
    const lShape: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];

    // Helper to compute normalized segment directions (dx/len, dy/len)
    const getDirections = (pts: Point2D[]) => {
      const dirs: { ux: number; uy: number }[] = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const pA = pts[i];
        const pB = pts[(i + 1) % n];
        const len = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        dirs.push({ ux: (pB.x - pA.x) / len, uy: (pB.y - pA.y) / len });
      }
      return dirs;
    };

    const origDirs = getDirections(lShape);

    // Adjust edge 1 (from (10,0) to (10,5)) to new length 8
    const adjLShape = adjustEdgeLength(lShape, 1, 8);
    const newDirs = getDirections(adjLShape);

    for (let i = 0; i < origDirs.length; i++) {
      expect(newDirs[i].ux).toBeCloseTo(origDirs[i].ux, 4);
      expect(newDirs[i].uy).toBeCloseTo(origDirs[i].uy, 4);
    }

    // Triangular polygon with slanted edges
    const triangle: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ];
    const origTriDirs = getDirections(triangle);
    const adjTri = adjustEdgeLength(triangle, 0, 15);
    const newTriDirs = getDirections(adjTri);

    for (let i = 0; i < origTriDirs.length; i++) {
      expect(newTriDirs[i].ux).toBeCloseTo(origTriDirs[i].ux, 4);
      expect(newTriDirs[i].uy).toBeCloseTo(origTriDirs[i].uy, 4);
    }
  });

  it('performs instant edge length adjustments on complex real-world wro.json buildings', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const wroPath = path.resolve(__dirname, '../reference/wro.json');
    if (!fs.existsSync(wroPath)) return;

    const data = JSON.parse(fs.readFileSync(wroPath, 'utf8'));
    const buildings = data.buildings;
    expect(buildings.length).toBeGreaterThan(10);

    const tStart = performance.now();
    let adjustmentsCount = 0;

    for (const bldg of buildings) {
      if (bldg.vertices && bldg.vertices.length >= 3) {
        for (let i = 0; i < bldg.vertices.length; i++) {
          const adj = adjustEdgeLength(bldg.vertices, i, 25.0);
          expect(adj.length).toBe(bldg.vertices.length);
          adjustmentsCount++;
        }
      }
    }
    const tTotal = performance.now() - tStart;
    const avgPerAdjustmentMs = tTotal / adjustmentsCount;
    // Must be well under 0.5ms per adjustment (sub-millisecond 60 FPS guarantee)
    expect(avgPerAdjustmentMs).toBeLessThan(0.5);
  });

  it('computes union area of multiple buildings correctly without double-counting overlaps', () => {
    // bldg1: 10x10 at (0,0) -> area 100
    const bldg1 = {
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };

    // bldg2: disjoint 10x10 at (20,0) -> area 100 => total 200
    const bldg2 = {
      vertices: [
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 20, y: 10 },
      ],
    };
    expect(computeBuildingsUnionArea([bldg1, bldg2])).toBeCloseTo(200, 2);

    // bldg3: overlapping 10x10 at (5,0) -> overlaps bldg1 by 5x10 (50 m²) => union area 150
    const bldg3 = {
      vertices: [
        { x: 5, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 10 },
        { x: 5, y: 10 },
      ],
    };
    expect(computeBuildingsUnionArea([bldg1, bldg3])).toBeCloseTo(150, 2);

    // bldg4: totally inside bldg1 (2x2 at (2,2)) => union area is still 100
    const bldg4 = {
      vertices: [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 4 },
        { x: 2, y: 4 },
      ],
    };
    expect(computeBuildingsUnionArea([bldg1, bldg4])).toBeCloseTo(100, 2);
  });
});

