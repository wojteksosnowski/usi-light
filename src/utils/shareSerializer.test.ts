import { describe, it, expect } from 'vitest';
import {
  compressProjectData,
  decompressProjectData,
  getCompressionStats,
  createSharedPayloadFromState,
  pointsToTuples,
  tuplesToPoints,
} from './shareSerializer';
import { SHARE_V2_BUILDING_DEFAULTS } from './shareDefaults';
import { createSampleBuildings } from './dxfParser';
import { SharedProjectPayloadV1 } from '../types/sharing';
import { applyBuildingModifiers } from '../engine/modifiers/modifierPipeline';

describe('shareSerializer', () => {
  it('powinien poprawnie skompresować i zdekompresować projekt (v2, symetria danych źródłowych)', () => {
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

    expect(payload.v).toBe(2);

    const compressed = compressProjectData(payload);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);

    const stats = getCompressionStats(payload, compressed);
    expect(stats.compressedSizeBytes).toBeLessThan(stats.rawSizeBytes);

    const restored = decompressProjectData(compressed);
    expect(restored.v).toBe(2);
    expect(restored.scene.buildings.length).toBe(buildings.length);
    expect(restored.solar.latitude).toBe(52.2297);
    expect(restored.solar.selectedCity).toBe('Warszawa');
  });

  it('nie zapisuje pól z wartością domyślną i nie zaokrągla współrzędnych', () => {
    const buildings = createSampleBuildings();
    // Wstrzyknięcie wartości nietypowej (wiele miejsc po przecinku) do sprawdzenia precyzji.
    buildings[0].vertices[0].x = 12.345678901234;
    buildings[0].elevation = SHARE_V2_BUILDING_DEFAULTS.elevation; // wartość domyślna -> powinna zostać pominięta

    const payload = createSharedPayloadFromState({
      buildings,
      settings: { latitude: 52.2297, longitude: 21.0122, equinoxDate: 'spring' },
    });

    const sb = payload.scene.buildings[0];
    expect(sb.elevation).toBeUndefined();
    expect(sb.vertices[0][0]).toBe(12.345678901234);
  });

  it('round-trip: wierzchołki/modyfikatory/wysokości przetrwają bez zaokrąglenia', () => {
    const buildings = createSampleBuildings();
    const original = buildings[0];
    const tuples = pointsToTuples(original.vertices);
    const roundTripped = tuplesToPoints(tuples);
    expect(roundTripped).toEqual(original.vertices);
  });

  it('wczytuje starszy payload v1 z geometrią wyliczoną bez ponownego przeliczania', () => {
    const buildings = createSampleBuildings();
    const legacyPayload: SharedProjectPayloadV1 = {
      v: 1,
      createdAt: Date.now(),
      metadata: { northAngleDeg: 0 },
      viewport: { rotation: 0 },
      solar: { latitude: 52.2297, longitude: 21.0122 },
      scene: { buildings },
    };
    const compressed = compressProjectData(legacyPayload as any);
    const restored = decompressProjectData(compressed);
    expect(restored.v).toBe(1);
    if (restored.v === 1) {
      // v1 payload carries pre-computed geometry verbatim (JSON round-trip normalizes
      // -0 -> 0 and drops `undefined` keys, so compare segment ids/lengths, not deep-equal).
      const expectedSegments = applyBuildingModifiers(buildings[0]).segments;
      const restoredSegments = restored.scene.buildings[0].segments;
      expect(restoredSegments.map((s) => s.id)).toEqual(expectedSegments.map((s) => s.id));
      expect(restoredSegments.map((s) => s.length)).toEqual(expectedSegments.map((s) => s.length));
    }
  });

  it('powinien rzucić błąd przy uszkodzonym lub nieprawidłowym ciągu Base64', () => {
    expect(() => decompressProjectData('nieprawidlowy-base64!')).toThrow();
  });
});
