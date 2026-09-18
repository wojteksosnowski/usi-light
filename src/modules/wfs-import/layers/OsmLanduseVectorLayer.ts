import { CadRenderLayer, CadRenderFrameContext } from '../../../components/cad/pipeline/types';
import { renderOsmLanduse } from '../renderers/osmLanduseRenderer';
import { OsmLanduseFeature, OsmLanduseLayerConfig } from '../store/useOsmLanduseStore';

/**
 * Warstwa wektorowa zagospodarowania terenu OSM (Landuse).
 * Pozycjonowana w potoku CadRenderPipeline (zIndex: 4) pod budynkami i obrysami CAD.
 */
export class OsmLanduseVectorLayer implements CadRenderLayer {
  readonly id = 'wfs_osm_landuse_vector';
  readonly zIndex = 4;

  private features: OsmLanduseFeature[] = [];
  private layers: OsmLanduseLayerConfig[] = [];
  private showGroup = true;

  setData(features: OsmLanduseFeature[], layers: OsmLanduseLayerConfig[]) {
    this.features = features;
    this.layers = layers;
  }

  setVisibility(showGroup: boolean) {
    this.showGroup = showGroup;
  }

  shouldRender(_context: CadRenderFrameContext): boolean {
    return this.showGroup && this.features.length > 0;
  }

  render(context: CadRenderFrameContext): void {
    renderOsmLanduse({
      rc: context.renderContext,
      features: this.features,
      layers: this.layers,
      showGroup: this.showGroup,
      projectRadius: context.projectRadius,
    });
  }
}
