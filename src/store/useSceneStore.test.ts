import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './useSceneStore';
import { useUiStore } from './useUiStore';
import { createBuildingFromVertices } from '../utils/dxfParser';

describe('useSceneStore', () => {
  beforeEach(() => {
    useSceneStore.getState().resetScene();
    useUiStore.getState().setSidebarOpen(false);
    useUiStore.getState().setOpenSidebarGroup(null);
  });

  it('selectBuilding automatically opens sidebar and activates layers tab', () => {
    const b1 = { ...createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 'Bldg 1', 10), id: 'b1' };
    useSceneStore.getState().setBuildings([b1]);

    expect(useUiStore.getState().isSidebarOpen).toBe(false);
    expect(useUiStore.getState().openSidebarGroup).toBeNull();

    useSceneStore.getState().selectBuilding('b1');

    expect(useSceneStore.getState().selectedBuildingId).toBe('b1');
    expect(useUiStore.getState().isSidebarOpen).toBe(true);
    expect(useUiStore.getState().openSidebarGroup).toBe('layers');
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

  it('moveBuildingEdge modifies polygon vertices correctly without breaking geometry', () => {
    const bldg = {
      ...createBuildingFromVertices([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ], 'Bldg 1', 10),
      id: 'bldg-1',
    };

    useSceneStore.getState().setBuildings([bldg]);
    // Move edge index 1 (right edge from (10,0) to (10,10)) by dx=5, dy=0
    useSceneStore.getState().moveBuildingEdge('bldg-1', 1, 5, 0);

    const updated = useSceneStore.getState().buildings.find((b) => b.id === 'bldg-1');
    expect(updated).toBeDefined();
    expect(updated?.vertices.length).toBe(4);
    expect(updated?.segments.length).toBe(4);
  });

  it('moveBuildingEdge with bay_window modifier updates geometry, modifiers and segments correctly', () => {
    const baseBldg = {
      ...createBuildingFromVertices([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ], 'Bldg with Bay Window', 15),
      id: 'bldg-bay',
      modifiers: [
        {
          id: 'mod-bay-1',
          type: 'bay_window' as const,
          name: 'Wykusz Krawędź 0',
          enabled: true,
          edgeIndex: 0,
          width: 6,
          projection: 2,
          storiesCount: 0,
        },
      ],
    };

    useSceneStore.getState().setBuildings([baseBldg]);
    // Move edge 2 (top edge from (20,20) to (0,20)) by dx=0, dy=5
    useSceneStore.getState().moveBuildingEdge('bldg-bay', 2, 0, 5);

    const updated = useSceneStore.getState().buildings.find((b) => b.id === 'bldg-bay');
    expect(updated).toBeDefined();
    expect(updated?.vertices.length).toBe(4);
    // Base vertices top edge moved from y=20 to y=25
    expect(updated?.vertices[2].y).toBe(25);
    expect(updated?.vertices[3].y).toBe(25);
    // Modifier segments should be regenerated and have > 4 segments
    expect(updated?.segments.length).toBeGreaterThan(4);
  });

  describe('Undo / Redo (zundo temporal)', () => {
    beforeEach(() => {
      const bldg = {
        ...createBuildingFromVertices(
          [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
          'Initial Test Building',
          15
        ),
        id: 'bldg-1',
      };
      useSceneStore.getState().setBuildings([bldg]);
      useSceneStore.temporal.getState().clear();
    });

    it('supports undo and redo for adding and updating buildings', () => {
      useSceneStore.temporal.getState().clear();
      const initialCount = useSceneStore.getState().buildings.length;

      const newBldg = {
        ...createBuildingFromVertices(
          [{ x: 100, y: 100 }, { x: 110, y: 100 }, { x: 110, y: 110 }, { x: 100, y: 110 }],
          'Test Undo Building',
          15
        ),
        id: 'undo-bldg-1',
      };

      useSceneStore.getState().addBuilding(newBldg);
      expect(useSceneStore.getState().buildings.length).toBe(initialCount + 1);

      // Undo -> count returns to initialCount
      useSceneStore.temporal.getState().undo();
      expect(useSceneStore.getState().buildings.length).toBe(initialCount);

      // Redo -> count returns to initialCount + 1
      useSceneStore.temporal.getState().redo();
      expect(useSceneStore.getState().buildings.length).toBe(initialCount + 1);
    });

    it('partialize ignores selection changes so selection does not pollute history', () => {
      useSceneStore.temporal.getState().clear();
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);

      // Changing selection should not produce a history state because partialize only tracks buildings & layerSettings
      useSceneStore.getState().selectBuilding('bldg-1');
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);
    });

    it('pausing temporal during continuous drag records only 1 history step on complete', () => {
      useSceneStore.temporal.getState().clear();
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);

      const bldgId = useSceneStore.getState().buildings[0].id;
      const initialPos = { ...useSceneStore.getState().buildings[0].vertices[0] };

      // 1. Start drag interaction batch
      useSceneStore.getState().startInteractionBatch();

      // 2. Perform 5 intermediate moves (like 5 mousemove frames)
      for (let i = 1; i <= 5; i++) {
        useSceneStore.getState().moveBuilding(bldgId, 1, 1);
      }

      // Past states should still be empty during drag
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);

      // 3. Drop (mouseup) -> commit interaction batch
      useSceneStore.getState().commitInteractionBatch();

      // Past states should have recorded exactly 1 step
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(1);

      // Current position should be +5, +5
      const moved = useSceneStore.getState().buildings.find((b) => b.id === bldgId);
      expect(moved?.vertices[0]).toEqual({ x: initialPos.x + 5, y: initialPos.y + 5 });

      // 4. Undo restores the initial position before the whole drag operation in a single step
      useSceneStore.temporal.getState().undo();
      const restored = useSceneStore.getState().buildings.find((b) => b.id === bldgId);
      expect(restored?.vertices[0]).toEqual(initialPos);

      // 5. Redo restores the final dragged position in a single step
      useSceneStore.temporal.getState().redo();
      const redone = useSceneStore.getState().buildings.find((b) => b.id === bldgId);
      expect(redone?.vertices[0]).toEqual({ x: initialPos.x + 5, y: initialPos.y + 5 });
    });

    it('does not add history step if interaction batch had no changes', () => {
      useSceneStore.temporal.getState().clear();
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);

      useSceneStore.getState().startInteractionBatch();
      // Mouse down and mouse up without moving
      useSceneStore.getState().commitInteractionBatch();

      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);
    });

    it('cancelInteractionBatch restores initial state without recording history', () => {
      useSceneStore.temporal.getState().clear();
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);

      const bldgId = useSceneStore.getState().buildings[0].id;
      const initialPos = { ...useSceneStore.getState().buildings[0].vertices[0] };

      useSceneStore.getState().startInteractionBatch();
      useSceneStore.getState().moveBuilding(bldgId, 10, 10);
      expect(useSceneStore.getState().buildings[0].vertices[0]).toEqual({ x: initialPos.x + 10, y: initialPos.y + 10 });

      // Cancel drag (e.g. Escape key)
      useSceneStore.getState().cancelInteractionBatch();

      // State is reverted
      expect(useSceneStore.getState().buildings[0].vertices[0]).toEqual(initialPos);
      // History is empty
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);
    });

    it('supports batching for vertex and edge dragging', () => {
      useSceneStore.temporal.getState().clear();
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);

      const bldgId = useSceneStore.getState().buildings[0].id;
      const initialVertices = useSceneStore.getState().buildings[0].vertices.map((v) => ({ ...v }));

      // Simulate vertex drag
      useSceneStore.getState().startInteractionBatch();
      for (let i = 1; i <= 4; i++) {
        const tempVerts = initialVertices.map((v, idx) => (idx === 0 ? { x: v.x + i, y: v.y + i } : v));
        useSceneStore.getState().updateBuildingVertices(bldgId, tempVerts);
      }
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(0);

      useSceneStore.getState().commitInteractionBatch();
      expect(useSceneStore.temporal.getState().pastStates.length).toBe(1);

      // Undo vertex drag
      useSceneStore.temporal.getState().undo();
      expect(useSceneStore.getState().buildings[0].vertices).toEqual(initialVertices);
    });

    it('moveBuilding and rotateBuilding directly transform modifier geometry buffer', () => {
      const bldgId = 'bldg-mod-buffer';
      const initialBuilding = {
        ...createBuildingFromVertices(
          [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 20 },
            { x: 0, y: 20 },
          ],
          'Bldg Mod Buffer',
          15
        ),
        id: bldgId,
        modifiers: [
          {
            id: 'm-terrace',
            type: 'terrace' as const,
            enabled: true,
            depth: -4,
            storiesCount: -1,
            edgeIndex: 1,
          },
        ],
      };

      useSceneStore.getState().setBuildings([initialBuilding]);
      useSceneStore.getState().selectBuilding(bldgId);
      useSceneStore.getState().updateSelectedBuilding({}); // triggers applyBuildingModifiers
      const withMods = useSceneStore.getState().buildings.find((b) => b.id === bldgId)!;
      expect(withMods.storyPolygons).toBeDefined();
      expect(withMods.storyPolygons!.length).toBe(5);

      const topStoryBefore = withMods.storyPolygons![4].polygon.map((p) => ({ ...p }));

      // 1. Move building by (50, 100)
      useSceneStore.getState().moveBuilding(bldgId, 50, 100);
      const moved = useSceneStore.getState().buildings.find((b) => b.id === bldgId)!;
      expect(moved.storyPolygons![4].polygon[0].x).toBeCloseTo(topStoryBefore[0].x + 50, 2);
      expect(moved.storyPolygons![4].polygon[0].y).toBeCloseTo(topStoryBefore[0].y + 100, 2);

      // 2. Rotate building by 90 degrees around (0,0)
      useSceneStore.getState().rotateBuilding(bldgId, { x: 0, y: 0 }, Math.PI / 2);
      const rotated = useSceneStore.getState().buildings.find((b) => b.id === bldgId)!;
      const movedPt = moved.storyPolygons![4].polygon[0];
      const expectedX = -movedPt.y;
      const expectedY = movedPt.x;
      expect(rotated.storyPolygons![4].polygon[0].x).toBeCloseTo(expectedX, 2);
      expect(rotated.storyPolygons![4].polygon[0].y).toBeCloseTo(expectedY, 2);
    });

    it('links and unlinks buildings and prevents modifiers on grouped/compound objects', () => {
      const b1 = { ...createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 'B1', 10), id: 'b1' };
      const b2 = { ...createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }], 'B2', 12), id: 'b2' };

      useSceneStore.getState().setBuildings([b1, b2]);

      // Link b1 and b2
      useSceneStore.getState().performLinkBuildings('b1', 'b2');
      let state = useSceneStore.getState();
      const linked1 = state.buildings.find((b) => b.id === 'b1');
      const linked2 = state.buildings.find((b) => b.id === 'b2');

      expect(linked1?.groupId).toBeDefined();
      expect(linked1?.groupId).toBe(linked2?.groupId);

      // Attempt to add a modifier to grouped object should be rejected
      useSceneStore.getState().addBuildingModifier('b1', {
        id: 'mod-test',
        type: 'terrace',
        enabled: true,
        depth: -2,
        storiesCount: -1,
        edgeIndex: 0,
      } as any);

      state = useSceneStore.getState();
      const b1AfterMod = state.buildings.find((b) => b.id === 'b1');
      expect(b1AfterMod?.modifiers?.length || 0).toBe(0);

      // Unlink b2
      useSceneStore.getState().performUnlinkBuilding('b2');
      state = useSceneStore.getState();
      const unlinked1 = state.buildings.find((b) => b.id === 'b1');
      const unlinked2 = state.buildings.find((b) => b.id === 'b2');
      expect(unlinked1?.groupId).toBeUndefined();
      expect(unlinked2?.groupId).toBeUndefined();
    });

    it('moves and rotates all group buildings when group is closed, but moves/rotates only selected building when group is open', () => {
      const b1 = { ...createBuildingFromVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'B1', 10), id: 'b1' };
      const b2 = { ...createBuildingFromVertices([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }], 'B2', 10), id: 'b2' };

      useSceneStore.getState().setBuildings([b1, b2]);
      useSceneStore.getState().performLinkBuildings('b1', 'b2');
      const groupId = useSceneStore.getState().buildings.find((b) => b.id === 'b1')!.groupId!;

      // 1. Grupa zamknięta (openGroupId === null) -> moveBuilding przesuwa oba budynki
      useSceneStore.getState().moveBuilding('b1', 5, 5);
      let state = useSceneStore.getState();
      expect(state.buildings.find((b) => b.id === 'b1')!.vertices[0]).toEqual({ x: 5, y: 5 });
      expect(state.buildings.find((b) => b.id === 'b2')!.vertices[0]).toEqual({ x: 25, y: 5 });

      // 2. Wejście do wnętrza grupy (openGroupId === groupId) -> moveBuilding na b1 przesuwa TYLKO b1
      useSceneStore.getState().setOpenGroupId(groupId);
      useSceneStore.getState().moveBuilding('b1', 10, 0);
      state = useSceneStore.getState();
      expect(state.buildings.find((b) => b.id === 'b1')!.vertices[0]).toEqual({ x: 15, y: 5 });
      expect(state.buildings.find((b) => b.id === 'b2')!.vertices[0]).toEqual({ x: 25, y: 5 }); // b2 bez zmian!

      // 3. moveBuildings w otwartej grupie z przekazaniem ['b1'] -> przesuwa TYLKO b1
      useSceneStore.getState().moveBuildings(['b1'], 0, 10);
      state = useSceneStore.getState();
      expect(state.buildings.find((b) => b.id === 'b1')!.vertices[0]).toEqual({ x: 15, y: 15 });
      expect(state.buildings.find((b) => b.id === 'b2')!.vertices[0]).toEqual({ x: 25, y: 5 });

      // 4. Wyjście z grupy (openGroupId === null) -> przesuwanie znowu porusza całą grupę
      useSceneStore.getState().setOpenGroupId(null);
      useSceneStore.getState().moveBuilding('b1', -5, -5);
      state = useSceneStore.getState();
      expect(state.buildings.find((b) => b.id === 'b1')!.vertices[0]).toEqual({ x: 10, y: 10 });
      expect(state.buildings.find((b) => b.id === 'b2')!.vertices[0]).toEqual({ x: 20, y: 0 });
    });
  });
});


