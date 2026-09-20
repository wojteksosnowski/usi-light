import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from '../src/store/useSceneStore';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { Point2D } from '../src/types/geometry';

describe('Group Hierarchy Interaction (Logical Objects & Sub-objects)', () => {
  beforeEach(() => {
    useSceneStore.setState({
      buildings: [],
      selectedBuildingId: null,
      selectedBuildingIds: [],
      openGroupId: null,
      isLinkingMode: false,
    });
  });

  it('1 - single click on a grouped building selects the logical group (all buildings) when outside group', () => {
    const b1 = createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'B1');
    const b2 = createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }], 'B2');
    const b3 = createBuildingFromVertices([{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }], 'B3');

    b1.groupId = 'group-node-1';
    b2.groupId = 'group-node-1';

    useSceneStore.setState({ buildings: [b1, b2, b3] });

    // Click on b1
    useSceneStore.getState().selectBuilding(b1.id);

    const state = useSceneStore.getState();
    expect(state.selectedBuildingId).toBe(b1.id);
    expect(state.selectedBuildingIds).toContain(b1.id);
    expect(state.selectedBuildingIds).toContain(b2.id);
    expect(state.selectedBuildingIds).not.toContain(b3.id);
    expect(state.openGroupId).toBeNull();
  });

  it('2 - entering group via setOpenGroupId isolates the group and allows selecting single sub-objects', () => {
    const b1 = createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'B1');
    const b2 = createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }], 'B2');

    b1.groupId = 'group-node-1';
    b2.groupId = 'group-node-1';

    useSceneStore.setState({ buildings: [b1, b2], openGroupId: 'group-node-1' });

    // When inside group, selecting b1 selects only b1
    useSceneStore.getState().selectBuilding(b1.id);

    const state = useSceneStore.getState();
    expect(state.selectedBuildingId).toBe(b1.id);
    expect(state.selectedBuildingIds).toEqual([b1.id]);
    expect(state.openGroupId).toBe('group-node-1');
  });

  it('3 - clicking outside the open group resets openGroupId and selection', () => {
    const b1 = createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'B1');
    const b2 = createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }], 'B2');
    const b3 = createBuildingFromVertices([{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }], 'B3');

    b1.groupId = 'group-node-1';
    b2.groupId = 'group-node-1';

    useSceneStore.setState({ buildings: [b1, b2, b3], openGroupId: 'group-node-1', selectedBuildingId: b1.id, selectedBuildingIds: [b1.id] });

    // Click on empty space (null)
    useSceneStore.getState().selectBuilding(null);
    expect(useSceneStore.getState().openGroupId).toBeNull();
    expect(useSceneStore.getState().selectedBuildingId).toBeNull();

    // Re-open and click on un-grouped building b3
    useSceneStore.setState({ openGroupId: 'group-node-1', selectedBuildingId: b1.id });
    useSceneStore.getState().selectBuilding(b3.id);
    expect(useSceneStore.getState().openGroupId).toBeNull();
    expect(useSceneStore.getState().selectedBuildingId).toBe(b3.id);
    expect(useSceneStore.getState().selectedBuildingIds).toEqual([b3.id]);
  });

  it('4 - rotating group buildings rotates all group members around common centroid', () => {
    const b1 = createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'B1');
    const b2 = createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }], 'B2');

    b1.groupId = 'group-node-1';
    b2.groupId = 'group-node-1';

    useSceneStore.setState({ buildings: [b1, b2] });

    // Common centroid between B1 (center: 5,5) and B2 (center: 25,5) is (15, 5)
    const pivot: Point2D = { x: 15, y: 5 };
    const deltaRad = Math.PI; // 180 degrees

    useSceneStore.getState().rotateBuilding(b1.id, pivot, deltaRad);

    const rotatedBuildings = useSceneStore.getState().buildings;
    const rotB1 = rotatedBuildings.find((b) => b.id === b1.id)!;
    const rotB2 = rotatedBuildings.find((b) => b.id === b2.id)!;

    // B1 was around (5,5), 180 deg around (15,5) -> now around (25,5)
    expect(rotB1.vertices[0].x).toBeCloseTo(30, 3);
    expect(rotB1.vertices[0].y).toBeCloseTo(10, 3);

    // B2 was around (25,5), 180 deg around (15,5) -> now around (5,5)
    expect(rotB2.vertices[0].x).toBeCloseTo(10, 3);
    expect(rotB2.vertices[0].y).toBeCloseTo(10, 3);
  });
});
