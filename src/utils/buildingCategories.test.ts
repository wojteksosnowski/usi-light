import { describe, it, expect } from 'vitest';
import { BuildingLoop } from '../types/geometry';
import { analyzeSegmentsStatistics } from './segmentStatistics';
import { computeDistancesToBoundaries, computeCombinedShadowEnvelope } from '@/utils/math2d';
import { analyzeShadowingAtPoint, prefilterObstacleSegments } from '../engine/analysisEngine';
import { createBuildingFromVertices } from './dxfParser';

describe('Object Categories: boundary, building, balcony', () => {
  const boundaryPoly: BuildingLoop = {
    id: 'bnd-1',
    name: 'Działka 124/2',
    category: 'boundary',
    plotNumber: '124/2',
    layer: 'GRANICE',
    isTested: false,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'other',
    defaultHeight: 0,
    hWindowBottom: 0,
    vertices: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 0, y: 30 },
    ],
    segments: [
      { id: 'bnd-s1', p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 }, normal: { x: 0, y: -1 }, length: 40, angleRad: 0, hTop: 0, hWindowBottom: 0, isCityCentre: false, buildingType: 'other' },
      { id: 'bnd-s2', p1: { x: 40, y: 0 }, p2: { x: 40, y: 30 }, normal: { x: 1, y: 0 }, length: 30, angleRad: Math.PI / 2, hTop: 0, hWindowBottom: 0, isCityCentre: false, buildingType: 'other' },
      { id: 'bnd-s3', p1: { x: 40, y: 30 }, p2: { x: 0, y: 30 }, normal: { x: 0, y: 1 }, length: 40, angleRad: Math.PI, hTop: 0, hWindowBottom: 0, isCityCentre: false, buildingType: 'other' },
      { id: 'bnd-s4', p1: { x: 0, y: 30 }, p2: { x: 0, y: 0 }, normal: { x: -1, y: 0 }, length: 30, angleRad: -Math.PI / 2, hTop: 0, hWindowBottom: 0, isCityCentre: false, buildingType: 'other' },
    ],
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  const buildingA: BuildingLoop = {
    id: 'bldg-a',
    name: 'Budynek Projektowany',
    category: 'building',
    firstFloorHeight: 3.5,
    typicalFloorHeight: 2.875,
    storeysCount: 4,
    layer: 'PROJEKT',
    isTested: true,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 12.0,
    hWindowBottom: 0.85,
    vertices: [
      { x: 10, y: 10 },
      { x: 25, y: 10 },
      { x: 25, y: 20 },
      { x: 10, y: 20 },
    ],
    segments: [
      { id: 'bldg-s1', p1: { x: 10, y: 10 }, p2: { x: 25, y: 10 }, normal: { x: 0, y: -1 }, length: 15, angleRad: 0, hTop: 12, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'bldg-s2', p1: { x: 25, y: 10 }, p2: { x: 25, y: 20 }, normal: { x: 1, y: 0 }, length: 10, angleRad: Math.PI / 2, hTop: 12, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'bldg-s3', p1: { x: 25, y: 20 }, p2: { x: 10, y: 20 }, normal: { x: 0, y: 1 }, length: 15, angleRad: Math.PI, hTop: 12, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'bldg-s4', p1: { x: 10, y: 20 }, p2: { x: 10, y: 10 }, normal: { x: -1, y: 0 }, length: 10, angleRad: -Math.PI / 2, hTop: 12, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
    ],
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  const balconyPoly: BuildingLoop = {
    id: 'balc-1',
    name: 'Balkon 1. piętro',
    category: 'balcony',
    layer: 'BALKONY',
    isTested: false,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 4.0,
    hWindowBottom: 0.85,
    vertices: [
      { x: 12, y: 8 },
      { x: 16, y: 8 },
      { x: 16, y: 10 },
      { x: 12, y: 10 },
    ],
    segments: [
      { id: 'balc-s1', p1: { x: 12, y: 8 }, p2: { x: 16, y: 8 }, normal: { x: 0, y: -1 }, length: 4, angleRad: 0, hTop: 4, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'balc-s2', p1: { x: 16, y: 8 }, p2: { x: 16, y: 10 }, normal: { x: 1, y: 0 }, length: 2, angleRad: Math.PI / 2, hTop: 4, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'balc-s3', p1: { x: 16, y: 10 }, p2: { x: 12, y: 10 }, normal: { x: 0, y: 1 }, length: 4, angleRad: Math.PI, hTop: 4, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
      { id: 'balc-s4', p1: { x: 12, y: 10 }, p2: { x: 12, y: 8 }, normal: { x: -1, y: 0 }, length: 2, angleRad: -Math.PI / 2, hTop: 4, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
    ],
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  it('excludes boundary category from facade angle statistics and tracking directions', () => {
    const statsWithBoundaryOnly = analyzeSegmentsStatistics([boundaryPoly]);
    expect(statsWithBoundaryOnly.totalSegments).toBe(0);
    expect(statsWithBoundaryOnly.totalLength).toBe(0);

    const statsMixed = analyzeSegmentsStatistics([boundaryPoly, buildingA]);
    expect(statsMixed.totalSegments).toBe(buildingA.segments.length);
    expect(statsMixed.totalLength).toBe(50); // 15 + 10 + 15 + 10
  });

  it('excludes boundary from shadow envelope generation', () => {
    // boundary has height 0 and is boundary category
    const envBoundary = computeCombinedShadowEnvelope([boundaryPoly]);
    expect(envBoundary.length).toBe(0);

    const envBuilding = computeCombinedShadowEnvelope([buildingA]);
    expect(envBuilding.length).toBeGreaterThan(0);
  });

  it('computes exact distance from building to boundary parcels', () => {
    // Building edges: x in [10, 25], y in [10, 20]
    // Boundary edges: x in [0, 40], y in [0, 30]
    // Min distance from building to boundary:
    // South edge y=10 to boundary south edge y=0 is distance 10.0 m
    const distances = computeDistancesToBoundaries(buildingA, [boundaryPoly]);
    expect(distances.length).toBe(1);
    expect(distances[0].boundaryId).toBe('bnd-1');
    expect(distances[0].minDistance).toBeCloseTo(10.0, 1);
  });

  it('ignores balcony in shadowing (§ 12) analysis', () => {
    const point = { x: 14, y: 10 };
    const seg = buildingA.segments[0]; // south facing normal (0, -1)

    // With balcony as obstacle
    const obstacles = prefilterObstacleSegments(point, seg, [buildingA, balconyPoly], buildingA.id);
    const shadowRes = analyzeShadowingAtPoint(point, seg, 0.5, [buildingA, balconyPoly], buildingA.id, 1.0, obstacles);

    // Balcony is ignored in § 12, so point remains fully unshadowed (156 deg free)
    expect(shadowRes.isCompliant).toBe(true);
    expect(shadowRes.maxContinuousFreeSpanDeg).toBeGreaterThanOrEqual(150);
  });

  it('correctly creates building from vertices with storeys calculation', () => {
    const b = createBuildingFromVertices(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      'Nowy budynek',
      12.0,
      true,
      'building'
    );

    expect(b.category).toBe('building');
    expect(b.defaultHeight).toBe(12.0);
    // H=12m: 1 + round((12 - 3.5) / 2.875) = 1 + round(2.95) = 4 storeys
    expect(b.storeysCount).toBe(4);
  });
});
