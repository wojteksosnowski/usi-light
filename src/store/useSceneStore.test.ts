import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './useSceneStore';
import { createBuildingFromVertices } from '../utils/dxfParser';

describe('useSceneStore', () => {
  beforeEach(() => {
    useSceneStore.getState().resetScene();
  });

  it('selectLayerBuildings selects all buildings on the specified layer', () => {
    const b1 = {
      ...createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'Bldg 1', 10),
      id: 'b1',
      layer: 'Warstwa A',
    };
    const b2 = {
      ...createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }], 'Bldg 2', 12),
      id: 'b2',
      layer: 'Warstwa A',
    };
    const b3 = {
      ...createBuildingFromVertices([{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }], 'Bldg 3', 15),
      id: 'b3',
      layer: 'Warstwa B',
    };

    useSceneStore.getState().setBuildings([b1, b2, b3]);
    useSceneStore.getState().selectLayerBuildings('Warstwa A');

    const state = useSceneStore.getState();
    expect(state.selectedBuildingIds).toEqual(['b1', 'b2']);
    expect(state.selectedBuildingId).toBe('b1');
  });

  it('deleteBuildings deletes multiple buildings atomically and cleans up selection', () => {
    const b1 = { ...createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 'Bldg 1', 10), id: 'b1' };
    const b2 = { ...createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }], 'Bldg 2', 10), id: 'b2' };
    const b3 = { ...createBuildingFromVertices([{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }], 'Bldg 3', 10), id: 'b3' };

    useSceneStore.getState().setBuildings([b1, b2, b3]);
    useSceneStore.getState().selectBuilding('b1');
    useSceneStore.getState().selectBuilding('b2', true);

    expect(useSceneStore.getState().selectedBuildingIds).toEqual(['b1', 'b2']);

    useSceneStore.getState().deleteBuildings(['b1', 'b2']);

    const state = useSceneStore.getState();
    expect(state.buildings.map((b) => b.id)).toEqual(['b3']);
    expect(state.selectedBuildingIds).toEqual([]);
    expect(state.selectedBuildingId).toBeNull();
  });

  it('updateSelectedBuilding applies changes to all selectedBuildingIds', () => {
    const b1 = { ...createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 'Bldg 1', 10), id: 'b1' };
    const b2 = { ...createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }], 'Bldg 2', 12), id: 'b2' };

    useSceneStore.getState().setBuildings([b1, b2]);
    useSceneStore.getState().selectBuilding('b1');
    useSceneStore.getState().selectBuilding('b2', true);

    useSceneStore.getState().updateSelectedBuilding({ defaultHeight: 25 });

    const updated = useSceneStore.getState().buildings;
    expect(updated.find((b) => b.id === 'b1')?.defaultHeight).toBe(25);
    expect(updated.find((b) => b.id === 'b2')?.defaultHeight).toBe(25);
  });
});
