import { CadRenderFrameContext, CadRenderLayer } from './types';
import { PerfMonitor } from '../../../engine/perf/PerfMonitor';
import {
  SatelliteMapLayer,
  GridLayer,
  ShadowRangeLayer,
  ShadowingLayer,
  AnalysisBandsLayer,
  PlaygroundLayer,
  BuildingsLayer,
  SunlightLayer,
  DimensionsLayer,
  DrawingToolLayer,
  BuildingsDragPreviewLayer,
  RecorderVisualsLayer,
} from './layers';

export * from './types';
export * from './layers';

/**
 * CadRenderPipeline - Centralny orkiestrator potoku renderowania CAD.
 *
 * Zarządza uporządkowanym stosem warstw CadRenderLayer (posortowanym po zIndex),
 * izoluje stan kontekstu Canvas 2D (ctx.save / ctx.restore) oraz gwarantuje
 * odporność na błędy w poszczególnych warstwach.
 */
export class CadRenderPipeline {
  private mainLayers: CadRenderLayer[] = [];
  private overlayLayers: CadRenderLayer[] = [];

  constructor(customMainLayers?: CadRenderLayer[], customOverlayLayers?: CadRenderLayer[]) {
    if (customMainLayers !== undefined) {
      this.mainLayers = [...customMainLayers].sort((a, b) => a.zIndex - b.zIndex);
    } else {
      this.registerDefaultMainLayers();
    }

    if (customOverlayLayers !== undefined) {
      this.overlayLayers = [...customOverlayLayers].sort((a, b) => a.zIndex - b.zIndex);
    } else {
      this.registerDefaultOverlayLayers();
    }
  }

  private registerDefaultMainLayers(): void {
    this.mainLayers = [
      new SatelliteMapLayer(),     // zIndex: 0,  tier: background
      new GridLayer(),             // zIndex: 10, tier: background
      new ShadowRangeLayer(),      // zIndex: 20, tier: scene
      new ShadowingLayer(),        // zIndex: 30, tier: scene
      new AnalysisBandsLayer(),    // zIndex: 40, tier: scene
      new PlaygroundLayer(),       // zIndex: 50, tier: scene
      new BuildingsLayer(),        // zIndex: 60, tier: scene
      new SunlightLayer(),         // zIndex: 70, tier: scene
      new DimensionsLayer(),       // zIndex: 80, tier: scene
    ].sort((a, b) => a.zIndex - b.zIndex);
  }

  private registerDefaultOverlayLayers(): void {
    this.overlayLayers = [
      new DrawingToolLayer(),        // zIndex: 90,  tier: hud
      new BuildingsDragPreviewLayer(), // zIndex: 95,  tier: hud
      new RecorderVisualsLayer(),    // zIndex: 999, tier: hud (najwyżej, widoczna na nagraniu)
    ].sort((a, b) => a.zIndex - b.zIndex);
  }

  public registerMainLayer(layer: CadRenderLayer): void {
    this.mainLayers = [...this.mainLayers.filter((l) => l.id !== layer.id), layer].sort(
      (a, b) => a.zIndex - b.zIndex
    );
  }

  public unregisterMainLayer(layerId: string): void {
    this.mainLayers = this.mainLayers.filter((l) => l.id !== layerId);
  }

  public getMainLayers(): readonly CadRenderLayer[] {
    return this.mainLayers;
  }

  public registerOverlayLayer(layer: CadRenderLayer): void {
    this.overlayLayers = [...this.overlayLayers.filter((l) => l.id !== layer.id), layer].sort(
      (a, b) => a.zIndex - b.zIndex
    );
  }

  public unregisterOverlayLayer(layerId: string): void {
    this.overlayLayers = this.overlayLayers.filter((l) => l.id !== layerId);
  }

  public getOverlayLayers(): readonly CadRenderLayer[] {
    return this.overlayLayers;
  }

  /**
   * Stosuje sprzętową transformację afiniczną widoku do podanego kontekstu Canvas 2D
   */
  public static applyViewportTransform(ctx: CanvasRenderingContext2D, renderContext: CadRenderFrameContext['renderContext']): void {
    if (renderContext.viewportMatrix) {
      const m = renderContext.viewportMatrix;
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    }
  }

  private runLayers(
    layers: CadRenderLayer[],
    context: CadRenderFrameContext,
    ctx: CanvasRenderingContext2D,
    markPrefix: string
  ): void {
    for (const layer of layers) {
      if (layer.shouldRender(context)) {
        try {
          ctx.save();
          PerfMonitor.time(`${markPrefix}.${layer.id}`, () => layer.render(context));
        } catch (err) {
          console.error(`[CadRenderPipeline] Błąd podczas renderowania warstwy [${layer.id}]:`, err);
        } finally {
          ctx.restore();
        }
      }
    }
  }

  /**
   * Renderuje warstwę tła (kafle satelitarne/WMS, siatka CAD) — tier `background`.
   * Wołane tylko przy zmianie viewportu, załadowaniu kafla lub przełączeniu widoczności warstwy geo.
   */
  public renderBackground(context: CadRenderFrameContext, targetCtx?: CanvasRenderingContext2D): void {
    const start = performance.now();
    const { renderContext } = context;
    const ctx = targetCtx ?? renderContext.ctx;
    const { width, height } = renderContext;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    const backgroundLayers = this.mainLayers.filter((l) => l.tier === 'background');
    this.runLayers(backgroundLayers, context, ctx, 'render.layer');

    PerfMonitor.mark('render.background.total', performance.now() - start);
  }

  /**
   * Renderuje geometrię sceny (budynki, cienie, pasma analizy) — tier `scene`.
   * Wołane przy zmianie danych sceny (buildings/analysis/shadow), nie przy samym hover/drag.
   * Bufor docelowy (`targetCtx`) jest zwykle OffscreenCanvas (`SceneBuffer`) — patrz `SceneBuffer.ts`.
   */
  public renderScene(context: CadRenderFrameContext, targetCtx?: CanvasRenderingContext2D): void {
    const start = performance.now();
    const { renderContext } = context;
    const ctx = targetCtx ?? renderContext.ctx;
    const { width, height } = renderContext;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.restore();

    const sceneLayers = this.mainLayers.filter((l) => l.tier === 'scene');
    this.runLayers(sceneLayers, context, ctx, 'render.layer');

    PerfMonitor.mark('render.scene.total', performance.now() - start);
    PerfMonitor.flushIfDue();
  }

  /**
   * @deprecated Wrapper zgodności wstecznej łączący `renderBackground` + `renderScene` na
   * jednym canvasie (0..80). Używany przez `MasterplanRenderPipeline`, który nie jest jeszcze
   * podzielony na tiery (patrz CLAUDE.md / plan wdrożenia buforowania warstw).
   */
  public renderMain(context: CadRenderFrameContext): void {
    this.renderBackground(context);
    this.renderScene(context);
  }

  /**
   * Renderuje stos warstw nakładki interaktywnej CAD (90)
   */
  public renderOverlay(context: CadRenderFrameContext): void {
    const overlayStart = performance.now();
    const { renderContext } = context;
    const { ctx, width, height } = renderContext;

    // Czyszczenie kanwy nakładki
    ctx.clearRect(0, 0, width, height);

    for (const layer of this.overlayLayers) {
      if (layer.shouldRender(context)) {
        try {
          ctx.save();
          PerfMonitor.time(`render.overlayLayer.${layer.id}`, () => layer.render(context));
        } catch (err) {
          console.error(`[CadRenderPipeline] Błąd podczas renderowania nakładki [${layer.id}]:`, err);
        } finally {
          ctx.restore();
        }
      }
    }

    PerfMonitor.mark('render.overlay.total', performance.now() - overlayStart);
  }

  // --------------------------------------------------------------------------
  // Statyczna instancja domyślna
  // --------------------------------------------------------------------------
  private static defaultPipeline = new CadRenderPipeline();

  public static getDefault(): CadRenderPipeline {
    return CadRenderPipeline.defaultPipeline;
  }

  public static renderMain(context: CadRenderFrameContext): void {
    CadRenderPipeline.defaultPipeline.renderMain(context);
  }

  public static renderBackground(context: CadRenderFrameContext, targetCtx?: CanvasRenderingContext2D): void {
    CadRenderPipeline.defaultPipeline.renderBackground(context, targetCtx);
  }

  public static renderScene(context: CadRenderFrameContext, targetCtx?: CanvasRenderingContext2D): void {
    CadRenderPipeline.defaultPipeline.renderScene(context, targetCtx);
  }

  public static renderOverlay(context: CadRenderFrameContext): void {
    CadRenderPipeline.defaultPipeline.renderOverlay(context);
  }
}
