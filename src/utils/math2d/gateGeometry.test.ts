import { describe, it, expect } from 'vitest';
import { computeGateSpan, generateGateCorridor } from './gateGeometry';
import { Point2D } from '../../types/geometry';

describe('gateGeometry', () => {
  // Prostokąt 20m (szerokość) x 10m (głębokość)
  const rect20x10: Point2D[] = [
    { x: 0, y: 0 },   // krawędź 0: dolna ściana y=0 (0,0)->(20,0)
    { x: 20, y: 0 },  // krawędź 1: prawa ściana x=20 (20,0)->(20,10)
    { x: 20, y: 10 }, // krawędź 2: górna ściana y=10 (20,10)->(0,10)
    { x: 0, y: 10 },  // krawędź 3: lewa ściana x=0 (0,10)->(0,0)
  ];

  it('computes gate span for a 20x10 rectangle on edge 0', () => {
    const span = computeGateSpan(rect20x10, undefined, 0);
    expect(span).not.toBeNull();
    expect(span!.edgeLength).toBe(20);
    expect(span!.tMin).toBe(0);
    expect(span!.tMax).toBe(20);
    expect(span!.maxWidth).toBe(20);
    expect(span!.oppEdgeIndex).toBe(2);
    expect(span!.inwardNormal.y).toBeCloseTo(1, 2); // Wektor do góry (+y)
    expect(span!.distanceToHit).toBe(10);
    expect(span!.isHitOnHole).toBe(false);
  });

  it('computes race condition boundary when opposing edge is shorter (e.g. trapezoid)', () => {
    // Trapez: dolna podstawa 30m ((0,0)->(30,0)), górna 10m ((20,10)->(10,10))
    const trapezoid: Point2D[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ];

    const span = computeGateSpan(trapezoid, undefined, 0);
    expect(span).not.toBeNull();
    expect(span!.edgeLength).toBe(30);
    // Rzut krawędzi górnej (10,10)->(20,10) na dolną krawędź daje [10, 20]
    expect(span!.tMin).toBeCloseTo(10, 2);
    expect(span!.tMax).toBeCloseTo(20, 2);
    expect(span!.maxWidth).toBeCloseTo(10, 2);
  });

  it('detects FIRST HIT on inner courtyard hole (from Donut) instead of far exterior wall', () => {
    // 40x40m budynek z wewnętrznym dziedzińcem 16x16m od (12,12) do (28,28)
    const square40: Point2D[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ];
    const courtyardHole: Point2D[] = [
      { x: 12, y: 12 },
      { x: 28, y: 12 },
      { x: 28, y: 28 },
      { x: 12, y: 28 },
    ];

    const span = computeGateSpan(square40, [courtyardHole], 0);
    expect(span).not.toBeNull();
    // Pierwsza trafiona krawędź to południowa ściana dziedzińca przy y=12 (odległość 12m)
    expect(span!.distanceToHit).toBe(12);
    expect(span!.isHitOnHole).toBe(true);
    expect(span!.tMin).toBe(12);
    expect(span!.tMax).toBe(28);
    expect(span!.maxWidth).toBe(16);
  });

  it('generates centered gate corridor for width 4m and positionRatio 0.5', () => {
    const corridor = generateGateCorridor(rect20x10, undefined, 4.0, 0.5, 0);
    expect(corridor).not.toBeNull();

    // Środek 20m to 10m -> brama 4m od x=8 do x=12
    expect(corridor!.a1.x).toBeCloseTo(8, 2);
    expect(corridor!.a1.y).toBeCloseTo(0, 2);
    expect(corridor!.a2.x).toBeCloseTo(12, 2);
    expect(corridor!.a2.y).toBeCloseTo(0, 2);

    expect(corridor!.b1.x).toBeCloseTo(8, 2);
    expect(corridor!.b1.y).toBeCloseTo(10, 2);
    expect(corridor!.b2.x).toBeCloseTo(12, 2);
    expect(corridor!.b2.y).toBeCloseTo(10, 2);
  });

  it('generates corridor leading into courtyard hole for building with donut', () => {
    const square40: Point2D[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ];
    const courtyardHole: Point2D[] = [
      { x: 12, y: 12 },
      { x: 28, y: 12 },
      { x: 28, y: 28 },
      { x: 12, y: 28 },
    ];

    // Brama o szerokości 4m w środku wejścia do dziedzińca (x=18 do x=22, y od 0 do 12)
    const corridor = generateGateCorridor(square40, [courtyardHole], 4.0, 0.5, 0);
    expect(corridor).not.toBeNull();

    expect(corridor!.a1.x).toBeCloseTo(18, 2);
    expect(corridor!.a1.y).toBeCloseTo(0, 2);
    expect(corridor!.a2.x).toBeCloseTo(22, 2);
    expect(corridor!.a2.y).toBeCloseTo(0, 2);

    // Korytarz kończy się na ścianie dziedzińca przy y=12!
    expect(corridor!.b1.x).toBeCloseTo(18, 2);
    expect(corridor!.b1.y).toBeCloseTo(12, 2);
    expect(corridor!.b2.x).toBeCloseTo(22, 2);
    expect(corridor!.b2.y).toBeCloseTo(12, 2);
  });
});
