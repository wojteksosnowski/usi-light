import { describe, it, expect } from 'vitest';
import { buildShadowRangeLUT } from '../src/engine/shadowRangeLut';
import {
  buildAllHourlyShadowPolygons,
  buildBuildingFullShadowRange,
  buildSingleHourShadowPolygon,
} from '../src/engine/shadowRangeBuilder';

describe('Shadow Range 11-hour computation', () => {
  const lut = buildShadowRangeLUT('LINIJKASLONCA', { latitude: 52.2297, longitude: 21.0122 });

  it('LUT contains exactly 11 rays from -5h to +5h', () => {
    expect(lut.rays).toHaveLength(11);
    expect(lut.rays[0].hourOffset).toBe(-5);
    expect(lut.rays[5].hourOffset).toBe(0);
    expect(lut.rays[10].hourOffset).toBe(5);
  });

  it('generates 11 individual shadow outlines for a building footprint', () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const height = 15;

    const hourlyOutlines = buildAllHourlyShadowPolygons(footprint, height, lut);
    expect(hourlyOutlines).toHaveLength(11);

    for (const outline of hourlyOutlines) {
      expect(outline.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('computes full shadow range union for convex building covering all 11 hours', () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const height = 15;

    const fullRange = buildBuildingFullShadowRange(footprint, height, lut);
    expect(fullRange.length).toBeGreaterThanOrEqual(1);

    const outline = fullRange[0];
    expect(outline.length).toBeGreaterThan(4);
  });

  it('computes full shadow range union for L-shaped (concave) building', () => {
    const lFootprint = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    const height = 12;

    const fullRange = buildBuildingFullShadowRange(lFootprint, height, lut);
    expect(fullRange.length).toBeGreaterThanOrEqual(1);
    expect(fullRange[0].length).toBeGreaterThan(4);
  });
});
