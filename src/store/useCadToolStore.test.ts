import { describe, it, expect, beforeEach } from 'vitest';
import { useCadToolStore } from './useCadToolStore';

// OSNAP i OTRACK są wyłącznie flagami grupowymi (isOsnapActive / isDirectionSnappingActive) —
// nie istnieje już per-typu wybór (OsnapModes/OtrackModes, toggleOsnapMode/toggleOtrackMode itd.
// zostały usunięte z CadToolState przez uproszczenie silnika snapowania, patrz
// src/engine/snapping/types.ts OSNAP_TYPES/OTRACK_TYPES). Każda z dwóch grup działa w całości
// albo wcale, niezależnie od drugiej.
describe('useCadToolStore - Snapping (grupowe flagi OSNAP/OTRACK)', () => {
  beforeEach(() => {
    useCadToolStore.setState({
      isOsnapActive: true,
      isDirectionSnappingActive: true,
    });
  });

  it('toggleOsnap przełącza wyłącznie grupową flagę isOsnapActive', () => {
    expect(useCadToolStore.getState().isOsnapActive).toBe(true);
    useCadToolStore.getState().toggleOsnap();
    expect(useCadToolStore.getState().isOsnapActive).toBe(false);
    useCadToolStore.getState().toggleOsnap();
    expect(useCadToolStore.getState().isOsnapActive).toBe(true);
  });

  it('toggleDirectionSnapping przełącza wyłącznie grupową flagę isDirectionSnappingActive', () => {
    expect(useCadToolStore.getState().isDirectionSnappingActive).toBe(true);
    useCadToolStore.getState().toggleDirectionSnapping();
    expect(useCadToolStore.getState().isDirectionSnappingActive).toBe(false);
    useCadToolStore.getState().toggleDirectionSnapping();
    expect(useCadToolStore.getState().isDirectionSnappingActive).toBe(true);
  });

  it('isOsnapActive i isDirectionSnappingActive są w pełni niezależne (dowolna kombinacja)', () => {
    useCadToolStore.getState().setIsOsnapActive(true);
    useCadToolStore.getState().setIsDirectionSnappingActive(false);
    expect(useCadToolStore.getState().isOsnapActive).toBe(true);
    expect(useCadToolStore.getState().isDirectionSnappingActive).toBe(false);

    useCadToolStore.getState().setIsOsnapActive(false);
    useCadToolStore.getState().setIsDirectionSnappingActive(true);
    expect(useCadToolStore.getState().isOsnapActive).toBe(false);
    expect(useCadToolStore.getState().isDirectionSnappingActive).toBe(true);
  });

  it('nie eksponuje już per-typu API (OsnapModes/OtrackModes usunięte)', () => {
    const state = useCadToolStore.getState() as unknown as Record<string, unknown>;
    expect(state.osnapModes).toBeUndefined();
    expect(state.otrackModes).toBeUndefined();
    expect(state.toggleOsnapMode).toBeUndefined();
    expect(state.setAllOsnapModes).toBeUndefined();
    expect(state.toggleOtrackMode).toBeUndefined();
    expect(state.setAllOtrackModes).toBeUndefined();
  });
});

describe('useCadToolStore - Project Brush Tool', () => {
  beforeEach(() => {
    useCadToolStore.setState({
      drawingMode: 'none',
      isDimensionToolActive: false,
      isProjectBrushActive: false,
      facadePointMode: false,
      isEditMode: false,
    });
  });

  it('activates and deactivates isProjectBrushActive properly', () => {
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(false);

    useCadToolStore.getState().setIsProjectBrushActive(true);
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(true);

    useCadToolStore.getState().setIsProjectBrushActive(false);
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(false);
  });

  it('toggles isProjectBrushActive and clears other active tool modes', () => {
    useCadToolStore.getState().setIsDimensionToolActive(true);
    expect(useCadToolStore.getState().isDimensionToolActive).toBe(true);

    useCadToolStore.getState().toggleProjectBrush();
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(true);
    expect(useCadToolStore.getState().isDimensionToolActive).toBe(false);

    useCadToolStore.getState().toggleProjectBrush();
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(false);
  });

  it('resets isProjectBrushActive when another tool mode is activated', () => {
    useCadToolStore.getState().setIsProjectBrushActive(true);
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(true);

    useCadToolStore.getState().setDrawingMode('rectangle');
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(false);
    expect(useCadToolStore.getState().drawingMode).toBe('rectangle');

    useCadToolStore.getState().setIsProjectBrushActive(true);
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(true);
    expect(useCadToolStore.getState().drawingMode).toBe('none');

    useCadToolStore.getState().setIsDimensionToolActive(true);
    expect(useCadToolStore.getState().isProjectBrushActive).toBe(false);
    expect(useCadToolStore.getState().isDimensionToolActive).toBe(true);
  });
});

