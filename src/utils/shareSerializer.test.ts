import { describe, it, expect } from 'vitest';
import {
  compressProjectData,
  decompressProjectData,
  getCompressionStats,
  createSharedPayloadFromState,
} from './shareSerializer';
import { createSampleBuildings } from './dxfParser';

describe('shareSerializer', () => {
  it('powinien poprawnie skompresować i zdekompresować projekt (symetria danych)', () => {
    const buildings = createSampleBuildings();
    const payload = createSharedPayloadFromState({
      buildings,
      selectedBuildingId: buildings[0]?.id,
      settings: {
        latitude: 52.2297,
        longitude: 21.0122,
        equinoxDate: 'spring',
      },
      selectedCity: 'Warszawa',
      viewRotationDeg: 45.0,
      savedViewRotationDeg: 45.0,
      showShadowingLines: true,
      showSunlightLines: true,
      showShadowRange: true,
    });

    const compressed = compressProjectData(payload);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);

    const stats = getCompressionStats(payload, compressed);
    expect(stats.compressedSizeBytes).toBeLessThan(stats.rawSizeBytes);
    expect(stats.reductionPercentage).toBeGreaterThan(50);

    const restored = decompressProjectData(compressed);
    expect(restored.v).toBe(1);
    expect(restored.scene.buildings.length).toBe(buildings.length);
    expect(restored.solar.latitude).toBe(52.2297);
    expect(restored.solar.selectedCity).toBe('Warszawa');
    expect(restored.viewport.rotation).toBe(45.0);
  });

  it('powinien rzucić błąd przy uszkodzonym lub nieprawidłowym ciągu Base64', () => {
    expect(() => decompressProjectData('nieprawidlowy-base64!')).toThrow();
  });
});
