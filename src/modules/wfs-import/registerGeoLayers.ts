import { CadRenderPipeline } from '../../components/cad/pipeline/CadRenderPipeline';
import { TerrainShadingLayer } from './layers/TerrainShadingLayer';
import { EgibOverlayLayer } from './layers/EgibOverlayLayer';
import { WfsTreesLayer } from './layers/WfsTreesLayer';
import { WmsTileManager } from './renderers/wmsTileManager';
import { useWfsStore } from './store/useWfsStore';

const NMT_WMS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WMS/ShadedRelief';
const EGIB_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';

let registered = false;

const terrainLayer = new TerrainShadingLayer();
const egibLayer = new EgibOverlayLayer();
const treesLayer = new WfsTreesLayer();

const terrainTileManager = new WmsTileManager({
  baseUrl: NMT_WMS_URL,
  layers: 'Raster',
  format: 'image/png',
  crs: 'EPSG:3857',
});

const egibTileManager = new WmsTileManager({
  baseUrl: EGIB_WMS_URL,
  layers: 'dzialki,budynki',
  format: 'image/png',
  crs: 'EPSG:3857',
});

terrainLayer.setTileManager(terrainTileManager);
egibLayer.setTileManager(egibTileManager);

export function registerGeoLayers(): () => void {
  if (registered) return () => {};
  registered = true;

  const pipeline = CadRenderPipeline.getDefault();
  pipeline.registerMainLayer(terrainLayer);
  pipeline.registerMainLayer(egibLayer);
  pipeline.registerMainLayer(treesLayer);

  const unsubTerrain = useWfsStore.subscribe(
    (state) => state.showTerrainLayer,
    (show) => {
      if (show) {
        pipeline.registerMainLayer(terrainLayer);
      } else {
        pipeline.unregisterMainLayer('wfs_terrain_shading');
      }
    }
  );

  const unsubEgib = useWfsStore.subscribe(
    (state) => state.showEgibLayer,
    (show) => {
      if (show) {
        pipeline.registerMainLayer(egibLayer);
      } else {
        pipeline.unregisterMainLayer('wfs_egib_overlay');
      }
    }
  );

  const unsubTrees = useWfsStore.subscribe(
    (state, prev) => {
      treesLayer.setTrees(state.trees);
      treesLayer.setVisible(state.showTreesLayer);
      if (state.showTreesLayer && state.trees.length > 0) {
        pipeline.registerMainLayer(treesLayer);
      } else {
        pipeline.unregisterMainLayer('wfs_trees');
      }
    }
  );

  return () => {
    unsubTerrain();
    unsubEgib();
    unsubTrees();
    pipeline.unregisterMainLayer('wfs_terrain_shading');
    pipeline.unregisterMainLayer('wfs_egib_overlay');
    pipeline.unregisterMainLayer('wfs_trees');
    registered = false;
  };
}
