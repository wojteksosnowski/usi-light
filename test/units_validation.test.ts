import { describe, it, expect } from 'vitest';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { analyzeShadowingAtPoint } from '../src/engine/analysisEngine';
import { raySegmentIntersection } from '../src/utils/math2d';

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

    // 1. Check direct South ray (angle 0 relative to normal)
    const directRay = result.rays.find(r => Math.abs(r.angleDeg) < 0.1);
    expect(directRay).toBeDefined();

    // Distance in plan: (5, 10) to (5, 5) => exactly 5.0 meters
    expect(directRay?.hitDistance).toBeCloseTo(5.0);

    // Required distance dReq: deltaH = 15.0 - 0.85 = 14.15 meters
    expect(directRay?.reqDistance).toBeCloseTo(14.15);

    // Since hitDistance (5.0m) < reqDistance (14.15m), this ray MUST be NOT free (blocked)
    expect(directRay?.isFree).toBe(false);

    // Obstacle is 100m wide at distance 5m.
    // Rays from -69.5° to +69.5° (139° span) hit the obstacle at distance < 14.15m and are BLOCKED.
    // Only grazing rays at extreme edges (>69.5°) exceed 14.15m (span = 78° - 69.5° = 8.5° on each side).
    // Continuous free span is 8.5° and total free span is 17.0°, both far below the required 60°/75°.
    // Therefore, it correctly evaluates to NON-COMPLIANT (§ 12 Niezgodne).
    expect(result.isCompliant).toBe(false);
    expect(result.maxContinuousFreeSpanDeg).toBeCloseTo(8.5, 0);
  });
});
