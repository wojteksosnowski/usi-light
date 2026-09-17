import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

// Store'y zustand z middleware `persist` odczytują localStorage już w momencie tworzenia (import
// modułu), więc podstawka musi istnieć przed ewaluacją importów — stąd vi.hoisted.
vi.hoisted(() => {
  const storage: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = String(value);
    },
    removeItem: (key: string) => {
      delete storage[key];
    },
    clear: () => {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  };
});

import { prefetchAllGeoLayersWarmup } from '../src/modules/wfs-import/registerGeoLayers';
import { WmsTileManager } from '../src/modules/wfs-import/renderers/wmsTileManager';
import { useWfsStore } from '../src/modules/wfs-import/store/useWfsStore';
import { useLicenseStore } from '../src/store/useLicenseStore';
import { APP_CONFIG } from '../src/config/appConfig';

const WARSAW = { lat: 52.2297, lon: 21.0122, radius: 200 };
/** Wszystkie serwisy WMS aplikacji: Orto, KIUT, MPZP, BDOT, NMT. */
const WMS_SERVICE_COUNT = 5;

/** Czas, po którym ostatni z rozłożonych (stagger) startów warm-upu musi już wystartować. */
const ALL_STAGGERS_MS = WMS_SERVICE_COUNT * APP_CONFIG.geo.wmsWarmupStaggerMs;

describe('Warm-up bufora WMS dla wszystkich serwisów (start aplikacji)', () => {
  let warmupSpy: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    // Podsłuchujemy sam entry-point menedżera — bez tego test wysyłałby realne żądania sieciowe.
    warmupSpy = vi
      .spyOn(WmsTileManager.prototype, 'prefetchZoomBandInRadius')
      .mockImplementation(() => {});
    useLicenseStore.setState({ isPro: true });
  });

  afterEach(() => {
    warmupSpy.mockRestore();
    vi.useRealTimers();
  });

  it('pobiera pasmo Z16–Z18 dla WSZYSTKICH serwisów WMS, choć żadna warstwa nie jest włączona', () => {
    const state = useWfsStore.getState();
    // Warunek wejściowy: dokładnie ta sytuacja, którą warm-up ma obsłużyć — bufor pusty, warstwy wyłączone
    expect(state.showOrthophotoLayer).toBe(false);
    expect(state.showKiutLayer).toBe(false);
    expect(state.showMpzpLayer).toBe(false);
    expect(state.showBdotLayer).toBe(false);
    expect(state.showTerrainLayer).toBe(false);

    prefetchAllGeoLayersWarmup(WARSAW.lat, WARSAW.lon, WARSAW.radius);
    expect(warmupSpy).not.toHaveBeenCalled(); // nic nie startuje synchronicznie (stagger)

    vi.advanceTimersByTime(ALL_STAGGERS_MS);

    expect(warmupSpy).toHaveBeenCalledTimes(WMS_SERVICE_COUNT);
    for (const call of warmupSpy.mock.calls) {
      // Celowo jawne 16/18 zamiast odczytu z APP_CONFIG: Z18 to poziom roboczy widoku po
      // „Centruj" (exactZoom ≈ 18,1 dla promienia 200 m), więc test pilnuje produkcyjnego pasma,
      // a nie tylko spójności z konfiguracją.
      expect(call).toEqual([WARSAW.lat, WARSAW.lon, WARSAW.radius, 16, 18]);
    }
  });

  it('serwisy startują sekwencyjnie (stagger), a nie jednym zrywem sieciowym', () => {
    const stagger = APP_CONFIG.geo.wmsWarmupStaggerMs;
    prefetchAllGeoLayersWarmup(WARSAW.lat, WARSAW.lon, WARSAW.radius);

    // Pierwszy serwis ma opóźnienie 0 (index * stagger), więc startuje na pierwszym ticku zegara
    vi.advanceTimersByTime(1);
    expect(warmupSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(stagger);
    expect(warmupSpy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(stagger);
    expect(warmupSpy).toHaveBeenCalledTimes(3);
  });

  it('bez licencji PRO warm-up nie wystartuje (bramka licencji)', () => {
    useLicenseStore.setState({ isPro: false });

    prefetchAllGeoLayersWarmup(WARSAW.lat, WARSAW.lon, WARSAW.radius);
    vi.advanceTimersByTime(ALL_STAGGERS_MS);

    expect(warmupSpy).not.toHaveBeenCalled();
  });

  it('zwrócona funkcja anulująca wstrzymuje jeszcze niewystrzelone serwisy (zmiana środka projektu)', () => {
    const cancel = prefetchAllGeoLayersWarmup(WARSAW.lat, WARSAW.lon, WARSAW.radius);

    vi.advanceTimersByTime(1);
    expect(warmupSpy).toHaveBeenCalledTimes(1);

    cancel();
    vi.advanceTimersByTime(ALL_STAGGERS_MS);

    expect(warmupSpy).toHaveBeenCalledTimes(1);
  });
});
