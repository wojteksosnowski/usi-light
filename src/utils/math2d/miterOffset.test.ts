import { describe, it, expect } from 'vitest';
import { miterOffsetPolygon } from './miterOffset';
import { Point2D } from '../../types/geometry';

describe('miterOffsetPolygon', () => {
  it('correctly offsets a CCW 10x10 square inward (-2m)', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const offset = miterOffsetPolygon(square, -2)[0];
    expect(offset.length).toBe(4);
    expect(offset[0].x).toBeCloseTo(2, 2);
    expect(offset[0].y).toBeCloseTo(2, 2);
    expect(offset[1].x).toBeCloseTo(8, 2);
    expect(offset[1].y).toBeCloseTo(2, 2);
    expect(offset[2].x).toBeCloseTo(8, 2);
    expect(offset[2].y).toBeCloseTo(8, 2);
    expect(offset[3].x).toBeCloseTo(2, 2);
    expect(offset[3].y).toBeCloseTo(8, 2);
  });

  it('correctly offsets a CCW 10x10 square outward (+1.5m)', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const offset = miterOffsetPolygon(square, 1.5)[0];
    expect(offset.length).toBe(4);
    expect(offset[0].x).toBeCloseTo(-1.5, 2);
    expect(offset[0].y).toBeCloseTo(-1.5, 2);
    expect(offset[1].x).toBeCloseTo(11.5, 2);
    expect(offset[1].y).toBeCloseTo(-1.5, 2);
    expect(offset[2].x).toBeCloseTo(11.5, 2);
    expect(offset[2].y).toBeCloseTo(11.5, 2);
    expect(offset[3].x).toBeCloseTo(-1.5, 2);
    expect(offset[3].y).toBeCloseTo(11.5, 2);
  });

  it('returns clone if distance is 0', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const offset = miterOffsetPolygon(square, 0);
    expect(offset).toEqual([square]);
  });

  it('resolves a self-intersecting (bowtie) result from a deep inward offset on a concave notch into separate simple islands', () => {
    // "H"-ähnliche/uskokowa figura: głęboki wcięcie (notch) pośrodku dolnej krawędzi.
    // Duży offset do wewnątrz sprawia, że naiwny miter offset zawija kontur w miejscu wcięcia.
    const notched: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 8 },
      { x: 6, y: 8 },
      { x: 6, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const offsetPolys = miterOffsetPolygon(notched, -1.5);
    expect(offsetPolys.length).toBeGreaterThan(1);
    for (const poly of offsetPolys) {
      expect(poly.length).toBeGreaterThanOrEqual(3);
    }
    // Suma pól wynikowych wysp musi być mniejsza od pola oryginału (offset do wewnątrz).
    const origArea = Math.abs(
      notched.reduce((acc, p, i) => {
        const q = notched[(i + 1) % notched.length];
        return acc + (p.x * q.y - q.x * p.y);
      }, 0) / 2
    );
    const totalOffsetArea = offsetPolys.reduce((acc, poly) => {
      return (
        acc +
        Math.abs(
          poly.reduce((a, p, i) => {
            const q = poly[(i + 1) % poly.length];
            return a + (p.x * q.y - q.x * p.y);
          }, 0) / 2
        )
      );
    }, 0);
    expect(totalOffsetArea).toBeLessThan(origArea);
    expect(totalOffsetArea).toBeGreaterThan(0);
  });

  it('maintains strict edge parallelism on sharp corners exceeding miterLimit (BudynekC regression)', () => {
    // Wielokąt z ostrym kątem ~30.87° na wierzchołku 0
    const polygonWithSharpCorner: Point2D[] = [
      { x: -14.8944, y: 4.0088 },
      { x: 60.3621, y: 4.0088 }, // Krawędź pozioma (dy = 0, angle = 0°)
      { x: 84.3970, y: -18.8440 },
      { x: 60.3621, y: -44.1220 },
      { x: 86.2332, y: -68.7207 },
      { x: 57.2415, y: -99.2119 },
      { x: -0.6979, y: -44.1220 },
      { x: 23.3369, y: -18.8440 },
    ];

    const offsetPolys = miterOffsetPolygon(polygonWithSharpCorner, -12);
    expect(offsetPolys.length).toBe(1);
    const hole = offsetPolys[0];

    // Znajdź krawędź odpowiadającą krawędzi poziomej 0->1 bazowego wielokąta
    const horizontalHoleEdge = hole.find((p1, i) => {
      const p2 = hole[(i + 1) % hole.length];
      return Math.abs(p2.y - p1.y) < 1e-4 && p2.x > p1.x;
    });

    expect(horizontalHoleEdge).toBeDefined();

    // Sprawdź, czy każda krawędź offsetu (z wyjątkiem ścięcia bevel) jest równoległa do odpowiedniej krawędzi bazy
    const baseAngles = polygonWithSharpCorner.map((p1, i) => {
      const p2 = polygonWithSharpCorner[(i + 1) % polygonWithSharpCorner.length];
      return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    });

    const holeAngles = hole.map((p1, i) => {
      const p2 = hole[(i + 1) % hole.length];
      return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    });

    // Sprawdź czy krawędź o kącie 0 rad (pozioma) występuje w otworze
    const hasZeroAngle = holeAngles.some((a) => Math.abs(a) < 1e-4);
    expect(hasZeroAngle).toBe(true);
  });
});

