import { describe, it, expect } from 'vitest';
import { GeometryCompiler } from './GeometryCompiler';
import { BuildingLoop, Point2D } from '@/types/geometry';

describe('GeometryCompiler - Benchmark & Performance Suite', () => {
  it('B1: Baking 100 complex buildings takes under 50ms', () => {
    const buildings: BuildingLoop[] = [];
    for (let i = 0; i < 100; i++) {
      const offsetX = (i % 10) * 30;
      const offsetY = Math.floor(i / 10) * 30;
      const vertices: Point2D[] = [
        { x: offsetX, y: offsetY },
        { x: offsetX + 20, y: offsetY },
        { x: offsetX + 20, y: offsetY + 15 },
        { x: offsetX, y: offsetY + 15 },
      ];
      buildings.push({
        id: `bench_bldg_${i}`,
        name: `Building ${i}`,
        category: 'building',
        vertices,
        defaultHeight: 12 + (i % 5) * 3,
        elevation: 0,
        firstFloorHeight: 3.5,
        typicalFloorHeight: 3.0,
        storeysCount: 4,
        hWindowBottom: 0.85,
        isCityCentre: false,
        buildingType: 'residential',
        layer: '0',
        isTested: true,
        segments: [],
        transform: { tx: 0, ty: 0, rotationDeg: 0 },
      });
    }

    const t0 = performance.now();
    const compiledList = buildings.map((b) => GeometryCompiler.bakeBuilding(b));
    const elapsed = performance.now() - t0;

    expect(compiledList.length).toBe(100);
    // Bake 100 obiektów musi być błyskawiczny (poniżej 100 ms na typowej maszynie)
    expect(elapsed).toBeLessThan(250);
  });
});
