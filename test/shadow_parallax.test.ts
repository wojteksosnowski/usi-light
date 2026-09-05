import { describe, it, expect } from 'vitest';
import { computeFastShadowPolygon, getShadowOffsetVector } from '../src/utils/math2d/shadowEnvelope';
import { Point2D } from '../src/types/geometry';

describe('Shadow Parallax Base Calculation', () => {
  const square: Point2D[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('standard ground building (hBase=0, hTop=10) casts shadow from ground', () => {
    const azRad = Math.PI; // South (shadow points North)
    const elevRad = Math.PI / 4; // 45 deg -> tan(45) = 1 -> length = 10
    const poly = computeFastShadowPolygon(square, azRad, elevRad, 10, 0);

    expect(poly.length).toBeGreaterThanOrEqual(4);
    // Min Y should be 0 (ground footprint)
    const minY = Math.min(...poly.map((p) => p.y));
    const maxY = Math.max(...poly.map((p) => p.y));
    expect(minY).toBeCloseTo(0, 1);
    expect(maxY).toBeCloseTo(20, 1); // 10m building + 10m shadow
  });

  it('elevated volume (hBase=10, hTop=20) shifts base footprint with parallax', () => {
    const azRad = Math.PI; // South
    const elevRad = Math.PI / 4; // 45 deg -> length top=20, base=10
    const poly = computeFastShadowPolygon(square, azRad, elevRad, 20, 10);

    expect(poly.length).toBeGreaterThanOrEqual(4);
    // Base is at Y=0 + 10 = 10, Top is at Y=10 + 20 = 30
    const minY = Math.min(...poly.map((p) => p.y));
    const maxY = Math.max(...poly.map((p) => p.y));
    expect(minY).toBeCloseTo(10, 1);
    expect(maxY).toBeCloseTo(30, 1);
  });
});
