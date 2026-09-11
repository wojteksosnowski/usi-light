import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderWfsTrees } from '../renderers/wfsTreesRenderer';
import { WfsTreeFeature } from '../store/useWfsStore';

export class WfsTreesLayer implements CadRenderLayer {
  readonly id = 'wfs_trees';
  readonly zIndex = 5;

  private trees: WfsTreeFeature[] = [];
  private visible = false;

  setTrees(trees: WfsTreeFeature[]) {
    this.trees = trees;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
  }

  shouldRender(_context: CadRenderFrameContext): boolean {
    return this.visible && this.trees.length > 0;
  }

  render(context: CadRenderFrameContext): void {
    renderWfsTrees({
      rc: context.renderContext,
      trees: this.trees,
    });
  }
}
