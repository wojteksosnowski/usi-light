import { describe, it, expect } from 'vitest';
import { calculateDirectionSnap } from './DirectionSnapStrategy';
import { Point2D, BuildingLoop } from '../../../types/geometry';

describe('DirectionSnapStrategy - otrackModes filtering', () => {
  const originPoint: Point2D = { x: 0, y: 0 };
  const dummyBuildings: BuildingLoop[] = [];

  it('snaps to Ortho 0° when ortho mode is enabled', () => {
    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 10, y: 0.1 },
      originPoint,
      buildings: dummyBuildings,
      otrackModes: { ortho: true, dominant: true, relative: true, dualIntersection: true },
    });

    expect(snap).not.toBeNull();
    expect(snap?.guideAngleDeg).toBe(0);
  });

  it('ignores Ortho 0° when ortho mode is disabled', () => {
    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 10, y: 0.1 },
      originPoint,
      buildings: dummyBuildings,
      dominantDirections: [],
      otrackModes: { ortho: false, dominant: false, relative: false, dualIntersection: false },
    });

    expect(snap).toBeNull();
  });

  it('snaps to dominant direction when dominant is enabled', () => {
    const dominantDirections = [{ angleDeg: 35.0, orthogonalDeg: 125.0, totalLength: 100, percentage: 50 }];

    const snap = calculateDirectionSnap({
      currentMouseWorld: { x: 10 * Math.cos((35 * Math.PI) / 180), y: 10 * Math.sin((35 * Math.PI) / 180) },
      originPoint,
      buildings: dummyBuildings,
      dominantDirections,
      otrackModes: { ortho: false, dominant: true, relative: false, dualIntersection: false },
    });

    expect(snap).not.toBeNull();
    expect(Math.round(snap?.guideAngleDeg ?? 0)).toBe(35);
  });
});
