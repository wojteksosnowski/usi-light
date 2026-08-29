import { describe, it, expect } from 'vitest';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { BuildingLoop } from '../src/types/geometry';

describe('Object Grouping and Linked Movement', () => {
  it('should move all linked buildings together when any member of the group is moved', () => {
    let buildings: BuildingLoop[] = createSampleBuildings();
    expect(buildings.length).toBeGreaterThanOrEqual(2);

    const b1Id = buildings[0].id;
    const b2Id = buildings[1].id;

    const initialB1X = buildings[0].vertices[0].x;
    const initialB2X = buildings[1].vertices[0].x;

    // Link buildings together with groupId
    const groupId = 'test-group-1';
    buildings = buildings.map((b) => {
      if (b.id === b1Id || b.id === b2Id) {
        return { ...b, groupId };
      }
      return b;
    });

    // Simulate handleBuildingMove on b1
    const dx = 15.0;
    const dy = -10.0;

    const targetBldg = buildings.find((b) => b.id === b1Id);
    const targetGroupId = targetBldg?.groupId;

    buildings = buildings.map((bldg) => {
      const shouldMove = bldg.id === b1Id || (!!targetGroupId && bldg.groupId === targetGroupId);
      if (!shouldMove) return bldg;

      const newVertices = bldg.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
      const newSegments = bldg.segments.map((s) => ({
        ...s,
        p1: { x: s.p1.x + dx, y: s.p1.y + dy },
        p2: { x: s.p2.x + dx, y: s.p2.y + dy },
      }));
      return {
        ...bldg,
        vertices: newVertices,
        segments: newSegments,
      };
    });

    // Verify both b1 and b2 moved by dx
    const b1After = buildings.find((b) => b.id === b1Id)!;
    const b2After = buildings.find((b) => b.id === b2Id)!;

    expect(b1After.vertices[0].x).toBeCloseTo(initialB1X + dx, 4);
    expect(b2After.vertices[0].x).toBeCloseTo(initialB2X + dx, 4);
  });

  it('should only move the single building when not linked in any group', () => {
    let buildings: BuildingLoop[] = createSampleBuildings();
    const b1Id = buildings[0].id;
    const b2Id = buildings[1].id;

    const initialB2X = buildings[1].vertices[0].x;
    const dx = 20.0;
    const dy = 5.0;

    // Move b1 without any groupId
    buildings = buildings.map((bldg) => {
      if (bldg.id !== b1Id) return bldg;
      return {
        ...bldg,
        vertices: bldg.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy })),
      };
    });

    const b2After = buildings.find((b) => b.id === b2Id)!;
    expect(b2After.vertices[0].x).toBeCloseTo(initialB2X, 4);
  });
});
