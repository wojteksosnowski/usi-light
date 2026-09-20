import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './useSceneStore';
import { BuildingLoop, Point2D } from '../types/geometry';

function createDummyBuilding(id: string, vertices: Point2D[], groupId?: string): BuildingLoop {
  return {
    id,
    name: `Building ${id}`,
    layer: 'Domyślna (0)',
    category: 'building',
    isTested: false,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 15,
    hWindowBottom: 0.85,
    elevation: 0,
    firstFloorHeight: 3.5,
    typicalFloorHeight: 3.0,
    storeysCount: 5,
    vertices,
    groupId,
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };
}

describe('useSceneStore - Group Logic (obiekt logiczny)', () => {
  beforeEach(() => {
    useSceneStore.setState({
      buildings: [],
      selectedBuildingId: null,
      selectedBuildingIds: [],
      openGroupId: null,
    });
  });

  it('selects all group members when clicking a group building at Level 0', () => {
    const b1 = createDummyBuilding('b1', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'grp-1');
    const b2 = createDummyBuilding('b2', [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }], 'grp-1');

    useSceneStore.getState().setBuildings([b1, b2]);
    useSceneStore.getState().setSelectedBuildingId('b1');

    const state = useSceneStore.getState();
    expect(state.selectedBuildingId).toBe('b1');
    expect(state.selectedBuildingIds).toContain('b1');
    expect(state.selectedBuildingIds).toContain('b2');
    expect(state.selectedBuildingIds).toHaveLength(2);
  });

  it('rotates all group buildings around group centroid', () => {
    const b1 = createDummyBuilding('b1', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'grp-1');
    const b2 = createDummyBuilding('b2', [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }], 'grp-1');

    useSceneStore.getState().setBuildings([b1, b2]);
    useSceneStore.getState().rotateGroup('grp-1', 90);

    const state = useSceneStore.getState();
    const rotatedB1 = state.buildings.find((b) => b.id === 'b1')!;
    const rotatedB2 = state.buildings.find((b) => b.id === 'b2')!;

    expect(rotatedB1.transform.rotationDeg).toBeCloseTo(90, 1);
    expect(rotatedB2.transform.rotationDeg).toBeCloseTo(90, 1);
  });

  it('updates group properties in bulk (isTested, isIncluded, isCityCentre)', () => {
    const b1 = createDummyBuilding('b1', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'grp-1');
    const b2 = createDummyBuilding('b2', [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }], 'grp-1');

    useSceneStore.getState().setBuildings([b1, b2]);
    useSceneStore.getState().updateGroup('grp-1', { isTested: true, isCityCentre: true, isIncluded: false });

    const state = useSceneStore.getState();
    expect(state.buildings.every((b) => b.isTested === true)).toBe(true);
    expect(state.buildings.every((b) => b.isCityCentre === true)).toBe(true);
    expect(state.buildings.every((b) => b.isIncluded === false)).toBe(true);
  });
});
