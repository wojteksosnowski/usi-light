import { describe, it, expect } from 'vitest';
import { runFullAnalysis } from '../src/engine/analysisEngine';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { ProjectSettings } from '../src/types/geometry';

describe('Analytical Layers Selective Calculation', () => {
  const buildings = createSampleBuildings();
  const settings: ProjectSettings = {
    latitude: 52.23,
    longitude: 21.01,
    isCityCentreDefault: false,
    samplingInterval: 0.5,
    equinoxDate: '2026-03-21',
  };

  it('runs both §12 and §56 when both enabled', () => {
    const output = runFullAnalysis(buildings, settings, undefined, 'raycasting', {
      shadowing: true,
      sunlight: true,
      shadowRange: true,
    });
    expect(output.results.length).toBeGreaterThan(0);
    expect(output.results[0].shadowing.sectors.length).toBeGreaterThan(0);
    expect(output.shadowAnalysis.hourlyShadows.length).toBeGreaterThan(0);
  });

  it('skips shadowing calculation when shadowing is disabled', () => {
    const output = runFullAnalysis(buildings, settings, undefined, 'raycasting', {
      shadowing: false,
      sunlight: true,
      shadowRange: true,
    });
    expect(output.results.length).toBeGreaterThan(0);
    // Shadowing is bypassed (default compliant placeholder)
    expect(output.results[0].shadowing.sectors).toEqual([]);
    expect(output.avgShadowingMs).toBe(0);
  });

  it('skips sunlight calculation when sunlight is disabled', () => {
    const output = runFullAnalysis(buildings, settings, undefined, 'raycasting', {
      shadowing: true,
      sunlight: false,
      shadowRange: true,
    });
    expect(output.results.length).toBeGreaterThan(0);
    // Sunlight is bypassed (0 hours placeholder)
    expect(output.results[0].sunlight.totalMinutes).toBe(0);
    expect(output.avgSunlightMs).toBe(0);
  });

  it('immediately returns empty results when all analytical layers are disabled', () => {
    const output = runFullAnalysis(buildings, settings, undefined, 'raycasting', {
      shadowing: false,
      sunlight: false,
      shadowRange: false,
    });
    expect(output.results).toEqual([]);
    expect(output.totalPoints).toBe(0);
    expect(output.shadowAnalysis.hourlyShadows).toEqual([]);
  });
});
