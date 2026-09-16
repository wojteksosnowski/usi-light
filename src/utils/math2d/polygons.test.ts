import { describe, it, expect } from 'vitest';
import { booleanUnionBuildings, getPolygonCentroid, collapseIdenticalConsecutiveHeightRuns, computePolygonDominantAngle } from './polygons';
import { BuildingLoop, Point2D } from '../../types/geometry';


interface TestTier {
  polygon: Point2D[];
  holes?: Point2D[][];
  hBottom: number;
  hTop: number;
  label: string;
}

function rect(x0: number, y0: number, x1: number, y1: number): Point2D[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function collapse(items: TestTier[]): TestTier[] {
  return collapseIdenticalConsecutiveHeightRuns<TestTier>(
    items,
    (t) => t.polygon,
    (t) => t.holes,
    (t) => t.hBottom,
    (t) => t.hTop,
    (last, hBottom, hTop) => ({ ...last, hBottom, hTop })
  );
}

describe('collapseIdenticalConsecutiveHeightRuns', () => {
  it('merges a run of 4 identical outlines followed by a different one into 2 elements', () => {
    const identical = rect(0, 0, 10, 10);
    const different = rect(1, 1, 9, 9);
    const items: TestTier[] = [
      { polygon: identical, hBottom: 0, hTop: 3, label: 's0' },
      { polygon: identical, hBottom: 3, hTop: 6, label: 's1' },
      { polygon: identical, hBottom: 6, hTop: 9, label: 's2' },
      { polygon: identical, hBottom: 9, hTop: 12, label: 's3' },
      { polygon: different, hBottom: 12, hTop: 15, label: 's4' },
    ];

    const result = collapse(items);
    expect(result.length).toBe(2);
    expect(result[0].hBottom).toBe(0);
    expect(result[0].hTop).toBe(12);
    expect(result[0].label).toBe('s3'); // ostatni z scalonego ciągu
    expect(result[1].hBottom).toBe(12);
    expect(result[1].hTop).toBe(15);
    expect(result[1].label).toBe('s4');
  });

  it('leaves a sequence with no repeats unchanged', () => {
    const items: TestTier[] = [
      { polygon: rect(0, 0, 10, 10), hBottom: 0, hTop: 3, label: 'a' },
      { polygon: rect(1, 1, 9, 9), hBottom: 3, hTop: 6, label: 'b' },
      { polygon: rect(2, 2, 8, 8), hBottom: 6, hTop: 9, label: 'c' },
    ];
    const result = collapse(items);
    expect(result.length).toBe(3);
    expect(result.map((r) => r.label)).toEqual(['a', 'b', 'c']);
  });

  it('does not merge across a height gap even with identical outlines', () => {
    const identical = rect(0, 0, 10, 10);
    const items: TestTier[] = [
      { polygon: identical, hBottom: 0, hTop: 3, label: 's0' },
      // przerwa: hTop=3 -> hBottom=5, nie 3
      { polygon: identical, hBottom: 5, hTop: 8, label: 's1' },
    ];
    const result = collapse(items);
    expect(result.length).toBe(2);
  });

  it('does not merge when holes differ even if the outer ring matches', () => {
    const outer = rect(0, 0, 10, 10);
    const hole = [rect(4, 4, 6, 6)];
    const items: TestTier[] = [
      { polygon: outer, holes: [], hBottom: 0, hTop: 3, label: 's0' },
      { polygon: outer, holes: hole, hBottom: 3, hTop: 6, label: 's1' },
    ];
    const result = collapse(items);
    expect(result.length).toBe(2);
  });

  it('merges when holes are identical across the run', () => {
    const outer = rect(0, 0, 10, 10);
    const hole = [rect(4, 4, 6, 6)];
    const items: TestTier[] = [
      { polygon: outer, holes: hole, hBottom: 0, hTop: 3, label: 's0' },
      { polygon: outer, holes: hole, hBottom: 3, hTop: 6, label: 's1' },
    ];
    const result = collapse(items);
    expect(result.length).toBe(1);
    expect(result[0].hBottom).toBe(0);
    expect(result[0].hTop).toBe(6);
  });
});

describe('getPolygonCentroid', () => {
  it('computes the centroid of a square', () => {
    const c = getPolygonCentroid([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(c).toEqual({ x: 5, y: 5 });
  });

  it('computes the centroid of a triangle', () => {
    const c = getPolygonCentroid([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 6 },
    ]);
    expect(c).toEqual({ x: 2, y: 2 });
  });

  it('handles a degenerate single-point polygon', () => {
    const c = getPolygonCentroid([{ x: 3, y: 4 }]);
    expect(c).toEqual({ x: 3, y: 4 });
  });

  it('returns origin for an empty vertex list', () => {
    expect(getPolygonCentroid([])).toEqual({ x: 0, y: 0 });
  });
});

describe('booleanUnionBuildings', () => {
  const createTestBuilding = (id: string, vertices: { x: number; y: number }[], height = 10): BuildingLoop => ({
    id,
    name: id,
    vertices,
    segments: [],
    defaultHeight: height,
    hWindowBottom: 0.85,
    isTested: false,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    layer: 'Domyślna (0)',
  });


  it('unions two overlapping rectangle buildings into a single polygon', () => {
    // Rect A: [0,0] to [10,10]
    const bldgA = createTestBuilding('b1', [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);

    // Rect B: [5,0] to [15,10] (overlapping)
    const bldgB = createTestBuilding('b2', [
      { x: 5, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 10 },
      { x: 5, y: 10 },
    ]);

    const result = booleanUnionBuildings(bldgA, bldgB);
    expect(result.success).toBe(true);
    expect(result.building).toBeDefined();
    expect(result.building?.vertices.length).toBeGreaterThanOrEqual(4);
    const holeVertexCount = (result.building?.holes || []).reduce((sum, h) => sum + h.length, 0);
    expect(result.building?.segments.length).toBe((result.building?.vertices.length || 0) + holeVertexCount);
  });

  it('unions two buildings that touch along an edge', () => {
    // Rect A: [0,0] to [10,10]
    const bldgA = createTestBuilding('b1', [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);

    // Rect B: [10,0] to [20,10] (touching at x=10)
    const bldgB = createTestBuilding('b2', [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ]);

    const result = booleanUnionBuildings(bldgA, bldgB);
    expect(result.success).toBe(true);
    expect(result.building).toBeDefined();
  });

  it('rejects union of disjoint buildings that do not touch or intersect', () => {
    // Rect A: [0,0] to [10,10]
    const bldgA = createTestBuilding('b1', [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);

    // Rect B: [20,0] to [30,10] (disjoint)
    const bldgB = createTestBuilding('b2', [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 20, y: 10 },
    ]);

    const result = booleanUnionBuildings(bldgA, bldgB);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Obiekty muszą się stykać lub przenikać');
  });
});

describe('computePolygonDominantAngle', () => {
  it('detects 0 rad (horizontal) for axis-aligned rectangle longer horizontally', () => {
    // 50m x 10m horizontal rect
    const poly = rect(0, 0, 50, 10);
    const angle = computePolygonDominantAngle(poly);
    expect(Math.abs(angle)).toBeCloseTo(0, 2);
  });

  it('detects 45 degrees for polygon rotated by 45 degrees', () => {
    // 40m x 10m rotated by 45 deg (pi/4 rad)
    const angleRad = Math.PI / 4;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const base = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 0, y: 10 },
    ];
    const rotated = base.map((p) => ({
      x: p.x * cos - p.y * sin,
      y: p.x * sin + p.y * cos,
    }));

    const computedAngle = computePolygonDominantAngle(rotated);
    expect(computedAngle).toBeCloseTo(angleRad, 2);
  });
});


