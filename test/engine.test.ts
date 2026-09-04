import { describe, it, expect } from 'vitest';
import { calculateSignedArea, isPolygonCCW, calculateOutwardNormal, computeBuildingShadowEnvelope, computeCombinedShadowEnvelope } from '@/utils/math2d';
import { calculateSolarPosition } from '../src/utils/solar';
import { analyzeShadowingAtPoint, runFullAnalysis } from '../src/engine/analysisEngine';
import { createSampleBuildings, resolveDxfScale } from '../src/utils/dxfParser';

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
    expect(res.sectors.length).toBeGreaterThan(0);
  });
});

describe('DXF Unit Resolution & Scaling', () => {
  it('should resolve explicit user unit choices', () => {
    expect(resolveDxfScale({}, 100, 'm').scale).toBe(1.0);
    expect(resolveDxfScale({}, 100, 'cm').scale).toBe(0.01);
    expect(resolveDxfScale({}, 100, 'mm').scale).toBe(0.001);
  });

  it('should resolve $INSUNITS header correctly when in auto mode', () => {
    expect(resolveDxfScale({ $INSUNITS: 4 }, 50, 'auto').scale).toBe(0.001); // mm
    expect(resolveDxfScale({ $INSUNITS: 5 }, 50, 'auto').scale).toBe(0.01); // cm
    expect(resolveDxfScale({ $INSUNITS: 6 }, 50, 'auto').scale).toBe(1.0); // m
  });

  it('should fallback to heuristic scaling when $INSUNITS is missing in auto mode', () => {
    expect(resolveDxfScale({}, 2500, 'auto').scale).toBe(0.001); // >1000 => mm
    expect(resolveDxfScale({}, 450, 'auto').scale).toBe(0.01); // 200..1000 => cm
    expect(resolveDxfScale({}, 35, 'auto').scale).toBe(1.0); // <=200 => m
  });
});

describe('Variable Accuracy & Multi-stage Refinement', () => {
  it('should compute significantly fewer points in live mode (1.5m) and refine to 0.25m in final mode', () => {
    const buildings = createSampleBuildings();
    const settings = {
      latitude: 52.23,
      longitude: 21.01,
      isCityCentreDefault: false,
      samplingInterval: 0.25,
      equinoxDate: 'spring' as const,
    };

    // Live mode (1.5m spatial step, 15 min solar step)
    const liveOutput = runFullAnalysis(buildings, settings, {
      samplingInterval: 1.5,
      angleStepDeg: 2.0,
      sunlightStepMinutes: 15,
    });

    // Final target mode (0.25m spatial step, 5 min solar step)
    const finalOutput = runFullAnalysis(buildings, settings, {
      samplingInterval: 0.25,
      angleStepDeg: 0.5,
      sunlightStepMinutes: 5,
    });

    const liveResults = liveOutput.results;
    const finalResults = finalOutput.results;

    expect(liveResults.length).toBeGreaterThan(0);
    expect(finalResults.length).toBeGreaterThan(liveResults.length * 3); // 0.25m has >4x denser sampling than 1.5m
    expect(finalOutput.avgShadowingMs).toBeGreaterThanOrEqual(0);
    expect(finalOutput.avgSunlightMs).toBeGreaterThanOrEqual(0);

    // Verify sunlight time resolution steps
    expect(liveResults[0].sunlight.timeSlots.length).toBeLessThan(finalResults[0].sunlight.timeSlots.length);
    expect(finalResults[0].sunlight.timeSlots.length).toBeGreaterThanOrEqual(100); // 5-minute steps across day
  });

  it('should instantly cull North-facing facades without redundant calculations', async () => {
    const { analyzeSunlightAtPoint } = await import('../src/engine/analysisEngine');
    const settings = {
      latitude: 52.23,
      longitude: 21.01,
      isCityCentreDefault: false,
      samplingInterval: 0.25,
      equinoxDate: 'spring' as const,
    };

    // North wall segment with normal (0, 1) pointing directly North
    const northSegment = {
      id: 'north-wall',
      p1: { x: 30, y: 22 },
      p2: { x: 10, y: 22 },
      normal: { x: 0, y: 1 }, // Directly North (0 deg azimuth)
      length: 20,
      angleRad: Math.PI,
      hTop: 15.0,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential' as const,
    };

    const res = analyzeSunlightAtPoint({ x: 20, y: 22 }, northSegment, 0.5, [], 'bldg-1', settings, 5);

    expect(res.totalMinutes).toBe(0);
    expect(res.totalHours).toBe(0);
    expect(res.isCompliant).toBe(false);
    expect(res.timeSlots.every(slot => !slot.isDirectSunlight)).toBe(true);
  });

  it('strictly disqualifies sunlight rays with incidence angle < 12 degrees to the facade plane (§ 56 ust. 5)', async () => {
    const { analyzeSunlightAtPoint } = await import('../src/engine/analysisEngine');
    const settings = {
      latitude: 52.23,
      longitude: 21.01,
      isCityCentreDefault: false,
      samplingInterval: 0.25,
      equinoxDate: 'spring' as const,
    };

    // South wall segment with normal (0, -1) pointing South
    const southSegment = {
      id: 'south-wall',
      p1: { x: 10, y: 10 },
      p2: { x: 30, y: 10 },
      normal: { x: 0, y: -1 }, // South
      length: 20,
      angleRad: 0,
      hTop: 15.0,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential' as const,
    };

    const res = analyzeSunlightAtPoint({ x: 20, y: 10 }, southSegment, 0.5, [], 'bldg-1', settings, 5);

    // Each time slot must satisfy: isDirectSunlight can only be true when isAngleAbove12Deg is true
    for (const slot of res.timeSlots) {
      if (slot.isDirectSunlight) {
        expect(slot.isAngleAbove12Deg).toBe(true);
        expect(slot.isSunAboveHorizon).toBe(true);
      }
    }
  });

  it('completely ignores buildings marked with isIncluded = false from § 12 and § 56 calculations', async () => {
    const { analyzeShadowingAtPoint } = await import('../src/engine/analysisEngine');
    const buildings = createSampleBuildings();
    // Building B (bldg-2) is an obstacle to South
    const target = buildings[0]; // Badany
    const southSeg = target.segments[0];
    const point = { x: 20, y: 10 };

    // With building B included (default):
    const resWithObstacle = analyzeShadowingAtPoint(point, southSeg, 0.5, buildings, target.id, 0.5);
    const blockedSector = resWithObstacle.sectors.find(s => !s.isFree && s.startAngleDeg <= 0 && s.endAngleDeg >= 0);
    expect(blockedSector).toBeDefined();

    // Mark building B as excluded (isIncluded = false)
    buildings[1].isIncluded = false;
    buildings[2].isIncluded = false; // Exclude building C as well

    const resWithoutObstacle = analyzeShadowingAtPoint(point, southSeg, 0.5, buildings, target.id, 0.5);
    expect(resWithoutObstacle.isCompliant).toBe(true);
    expect(resWithoutObstacle.sectors.every(s => s.isFree)).toBe(true);
  });

  it('verifies analytical segment intersection method (§ 56 Segmenty) vs raycasting consistency', async () => {
    const { analyzeSunlightAtPoint, analyzeSunlightAtPointSegments } = await import('../src/engine/analysisEngine');
    const buildings = createSampleBuildings();
    const target = buildings[0];
    const southSeg = target.segments[0];
    const point = { x: 20, y: 10 };
    const settings = {
      latitude: 52.23,
      longitude: 21.01,
      isCityCentreDefault: false,
      samplingInterval: 0.25,
      equinoxDate: 'spring' as const,
    };

    const rayResult = analyzeSunlightAtPoint(point, southSeg, 0.5, buildings, target.id, settings, 5);
    const segResult = analyzeSunlightAtPointSegments(point, southSeg, 0.5, buildings, target.id, settings);

    expect(Math.abs(segResult.totalMinutes - rayResult.totalMinutes)).toBeLessThanOrEqual(10);
    expect(Math.abs(segResult.totalHours - rayResult.totalHours)).toBeLessThanOrEqual(0.15);
    expect(segResult.isCompliant).toBe(rayResult.isCompliant);
    expect(segResult.sectors).toBeDefined();
    expect(segResult.sectors!.length).toBeGreaterThan(0);
  });

  it('computes combined boolean shadow envelope (Zakres cienia) for all tested buildings correctly', () => {
    const buildings = createSampleBuildings();
    const loops = computeCombinedShadowEnvelope(buildings, 52.23, 'spring');

    expect(loops).toBeDefined();
    expect(loops.length).toBeGreaterThanOrEqual(1);
    expect(loops[0].length).toBeGreaterThanOrEqual(3);

    // Verify combined envelope extends to the North
    const testedBldgs = buildings.filter((b) => b.isTested && b.isIncluded !== false);
    const maxBldgY = Math.max(...testedBldgs.flatMap((b) => b.vertices.map((v) => v.y)));
    const maxCombinedY = Math.max(...loops.flatMap((l) => l.map((v) => v.y)));
    expect(maxCombinedY).toBeGreaterThan(maxBldgY);
  });
});




