import { describe, it, expect } from 'vitest';
import { GeometryCompiler } from './GeometryCompiler';
import { BuildingLoop, Point2D } from '@/types/geometry';
import { applyBuildingModifiers } from '../modifiers/modifierPipeline';

describe('GeometryCompiler - Golden Parity & Identity Suite', () => {
  const createBaseBuilding = (id: string, vertices: Point2D[], height = 15, elevation = 0): BuildingLoop => ({
    id,
    name: `Building ${id}`,
    category: 'building',
    vertices,
    defaultHeight: height,
    elevation,
    hWindowBottom: 0.85,
    isCityCentre: false,
    buildingType: 'residential',
    layer: '0',
    isTested: true,
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  });

  it('P1: Rectangular simple building - exact geometry & metrics parity', () => {
    const rectVertices: Point2D[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ];
    const bldg = createBaseBuilding('b1', rectVertices, 12, 0);
    const compiled = GeometryCompiler.bakeBuilding(bldg);

    // 1. Metryki
    expect(compiled.metrics.footprintArea).toBeCloseTo(200, 4);
    expect(compiled.metrics.perimeter).toBeCloseTo(60, 4);
    expect(compiled.metrics.volume).toBeCloseTo(2400, 4);
    expect(compiled.metrics.heightMax).toBe(12);

    // 2. Reprezentacja 2D
    expect(compiled.representation2D.footprintBase.exterior.length).toBe(4);
    expect(compiled.representation2D.bounds2D.min).toEqual({ x: 0, y: 0 });
    expect(compiled.representation2D.bounds2D.max).toEqual({ x: 20, y: 10 });

    // 3. Reprezentacja 3D
    // 4 ściany + 1 dach + 1 posadzka = 6 ścian
    expect(compiled.representation3D.faces.length).toBe(6);
    const wallFaces = compiled.representation3D.faces.filter((f) => f.type === 'wall');
    expect(wallFaces.length).toBe(4);
    const roofFaces = compiled.representation3D.faces.filter((f) => f.type === 'roof');
    expect(roofFaces.length).toBe(1);

    // 4. Krawędzie rzucające cień
    expect(compiled.analysis.castingEdges.length).toBe(4);
    expect(compiled.analysis.castingEdges[0].p1.z).toBe(12);
  });

  it('P2: Building with courtyard (holes) - proper hole netting & wall normals', () => {
    const outer: Point2D[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 0, y: 30 },
    ];
    const hole: Point2D[] = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ];
    const bldg: BuildingLoop = {
      ...createBaseBuilding('b_hole', outer, 9, 0),
      holes: [hole],
    };

    const compiled = GeometryCompiler.bakeBuilding(bldg);

    // Powierzchnia netto: 900 - 100 = 800 m2
    expect(compiled.metrics.footprintArea).toBeCloseTo(800, 4);
    expect(compiled.metrics.volume).toBeCloseTo(7200, 4);

    // Reprezentacja 2D zawiera 1 otwór
    expect(compiled.representation2D.footprintBase.holes.length).toBe(1);
    expect(compiled.representation2D.footprintBase.holes[0].length).toBe(4);

    // Reprezentacja 3D ma ściany zewnętrzne (4) oraz ściany dziedzińca (4)
    const wallFaces = compiled.representation3D.faces.filter((f) => f.type === 'wall');
    expect(wallFaces.length).toBe(8);
  });

  it('P3: Building with Story Offset modifier - exact matching with modifierPipeline', () => {
    const vertices: Point2D[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ];

    const bldg: BuildingLoop = {
      ...createBaseBuilding('b_offset', vertices, 15, 0),
      firstFloorHeight: 3.5,
      typicalFloorHeight: 3.0,
      storeysCount: 5,
      modifiers: [
        {
          id: 'mod_offset_1',
          type: 'story_offset',
          enabled: true,
          storiesCount: -2,
          distance: -2.0,
        },
      ],
    };

    const expectedPipeline = applyBuildingModifiers(bldg);
    const compiled = GeometryCompiler.bakeBuilding(bldg);

    // Liczba kondygnacji i obrysów
    expect(compiled.representation2D.storySlices.length).toBe(expectedPipeline.storyPolygons.length);

    // Zgodność obrysów poszczególnych kondygnacji
    compiled.representation2D.storySlices.forEach((slice, idx) => {
      const expectedStory = expectedPipeline.storyPolygons[idx];
      expect(slice.elevationBottom).toBe(expectedStory.hBottom);
      expect(slice.elevationTop).toBe(expectedStory.hTop);
      expect(slice.footprint.exterior.length).toBe(expectedStory.polygon.length);
    });

    // PUM / Gross Floor Area odzwierciedla uskok górnych kondygnacji
    const baseArea = 40 * 20; // 800 m2
    expect(compiled.metrics.grossFloorArea).toBeLessThan(baseArea * 5);
  });
});
