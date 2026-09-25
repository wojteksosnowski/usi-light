import { describe, it, expect } from 'vitest';
import { FastShadowInTheMiddle } from './FastShadowInTheMiddle';
import { CanonicalShadowBaker } from '../compiler/CanonicalShadowBaker';
import { MasterplanFastShadowPipeline } from '@/components/cad/masterplan/masterplanFastShadowPipeline';
import { Point2D } from '@/types/geometry';
import { calculateSignedArea } from '@/utils/math2d/polygons';

describe('FastShadowInTheMiddle - Mathematical Identity & Projection Tests', () => {
  const squareBase: Point2D[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  const shadowVector: Point2D = { x: 1.5, y: 0.5 };
  const zMax = 30;
  const zMin = 0;

  it('preserves 1:1 mathematical identity with analytical shadow projection across horizontal planes', () => {
    const component = CanonicalShadowBaker.bakeComponent(
      'bldg_1_comp_0',
      'bldg_1',
      zMin,
      zMax,
      squareBase,
      undefined,
      shadowVector
    );

    const testTargetHeights = [0, 5, 10, 15, 20, 25, 29.9];

    for (const zTarget of testTargetHeights) {
      const projected = FastShadowInTheMiddle.projectComponentToPlane(component, zTarget);
      expect(projected).not.toBeNull();
      if (!projected) continue;

      const projectedOuter = projected.outer;
      expect(projectedOuter.length).toBe(squareBase.length);

      // Weryfikacja dla każdego wierzchołka: P(Z) = V_xy + (zMax - Z) * s
      for (let i = 0; i < squareBase.length; i++) {
        const v = squareBase[i];
        const expectedX = v.x + (zMax - zTarget) * shadowVector.x;
        const expectedY = v.y + (zMax - zTarget) * shadowVector.y;

        expect(projectedOuter[i].x).toBeCloseTo(expectedX, 6);
        expect(projectedOuter[i].y).toBeCloseTo(expectedY, 6);
      }
    }
  });

  it('rejects targets at or above zMax in O(1)', () => {
    const component = CanonicalShadowBaker.bakeComponent(
      'bldg_1_comp_0',
      'bldg_1',
      zMin,
      zMax,
      squareBase,
      undefined,
      shadowVector
    );

    expect(FastShadowInTheMiddle.projectComponentToPlane(component, 30)).toBeNull();
    expect(FastShadowInTheMiddle.projectComponentToPlane(component, 35)).toBeNull();
    expect(FastShadowInTheMiddle.projectComponentToPlane(component, 100)).toBeNull();
  });

  it('correctly handles donut / courtyard hole rings', () => {
    const hole: Point2D[] = [
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 3, y: 7 },
    ];

    const component = CanonicalShadowBaker.bakeComponent(
      'bldg_donut_comp',
      'bldg_donut',
      0,
      20,
      squareBase,
      [hole],
      shadowVector
    );

    const zTarget = 10;
    const projected = FastShadowInTheMiddle.projectComponentToPlane(component, zTarget);
    expect(projected).not.toBeNull();
    if (!projected) return;

    expect(projected.holes.length).toBe(1);
    const projectedHole = projected.holes[0];
    expect(projectedHole.length).toBe(4);

    for (let i = 0; i < hole.length; i++) {
      const hv = hole[i];
      const expectedX = hv.x + (20 - zTarget) * shadowVector.x;
      const expectedY = hv.y + (20 - zTarget) * shadowVector.y;

      expect(projectedHole[i].x).toBeCloseTo(expectedX, 6);
      expect(projectedHole[i].y).toBeCloseTo(expectedY, 6);
    }
  });

  it('computes accurate roof shadow via MasterplanFastShadowPipeline with 0.0000 m² error', () => {
    // Budynek 1 (rzucający cień): H = 30m, podstawa (0,0)-(10,10)
    const casterBuildingShadow = CanonicalShadowBaker.bakeBuildingShadow(
      'caster_1',
      [],
      squareBase,
      undefined,
      30,
      0,
      'test_sun',
      { x: 1.0, y: 0.0 } // cień w prawo o dx = (30 - zTarget) * 1.0
    );

    // Budynek 2 (docelowy dach): H = 15m, podstawa (10, 0)-(20, 10)
    const targetRoofPoly: Point2D[] = [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ];

    // Na poziomie Z = 15m, cień castera przesuwa się o (30 - 15) * 1.0 = 15m w prawo
    // Obrys cienia castera na Z=15m: [15..25] x [0..10]
    // Przecięcie z dachem docelowym [10..20] x [0..10]: [15..20] x [0..10], pole = 5 * 10 = 50 m²
    const shadowPatches = MasterplanFastShadowPipeline.calculateShadowOnRoof(
      [casterBuildingShadow],
      {
        buildingId: 'target_1',
        roofHeight: 15,
        roofPolygon: targetRoofPoly,
      }
    );

    expect(shadowPatches.length).toBeGreaterThan(0);
    const totalArea = shadowPatches.reduce((acc, p) => acc + Math.abs(calculateSignedArea(p)), 0);
    expect(totalArea).toBeCloseTo(50.0, 4);
  });
});
