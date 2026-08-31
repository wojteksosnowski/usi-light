import { describe, it, expect } from 'vitest';
import { computePolygonArea, adjustEdgeLength } from '../src/utils/math2d';
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
});
