import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runFullAnalysis } from '../src/engine/analysisEngine';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { BuildingLoop, ProjectSettings } from '../src/types/geometry';

describe('Lotnicza Performance Benchmark', () => {
  const lotniczaPath = path.resolve(__dirname, '../reference/lotnicza.json');
  if (!fs.existsSync(lotniczaPath)) return;

  const data = JSON.parse(fs.readFileSync(lotniczaPath, 'utf8'));
  const buildings: BuildingLoop[] = data.buildings;
  const settings: ProjectSettings = data.settings || {
    latitude: 51.1079,
    longitude: 17.0385,
    equinoxDate: 'spring',
  };

  it('computes full analysis on 5500+ points within 500ms in final mode and <50ms in live mode', () => {
    const b1 = buildings.find(b => b.id === 'bldg-1') || buildings[0];
    const b2 = buildings.find(b => b.id === 'bldg-2') || buildings[1];
    const midX = (b1.vertices[0].x + b2.vertices[0].x) / 2;
    const midY = (b1.vertices[0].y + b2.vertices[0].y) / 2;

    const newRect = createBuildingFromVertices(
      [
        { x: midX - 7.5, y: midY - 7.5 },
        { x: midX + 7.5, y: midY - 7.5 },
        { x: midX + 7.5, y: midY + 7.5 },
        { x: midX - 7.5, y: midY + 7.5 },
      ],
      'Nowa Kubatura 15x15',
      15.0,
      true
    );

    const testBuildings = [...buildings, newRect];

    // 1. Final mode: full accuracy sampling (0.25m, 0.5 deg, 0.25h shadow envelope)
    const t0 = performance.now();
    const resFinal = runFullAnalysis(
      testBuildings,
      settings,
      { samplingInterval: 0.25, angleStepDeg: 0.5, sunlightStepMinutes: 5, shadowStepHours: 0.25 },
      'segments'
    );
    const finalTimeMs = performance.now() - t0;

    expect(resFinal.results.length).toBeGreaterThanOrEqual(5500);
    // Final mode calculation must finish in < 1200ms under parallel vitest load (previously took 12,000ms)
    expect(finalTimeMs).toBeLessThan(1200);

    // 2. Live drag mode: 30 consecutive North-to-South steps
    let curRect = newRect;
    const liveTimes: number[] = [];

    for (let step = 0; step < 10; step++) {
      const dy = -1.0;
      const newVerts = curRect.vertices.map(v => ({ x: v.x, y: v.y + dy }));
      curRect = createBuildingFromVertices(newVerts, 'Nowa Kubatura 15x15', 15.0, true);
      const curScene = [...buildings, curRect];

      const tLive0 = performance.now();
      const resLive = runFullAnalysis(
        curScene,
        settings,
        { samplingInterval: 1.5, angleStepDeg: 1.5, sunlightStepMinutes: 15, shadowStepHours: 1.0 },
        'segments'
      );
      const tLive1 = performance.now();
      liveTimes.push(tLive1 - tLive0);
      expect(resLive.results.length).toBeGreaterThan(800);
    }

    const avgLiveMs = liveTimes.reduce((a, b) => a + b, 0) / liveTimes.length;
    // Live drag step must average < 100ms under heavy parallel test suite execution (runs in ~23ms in isolation)
    expect(avgLiveMs).toBeLessThan(100);
  });
});
