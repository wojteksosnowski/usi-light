/**
 * Bufor sceny CAD (budynki/cienie/pasma analizy) — rysowany raz na aktualizację danych sceny,
 * a nie na każdą klatkę interakcji, i kopiowany na canvas prezentacji przez `drawImage`.
 *
 * Preferuje `OffscreenCanvas` (feature-detect), z fallbackiem do niedołączonego do DOM
 * `HTMLCanvasElement` na przeglądarkach bez wsparcia — `drawImage` przyjmuje oba typy
 * identycznie jako źródło, więc fallback nie wymaga specjalnej obsługi przy kompozycji.
 * Wzorzec analogiczny do istniejącego użycia OffscreenCanvas w `wmsTileManager.ts`
 * (pre-inwersja pojedynczych kafli WMS).
 */
export class SceneBuffer {
  private static readonly supportsOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

  private buffer: OffscreenCanvas | HTMLCanvasElement;
  private bufferCtx: CanvasRenderingContext2D;
  private currentWidth = 0;
  private currentHeight = 0;

  constructor() {
    this.buffer = SceneBuffer.supportsOffscreenCanvas
      ? new OffscreenCanvas(1, 1)
      : document.createElement('canvas');
    const ctx = this.buffer.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) {
      throw new Error('[SceneBuffer] Nie udało się utworzyć kontekstu 2D bufora sceny');
    }
    this.bufferCtx = ctx;
  }

  /** Źródło do `ctx.drawImage(source, 0, 0)` na canvasie prezentacji. */
  get source(): CanvasImageSource {
    return this.buffer as unknown as CanvasImageSource;
  }

  get ctx(): CanvasRenderingContext2D {
    return this.bufferCtx;
  }

  /**
   * Zmienia rozmiar bufora, jeśli faktycznie się zmienił. Ustawienie `.width`/`.height`
   * czyści zawartość canvasa (natywna semantyka), więc zwraca `true` gdy nastąpił resize
   * i wymagany jest pełny redraw sceny.
   */
  resize(width: number, height: number): boolean {
    if (width === this.currentWidth && height === this.currentHeight) {
      return false;
    }
    this.currentWidth = width;
    this.currentHeight = height;
    this.buffer.width = width;
    this.buffer.height = height;
    return true;
  }
}
