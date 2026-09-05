import { CadRenderFrameContext, CadRenderLayer } from './types';
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
      new SatelliteMapLayer(),     // zIndex: 0
      new GridLayer(),             // zIndex: 10
      new ShadowRangeLayer(),      // zIndex: 20
      new ShadowingLayer(),        // zIndex: 30
      new AnalysisBandsLayer(),    // zIndex: 40
      new PlaygroundLayer(),       // zIndex: 50
      new BuildingsLayer(),        // zIndex: 60
      new SunlightLayer(),         // zIndex: 70
      new DimensionsLayer(),       // zIndex: 80
    ].sort((a, b) => a.zIndex - b.zIndex);
  }

  private registerDefaultOverlayLayers(): void {
    this.overlayLayers = [
      new DrawingToolLayer(),      // zIndex: 90
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
   * Renderuje główny stos warstw sceny CAD (0..80)
   */
  public renderMain(context: CadRenderFrameContext): void {
    const { renderContext } = context;
    const { ctx } = renderContext;

    for (const layer of this.mainLayers) {
      if (layer.shouldRender(context)) {
        try {
          ctx.save();
          layer.render(context);
        } catch (err) {
          console.error(`[CadRenderPipeline] Błąd podczas renderowania warstwy [${layer.id}]:`, err);
        } finally {
          ctx.restore();
        }
      }
    }
  }

  /**
   * Renderuje stos warstw nakładki interaktywnej CAD (90)
   */
  public renderOverlay(context: CadRenderFrameContext): void {
    const { renderContext } = context;
    const { ctx, width, height } = renderContext;

    // Czyszczenie kanwy nakładki
    ctx.clearRect(0, 0, width, height);

    for (const layer of this.overlayLayers) {
      if (layer.shouldRender(context)) {
        try {
          ctx.save();
          layer.render(context);
        } catch (err) {
          console.error(`[CadRenderPipeline] Błąd podczas renderowania nakładki [${layer.id}]:`, err);
        } finally {
          ctx.restore();
        }
      }
    }
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

  public static renderOverlay(context: CadRenderFrameContext): void {
    CadRenderPipeline.defaultPipeline.renderOverlay(context);
  }
}
