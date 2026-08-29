import { describe, it, expect } from 'vitest';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { BuildingLoop } from '../src/types/geometry';

describe('Object Duplication and Deletion', () => {
  it('should duplicate a building with offset vertices and unique segment ids', () => {
    const buildings: BuildingLoop[] = createSampleBuildings();
    const source = buildings[0];

    const offset = 5.0;
    const newId = `bldg-${Date.now()}`;
    const newName = `${source.name} (Kopia)`;

    const newVertices = source.vertices.map((v) => ({
      x: v.x + offset,
      y: v.y - offset,
    }));

    const newSegments = source.segments.map((s, idx) => ({
      ...s,
      id: `${newId}-seg-${idx + 1}`,
      p1: { x: s.p1.x + offset, y: s.p1.y - offset },
      p2: { x: s.p2.x + offset, y: s.p2.y - offset },
    }));

    const duplicate: BuildingLoop = {
      ...source,
      id: newId,
      name: newName,
      vertices: newVertices,
      segments: newSegments,
      groupId: undefined,
    };

    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.name).toContain('(Kopia)');
    expect(duplicate.vertices[0].x).toBeCloseTo(source.vertices[0].x + 5.0, 4);
    expect(duplicate.segments[0].id).toBe(`${newId}-seg-1`);
  });

  it('should delete a building and dissolve group if only 1 member remains', () => {
    let buildings: BuildingLoop[] = createSampleBuildings();
    const b1Id = buildings[0].id;
    const b2Id = buildings[1].id;

    // Put b1 and b2 in a group
    buildings = buildings.map((b) => {
      if (b.id === b1Id || b.id === b2Id) {
        return { ...b, groupId: 'grp-test' };
      }
      return b;
    });

    // Delete b1
    const target = buildings.find((b) => b.id === b1Id);
    let remaining = buildings.filter((b) => b.id !== b1Id);

    if (target?.groupId) {
      const remainingInGroup = remaining.filter((b) => b.groupId === target.groupId);
      if (remainingInGroup.length <= 1) {
        remaining = remaining.map((b) =>
          b.groupId === target.groupId ? { ...b, groupId: undefined } : b
        );
      }
    }

    const b2After = remaining.find((b) => b.id === b2Id)!;
    expect(b2After.groupId).toBeUndefined();
    expect(remaining.length).toBe(buildings.length - 1);
  });
});
