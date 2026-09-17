import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BuildingLoop, Point2D } from '../src/types/geometry';
import { buildLineBufferFromBuildings, flattenLineBuffer } from '../src/utils/lineBufferEngine';
import { SnapCoordinator, SnapContext } from '../src/engine/snapping';
import { SpatialLineIndex } from '../src/engine/snapping/SpatialLineIndex';

describe('Snap & Spatial Performance Benchmarks - Warszawa Dataset (372 Buildings)', () => {
  const filePath = path.resolve('C:/py/usi-light/reference/warszawa.json');
  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const buildings: BuildingLoop[] = rawData.buildings;

  const lineBufferMap = buildLineBufferFromBuildings(buildings);
  const lineBuffer = flattenLineBuffer(lineBufferMap);

  const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 2.5, sy: wy * 2.5 });
  const screenToWorld = (sx: number, sy: number) => ({ wx: sx / 2.5, wy: sy / 2.5 });

  it('verifies flat lineBuffer size', () => {
    expect(lineBuffer.length).toBeGreaterThan(500);
  });

  it('Benchmark: SpatialLineIndex query performance across 10,000 spatial queries', () => {
    const index = new SpatialLineIndex();
    index.rebuildIfStale(lineBuffer);

    // Warm-up
    for (let i = 0; i < 50; i++) {
      index.queryBBox(500, 500, 520, 520);
    }

    const testPoints: Point2D[] = lineBuffer.slice(0, 100).map((e) => e.p1);
    const numQueries = 10000;
    const radius = 5.0; // 5 meters bounding box

    const start = performance.now();
    let totalFound = 0;

    for (let i = 0; i < numQueries; i++) {
      const pt = testPoints[i % testPoints.length];
      const results = index.queryBBox(pt.x - radius, pt.y - radius, pt.x + radius, pt.y + radius);
      totalFound += results.length;
    }

    const elapsed = performance.now() - start;
    const avgPerQueryUs = (elapsed / numQueries) * 1000; // microseconds
    const queriesPerSec = (numQueries / elapsed) * 1000;

    expect(totalFound).toBeGreaterThan(0);
    expect(avgPerQueryUs).toBeLessThan(50); // Mniej niz 50 mikrosekund na zapytanie
    expect(queriesPerSec).toBeGreaterThan(20000); // Ponad 20,000 zapytan na sekunde
  });

  it('Benchmark: SnapCoordinator.evaluate throughput across 10,000 cursor positions', () => {
    const coordinator = new SnapCoordinator();

    // Sample vertices across the scene
    const sampleVertices = lineBuffer.slice(0, 200).map((e) => e.p1);
    const numEvals = 10000;

    const start = performance.now();
    let snapCount = 0;

    for (let i = 0; i < numEvals; i++) {
      const v = sampleVertices[i % sampleVertices.length];
      // Test position slightly perturbed (e.g. 0.15m from vertex)
      const mouse: Point2D = { x: v.x + 0.1, y: v.y - 0.08 };
      const ctx: SnapContext = {
        mouseWorld: mouse,
        mouseScreen: worldToScreen(mouse.x, mouse.y),
        worldToScreen,
        screenToWorld,
        buildings,
        lineBuffer,
        isOsnapActive: true,
        isDirectionSnappingActive: false,
        thresholdPx: 14,
      };

      const res = coordinator.evaluate(mouse, ctx);
      if (res.snapped) snapCount++;
    }

    const elapsed = performance.now() - start;
    const avgPerEvalMs = elapsed / numEvals;
    const evalsPerSec = (numEvals / elapsed) * 1000;

    expect(snapCount).toBeGreaterThan(0);
    expect(avgPerEvalMs).toBeLessThan(0.15); // < 0.15 ms na ewaluacje (wysoki budzet dla 60/120fps)
    expect(evalsPerSec).toBeGreaterThan(6500); // Ponad 6500 klatek na sekunde czystej przepustowosci
  });
});
