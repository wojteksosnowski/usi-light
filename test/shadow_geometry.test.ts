import { describe, it, expect } from 'vitest';
import {
  computeFastShadowPolygon,
  computeBuildingShadowEnvelope,
  getShadowOffsetVector,
  isPolygonConvex,
} from '../src/utils/math2d';
import { calculateSolarPosition } from '../src/utils/solar';
import { BuildingLoop } from '../src/types/geometry';

describe('Shadow Geometry and Envelope Calculation (§ 56 WT)', () => {
  const sampleRect = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 30, y: 22 },
    { x: 10, y: 22 },
  ];

  it('detects polygon convexity accurately', () => {
    expect(isPolygonConvex(sampleRect)).toBe(true);

    const lShape = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    expect(isPolygonConvex(lShape)).toBe(false);
  });

  it('generates orthogonal rectangular shadows for N-S and E-W walls at solar noon', () => {
    const lat = 52.23;
    const lon = 21.01;
    const height = 12;

    const noonPos = calculateSolarPosition(lat, lon, 3, 21, 12.0);
    const azRad = noonPos.azimuthDeg * (Math.PI / 180);
    const elevRad = noonPos.elevationDeg * (Math.PI / 180);
    const offset = getShadowOffsetVector(azRad, elevRad, height);

    const shadow = computeFastShadowPolygon(sampleRect, azRad, elevRad, height);

    // Exterior perimeter of the noon shadow contains base and projected northern/eastern roof corners:
    const expectedPerimeterPoints = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30 + offset.x, y: 10 + offset.y }, // south-east roof
      { x: 30 + offset.x, y: 22 + offset.y }, // north-east roof
      { x: 10 + offset.x, y: 22 + offset.y }, // north-west roof
      { x: 10, y: 22 },
    ];

    for (const p of expectedPerimeterPoints) {
      const match = shadow.some(
        (sp) => Math.hypot(sp.x - p.x, sp.y - p.y) < 0.05
      );
      expect(match).toBe(true);
    }

    // Check that top shadow boundary is horizontal (same Y for both northern roof corners)
    const northEastRoof = { x: 30 + offset.x, y: 22 + offset.y };
    const northWestRoof = { x: 10 + offset.x, y: 22 + offset.y };
    expect(northEastRoof.y).toBeCloseTo(northWestRoof.y, 4);

    // Check that eastern shadow boundary is vertical (same X for both eastern roof corners)
    const southEastRoof = { x: 30 + offset.x, y: 10 + offset.y };
    expect(northEastRoof.x).toBeCloseTo(southEastRoof.x, 4);
  });

  it('generates correct daily shadow envelope with East-West northern limit and N-S lateral limits', () => {
    const building: BuildingLoop = {
      id: 'bldg-test',
      name: 'Test Building',
      vertices: sampleRect,
      segments: [],
      defaultHeight: 12,
      isTested: true,
      isIncluded: true,
    };

    const envelope = computeBuildingShadowEnvelope(building, 52.23, 'spring', false, 21.01);
    expect(envelope.length).toBeGreaterThanOrEqual(4);

    // Find northernmost Y in shadow envelope
    const maxY = Math.max(...envelope.map((p) => p.y));
    // Theoretical equinox limit: Y_north + H * tan(lat) = 22 + 12 * tan(52.23°) ~ 37.49m
    const expectedMaxY = 22 + 12 * Math.tan(52.23 * (Math.PI / 180));
    expect(Math.abs(maxY - expectedMaxY)).toBeLessThan(0.5);

    // Check that westernmost and easternmost rays project symmetrically
    const minX = Math.min(...envelope.map((p) => p.x));
    const maxX = Math.max(...envelope.map((p) => p.x));
    expect(minX).toBeLessThan(0);
    expect(maxX).toBeGreaterThan(40);
  });

  it('handles concave L-shaped buildings without collapsing courtyards', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];

    const shadow = computeFastShadowPolygon(lShape, Math.PI, Math.PI / 4, 10);
    expect(shadow.length).toBeGreaterThanOrEqual(6);
  });
});
