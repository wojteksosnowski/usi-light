import { describe, it, expect } from 'vitest';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { analyzeShadowingAtPoint } from '../src/engine/analysisEngine';
import { raySegmentIntersection } from '@/utils/math2d';

describe('Verification of Geometry Units and Heights Scale', () => {
  it('confirms that distances in plan (X, Y) and heights (Z/H) are strictly in meters', () => {
    // Target building: 10m x 10m, South wall at Y=10 from X=0 to X=10, window at 0.85m
    const targetBuilding = {
      id: 'target',
      name: 'Badany',
      layer: '0',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential' as const,
      defaultHeight: 10.0,
      hWindowBottom: 0.85,
      vertices: [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }],
      segments: [
        {
          id: 'south-wall',
          p1: { x: 0, y: 10 },
          p2: { x: 10, y: 10 },
          normal: { x: 0, y: -1 },
          length: 10,
          angleRad: 0,
          hTop: 10.0,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential' as const,
        }
      ],
      isClockwise: false,
      transform: { tx: 0, ty: 0, rotationDeg: 0 }
    };

    // Obstacle building: 100m wide wall placed directly South at Y = 5 (distance = 5 meters in plan)
    // Obstacle height H_top = 15m.
    const obstacleBuilding = {
      id: 'obstacle',
      name: 'Przeszkoda',
      layer: '0',
      isTested: false,
      isCityCentre: false,
      buildingType: 'residential' as const,
      defaultHeight: 15.0,
      hWindowBottom: 0.85,
      vertices: [{ x: -50, y: 5 }, { x: 50, y: 5 }, { x: 50, y: 0 }, { x: -50, y: 0 }],
      segments: [
        {
          id: 'obs-north-wall',
          p1: { x: -50, y: 5 },
          p2: { x: 50, y: 5 },
          normal: { x: 0, y: 1 },
          length: 100,
          angleRad: 0,
          hTop: 15.0,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential' as const,
        }
      ],
      isClockwise: false,
      transform: { tx: 0, ty: 0, rotationDeg: 0 }
    };

    const midPoint = { x: 5, y: 10 };
    const allBuildings = [targetBuilding, obstacleBuilding];

    // Analyze mid-point of target south wall
    const result = analyzeShadowingAtPoint(midPoint, targetBuilding.segments[0], 0.5, allBuildings, targetBuilding.id);

    // 1. Check center sector (angle 0 relative to normal)
    const directSector = result.sectors.find(s => s.startAngleDeg <= 0 && s.endAngleDeg >= 0);
    expect(directSector).toBeDefined();

    // Required distance dReq: deltaH = 15.0 meters
    expect(directSector?.requiredDistance).toBeCloseTo(15.0);

    // Since obstacle distance (5.0m) < reqDistance (15.0m), this sector MUST be NOT free (blocked)
    expect(directSector?.isFree).toBe(false);

    // Therefore, it correctly evaluates to NON-COMPLIANT (§ 12 Niezgodne).
    expect(result.isCompliant).toBe(false);
    expect(result.maxContinuousFreeSpanDeg).toBeCloseTo(7.47, 1);
  });
});
