import { describe, it, expect } from 'vitest';
import { offsetPolygonRobust } from './offsetPolygon';
import { calculateSignedArea, unionPolygonLoops } from './polygons';
import { Point2D } from '../../types/geometry';

const square: Point2D[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

// Wielokąt w kształcie litery L (niewypukły) — erozja przy wewnętrznym narożniku łatwo
// prowadzi naiwny miter-offset do samo-przecięcia.
const lShape: Point2D[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 10 },
  { x: 0, y: 10 },
];

// Bowtie/klepsydra: dwa trójkąty przecinające się w środku — klasyczny samo-przecinający się
// pierścień, kanoniczny przypadek testowy techniki self-union (nie przechodzi przez offset,
// testuje bezpośrednio mechanizm użyty wewnątrz offsetPolygonRobust: unionPolygonLoops jednego
// samo-przecinającego się pierścienia powinno rozdzielić go na dwa proste trójkąty).
const bowtie: Point2D[] = [
  { x: 0, y: 0 },
  { x: 10, y: 10 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
];

describe('offsetPolygonRobust', () => {
  it('convex square, positive offset — single loop, larger area', () => {
    const loops = offsetPolygonRobust(square, 1.5, 'miter');
    expect(loops.length).toBe(1);
    expect(Math.abs(calculateSignedArea(loops[0]))).toBeGreaterThan(100);
  });

  it('convex square, negative offset — single loop, smaller area, regression-equal to old behavior', () => {
    const loops = offsetPolygonRobust(square, -2, 'miter');
    expect(loops.length).toBe(1);
    const area = Math.abs(calculateSignedArea(loops[0]));
    expect(area).toBeCloseTo(36, 1); // 6x6
  });

  it('non-convex L-shape, erosion large enough to self-intersect naively — returns a valid, non-degenerate simple loop (not a silent fallback to the original)', () => {
    const loops = offsetPolygonRobust(lShape, -1.5, 'miter');
    expect(loops.length).toBeGreaterThanOrEqual(1);
    const totalArea = loops.reduce((sum, l) => sum + Math.abs(calculateSignedArea(l)), 0);
    const originalArea = Math.abs(calculateSignedArea(lShape));
    // Musi się zmienić (nie fallback do oryginału) i pozostać mniejsze (erozja).
    expect(totalArea).toBeLessThan(originalArea);
    expect(totalArea).toBeGreaterThan(0);
  });

  it('self-union technique (the core mechanism behind offsetPolygonRobust) correctly splits a self-intersecting bowtie ring into two independent, simple islands', () => {
    const loops = unionPolygonLoops([bowtie, bowtie]);
    expect(loops.length).toBe(2);
    for (const loop of loops) {
      expect(loop.length).toBeGreaterThanOrEqual(3);
      // Każdy trójkąt wynikowy ma pole ~25 (połowa bowtie o "polu brutto" nieokreślonym wprost,
      // ale geometrycznie: dwa trójkąty 5x10/2 = 25 każdy, stykające się w punkcie (5,5)).
      expect(Math.abs(calculateSignedArea(loop))).toBeCloseTo(25, 0);
    }
  });

  it('round join still produces a valid offset (regression)', () => {
    const loops = offsetPolygonRobust(square, 1.0, 'round');
    expect(loops.length).toBe(1);
    expect(Math.abs(calculateSignedArea(loops[0]))).toBeGreaterThan(100);
  });

  it('bevel join still produces a valid offset (regression)', () => {
    const loops = offsetPolygonRobust(square, 1.0, 'bevel');
    expect(loops.length).toBe(1);
    expect(Math.abs(calculateSignedArea(loops[0]))).toBeGreaterThan(100);
  });

  it('collapses to nothing when eroded far beyond its own extent', () => {
    const loops = offsetPolygonRobust(square, -20, 'miter');
    expect(loops.length).toBe(0);
  });
});
