import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runFullAnalysis } from '../src/engine/analysisEngine';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { BuildingLoop, ProjectSettings } from '../src/types/geometry';

describe('Performance Benchmark on reference/wro.json', () => {
  const wroPath = path.resolve(__dirname, '../reference/wro.json');
  const fileExists = fs.existsSync(wroPath);

  it('runs analysis on wro.json without crashes or hangs', () => {
    if (!fileExists) {
      console.warn('reference/wro.json not found, skipping large benchmark.');
      return;
    }

    const data = JSON.parse(fs.readFileSync(wroPath, 'utf8'));
    const buildings: BuildingLoop[] = data.buildings;
    const settings: ProjectSettings = data.settings || {
      latitude: 51.1079,
      longitude: 17.0385,
      equinoxDate: 'spring',
    };

    expect(buildings.length).toBeGreaterThanOrEqual(30);

    // 1. Test live resolution analysis (fast mesh)
    const t0 = performance.now();
    const resLive = runFullAnalysis(
      buildings,
      settings,
      { samplingInterval: 2.0, angleStepDeg: 2.0, sunlightStepMinutes: 15 },
      'raycasting'
    );
    const t1 = performance.now();

    expect(resLive.results.length).toBeGreaterThan(500);
    expect(t1 - t0).toBeLessThan(10000); // Must finish within 10s under heavy load

    // 2. Add new user rectangle dynamically
    const newRectVerts = [
      { x: 100, y: 100 },
      { x: 130, y: 100 },
      { x: 130, y: 120 },
      { x: 100, y: 120 },
    ];
    const newBldg = createBuildingFromVertices(newRectVerts, 'Budynek Nowy Test', 15.0, false);
    const updatedBuildings = [...buildings, newBldg];

    // 3. Re-run analysis with newly added rectangle
    const t2 = performance.now();
    const resUpdated = runFullAnalysis(
      updatedBuildings,
      settings,
      { samplingInterval: 1.0, angleStepDeg: 1.0, sunlightStepMinutes: 10 },
      'raycasting'
    );
    const t3 = performance.now();

    expect(resUpdated.results.length).toBeGreaterThan(resLive.results.length);
    expect(t3 - t2).toBeLessThan(10000); // Heavy load margin
  });

  it('maintains constant fast execution time during 30 consecutive rapid moves', () => {
    if (!fileExists) return;

    const data = JSON.parse(fs.readFileSync(wroPath, 'utf8'));
    let buildings: BuildingLoop[] = [...data.buildings];
    const settings: ProjectSettings = data.settings || {
      latitude: 51.1079,
      longitude: 17.0385,
      equinoxDate: 'spring',
    };

    const newRect = createBuildingFromVertices(
      [
        { x: 50, y: 50 },
        { x: 80, y: 50 },
        { x: 80, y: 70 },
        { x: 50, y: 70 },
      ],
      'Draggable Bldg',
      15.0,
      true
    );
    buildings.push(newRect);

    const moveDurations: number[] = [];

    // Simulate 30 consecutive moves (rapid mouse dragging)
    for (let step = 1; step <= 30; step++) {
      const dx = 1.5;
      const dy = 0.8;
      buildings = buildings.map((b) => {
        if (b.id !== newRect.id) return b;
        const newVerts = b.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
        const newSegs = b.segments.map((s) => ({
          ...s,
          p1: { x: s.p1.x + dx, y: s.p1.y + dy },
          p2: { x: s.p2.x + dx, y: s.p2.y + dy },
        }));
        return { ...b, vertices: newVerts, segments: newSegs };
      });

      const t0 = performance.now();
      const res = runFullAnalysis(
        buildings,
        settings,
        { samplingInterval: 1.5, angleStepDeg: 1.5, sunlightStepMinutes: 15 },
        'raycasting'
      );
      const t1 = performance.now();
      moveDurations.push(t1 - t0);
      expect(res.results.length).toBeGreaterThan(1000);
    }

    // Verify time does not grow unbounded with consecutive moves (no performance degradation or leak)
    const first5Avg = moveDurations.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const last5Avg = moveDurations.slice(-5).reduce((a, b) => a + b, 0) / 5;

    // Both initial and final moves must maintain fast interactive speed (< 1800ms during heavy parallel test runs) on a heavy 30+ building scene
    expect(first5Avg).toBeLessThan(1800);
    expect(last5Avg).toBeLessThan(1800);
  }, 45000);
});

