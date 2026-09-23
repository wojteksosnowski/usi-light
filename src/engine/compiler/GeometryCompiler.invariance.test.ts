import { describe, it, expect } from 'vitest';
import { GeometryCompiler } from './GeometryCompiler';
import { BuildingLoop, Point2D } from '@/types/geometry';

describe('GeometryCompiler - Transformation Invariance Suite (AGENTS.md §1)', () => {
  const createTestBuilding = (): BuildingLoop => ({
    id: 'b_inv',
    name: 'Invariance Test Building',
    category: 'building',
    vertices: [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 40 },
      { x: 10, y: 40 },
    ],
    defaultHeight: 18,
    elevation: 2,
    hWindowBottom: 0.85,
    isCityCentre: false,
    buildingType: 'residential',
    layer: '0',
    isTested: true,
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  });

  it('I1: Rigid Translation preserves exact areas, volume, and edge lengths', () => {
    const originalBldg = createTestBuilding();
    const originalCompiled = GeometryCompiler.bakeBuilding(originalBldg);

    const dx = 125.45;
    const dy = -87.12;

    const translatedCompiled = GeometryCompiler.transformCompiledGeometry(originalCompiled, dx, dy);

    // Metryki numeryczne muszą być w 100% zachowane
    expect(translatedCompiled.metrics.footprintArea).toBeCloseTo(originalCompiled.metrics.footprintArea, 6);
    expect(translatedCompiled.metrics.grossFloorArea).toBeCloseTo(originalCompiled.metrics.grossFloorArea, 6);
    expect(translatedCompiled.metrics.volume).toBeCloseTo(originalCompiled.metrics.volume, 6);
    expect(translatedCompiled.metrics.perimeter).toBeCloseTo(originalCompiled.metrics.perimeter, 6);
    expect(translatedCompiled.metrics.heightMax).toBe(originalCompiled.metrics.heightMax);

    // Przesunięcie bounding boxów dokładnie o (dx, dy)
    expect(translatedCompiled.representation2D.bounds2D.min.x).toBeCloseTo(originalCompiled.representation2D.bounds2D.min.x + dx, 4);
    expect(translatedCompiled.representation2D.bounds2D.min.y).toBeCloseTo(originalCompiled.representation2D.bounds2D.min.y + dy, 4);
    expect(translatedCompiled.representation3D.bounds3D.min.x).toBeCloseTo(originalCompiled.representation3D.bounds3D.min.x + dx, 4);
    expect(translatedCompiled.representation3D.bounds3D.min.y).toBeCloseTo(originalCompiled.representation3D.bounds3D.min.y + dy, 4);

    // Z-elevation pozostaje bez zmian
    expect(translatedCompiled.representation3D.bounds3D.min.z).toBe(originalCompiled.representation3D.bounds3D.min.z);
    expect(translatedCompiled.representation3D.bounds3D.max.z).toBe(originalCompiled.representation3D.bounds3D.max.z);
  });

  it('I2: Rigid 90, 180, 270 degree rotation preserves exact area and shape', () => {
    const originalBldg = createTestBuilding();
    const originalCompiled = GeometryCompiler.bakeBuilding(originalBldg);

    const pivot: Point2D = { x: 30, y: 25 };

    [Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach((angleRad) => {
      const rotatedCompiled = GeometryCompiler.transformCompiledGeometry(originalCompiled, 0, 0, angleRad, pivot);

      expect(rotatedCompiled.metrics.footprintArea).toBeCloseTo(originalCompiled.metrics.footprintArea, 4);
      expect(rotatedCompiled.metrics.volume).toBeCloseTo(originalCompiled.metrics.volume, 4);
      expect(rotatedCompiled.metrics.perimeter).toBeCloseTo(originalCompiled.metrics.perimeter, 4);
      expect(rotatedCompiled.representation3D.faces.length).toBe(originalCompiled.representation3D.faces.length);
    });
  });

  it('I3: Hash caching prevents redundant compilations when state is unchanged', () => {
    const bldg = createTestBuilding();
    const firstBake = GeometryCompiler.bakeBuilding(bldg);

    // Przypisanie do obiektu
    const cachedBldg: BuildingLoop = {
      ...bldg,
      computed: firstBake,
    };

    const secondBake = GeometryCompiler.bakeBuilding(cachedBldg);
    // Powinien zwrócić dokładnie tę samą instancję z pamięci podręcznej
    expect(secondBake).toBe(firstBake);
  });
});
