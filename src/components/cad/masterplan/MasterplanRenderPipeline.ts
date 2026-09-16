import { CadRenderFrameContext } from '../pipeline/types';
import { renderMasterplanGround } from './renderers/masterplanGroundRenderer';
import { renderMasterplanRoofs } from './renderers/masterplanRoofsRenderer';

export interface MasterplanRenderOptions {
  hourFraction?: number;
}

/**
 * MasterplanRenderPipeline - Niezależny orkiestrator renderowania 2D „Masterplan White”.
 *
 * Realizuje potok graficzny typu rysunek tuszem na białym arkuszu z wielopoziomowym rzutowaniem cieni (ΔH)
 * oraz miękką penumbrą (±1 min).
 */
export class MasterplanRenderPipeline {
  /**
   * Główna metoda renderująca widok Masterplan White.
   */
  public static render(context: CadRenderFrameContext, options: MasterplanRenderOptions = {}): void {
    const hourFraction = options.hourFraction ?? context.renderContext.masterplanHourFraction ?? 12.0;

    // 1. Renderowanie podkładu geodezyjnego i cieni gruntowych
    renderMasterplanGround(context, hourFraction);

    // 2. Renderowanie dachów budynków, cieni wielopoziomowych ΔH i czarnego tuszu
    renderMasterplanRoofs(context, hourFraction);
  }
}
