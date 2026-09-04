import { describe, it, expect } from 'vitest';
import { booleanUnionBuildings } from './polygons';
import { BuildingLoop } from '../../types/geometry';

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
    expect(result.building?.segments.length).toBe(result.building?.vertices.length);
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
