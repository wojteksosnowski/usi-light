/**
 * Diagnostyka regresji zgłoszonej przez użytkownika (branch `geo`, 2026-09-13): dramatyczny
 * spadek FPS przy powiększeniu ~18.01, ustępujący przy ~18.81, powracający przy ~19.02,
 * ustępujący przy ~19.52, powracający przy ~20.02 — WYŁĄCZNIE z włączonym satelitą Google
 * (bez nakładek WMS). Użytkownik potwierdził, że przed dodaniem buforowania/cache do
 * `GoogleTileManager` na tej gałęzi (patrz `git diff main -- src/utils/googleTileManager.ts`)
 * ten sam widok działał płynnie, i że opublikowana gałąź `main` (bez tego buforowania) nadal
 * działa płynnie na produkcji. To zawęża podejrzenie do kodu dodanego w tym commicie:
 * `TileZoomHysteresis`, `ProtectedLruCache`, `prefetchAllZoomsInRadius`/`processQueue`.
 *
 * Ten test NIE zmienia kodu produkcyjnego — mierzy rzeczywisty czas (performance.now()) pracy
 * synchronicznej wykonywanej w:
 *   (a) pętli renderu przy każdej klatce: `resolveTargetZoom()` (TileZoomHysteresis) — wołane
 *       przez `satelliteMapRenderer.ts` na KAŻDĄ klatkę, nie debounced,
 *   (b) debounced efekcie (400ms po ustaniu ruchu, patrz `CadCanvas.tsx:251-263`):
 *       `prefetchAllZoomsInRadius()` — oblicza zakresy kafli dla do 4 poziomów zoom i ustawia
 *       chronione klucze w `ProtectedLruCache`.
 *
 * Zgodnie z zasadą "measure before fixing" (patrz pamięć `feedback_measure_before_fixing`):
 * jeśli poniższe pomiary NIE pokażą wyraźnego skoku kosztu w pobliżu zgłoszonych wartości
 * zoomu, nie należy z tego wnioskować fixu — trzeba wrócić do profilowania w Chrome DevTools
 * (patrz checklist w `zoom_step_smoothness_profile.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import { GoogleTileManager } from '../src/utils/googleTileManager';
import { TileZoomHysteresis } from '../src/utils/tileGridProjection';

class MockImage {
  public crossOrigin = '';
  public complete = true;
  public naturalWidth = 256;
  public naturalHeight = 256;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  private _src = '';
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
}

if (typeof globalThis.Image === 'undefined') {
  (globalThis as any).Image = MockImage;
}

const WARSAW_LAT = 52.2297;
const WARSAW_LON = 21.0122;

/** Wartości zoomu dokładnie zgłoszone przez użytkownika w opisie regresji. */
const REPORTED_ZOOMS = [18.01, 18.81, 19.02, 19.52, 20.02];

describe('Zoom-band transition profile (satellite-only, real-world repro numbers)', () => {
  it('logs per-frame resolveTargetZoom() cost and transition points across a slow continuous zoom-in sweep', () => {
    const google = new GoogleTileManager('test-key');
    const transitions: { exactZoom: number; from: number; to: number }[] = [];
    let lastResolved: number | null = null;
    let maxFrameMs = 0;
    let totalFrameMs = 0;
    let frames = 0;

    for (let z = 1750; z <= 2050; z++) {
      const exactZoom = z / 100;
      const t0 = performance.now();
      const resolved = google.resolveTargetZoom(exactZoom, 2);
      const frameMs = performance.now() - t0;
      frames++;
      totalFrameMs += frameMs;
      maxFrameMs = Math.max(maxFrameMs, frameMs);

      if (lastResolved !== null && resolved !== lastResolved) {
        transitions.push({ exactZoom, from: lastResolved, to: resolved });
      }
      lastResolved = resolved;
    }

    console.log('[ZOOM BAND PROFILE] per-frame resolveTargetZoom() transitions (17.50 -> 20.50, step 0.01):');
    for (const t of transitions) {
      console.log(`  exactZoom=${t.exactZoom.toFixed(2)}  ${t.from} -> ${t.to}`);
    }
    console.log(`[ZOOM BAND PROFILE] frames=${frames} avgFrameMs=${(totalFrameMs / frames).toFixed(4)} maxFrameMs=${maxFrameMs.toFixed(4)}`);
    console.log(`[ZOOM BAND PROFILE] reported lag zoom values from user: ${REPORTED_ZOOMS.join(', ')}`);

    // Sam koszt resolveTargetZoom per klatka musi być znikomy (to zwykła arytmetyka) — jeśli
    // nie jest, to jest samodzielny dowód regresji w tym miejscu.
    expect(maxFrameMs).toBeLessThan(1);

    // Nie zakładamy z góry, że tranzycje pokrywają się z liczbami użytkownika — to jest dokładnie
    // pytanie badawcze tego testu. Zostawiamy asercję tylko na to, że tranzycji jest rozsądnie
    // mało (hysteresis działa), żeby wychwycić regresję typu "flip co klatkę".
    expect(transitions.length).toBeLessThan(10);
  });

  it('measures synchronous cost of the debounced prefetchAllZoomsInRadius() at each reported lag zoom (default 200m project radius)', async () => {
    const results: { exactZoom: number; ms: number; protectedKeys: number; queueLength: number }[] = [];

    for (const exactZoom of REPORTED_ZOOMS) {
      const google = new GoogleTileManager('test-key');
      const t0 = performance.now();
      google.prefetchAllZoomsInRadius(WARSAW_LAT, WARSAW_LON, 200, 14, exactZoom);
      const ms = performance.now() - t0;
      const protectedKeys = (google as any).cache?.protectedSize ?? -1;
      const queueLength = (google as any).prefetchQueue?.length ?? -1;
      results.push({ exactZoom, ms, protectedKeys, queueLength });
      // Odczekaj mikrozadania, by nie mieszać kolejek między iteracjami (każda ma świeży manager,
      // ale mock Image kolejkuje onload jako mikrozadanie).
      await Promise.resolve();
    }

    console.log('[ZOOM BAND PROFILE] prefetchAllZoomsInRadius() synchronous cost at reported lag zoom values (r=200m):');
    for (const r of results) {
      console.log(`  exactZoom=${r.exactZoom}  ms=${r.ms.toFixed(3)}  protectedKeys=${r.protectedKeys}  queued=${r.queueLength}`);
    }

    // Budżet: to jest pojedyncze wywołanie z jednego debounced efektu (nie w pętli renderu), ale
    // wciąż odpala się na głównym wątku. Kilka-kilkanaście ms byłoby niezauważalne; dziesiątki+ ms
    // dla pojedynczego promienia 200m byłyby dowodem realnego blokowania wątku.
    for (const r of results) {
      expect(r.ms).toBeLessThan(20);
    }
  });

  it('measures cost when ALL active geo layers (satellite + up to 5 WMS overlays) fire prefetch back-to-back on the same debounce tick', async () => {
    // Odtwarza CadCanvas.tsx:251-263 + registerGeoLayers.ts:106-114: po 400ms ciszy WSZYSTKIE
    // aktywne warstwy odpalają prefetch dla tego samego (lat, lon, promień, zoom) w tej samej
    // klatce zdarzeń (ten sam `setTimeout` callback), jedna po drugiej, synchronicznie.
    const managers = Array.from({ length: 6 }, () => new GoogleTileManager('test-key'));

    for (const exactZoom of REPORTED_ZOOMS) {
      const t0 = performance.now();
      for (const m of managers) {
        m.prefetchAllZoomsInRadius(WARSAW_LAT, WARSAW_LON, 200, 14, exactZoom);
      }
      const ms = performance.now() - t0;
      console.log(`[ZOOM BAND PROFILE] combined 6-manager prefetch burst at exactZoom=${exactZoom}: ${ms.toFixed(3)} ms`);
      expect(ms).toBeLessThan(60);
    }
  });

  it('checks whether prefetchQueue grows unbounded across repeated zoom-pause events (queue never cleared between calls)', async () => {
    // Symuluje użytkownika zatrzymującego się co ~0.2 zoomu podczas powolnego zoomowania —
    // każdy przystanek odpala debounced prefetch zanim poprzednia kolejka zdążyła się w pełni
    // przetworzyć (limit współbieżności = 6).
    const google = new GoogleTileManager('test-key');
    const queueSizes: number[] = [];

    for (let z = 1750; z <= 2050; z += 20) {
      const exactZoom = z / 100;
      google.prefetchAllZoomsInRadius(WARSAW_LAT, WARSAW_LON, 200, 14, exactZoom);
      queueSizes.push((google as any).prefetchQueue.length);
      // Nie czekamy pełnych rund mikrozadań — symulujemy szybkie kolejne przystanki.
      await Promise.resolve();
    }

    console.log(`[ZOOM BAND PROFILE] prefetchQueue.length after each of ${queueSizes.length} rapid zoom-pause events: ${queueSizes.join(', ')}`);
    console.log(`[ZOOM BAND PROFILE] final queue length: ${queueSizes[queueSizes.length - 1]}, max: ${Math.max(...queueSizes)}`);
  });
});
