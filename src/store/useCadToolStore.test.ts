import { describe, it, expect, beforeEach } from 'vitest';
import { useCadToolStore } from './useCadToolStore';

describe('useCadToolStore - Snapping & HPF Filter', () => {
  beforeEach(() => {
    useCadToolStore.setState({
      isOsnapActive: true,
      isDirectionSnappingActive: true,
      osnapModes: {
        vertex: true,
        intersection: true,
        perpendicular: true,
        edge: true,
        extension: true,
      },
      otrackModes: {
        ortho: true,
        dominant: true,
        relative: true,
        dualIntersection: true,
      },
      noisePercentileCutoff: 20,
    });
  });

  it('toggles individual osnap modes correctly', () => {
    expect(useCadToolStore.getState().osnapModes.intersection).toBe(true);

    useCadToolStore.getState().toggleOsnapMode('intersection');
    expect(useCadToolStore.getState().osnapModes.intersection).toBe(false);

    useCadToolStore.getState().toggleOsnapMode('intersection');
    expect(useCadToolStore.getState().osnapModes.intersection).toBe(true);
  });

  it('sets all osnap modes at once', () => {
    useCadToolStore.getState().setAllOsnapModes(false);
    expect(useCadToolStore.getState().osnapModes).toEqual({
      vertex: false,
      intersection: false,
      perpendicular: false,
      edge: false,
      extension: false,
    });

    useCadToolStore.getState().setAllOsnapModes(true);
    expect(useCadToolStore.getState().osnapModes).toEqual({
      vertex: true,
      intersection: true,
      perpendicular: true,
      edge: true,
      extension: true,
    });
  });

  it('toggles otrack modes correctly', () => {
    expect(useCadToolStore.getState().otrackModes.ortho).toBe(true);

    useCadToolStore.getState().toggleOtrackMode('ortho');
    expect(useCadToolStore.getState().otrackModes.ortho).toBe(false);

    useCadToolStore.getState().setAllOtrackModes(false);
    expect(useCadToolStore.getState().otrackModes).toEqual({
      ortho: false,
      dominant: false,
      relative: false,
      dualIntersection: false,
    });
  });

  it('sets noise percentile cutoff for high pass filtering', () => {
    expect(useCadToolStore.getState().noisePercentileCutoff).toBe(20);

    useCadToolStore.getState().setNoisePercentileCutoff(35);
    expect(useCadToolStore.getState().noisePercentileCutoff).toBe(35);

    // Clamping 0 - 80
    useCadToolStore.getState().setNoisePercentileCutoff(-10);
    expect(useCadToolStore.getState().noisePercentileCutoff).toBe(0);

    useCadToolStore.getState().setNoisePercentileCutoff(100);
    expect(useCadToolStore.getState().noisePercentileCutoff).toBe(80);
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

