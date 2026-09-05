import { describe, it, expect } from 'vitest';
import { generateSweepPolygon, offsetOpenPolylineEdge } from './sweep';
import { calculateSignedArea } from './polygons';

describe('generateSweepPolygon', () => {
  it('should return an empty array for less than 2 points', () => {
    expect(generateSweepPolygon([], 5)).toEqual([]);
    expect(generateSweepPolygon([{ x: 0, y: 0 }], 5)).toEqual([]);
  });

  it('should generate symmetric rectangle for straight horizontal segment with center alignment', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const width = 4;
    const polygon = generateSweepPolygon(polyline, width, 'center');

    // Direction (10, 0), normal is (0, 1) [left]
    // dLeft = +2, dRight = -2
    // Left points: (0, 2), (10, 2)
    // Right points: (0, -2), (10, -2)
    // Result: [(0,2), (10,2), (10,-2), (0,-2)]
    expect(polygon).toHaveLength(4);
    expect(polygon[0]).toEqual({ x: 0, y: 2 });
    expect(polygon[1]).toEqual({ x: 10, y: 2 });
    expect(polygon[2]).toEqual({ x: 10, y: -2 });
    expect(polygon[3]).toEqual({ x: 0, y: -2 });

    const area = Math.abs(calculateSignedArea(polygon));
    expect(area).toBeCloseTo(40, 4);
  });

  it('should generate rectangle on left side for left alignment', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const width = 4;
    const polygon = generateSweepPolygon(polyline, width, 'left');

    // Left points: (0, 4), (10, 4)
    // Right points (on baseline): (0, 0), (10, 0)
    // Result: [(0,4), (10,4), (10,0), (0,0)]
    expect(polygon).toHaveLength(4);
    expect(polygon[0]).toEqual({ x: 0, y: 4 });
    expect(polygon[1]).toEqual({ x: 10, y: 4 });
    expect(polygon[2]).toEqual({ x: 10, y: 0 });
    expect(polygon[3]).toEqual({ x: 0, y: 0 });
  });

  it('should generate rectangle on right side for right alignment', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const width = 4;
    const polygon = generateSweepPolygon(polyline, width, 'right');

    // Left points (on baseline): (0, 0), (10, 0)
    // Right points: (0, -4), (10, -4)
    // Result: [(0,0), (10,0), (10,-4), (0,-4)]
    expect(polygon).toHaveLength(4);
    expect(polygon[0]).toEqual({ x: 0, y: 0 });
    expect(polygon[1]).toEqual({ x: 10, y: 0 });
    expect(polygon[2]).toEqual({ x: 10, y: -4 });
    expect(polygon[3]).toEqual({ x: 0, y: -4 });
  });

  it('should generate clean miter join for 90-degree bend', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const width = 2; // dLeft = +1, dRight = -1
    const polygon = generateSweepPolygon(polyline, width, 'center');

    // Segment 1 (0,0)->(10,0): n1 = (0, 1)
    // Segment 2 (10,0)->(10,10): n2 = (-1, 0)
    // Inner/outer miter corners
    expect(polygon).toHaveLength(6);
    const area = Math.abs(calculateSignedArea(polygon));
    expect(area).toBeGreaterThan(0);
    // Area of mitered L-shape: 10 * 2 + 10 * 2 = 40 (outer triangle cancels inner cutout)
    expect(area).toBeCloseTo(40, 1);
  });
});

describe('offsetOpenPolylineEdge', () => {
  it('strictly preserves the direction angles of adjacent segments when shifting an edge', () => {
    // 3-odcinkowa polilinia: (0,0) -> (10,0) -> (10,10) -> (20,10)
    // Odcinki:
    // Seg 0: (0,0) -> (10,0) [kąt 0°]
    // Seg 1: (10,0) -> (10,10) [kąt 90°]
    // Seg 2: (10,10) -> (20,10) [kąt 0°]
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ];

    // Przesuwamy środkowy pionowy odcinek (Seg 1: edgeIndex = 1) w prawo o 2m: delta = { x: 2, y: 0 }
    // Normalna lewostronna dla (10,0)->(10,10) to (-1, 0)
    // Przesunięcie o deltaX = 2m przesuwa linię na x = 12m
    // Przecięcie z poziomym Seg 0 (y=0) daje P1' = (12, 0)
    // Przecięcie z poziomym Seg 2 (y=10) daje P2' = (12, 10)
    const shifted = offsetOpenPolylineEdge(polyline, 1, { x: 2, y: 0 });

    expect(shifted).toHaveLength(4);
    expect(shifted[0]).toEqual({ x: 0, y: 0 });
    expect(shifted[1].x).toBeCloseTo(12, 4);
    expect(shifted[1].y).toBeCloseTo(0, 4); // y nie uległ zmianie!
    expect(shifted[2].x).toBeCloseTo(12, 4);
    expect(shifted[2].y).toBeCloseTo(10, 4); // y nie uległ zmianie!
    expect(shifted[3]).toEqual({ x: 20, y: 10 });

    // Weryfikacja kątów:
    // Seg 0 po przesunięciu: (0,0) -> (12,0) kąt Math.atan2(0, 12) = 0° (dokładnie zachowany!)
    const ang0 = Math.atan2(shifted[1].y - shifted[0].y, shifted[1].x - shifted[0].x);
    expect(ang0).toBeCloseTo(0, 4);

    // Seg 1 po przesunięciu: (12,0) -> (12,10) kąt Math.atan2(10, 0) = 90° (dokładnie zachowany!)
    const ang1 = Math.atan2(shifted[2].y - shifted[1].y, shifted[2].x - shifted[1].x);
    expect(ang1).toBeCloseTo(Math.PI / 2, 4);

    // Seg 2 po przesunięciu: (12,10) -> (20,10) kąt Math.atan2(0, 8) = 0° (dokładnie zachowany!)
    const ang2 = Math.atan2(shifted[3].y - shifted[2].y, shifted[3].x - shifted[2].x);
    expect(ang2).toBeCloseTo(0, 4);
  });
});
