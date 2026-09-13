/**
 * Regresja (branch `geo`, 2026-09-13): po dodaniu flagi `silent` do kolejki prefetchu kafli
 * (żeby kafle dociągane w tle nie wywoływały przerysowania — patrz
 * `test/zoom_band_transition_profile.test.ts`), warstwy WMS (KIUT/BDOT/MPZP/Ortofotomapa)
 * przestały się w ogóle wyświetlać. Przyczyna: `silent` był trzymany PER-ELEMENT kolejki
 * (`prefetchQueue`), a `getTile()` "odciszał" kafel przez `prefetchQueue.find(...)`. To działa
 * tylko dopóki element wciąż siedzi w tablicy — `processQueue()` robi na nim `shift()` w
 * momencie startu pobierania (`activePrefetches++`, `loadTile(...)`), więc dla kafla już
 * "w locie" (dispatched, poza tablicą) `find()` nic nie znajdował, `silent` zostawał
 * zamrożony na `true`, `onTileLoaded()` nigdy się nie odpalał — a przerysowanie jest czysto
 * zdarzeniowe (`geo-render-needed`), więc cała warstwa zostawała pusta na zawsze, mimo że
 * kafle w rzeczywistości poprawnie wylądowały w cache.
 *
 * Naprawa: `silentKeys` to teraz `Set<string>` na poziomie managera, niezależny od pozycji w
 * kolejce — `getTile()` robi `silentKeys.delete(key)` bezwarunkowo, więc działa identycznie
 * dla kafla wciąż w kolejce i dla kafla już dispatched. Ten test odtwarza dokładnie ten
 * scenariusz wyścigu i weryfikuje, że `onTileLoaded` odpala się mimo "odciszenia" już PO
 * starcie pobierania.
 */
import { describe, it, expect, vi } from 'vitest';
import { WmsTileManager } from '../src/modules/wfs-import/renderers/wmsTileManager';
import { GoogleTileManager } from '../src/utils/googleTileManager';

class ControllableImage {
  public crossOrigin = '';
  public complete = false;
  public naturalWidth = 0;
  public naturalHeight = 0;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  private _src = '';
  static instances: ControllableImage[] = [];

  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    ControllableImage.instances.push(this);
    // Celowo NIE wywołujemy onload automatycznie — test steruje tym ręcznie, żeby
    // odtworzyć stan "w locie" (dispatched, ale jeszcze nie załadowany).
  }

  resolve() {
    this.complete = true;
    this.naturalWidth = 256;
    this.naturalHeight = 256;
    this.onload?.();
  }
}

(globalThis as any).Image = ControllableImage;

describe('Silent-prefetch un-silence race (dispatched-but-not-yet-loaded tile)', () => {
  it('WmsTileManager: still fires onTileLoaded when getTile() is called AFTER the tile was already dispatched by a silent prefetch', () => {
    ControllableImage.instances = [];
    const onTileLoaded = vi.fn();
    const wms = new WmsTileManager({ baseUrl: 'http://example.com', layers: 'test' }, 1200, onTileLoaded);

    // 1. Prefetch w tle kolejkuje i NATYCHMIAST dispatch'uje kafel (maxConcurrentPrefetches=4 > 0),
    //    więc `img` istnieje i jest "w locie" (poza prefetchQueue) zanim getTile() zostanie wywołane.
    wms.prefetchAllZoomsInRadius(52.2297, 21.0122, 1, 18, 18);
    expect(ControllableImage.instances.length).toBeGreaterThan(0);

    // Znajdź klucz odpowiadający pierwszemu dispatched image, żeby zażądać dokładnie tego kafla
    // przez interaktywną ścieżkę (symulacja: kafel stał się realnie widoczny na ekranie).
    const firstImg = ControllableImage.instances[0];
    const match = firstImg.src.match(/bbox=([^&]+)/);
    expect(match).not.toBeNull();

    // 2. Kafel jest teraz potrzebny na ekranie — getTile() powinien go "odciszyć" mimo że jest
    //    już w locie (dispatched), a nie w kolejce.
    //    Odtwarzamy to wprost: wywołujemy getTile() dla WSZYSTKICH kafli w promieniu (te same
    //    współrzędne co prefetch), więc trafiamy dokładnie w already-dispatched klucze.
    for (let tx = -1; tx <= 1; tx++) {
      for (let ty = -1; ty <= 1; ty++) {
        wms.getTile(131000 + tx, 87000 + ty, 18);
      }
    }

    // 3. Załaduj wszystkie dispatched obrazy (symulacja zakończenia sieciowego).
    expect(onTileLoaded).not.toHaveBeenCalled();
    for (const img of ControllableImage.instances) {
      img.resolve();
    }

    // Kluczowa asercja regresji: onTileLoaded MUSI się odpalić przynajmniej raz — inaczej
    // warstwa nigdy nie zostanie przerysowana mimo w pełni załadowanych kafli.
    expect(onTileLoaded).toHaveBeenCalled();
  });

  it('GoogleTileManager: same race — un-silencing an already-dispatched tile still triggers onTileLoaded', () => {
    ControllableImage.instances = [];
    const onTileLoaded = vi.fn();
    const google = new GoogleTileManager('test-key', onTileLoaded);

    google.prefetchAllZoomsInRadius(52.2297, 21.0122, 1, 18, 18);
    expect(ControllableImage.instances.length).toBeGreaterThan(0);

    // Wywołaj getTile() dla tych samych kafli, które prefetch już dispatched (te same z/x/y —
    // GoogleTileManager koduje je w URL jako x=/y=/z=).
    const firstUrl = ControllableImage.instances[0].src;
    const m = firstUrl.match(/x=(-?\d+)&y=(-?\d+)&z=(\d+)/);
    expect(m).not.toBeNull();
    const [, xs, ys, zs] = m!;
    google.getTile(Number(xs), Number(ys), Number(zs));

    expect(onTileLoaded).not.toHaveBeenCalled();
    for (const img of ControllableImage.instances) {
      img.resolve();
    }

    expect(onTileLoaded).toHaveBeenCalled();
  });
});
