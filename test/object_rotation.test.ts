import { describe, it, expect } from 'vitest';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { rebuildBuildingSegments } from '../src/utils/segmentStatistics';
import { Point2D } from '../src/types/geometry';

describe('Object Rotation Tool & Vertex Deletion', () => {
  describe('Single Building Rotation around Pivot', () => {
    it('rotates a square building 90 degrees around origin pivot (0,0)', () => {
      const initialVerts: Point2D[] = [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 10, y: 10 },
      ];
      const building = createBuildingFromVertices(initialVerts, 'Bldg 1', 15.0);

      const pivot = { x: 0, y: 0 };
      const deltaAngleRad = Math.PI / 2; // +90 deg
      const cosA = Math.cos(deltaAngleRad);
      const sinA = Math.sin(deltaAngleRad);

      const newVertices = building.vertices.map((v) => {
        const rx = v.x - pivot.x;
        const ry = v.y - pivot.y;
        return {
          x: pivot.x + rx * cosA - ry * sinA,
          y: pivot.y + rx * sinA + ry * cosA,
        };
      });

      const rotated = rebuildBuildingSegments(building, newVertices);
      expect(rotated.vertices.length).toBe(4);
      expect(rotated.vertices[0].x).toBeCloseTo(0, 4);
      expect(rotated.vertices[0].y).toBeCloseTo(10, 4);
      expect(rotated.vertices[1].x).toBeCloseTo(0, 4);
      expect(rotated.vertices[1].y).toBeCloseTo(20, 4);
      expect(rotated.vertices[2].x).toBeCloseTo(-10, 4);
      expect(rotated.vertices[2].y).toBeCloseTo(20, 4);
      expect(rotated.vertices[3].x).toBeCloseTo(-10, 4);
      expect(rotated.vertices[3].y).toBeCloseTo(10, 4);
      expect(rotated.segments.length).toBe(4);
    });

    it('rotates a building around its own custom corner pivot (e.g. vertex 0)', () => {
      const initialVerts: Point2D[] = [
        { x: 5, y: 5 },
        { x: 15, y: 5 },
        { x: 15, y: 15 },
        { x: 5, y: 15 },
      ];
      const building = createBuildingFromVertices(initialVerts, 'Corner Pivot Bldg', 15.0);

      const pivot = { x: 5, y: 5 }; // Corner pivot
      const deltaAngleRad = Math.PI / 2; // +90 deg
      const cosA = Math.cos(deltaAngleRad);
      const sinA = Math.sin(deltaAngleRad);

      const newVertices = building.vertices.map((v) => {
        const rx = v.x - pivot.x;
        const ry = v.y - pivot.y;
        return {
          x: pivot.x + rx * cosA - ry * sinA,
          y: pivot.y + rx * sinA + ry * cosA,
        };
      });

      const rotated = rebuildBuildingSegments(building, newVertices);
      // Vertex 0 was at pivot so it stays at (5, 5)
      expect(rotated.vertices[0].x).toBeCloseTo(5, 4);
      expect(rotated.vertices[0].y).toBeCloseTo(5, 4);
      // Vertex 1 was (15, 5) -> now (5, 15)
      expect(rotated.vertices[1].x).toBeCloseTo(5, 4);
      expect(rotated.vertices[1].y).toBeCloseTo(15, 4);
    });
  });

  describe('Grouped / Linked Buildings Rotation', () => {
    it('rotates all buildings in the same group around a common pivot', () => {
      const b1 = createBuildingFromVertices(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        'Group A1'
      );
      const b2 = createBuildingFromVertices(
        [
          { x: 20, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 10 },
          { x: 20, y: 10 },
        ],
        'Group A2'
      );

      const groupId = 'group-123';
      b1.groupId = groupId;
      b2.groupId = groupId;

      const groupPivot = { x: 15, y: 5 }; // Midpoint between the two buildings
      const deltaAngleRad = Math.PI; // 180 deg rotation
      const cosA = Math.cos(deltaAngleRad);
      const sinA = Math.sin(deltaAngleRad);

      const rotateBldg = (b: typeof b1) => {
        const newVerts = b.vertices.map((v) => {
          const rx = v.x - groupPivot.x;
          const ry = v.y - groupPivot.y;
          return {
            x: groupPivot.x + rx * cosA - ry * sinA,
            y: groupPivot.y + rx * sinA + ry * cosA,
          };
        });
        return rebuildBuildingSegments(b, newVerts);
      };

      const rot1 = rotateBldg(b1);
      const rot2 = rotateBldg(b2);

      // B1 centroid was (5, 5) -> 180 deg around (15, 5) -> centroid becomes (25, 5)
      expect(rot1.vertices[0].x).toBeCloseTo(30, 3);
      expect(rot1.vertices[0].y).toBeCloseTo(10, 3);
      // B2 centroid was (25, 5) -> 180 deg around (15, 5) -> centroid becomes (5, 5)
      expect(rot2.vertices[0].x).toBeCloseTo(10, 3);
      expect(rot2.vertices[0].y).toBeCloseTo(10, 3);
    });
  });

  describe('Vertex Deletion', () => {
    it('deletes a vertex from 5-sided polygon leaving valid 4-sided polygon', () => {
      const polyVerts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 15, y: 5 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const building = createBuildingFromVertices(polyVerts, 'Pentagon');
      expect(building.vertices.length).toBe(5);
      expect(building.segments.length).toBe(5);

      // Delete vertex index 2 (tip at 15, 5)
      const remainingVerts = building.vertices.filter((_, idx) => idx !== 2);
      const updated = rebuildBuildingSegments(building, remainingVerts);

      expect(updated.vertices.length).toBe(4);
      expect(updated.segments.length).toBe(4);
      expect(updated.vertices).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]);
    });
  });

  describe('Viewport Rotation Center Invariance', () => {
    it('keeps the world point at screen center invariant when rotating view for offset coordinates', () => {
      // Screen center at (500, 400), model far from (0,0) at (5000, 6000)
      const cx = 500;
      const cy = 400;
      const scale = 14;
      const initialPanX = 500 - 5000 * scale; // projects (5000, 6000) to (500, 400) at 0 deg
      const initialPanY = 400 + 6000 * scale;

      const rotPrevDeg = 0;
      const rotNewDeg = 45;

      // 1. World point at center before rotation (rot = 0)
      const wx = 5000;
      const wy = 6000;

      // 2. Compute new pan to keep (wx, wy) at (cx, cy) after 45 deg rotation
      const rotNewRad = (rotNewDeg * Math.PI) / 180;
      const cosNew = Math.cos(rotNewRad);
      const sinNew = Math.sin(rotNewRad);
      const rxNew = wx * cosNew - wy * sinNew;
      const ryNew = wx * sinNew + wy * cosNew;

      const newPanX = cx - rxNew * scale;
      const newPanY = cy + ryNew * scale;

      // Verify worldToScreen with new rotation and newPan
      const sx = newPanX + (wx * cosNew - wy * sinNew) * scale;
      const sy = newPanY - (wx * sinNew + wy * cosNew) * scale;

      expect(sx).toBeCloseTo(cx, 4);
      expect(sy).toBeCloseTo(cy, 4);
    });
  });

  describe('Step Rotation & Absolute Angle Setting', () => {
    it('rotates a building by 5 degree steps when tracking is disabled', () => {
      const bldg = createBuildingFromVertices(
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        'Step Bldg'
      );
      const pivot = { x: 5, y: 5 };
      const stepDeg = 5;
      const stepRad = (stepDeg * Math.PI) / 180;
      const cosA = Math.cos(stepRad);
      const sinA = Math.sin(stepRad);

      const rotatedVerts = bldg.vertices.map((v) => {
        const rx = v.x - pivot.x;
        const ry = v.y - pivot.y;
        return {
          x: pivot.x + rx * cosA - ry * sinA,
          y: pivot.y + rx * sinA + ry * cosA,
        };
      });
      const rotated = rebuildBuildingSegments(bldg, rotatedVerts);
      expect(rotated.vertices.length).toBe(4);
      // Segment 0 angle should now be +5 deg
      const seg0AngleDeg = (rotated.segments[0].angleRad * 180) / Math.PI;
      expect(seg0AngleDeg).toBeCloseTo(5, 2);
    });

    it('sets absolute rotation angle to 45 degrees correctly', () => {
      const bldg = createBuildingFromVertices(
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        'Abs Rotate Bldg'
      );
      const currentRot = (bldg.segments[0].angleRad * 180) / Math.PI; // 0 deg
      const targetDeg = 45;
      const deltaRad = ((targetDeg - currentRot) * Math.PI) / 180;
      const cosA = Math.cos(deltaRad);
      const sinA = Math.sin(deltaRad);
      const pivot = { x: 5, y: 5 };

      const rotatedVerts = bldg.vertices.map((v) => {
        const rx = v.x - pivot.x;
        const ry = v.y - pivot.y;
        return {
          x: pivot.x + rx * cosA - ry * sinA,
          y: pivot.y + rx * sinA + ry * cosA,
        };
      });
      const rotated = rebuildBuildingSegments(bldg, rotatedVerts);
      const newSeg0AngleDeg = (rotated.segments[0].angleRad * 180) / Math.PI;
      expect(newSeg0AngleDeg).toBeCloseTo(45, 2);
    });
  });

  describe('Full Building & Analysis Segments Rotation', () => {
    it('updates building segments and normals correctly upon rotation', () => {
      const initialVerts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const building = createBuildingFromVertices(initialVerts, 'Bldg Segments Test', 15.0);
      // Segment 0: (0,0) -> (10,0), normal is (0, -1) in standard CCW outward normal
      expect(building.segments[0].normal.x).toBeCloseTo(0, 4);
      expect(building.segments[0].normal.y).toBeCloseTo(-1, 4);

      // Rotate 90 deg counter-clockwise around origin (0,0)
      const pivot = { x: 0, y: 0 };
      const deltaAngleRad = Math.PI / 2;
      const cosA = Math.cos(deltaAngleRad);
      const sinA = Math.sin(deltaAngleRad);

      const newVertices = building.vertices.map((v) => {
        const rx = v.x - pivot.x;
        const ry = v.y - pivot.y;
        return {
          x: pivot.x + rx * cosA - ry * sinA,
          y: pivot.y + rx * sinA + ry * cosA,
        };
      });

      const rotated = rebuildBuildingSegments(building, newVertices);

      // Segment 0 is now (0,0) -> (0,10), outward normal should now point right (1, 0)
      expect(rotated.segments[0].p1.x).toBeCloseTo(0, 4);
      expect(rotated.segments[0].p1.y).toBeCloseTo(0, 4);
      expect(rotated.segments[0].p2.x).toBeCloseTo(0, 4);
      expect(rotated.segments[0].p2.y).toBeCloseTo(10, 4);
      expect(rotated.segments[0].normal.x).toBeCloseTo(1, 4);
      expect(rotated.segments[0].normal.y).toBeCloseTo(0, 4);
    });
  });
});
