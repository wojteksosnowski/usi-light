import { CadRenderPipeline } from '../../components/cad/pipeline/CadRenderPipeline';
import { OrthophotoLayer } from './layers/OrthophotoLayer';
import { KiutOverlayLayer } from './layers/KiutOverlayLayer';
import { MpzpOverlayLayer } from './layers/MpzpOverlayLayer';
import { TerrainShadingLayer } from './layers/TerrainShadingLayer';
import { EgibOverlayLayer } from './layers/EgibOverlayLayer';
import { WfsTreesLayer } from './layers/WfsTreesLayer';
import { WmsTileManager } from './renderers/wmsTileManager';
import { useWfsStore } from './store/useWfsStore';

const ORTO_WMS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolutionTime';
const KIUT_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu';
const MPZP_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego';
const NMT_WMS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WMS/ShadedRelief';
const EGIB_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';

const triggerRender = () => {
  window.dispatchEvent(new Event('geo-render-needed'));
};

let registered = false;

const orthophotoLayer = new OrthophotoLayer();
const kiutLayer = new KiutOverlayLayer();
const mpzpLayer = new MpzpOverlayLayer();
const terrainLayer = new TerrainShadingLayer();
const egibLayer = new EgibOverlayLayer();
const treesLayer = new WfsTreesLayer();

const orthophotoTileManager = new WmsTileManager({
  baseUrl: ORTO_WMS_URL,
  layers: 'Raster',
  format: 'image/jpeg',
  crs: 'EPSG:3857',
}, 200, triggerRender);

const kiutTileManager = new WmsTileManager({
  baseUrl: KIUT_WMS_URL,
  layers: 'przewod_wodociagowy,przewod_kanalizacyjny,przewod_gazowy,przewod_elektroenergetyczny,przewod_telekomunikacyjny,urzadzenie_techniczne,slup,studnia',
  format: 'image/png',
  crs: 'EPSG:3857',
}, 200, triggerRender);

const mpzpTileManager = new WmsTileManager({
  baseUrl: MPZP_WMS_URL,
  layers: 'granice,przeznaczenie',
  format: 'image/png',
  crs: 'EPSG:3857',
}, 200, triggerRender);

const terrainTileManager = new WmsTileManager({
  baseUrl: NMT_WMS_URL,
  layers: 'Raster',
  format: 'image/png',
  crs: 'EPSG:3857',
}, 200, triggerRender);

const egibTileManager = new WmsTileManager({
  baseUrl: EGIB_WMS_URL,
  layers: 'dzialki,budynki',
  format: 'image/png',
  crs: 'EPSG:3857',
}, 200, triggerRender);

orthophotoLayer.setTileManager(orthophotoTileManager);
kiutLayer.setTileManager(kiutTileManager);
mpzpLayer.setTileManager(mpzpTileManager);
terrainLayer.setTileManager(terrainTileManager);
egibLayer.setTileManager(egibTileManager);

export function registerGeoLayers(): () => void {
  if (registered) return () => {};
  registered = true;

  const pipeline = CadRenderPipeline.getDefault();

  let prevShowOrtho = false;
  let prevShowKiut = false;
  let prevShowMpzp = false;
  let prevShowTerrain = false;
  let prevShowEgib = false;
  let prevShowTrees = false;
  let prevTreesLen = 0;

  const unsub = useWfsStore.subscribe((state) => {
    const {
      showOrthophotoLayer,
      orthophotoOpacity,
      showKiutLayer,
      kiutOpacity,
      showMpzpLayer,
      mpzpOpacity,
      showTerrainLayer,
      showEgibLayer,
      showTreesLayer,
      trees,
    } = state;

    let changed = false;

    // 1. Ortofotomapa
    orthophotoLayer.setOpacity(orthophotoOpacity);
    if (showOrthophotoLayer !== prevShowOrtho) {
      if (showOrthophotoLayer) pipeline.registerMainLayer(orthophotoLayer);
      else pipeline.unregisterMainLayer('wfs_orthophoto');
      prevShowOrtho = showOrthophotoLayer;
      changed = true;
    }

    // 2. Sieci GESUT (KIUT)
    kiutLayer.setOpacity(kiutOpacity);
    if (showKiutLayer !== prevShowKiut) {
      if (showKiutLayer) pipeline.registerMainLayer(kiutLayer);
      else pipeline.unregisterMainLayer('wfs_kiut_overlay');
      prevShowKiut = showKiutLayer;
      changed = true;
    }

    // 3. MPZP
    mpzpLayer.setOpacity(mpzpOpacity);
    if (showMpzpLayer !== prevShowMpzp) {
      if (showMpzpLayer) pipeline.registerMainLayer(mpzpLayer);
      else pipeline.unregisterMainLayer('wfs_mpzp_overlay');
      prevShowMpzp = showMpzpLayer;
      changed = true;
    }

    // 4. Cieniowanie NMT
    if (showTerrainLayer !== prevShowTerrain) {
      if (showTerrainLayer) pipeline.registerMainLayer(terrainLayer);
      else pipeline.unregisterMainLayer('wfs_terrain_shading');
      prevShowTerrain = showTerrainLayer;
      changed = true;
    }

    // 5. EGiB
    if (showEgibLayer !== prevShowEgib) {
      if (showEgibLayer) pipeline.registerMainLayer(egibLayer);
      else pipeline.unregisterMainLayer('wfs_egib_overlay');
      prevShowEgib = showEgibLayer;
      changed = true;
    }

    // 6. Drzewa
    treesLayer.setTrees(trees);
    treesLayer.setVisible(showTreesLayer);
    const shouldShowTrees = showTreesLayer && trees.length > 0;
    if (shouldShowTrees !== prevShowTrees || trees.length !== prevTreesLen) {
      if (shouldShowTrees) pipeline.registerMainLayer(treesLayer);
      else pipeline.unregisterMainLayer('wfs_trees');
      prevShowTrees = shouldShowTrees;
      prevTreesLen = trees.length;
      changed = true;
    }

    if (changed) triggerRender();
  });

  return () => {
    unsub();
    pipeline.unregisterMainLayer('wfs_orthophoto');
    pipeline.unregisterMainLayer('wfs_kiut_overlay');
    pipeline.unregisterMainLayer('wfs_mpzp_overlay');
    pipeline.unregisterMainLayer('wfs_terrain_shading');
    pipeline.unregisterMainLayer('wfs_egib_overlay');
    pipeline.unregisterMainLayer('wfs_trees');
    registered = false;
  };
}
