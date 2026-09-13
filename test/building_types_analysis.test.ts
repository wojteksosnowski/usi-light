import { describe, it, expect } from 'vitest';
import { BuildingLoop, ProjectSettings } from '../src/types/geometry';
import { runFullAnalysis } from '../src/engine/analysisEngine';
import { computeBuildingShadowEnvelope, computeFullShadowAnalysis } from '../src/utils/math2d/shadowEnvelope';

describe('Building Types & Underground Elevation Analysis Tests', () => {
  const defaultSettings: ProjectSettings = {
    latitude: 52.23,
    longitude: 21.01,
    equinoxDate: 'spring',
    samplingInterval: 5.0,
    angleStepDeg: 1.0,
    sunlightStepMinutes: 15,
  };

  const residentialBuilding: BuildingLoop = {
    id: 'bldg-res',
    name: 'Budynek Mieszkalny',
    buildingType: 'residential',
    category: 'building',
    isTested: true,
    isIncluded: true,
    isCityCentre: false,
    defaultHeight: 12.0,
    elevation: 0.0,
    hWindowBottom: 0.85,
    layer: 'PROJEKT',
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    segments: [
      { id: 'res-s1', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, normal: { x: 0, y: -1 }, length: 10, angleRad: 0, hTop: 12, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'res-s2', p1: { x: 10, y: 0 }, p2: { x: 10, y: 10 }, normal: { x: 1, y: 0 }, length: 10, angleRad: Math.PI / 2, hTop: 12, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'res-s3', p1: { x: 10, y: 10 }, p2: { x: 0, y: 10 }, normal: { x: 0, y: 1 }, length: 10, angleRad: Math.PI, hTop: 12, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'res-s4', p1: { x: 0, y: 10 }, p2: { x: 0, y: 0 }, normal: { x: -1, y: 0 }, length: 10, angleRad: -Math.PI / 2, hTop: 12, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
    ],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  const serviceBuilding: BuildingLoop = {
    id: 'bldg-srv',
    name: 'Budynek Usługowy',
    buildingType: 'service',
    category: 'building',
    isTested: true,
    isIncluded: true,
    isCityCentre: false,
    defaultHeight: 12.0,
    elevation: 0.0,
    hWindowBottom: 0.85,
    layer: 'PROJEKT',
    vertices: [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 20, y: 10 },
    ],
    segments: [
      { id: 'srv-s1', p1: { x: 20, y: 0 }, p2: { x: 30, y: 0 }, normal: { x: 0, y: -1 }, length: 10, angleRad: 0, hTop: 12, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'service' },
      { id: 'srv-s2', p1: { x: 30, y: 0 }, p2: { x: 30, y: 10 }, normal: { x: 1, y: 0 }, length: 10, angleRad: Math.PI / 2, hTop: 12, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'service' },
      { id: 'srv-s3', p1: { x: 30, y: 10 }, p2: { x: 20, y: 10 }, normal: { x: 0, y: 1 }, length: 10, angleRad: Math.PI, hTop: 12, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'service' },
      { id: 'srv-s4', p1: { x: 20, y: 10 }, p2: { x: 20, y: 0 }, normal: { x: -1, y: 0 }, length: 10, angleRad: -Math.PI / 2, hTop: 12, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'service' },
    ],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  const garageBuilding: BuildingLoop = {
    id: 'bldg-gar',
    name: 'Garaż Wielostanowiskowy',
    buildingType: 'garage',
    category: 'building',
    isTested: true,
    isIncluded: true,
    isCityCentre: false,
    defaultHeight: 4.0,
    elevation: 0.0,
    hWindowBottom: 0.85,
    layer: 'PROJEKT',
    vertices: [
      { x: 40, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 10 },
      { x: 40, y: 10 },
    ],
    segments: [
      { id: 'gar-s1', p1: { x: 40, y: 0 }, p2: { x: 50, y: 0 }, normal: { x: 0, y: -1 }, length: 10, angleRad: 0, hTop: 4, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'garage' },
      { id: 'gar-s2', p1: { x: 50, y: 0 }, p2: { x: 50, y: 10 }, normal: { x: 1, y: 0 }, length: 10, angleRad: Math.PI / 2, hTop: 4, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'garage' },
      { id: 'gar-s3', p1: { x: 50, y: 10 }, p2: { x: 40, y: 10 }, normal: { x: 0, y: 1 }, length: 10, angleRad: Math.PI, hTop: 4, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'garage' },
      { id: 'gar-s4', p1: { x: 40, y: 10 }, p2: { x: 40, y: 0 }, normal: { x: -1, y: 0 }, length: 10, angleRad: -Math.PI / 2, hTop: 4, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'garage' },
    ],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  it('excludes garage buildings from batch analysis sampling (neither § 12 nor § 56)', () => {
    const output = runFullAnalysis(
      [garageBuilding],
      defaultSettings,
      { samplingInterval: 5.0, angleStepDeg: 1.0, sunlightStepMinutes: 15 },
      'raycasting',
      { shadowing: true, sunlight: true }
    );

    // No points sampled on garage
    expect(output.results.length).toBe(0);
  });

  it('evaluates § 12 on service buildings, but skips § 56 sunlight analysis', () => {
    const output = runFullAnalysis(
      [serviceBuilding],
      defaultSettings,
      { samplingInterval: 5.0, angleStepDeg: 1.0, sunlightStepMinutes: 15 },
      'raycasting',
      { shadowing: true, sunlight: true }
    );

    expect(output.results.length).toBeGreaterThan(0);
    // § 12 (przesłanianie) is evaluated:
    expect(output.results[0].shadowing).toBeDefined();
    expect(output.results[0].shadowing.totalFreeSpanDeg).toBeGreaterThan(0);

    // § 56 (nasłonecznienie) is skipped (totalHours is 0, default compliant)
    expect(output.results[0].sunlight.totalHours).toBe(0);
    expect(output.results[0].sunlight.timeSlots.length).toBe(0);
  });

  it('evaluates both § 12 and § 56 on residential buildings', () => {
    const output = runFullAnalysis(
      [residentialBuilding],
      defaultSettings,
      { samplingInterval: 5.0, angleStepDeg: 1.0, sunlightStepMinutes: 15 },
      'raycasting',
      { shadowing: true, sunlight: true }
    );

    expect(output.results.length).toBeGreaterThan(0);
    // Find south-facing segment point
    const southPoint = output.results.find((r) => r.segmentId === 'res-s1');
    expect(southPoint).toBeDefined();
    // § 12 evaluated
    expect(southPoint!.shadowing.totalFreeSpanDeg).toBeGreaterThan(0);
    // § 56 evaluated and has sunlight hours
    expect(southPoint!.sunlight.totalHours).toBeGreaterThan(0);
  });

  it('garage acts as an obstacle for a neighboring residential building', () => {
    // Place a wide and tall garage right in front of south facade of residential building
    const tallGarage: BuildingLoop = {
      ...garageBuilding,
      isTested: false,
      defaultHeight: 25.0,
      vertices: [
        { x: -30, y: -8 },
        { x: 40, y: -8 },
        { x: 40, y: -2 },
        { x: -30, y: -2 },
      ],
      segments: [
        { id: 'gar-obs-1', p1: { x: -30, y: -8 }, p2: { x: 40, y: -8 }, normal: { x: 0, y: -1 }, length: 70, angleRad: 0, hTop: 25, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'garage' },
        { id: 'gar-obs-2', p1: { x: 40, y: -8 }, p2: { x: 40, y: -2 }, normal: { x: 1, y: 0 }, length: 6, angleRad: Math.PI / 2, hTop: 25, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'garage' },
        { id: 'gar-obs-3', p1: { x: 40, y: -2 }, p2: { x: -30, y: -2 }, normal: { x: 0, y: 1 }, length: 70, angleRad: Math.PI, hTop: 25, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'garage' },
        { id: 'gar-obs-4', p1: { x: -30, y: -2 }, p2: { x: -30, y: -8 }, normal: { x: -1, y: 0 }, length: 6, angleRad: -Math.PI / 2, hTop: 25, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'garage' },
      ],
    };

    const output = runFullAnalysis(
      [residentialBuilding, tallGarage],
      defaultSettings,
      { samplingInterval: 5.0, angleStepDeg: 1.0, sunlightStepMinutes: 15 },
      'raycasting',
      { shadowing: true, sunlight: true }
    );

    const southPoint = output.results.find((r) => r.segmentId === 'res-s1');
    expect(southPoint).toBeDefined();
    // Sunlight should be obstructed by the garage
    expect(southPoint!.sunlight.totalHours).toBeLessThan(1.0);
    expect(southPoint!.shadowing.isCompliant).toBe(false);
  });

  it('underground building (elevation -3, height 3 -> hTop=0) generates NO shadow in computeBuildingShadowEnvelope and computeFullShadowAnalysis', () => {
    const undergroundBldg: BuildingLoop = {
      ...residentialBuilding,
      elevation: -3.0,
      defaultHeight: 3.0,
    };

    const envelope = computeBuildingShadowEnvelope(undergroundBldg, 52.23, 'spring', false, 21.01);
    expect(envelope.length).toBe(0);

    const fullAnalysis = computeFullShadowAnalysis([undergroundBldg], 52.23, 21.01, 'spring');
    expect(fullAnalysis.envelopeLoops.length).toBe(0);
    expect(fullAnalysis.hourlyShadows.length).toBe(0);
  });
});
