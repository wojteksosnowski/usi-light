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
    expect(t1 - t0).toBeLessThan(1000); // Must finish within 1s

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
    expect(t3 - t2).toBeLessThan(1500);
  });
});
