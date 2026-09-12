import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderOvertureContext } from '../renderers/overtureContextRenderer';
import { OverturePolygonFeature } from '../store/useWfsStore';

/**
 * Warstwa kontekstowa Overture Maps: zieleń (land_use/land_cover z tematu `base`).
 * Drogi/koleje/wody świadomie nieobsłużone — `api.overturemapsapi.com` nie zwraca dla nich
 * geometrii poza miastami demo / w ogóle nie eksponuje wód, a surowe partycje Overture przez
 * DuckDB-WASM (`overtureDuckDb.ts`) w praktyce zacinały aplikację (silnik jednowątkowy,
 * dziesiątki plików Parquet skanowane sekwencyjnie) — patrz komentarz w ProjectGroup.tsx.
 */
export class OvertureContextLayer implements CadRenderLayer {
  readonly id = 'wfs_overture_context';
  readonly zIndex = 3;

  private greenAreas: OverturePolygonFeature[] = [];
  private showGreenAreas = false;

  setData(data: { greenAreas: OverturePolygonFeature[] }) {
    this.greenAreas = data.greenAreas;
  }

  setVisibility(v: { showGreenAreas: boolean }) {
    this.showGreenAreas = v.showGreenAreas;
  }

  shouldRender(_context: CadRenderFrameContext): boolean {
    return this.showGreenAreas && this.greenAreas.length > 0;
  }

  render(context: CadRenderFrameContext): void {
    renderOvertureContext({
      rc: context.renderContext,
      greenAreas: this.greenAreas,
      showGreenAreas: this.showGreenAreas,
    });
  }
}
