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

  it('preserves and updates sweepPath during updateBuildingSweepPath and moveBuilding', () => {
    const sweepPath = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 15 },
    ];
    const sweepBldg = {
      ...createBuildingFromVertices([
        { x: 0, y: 2.5 },
        { x: 20, y: 2.5 },
        { x: 20, y: -2.5 },
        { x: 0, y: -2.5 },
      ], 'Wstęga 1', 12),
      id: 'sweep-1',
      sweepPath,
      sweepWidth: 5.0,
      sweepAlignment: 'center' as const,
    };

    useSceneStore.getState().setBuildings([sweepBldg]);
    
    // Test updateBuildingSweepPath
    const newPath = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
    ];
    useSceneStore.getState().updateBuildingSweepPath('sweep-1', newPath, 6.0, 'left');

    let state = useSceneStore.getState();
    const updatedSweep = state.buildings.find((b) => b.id === 'sweep-1');
    expect(updatedSweep?.sweepPath).toEqual(newPath);
    expect(updatedSweep?.sweepWidth).toBe(6.0);
    expect(updatedSweep?.sweepAlignment).toBe('left');
    expect(updatedSweep?.vertices.length).toBeGreaterThanOrEqual(4);

    // Test moveBuilding transforms sweepPath along with vertices
    useSceneStore.getState().moveBuilding('sweep-1', 5, 10);
    state = useSceneStore.getState();
    const movedSweep = state.buildings.find((b) => b.id === 'sweep-1');
    expect(movedSweep?.sweepPath?.[0]).toEqual({ x: 5, y: 10 });
    expect(movedSweep?.sweepPath?.[1]).toEqual({ x: 35, y: 10 });
  });
});

