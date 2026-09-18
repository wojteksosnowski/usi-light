import { CadRenderFrameContext } from '../pipeline/types';
import { renderMasterplanGround } from './renderers/masterplanGroundRenderer';
import { renderMasterplanRoofs } from './renderers/masterplanRoofsRenderer';
import {
  ShadowRangeLayer,
  PlaygroundLayer,
  AnalysisBandsLayer,
  ShadowingLayer,
  SunlightLayer,
  DimensionsLayer,
} from '../pipeline/layers';

export interface MasterplanRenderOptions {
  hourFraction?: number;
}

/**
 * MasterplanRenderPipeline - Niezależny orkiestrator renderowania 2D „Masterplan White”.
 *
 * Realizuje potok graficzny typu rysunek tuszem na białym arkuszu z wielopoziomowym rzutowaniem cieni (ΔH),
 * miękką penumbrą (±1 min) oraz warstwami analizy nasłonecznienia i przesłaniania (§ 12 i § 56).
 */
export class MasterplanRenderPipeline {
  private static shadowRangeLayer = new ShadowRangeLayer();
  private static playgroundLayer = new PlaygroundLayer();
  private static analysisBandsLayer = new AnalysisBandsLayer();
  private static shadowingLayer = new ShadowingLayer();
  private static sunlightLayer = new SunlightLayer();
  private static dimensionsLayer = new DimensionsLayer();

  private static renderLayer(context: CadRenderFrameContext, layer: { shouldRender: (c: CadRenderFrameContext) => boolean; render: (c: CadRenderFrameContext) => void }): void {
    if (!layer.shouldRender(context)) return;
    context.renderContext.ctx.save();
    layer.render(context);
    context.renderContext.ctx.restore();
  }

  /**
   * Główna metoda renderująca widok Masterplan White.
   */
  public static render(context: CadRenderFrameContext, options: MasterplanRenderOptions = {}): void {
    const hourFraction = options.hourFraction ?? context.renderContext.masterplanHourFraction ?? 12.0;

    // 1. Renderowanie podkładu geodezyjnego i cieni gruntowych
    renderMasterplanGround(context, hourFraction);

    // 2. Warstwy analityczne na poziomie gruntu (zasięg cienia, place zabaw)
    this.renderLayer(context, this.shadowRangeLayer);
    this.renderLayer(context, this.playgroundLayer);

    // 3. Renderowanie dachów budynków, cieni wielopoziomowych ΔH, funkcji budynków i tuszu
    renderMasterplanRoofs(context, hourFraction);

    // 4. Warstwy analityczne nad dachami: pasma § 12/56, punkty przesłaniania § 12, linijka słońca § 56
    this.renderLayer(context, this.analysisBandsLayer);
    this.renderLayer(context, this.shadowingLayer);
    this.renderLayer(context, this.sunlightLayer);

    // 5. Wymiarowanie CAD (Dimensions)
    this.renderLayer(context, this.dimensionsLayer);
  }
}
