import { describe, it, expect, beforeEach } from 'vitest';
import { useCadToolStore } from './useCadToolStore';

describe('useCadToolStore - Snapping & HPF Filter', () => {
  beforeEach(() => {
    useCadToolStore.setState({
      isOsnapActive: true,
      isDirectionSnappingActive: true,
      osnapModes: {
        vertex: true,
        midpoint: true,
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
    expect(useCadToolStore.getState().osnapModes.midpoint).toBe(true);

    useCadToolStore.getState().toggleOsnapMode('midpoint');
    expect(useCadToolStore.getState().osnapModes.midpoint).toBe(false);

    useCadToolStore.getState().toggleOsnapMode('midpoint');
    expect(useCadToolStore.getState().osnapModes.midpoint).toBe(true);
  });

  it('sets all osnap modes at once', () => {
    useCadToolStore.getState().setAllOsnapModes(false);
    expect(useCadToolStore.getState().osnapModes).toEqual({
      vertex: false,
      midpoint: false,
      intersection: false,
      perpendicular: false,
      edge: false,
      extension: false,
    });

    useCadToolStore.getState().setAllOsnapModes(true);
    expect(useCadToolStore.getState().osnapModes).toEqual({
      vertex: true,
      midpoint: true,
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
