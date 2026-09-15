import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderParcelLoadingPreview } from '../renderers/parcelLoadingPreviewRenderer';
import { BuildingLoop } from '../../../types/geometry';

export class ParcelLoadingPreviewLayer implements CadRenderLayer {
  readonly id = 'wfs_parcels_loading';
  readonly zIndex = 5;

  private loops: BuildingLoop[] = [];

  setLoops(loops: BuildingLoop[]) {
    this.loops = loops;
  }

  shouldRender(_context: CadRenderFrameContext): boolean {
    return this.loops.length > 0;
  }

  render(context: CadRenderFrameContext): void {
    renderParcelLoadingPreview({
      rc: context.renderContext,
      loops: this.loops,
    });
  }
}
