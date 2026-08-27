import { describe, it, expect } from 'vitest';
import { calculateSignedArea, isPolygonCCW, calculateOutwardNormal } from '../src/utils/math2d';
import { calculateSolarPosition } from '../src/utils/solar';
import { analyzeShadowingAtPoint } from '../src/engine/analysisEngine';
import { createSampleBuildings } from '../src/utils/dxfParser';

describe('2.5D Geometry & Normals', () => {
  it('should correctly detect CCW orientation and outward normal', () => {
    // Square 0,0 to 10,10 CCW: (0,0) -> (10,0) -> (10,10) -> (0,10)
    const ccwSquare = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(isPolygonCCW(ccwSquare)).toBe(true);

    // Bottom edge (0,0)->(10,0) outward normal should point South: (0, -1)
    const normalBottom = calculateOutwardNormal(ccwSquare[0], ccwSquare[1], true);
    expect(normalBottom.x).toBeCloseTo(0);
    expect(normalBottom.y).toBeCloseTo(-1);

    // Right edge (10,0)->(10,10) outward normal should point East: (1, 0)
    const normalRight = calculateOutwardNormal(ccwSquare[1], ccwSquare[2], true);
    expect(normalRight.x).toBeCloseTo(1);
    expect(normalRight.y).toBeCloseTo(0);
  });
});

describe('Solar Engine (§ 56)', () => {
  it('should calculate accurate solar position for Warsaw on Equinox (March 21)', () => {
    // Warsaw: lat=52.23, lon=21.01, March 21, solar noon
    const pos = calculateSolarPosition(52.23, 21.01, 3, 21, 12.0, 1.0);
    const posAtSolarNoon = calculateSolarPosition(52.23, 21.01, 3, 21, pos.solarNoonDecimal, 1.0);
    expect(posAtSolarNoon.elevationDeg).toBeGreaterThan(30); // ~37.8 deg in Warsaw
    expect(posAtSolarNoon.azimuthDeg).toBeCloseTo(180, 0); // Exact South at true solar noon
  });
});

describe('Shadowing Engine (§ 12)', () => {
  it('should detect unobstructed vs obstructed sectors', () => {
    const buildings = createSampleBuildings();
    const target = buildings[0]; // Building A
    const southSegment = target.segments[0]; // (10,10)->(30,10) normal (0, -1)

    // Analyze mid-point of south facade
    const midPoint = { x: 20, y: 10 };
    const res = analyzeShadowingAtPoint(midPoint, southSegment, 0.5, buildings, target.id);

    expect(res).toBeDefined();
    expect(res.rays.length).toBeGreaterThan(0);
  });
});
