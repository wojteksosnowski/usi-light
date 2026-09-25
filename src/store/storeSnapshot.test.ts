import { describe, it, expect, vi } from 'vitest';
import { create } from 'zustand';
import { applyStoreOverrides } from './storeSnapshot';

describe('storeSnapshot - applyStoreOverrides', () => {
  it('poprawnie nadpisuje i przywraca pojedynczy store z prostymi wartościami', () => {
    interface TestState {
      count: number;
      label: string;
      isEnabled: boolean;
    }

    const useTestStore = create<TestState>(() => ({
      count: 42,
      label: 'initial',
      isEnabled: true,
    }));

    const restore = applyStoreOverrides([
      {
        store: useTestStore,
        overrides: {
          count: 0,
          isEnabled: false,
        },
      },
    ]);

    expect(useTestStore.getState()).toEqual({
      count: 0,
      label: 'initial',
      isEnabled: false,
    });

    restore();

    expect(useTestStore.getState()).toEqual({
      count: 42,
      label: 'initial',
      isEnabled: true,
    });
  });

  it('izoluje tablice przed mutacjami po utworzeniu migawki', () => {
    interface TestState {
      selectedIds: string[];
    }

    const useTestStore = create<TestState>(() => ({
      selectedIds: ['id1', 'id2'],
    }));

    const restore = applyStoreOverrides([
      {
        store: useTestStore,
        overrides: {
          selectedIds: [],
        },
      },
    ]);

    expect(useTestStore.getState().selectedIds).toEqual([]);

    // Symulacja manipulacji tablicą po nadpisaniu
    useTestStore.setState({ selectedIds: ['id3'] });
    expect(useTestStore.getState().selectedIds).toEqual(['id3']);

    restore();

    expect(useTestStore.getState().selectedIds).toEqual(['id1', 'id2']);
  });

  it('obsługuje wiele storeów jednocześnie w jednym wywołaniu', () => {
    const useStoreA = create(() => ({ a: 1, text: 'A' }));
    const useStoreB = create(() => ({ b: 2, flag: true }));

    const restore = applyStoreOverrides([
      { store: useStoreA, overrides: { a: 99 } },
      { store: useStoreB, overrides: { flag: false } },
    ]);

    expect(useStoreA.getState().a).toBe(99);
    expect(useStoreA.getState().text).toBe('A');
    expect(useStoreB.getState().flag).toBe(false);
    expect(useStoreB.getState().b).toBe(2);

    restore();

    expect(useStoreA.getState().a).toBe(1);
    expect(useStoreB.getState().flag).toBe(true);
  });

  it('obsługuje niestandardowe handlery capture, apply i restore', () => {
    interface Layer {
      id: string;
      visible: boolean;
    }
    interface ComplexState {
      groupActive: boolean;
      layers: Layer[];
      updateLayer: (id: string, visible: boolean) => void;
    }

    const useComplexStore = create<ComplexState>((set) => ({
      groupActive: true,
      layers: [
        { id: 'l1', visible: true },
        { id: 'l2', visible: false },
      ],
      updateLayer: (id, visible) =>
        set((state) => ({
          layers: state.layers.map((l) => (l.id === id ? { ...l, visible } : l)),
        })),
    }));

    const restore = applyStoreOverrides([
      {
        store: useComplexStore,
        capture: (state: ComplexState) => ({
          groupActive: state.groupActive,
          layers: state.layers.map((l: Layer) => ({ ...l })),
        }),
        apply: (store) => {
          store.setState({ groupActive: false });
          store.getState().updateLayer('l1', false);
        },
        restore: (store, snapshot) => {
          store.setState({ groupActive: snapshot.groupActive });
          for (const l of snapshot.layers) {
            store.getState().updateLayer(l.id, l.visible);
          }
        },
      },
    ]);

    expect(useComplexStore.getState().groupActive).toBe(false);
    expect(useComplexStore.getState().layers[0].visible).toBe(false);

    restore();

    expect(useComplexStore.getState().groupActive).toBe(true);
    expect(useComplexStore.getState().layers[0].visible).toBe(true);
    expect(useComplexStore.getState().layers[1].visible).toBe(false);
  });

  it('gwarantuje idempotentność funkcji restore()', () => {
    const useTestStore = create(() => ({ val: 10 }));
    const restore = applyStoreOverrides([
      { store: useTestStore, overrides: { val: 20 } },
    ]);

    expect(useTestStore.getState().val).toBe(20);
    restore();
    expect(useTestStore.getState().val).toBe(10);

    // Drugie wywołanie nie powinno nadpisać stanu jeśli ktoś go w międzyczasie zmienił
    useTestStore.setState({ val: 30 });
    restore();
    expect(useTestStore.getState().val).toBe(30);
  });
});
