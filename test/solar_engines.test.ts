import { describe, it, expect } from 'vitest';
import {
  AnalyticalSolarEngine,
  LutSolarEngine,
  SolarAnalysisEngine,
  defaultSolarAnalysisEngine,
} from '../src/engine/solar';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { ProjectSettings } from '../src/types/geometry';

describe('Unified Solar Engines (Strategy & Facade)', () => {
  const settings: ProjectSettings = {
    latitude: 51.1079, // Wrocław
    longitude: 17.0385,
    isCityCentreDefault: false,
    samplingInterval: 0.5,
    equinoxDate: 'spring',
  };

  const buildings = createSampleBuildings();
  const testedBldg = buildings[0];
  const seg = testedBldg.segments[0];
  const pt = {
    x: seg.p1.x + 0.5 * (seg.p2.x - seg.p1.x),
    y: seg.p1.y + 0.5 * (seg.p2.y - seg.p1.y),
  };

  it('evaluates sunlight accurately using AnalyticalSolarEngine (raycasting & segments)', () => {
    const rayEngine = new AnalyticalSolarEngine({ method: 'raycasting' });
    const segEngine = new AnalyticalSolarEngine({ method: 'segments' });

    const rayRes = rayEngine.calculatePointSunlight(pt, seg, 0.5, buildings, testedBldg.id, settings);
    const segRes = segEngine.calculatePointSunlight(pt, seg, 0.5, buildings, testedBldg.id, settings);

    expect(rayRes.totalMinutes).toBeGreaterThanOrEqual(0);
    expect(segRes.totalMinutes).toBeGreaterThanOrEqual(0);
    expect(Math.abs(rayRes.totalHours - segRes.totalHours)).toBeLessThan(0.15);
    expect(rayRes.evaluation).toBeDefined();
    expect(typeof rayRes.isCompliant).toBe('boolean');
  });

  it('evaluates sunlight using LutSolarEngine', () => {
    const lutEngine = new LutSolarEngine();
    const lutRes = lutEngine.calculatePointSunlight(pt, seg, 0.5, buildings, testedBldg.id, settings);

    expect(lutRes.totalMinutes).toBeGreaterThanOrEqual(0);
    expect(lutRes.evaluation).toBeDefined();
  });

  it('switches engine dynamically in SolarAnalysisEngine facade', () => {
    const facade = new SolarAnalysisEngine({ mode: 'auto' });

    const staticEngine = facade.getActiveEngine(false);
    expect(staticEngine.id).toBe('analytical');

    const dragEngine = facade.getActiveEngine(true);
    expect(dragEngine.id).toBe('lut');

    facade.setMode('lut');
    expect(facade.getActiveEngine(false).id).toBe('lut');

    facade.setMode('analytical');
    expect(facade.getActiveEngine(true).id).toBe('analytical');
  });

  it('executes runFullAnalysis via defaultSolarAnalysisEngine facade', () => {
    const batchRes = defaultSolarAnalysisEngine.runFullAnalysis(buildings, settings);
    expect(batchRes).toBeDefined();
    expect(batchRes.results.length).toBeGreaterThan(0);
    expect(batchRes.totalAnalysisMs).toBeGreaterThanOrEqual(0);
  });
});
