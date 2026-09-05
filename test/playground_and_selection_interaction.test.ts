import { describe, it, expect } from 'vitest';
import { analyzePlaygroundSunlight } from '../src/engine/analysisEngine';
import { BuildingLoop, ProjectSettings } from '../src/types/geometry';

describe('Playground Ortho Grid Approximation & Coverage', () => {
  const defaultSettings: ProjectSettings = {
    latitude: 52.2297,
    longitude: 21.0122,
    equinoxDate: '2026-03-21',
    samplingInterval: 1.0,
    isCityCentreDefault: false,
  };

  const testPlayground: BuildingLoop = {
    id: 'pg-1',
    name: 'Plac zabaw',
    category: 'boundary',
    areaType: 'playground',
    isTested: true,
    isIncluded: true,
    defaultHeight: 0,
    playgroundVoronoi: false,
    segments: [],
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  };

  it('generates full ortho grid during interaction without dropped cells', () => {
    const resRest = analyzePlaygroundSunlight(
      testPlayground,
      [testPlayground],
      defaultSettings,
      'raycasting',
      { isInteracting: false, samplingInterval: 1.0 }
    );

    const resInteracting = analyzePlaygroundSunlight(
      testPlayground,
      [testPlayground],
      defaultSettings,
      'raycasting',
      { isInteracting: true, samplingInterval: 1.0 }
    );

    expect(resRest.samplePoints.length).toBeGreaterThan(0);
    // In interacting mode, points are not dropped; all grid cells are populated via approximation
    expect(resInteracting.samplePoints.length).toBe(resRest.samplePoints.length);
    for (const sp of resInteracting.samplePoints) {
      expect(Number.isFinite(sp.hours)).toBe(true);
      expect(typeof sp.isCompliant).toBe('boolean');
    }
  });

  it('covers border cells so polygon clipping leaves no blank fringes', () => {
    const res = analyzePlaygroundSunlight(
      testPlayground,
      [testPlayground],
      defaultSettings,
      'raycasting',
      { isInteracting: false, samplingInterval: 1.0 }
    );

    // Verify grid reaches edge cell centers (0.5 and 9.5 in 10x10)
    const xs = res.samplePoints.map((p) => p.point.x);
    const ys = res.samplePoints.map((p) => p.point.y);
    expect(Math.min(...xs)).toBeCloseTo(0.5, 1);
    expect(Math.max(...xs)).toBeCloseTo(9.5, 1);
    expect(Math.min(...ys)).toBeCloseTo(0.5, 1);
    expect(Math.max(...ys)).toBeCloseTo(9.5, 1);
  });
});
