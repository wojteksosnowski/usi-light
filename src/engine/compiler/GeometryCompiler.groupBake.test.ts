import { describe, it, expect } from 'vitest';
import { GeometryCompiler } from './GeometryCompiler';
import { BuildingLoop, Point2D } from '@/types/geometry';

describe('GeometryCompiler - Bottom-Up Group Aggregation & Invalidation Suite', () => {
  const createChildBuilding = (id: string, offset: number, groupId: string): BuildingLoop => ({
    id,
    name: `Child ${id}`,
    category: 'building',
    groupId,
    vertices: [
      { x: offset, y: 0 },
      { x: offset + 20, y: 0 },
      { x: offset + 20, y: 20 },
      { x: offset, y: 20 },
    ],
    defaultHeight: 15,
    elevation: 0,
    hWindowBottom: 0.85,
    isCityCentre: false,
    buildingType: 'residential',
    layer: '0',
    isTested: true,
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  });

  it('G1: Group aggregation sums metrics and combines 3D faces from children', () => {
    const groupId = 'group_main';
    const child1 = createChildBuilding('c1', 0, groupId);
    const child2 = createChildBuilding('c2', 30, groupId);

    const groupBldg: BuildingLoop = {
      id: groupId,
      name: 'Main Group',
      category: 'compound',
      vertices: [],
      defaultHeight: 15,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
      layer: '0',
      isTested: true,
      segments: [],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const bakedChild1 = GeometryCompiler.bakeBuilding(child1);
    const bakedChild2 = GeometryCompiler.bakeBuilding(child2);

    const compiledGroup = GeometryCompiler.bakeGroup(groupBldg, [
      { ...child1, computed: bakedChild1 },
      { ...child2, computed: bakedChild2 },
    ]);

    // Suma powierzchni: 400 + 400 = 800 m2
    expect(compiledGroup.metrics.footprintArea).toBeCloseTo(800, 4);
    // Suma kubatury: 6000 + 6000 = 12000 m3
    expect(compiledGroup.metrics.volume).toBeCloseTo(12000, 4);

    // Suma ścian 3D: 6 + 6 = 12 faces
    expect(compiledGroup.representation3D.faces.length).toBe(
      bakedChild1.representation3D.faces.length + bakedChild2.representation3D.faces.length
    );

    // Bounding box grupy obejmuje oba budynki: x in [0, 50], y in [0, 20]
    expect(compiledGroup.representation2D.bounds2D.min).toEqual({ x: 0, y: 0 });
    expect(compiledGroup.representation2D.bounds2D.max).toEqual({ x: 50, y: 20 });
  });

  it('G2: Bottom-Up Invalidation preserves unmodified sibling geometry instance', () => {
    const groupId = 'grp_inv';
    const childA = createChildBuilding('cA', 0, groupId);
    const childB = createChildBuilding('cB', 40, groupId);

    const bakedA = GeometryCompiler.bakeBuilding(childA);
    const bakedB = GeometryCompiler.bakeBuilding(childB);

    // Modyfikujemy tylko dziecko A (zwiększenie wysokości)
    const modifiedChildA: BuildingLoop = {
      ...childA,
      defaultHeight: 25,
    };
    const rebakedA = GeometryCompiler.bakeBuilding(modifiedChildA);

    // Nowy bake dziecka A ma inny hash i inną kubaturę
    expect(rebakedA.geometryHash).not.toBe(bakedA.geometryHash);
    expect(rebakedA.metrics.volume).toBeGreaterThan(bakedA.metrics.volume);

    // Dziecko B NIE uległo modyfikacji - zachowuje ten sam obiekt computed
    expect(bakedB.geometryHash).toBe(GeometryCompiler.computeStateHash(childB));
  });
});
