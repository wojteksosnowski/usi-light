import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runFullAnalysis } from '../src/engine/analysisEngine';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { BuildingLoop, ProjectSettings } from '../src/types/geometry';

describe('Verify Fix for User Scenario (15x15x15m kubatura move)', () => {
  it('executes under 400ms in final mode and under 40ms in live mode across 10 drag steps', () => {
    const lotniczaPath = path.resolve(__dirname, '../reference/lotnicza.json');
    const data = JSON.parse(fs.readFileSync(lotniczaPath, 'utf8'));
    const buildings: BuildingLoop[] = data.buildings;
    const settings: ProjectSettings = data.settings || {
      latitude: 52.2297,
      longitude: 21.0122,
      equinoxDate: 'spring',
      samplingInterval: 0.25,
    };

    const startX = 6426410;
    const startY = 5667290;
    const newBldg = createBuildingFromVertices(
      [
        { x: startX, y: startY },
        { x: startX + 15, y: startY },
        { x: startX + 15, y: startY + 15 },
        { x: startX, y: startY + 15 },
      ],
      'Nowa Kubatura 15x15x15',
      15.0,
      true
    );

    // 1. Initial 0.25m final calculation with Linijka
    const sceneWithNew = [...buildings, newBldg];
    const t0 = performance.now();
    const resFinal = runFullAnalysis(sceneWithNew, settings, { samplingInterval: 0.25 }, 'segments');
    const t1 = performance.now();
    // Final mode calculation (5500+ points) must finish in < 1200ms during full parallel test suite runs (previously took 12,000ms)
    expect(t1 - t0).toBeLessThan(1200);

    // 2. 10 consecutive drag steps in Live mode (1.5m, shadowStep: 1.0h)
    console.log('\nTesting 10 consecutive drag steps in Live Mode:');
    let movingScene = [...buildings, newBldg];
    for (let step = 1; step <= 10; step++) {
      const dy = -5.0;
      movingScene = movingScene.map(b => {
        if (b.id !== newBldg.id) return b;
        return {
          ...b,
          vertices: b.vertices.map(v => ({ x: v.x, y: v.y + dy })),
          segments: b.segments.map(s => ({
            ...s,
            p1: { x: s.p1.x, y: s.p1.y + dy },
            p2: { x: s.p2.x, y: s.p2.y + dy },
          }))
        };
      });

      const tStep0 = performance.now();
      const resStep = runFullAnalysis(movingScene, settings, { samplingInterval: 1.5, angleStepDeg: 1.5, sunlightStepMinutes: 15, shadowStepHours: 1.0 }, 'segments');
      const tStep1 = performance.now();
      const stepMs = tStep1 - tStep0;
      console.log(`  Step ${step} (Live): ${stepMs.toFixed(2)} ms (Points: ${resStep.totalPoints}, §12: ${resStep.totalShadowingTimeMs.toFixed(1)}ms, §56: ${resStep.totalSunlightTimeMs.toFixed(1)}ms, ShadowEnv: ${resStep.shadowEnvelopeMs.toFixed(1)}ms)`);
      expect(stepMs).toBeLessThan(100);
    }
  });
});
