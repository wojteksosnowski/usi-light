import { CadRenderPipeline } from '../../components/cad/pipeline/CadRenderPipeline';
import { CadRenderLayer } from '../../components/cad/pipeline/types';
import { OrthophotoLayer } from './layers/OrthophotoLayer';
import { KiutOverlayLayer } from './layers/KiutOverlayLayer';
import { MpzpOverlayLayer } from './layers/MpzpOverlayLayer';
import { BdotOverlayLayer } from './layers/BdotOverlayLayer';
import { TerrainShadingLayer } from './layers/TerrainShadingLayer';
import { WfsTreesLayer } from './layers/WfsTreesLayer';
import { ParcelLoadingPreviewLayer } from './layers/ParcelLoadingPreviewLayer';
import { OvertureContextLayer } from './layers/OvertureContextLayer';
import { MpzpZonesVectorLayer } from './layers/MpzpZonesVectorLayer';
import { WmsTileManager } from './renderers/wmsTileManager';
import { useWfsStore } from './store/useWfsStore';

const ORTO_WMS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolutionTime';
const KIUT_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu';
const MPZP_WMS_URL = 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego';
const BDOT_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaBazDanychObiektowTopograficznych';
const NMT_WMS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WMS/ShadedRelief';

const triggerRender = () => {
  window.dispatchEvent(new Event('geo-render-needed'));
};

/** Rejestruje/wyrejestrowuje warstwę w pipeline gdy jej widoczność się zmienia. Zwraca true jeśli coś się zmieniło. */
function toggleMainLayer(
  pipeline: CadRenderPipeline,
  layer: CadRenderLayer,
  layerId: string,
  shouldShow: boolean,
  prevShouldShow: boolean
): boolean {
  if (shouldShow === prevShouldShow) return false;
  if (shouldShow) pipeline.registerMainLayer(layer);
  else pipeline.unregisterMainLayer(layerId);
  return true;
}

let registered = false;

const orthophotoLayer = new OrthophotoLayer();
const kiutLayer = new KiutOverlayLayer();
const mpzpLayer = new MpzpOverlayLayer();
const bdotLayer = new BdotOverlayLayer();
const terrainLayer = new TerrainShadingLayer();
const treesLayer = new WfsTreesLayer();
const parcelLoadingPreviewLayer = new ParcelLoadingPreviewLayer();
const overtureContextLayer = new OvertureContextLayer();
const mpzpZonesVectorLayer = new MpzpZonesVectorLayer();

const orthophotoTileManager = new WmsTileManager({
  baseUrl: ORTO_WMS_URL,
  layers: 'Image',
  format: 'image/jpeg',
  crs: 'EPSG:3857',
}, 200, triggerRender);

const kiutTileManager = new WmsTileManager({
  baseUrl: KIUT_WMS_URL,
  layers: 'gesut,przewod_wodociagowy,przewod_kanalizacyjny,przewod_gazowy,przewod_elektroenergetyczny,przewod_cieplowniczy,przewod_telekomunikacyjny,przewod_urzadzenia',
  format: 'image/png',
  crs: 'EPSG:3857',
}, 200, triggerRender);

const mpzpTileManager = new WmsTileManager({
  baseUrl: MPZP_WMS_URL,
  layers: 'plany,raster,wektor-str,wektor-pow,granice',
  format: 'image/png',
  crs: 'EPSG:3857',
}, 200, triggerRender);

const bdotTileManager = new WmsTileManager({
  baseUrl: BDOT_WMS_URL,
  layers: 'bdot',
  format: 'image/png',
  crs: 'EPSG:3857',
}, 200, triggerRender);

const terrainTileManager = new WmsTileManager({
  baseUrl: NMT_WMS_URL,
  layers: 'Raster',
  format: 'image/png',
  crs: 'EPSG:3857',
}, 200, triggerRender);

orthophotoLayer.setTileManager(orthophotoTileManager);
kiutLayer.setTileManager(kiutTileManager);
mpzpLayer.setTileManager(mpzpTileManager);
bdotLayer.setTileManager(bdotTileManager);
terrainLayer.setTileManager(terrainTileManager);

/**
 * Prefetchuje (i "przypina" w cache) kafle WMS w zasięgu projektu dla wszystkich aktualnie
 * włączonych warstw GEO (Ortofotomapa/KIUT/MPZP/BDOT/NMT). Wywoływane z `CadCanvas.tsx` przy
 * zmianie środka/promienia projektu lub włączeniu warstwy — patrz `tilePrefetchMath.ts`.
 */
export function prefetchActiveGeoLayersInRadius(lat: number, lon: number, radiusMeters: number) {
  const state = useWfsStore.getState();
  if (state.showOrthophotoLayer) orthophotoTileManager.prefetchTilesInRadius(lat, lon, radiusMeters);
  if (state.showKiutLayer) kiutTileManager.prefetchTilesInRadius(lat, lon, radiusMeters);
  if (state.showMpzpLayer) mpzpTileManager.prefetchTilesInRadius(lat, lon, radiusMeters);
  if (state.showBdotLayer) bdotTileManager.prefetchTilesInRadius(lat, lon, radiusMeters);
  if (state.showTerrainLayer) terrainTileManager.prefetchTilesInRadius(lat, lon, radiusMeters);
}

export function registerGeoLayers(): () => void {
  if (registered) return () => {};
  registered = true;

  const pipeline = CadRenderPipeline.getDefault();

  let prevShowOrtho = false;
  let prevShowKiut = false;
  let prevShowMpzp = false;
  let prevShowBdot = false;
  let prevShowTerrain = false;
  let prevShowTrees = false;
  let prevTreesLen = 0;
  let prevLoadingParcelsLen = 0;
  let prevShowOverture = false;
  let prevOvertureFeaturesLen = 0;
  let prevShowMpzpZones = false;
  let prevMpzpZonesLen = 0;

  const unsub = useWfsStore.subscribe((state) => {
    const {
      showOrthophotoLayer,
      orthophotoOpacity,
      showKiutLayer,
      kiutOpacity,
      showMpzpLayer,
      mpzpOpacity,
      showBdotLayer,
      bdotOpacity,
      showTerrainLayer,
      showTreesLayer,
      trees,
      loadingParcels,
      overtureGreenAreas,
      showOvertureGreenAreas,
      mpzpZones,
      showMpzpZonesLayer,
    } = state;

    let changed = false;

    // 1. Ortofotomapa
    orthophotoLayer.setOpacity(orthophotoOpacity);
    if (toggleMainLayer(pipeline, orthophotoLayer, 'wfs_orthophoto', showOrthophotoLayer, prevShowOrtho)) changed = true;
    prevShowOrtho = showOrthophotoLayer;

    // 2. Sieci GESUT (KIUT)
    kiutLayer.setOpacity(kiutOpacity);
    if (toggleMainLayer(pipeline, kiutLayer, 'wfs_kiut_overlay', showKiutLayer, prevShowKiut)) changed = true;
    prevShowKiut = showKiutLayer;

    // 3. MPZP
    mpzpLayer.setOpacity(mpzpOpacity);
    if (toggleMainLayer(pipeline, mpzpLayer, 'wfs_mpzp_overlay', showMpzpLayer, prevShowMpzp)) changed = true;
    prevShowMpzp = showMpzpLayer;

    // 4. BDOT10k
    bdotLayer.setOpacity(bdotOpacity);
    if (toggleMainLayer(pipeline, bdotLayer, 'wfs_bdot_overlay', showBdotLayer, prevShowBdot)) changed = true;
    prevShowBdot = showBdotLayer;

    // 5. Cieniowanie NMT
    if (toggleMainLayer(pipeline, terrainLayer, 'wfs_terrain_shading', showTerrainLayer, prevShowTerrain)) changed = true;
    prevShowTerrain = showTerrainLayer;

    // 7. Drzewa
    treesLayer.setTrees(trees);
    treesLayer.setVisible(showTreesLayer);
    const shouldShowTrees = showTreesLayer && trees.length > 0;
    if (shouldShowTrees !== prevShowTrees || trees.length !== prevTreesLen) {
      toggleMainLayer(pipeline, treesLayer, 'wfs_trees', shouldShowTrees, prevShowTrees);
      prevShowTrees = shouldShowTrees;
      prevTreesLen = trees.length;
      changed = true;
    }

    // 8. Podgląd wczytywanych działek (ULDK, batch po batchu)
    parcelLoadingPreviewLayer.setLoops(loadingParcels);
    if (loadingParcels.length !== prevLoadingParcelsLen) {
      const hasLoadingParcels = loadingParcels.length > 0;
      const hadLoadingParcels = prevLoadingParcelsLen > 0;
      toggleMainLayer(pipeline, parcelLoadingPreviewLayer, 'wfs_parcels_loading', hasLoadingParcels, hadLoadingParcels);
      prevLoadingParcelsLen = loadingParcels.length;
      changed = true;
    }

    // 9. Warstwa kontekstowa Overture Maps (zieleń)
    overtureContextLayer.setData({ greenAreas: overtureGreenAreas });
    overtureContextLayer.setVisibility({ showGreenAreas: showOvertureGreenAreas });
    const shouldShowOverture = showOvertureGreenAreas && overtureGreenAreas.length > 0;
    const overtureFeaturesLen = overtureGreenAreas.length;
    if (shouldShowOverture !== prevShowOverture || overtureFeaturesLen !== prevOvertureFeaturesLen) {
      toggleMainLayer(pipeline, overtureContextLayer, 'wfs_overture_context', shouldShowOverture, prevShowOverture);
      prevShowOverture = shouldShowOverture;
      prevOvertureFeaturesLen = overtureFeaturesLen;
      changed = true;
    }

    // 10. Strefy MPZP (wektor, pilot Warszawa)
    mpzpZonesVectorLayer.setData(mpzpZones);
    mpzpZonesVectorLayer.setVisibility(showMpzpZonesLayer);
    const shouldShowMpzpZones = showMpzpZonesLayer && mpzpZones.length > 0;
    if (shouldShowMpzpZones !== prevShowMpzpZones || mpzpZones.length !== prevMpzpZonesLen) {
      toggleMainLayer(pipeline, mpzpZonesVectorLayer, 'wfs_mpzp_zones_vector', shouldShowMpzpZones, prevShowMpzpZones);
      prevShowMpzpZones = shouldShowMpzpZones;
      prevMpzpZonesLen = mpzpZones.length;
      changed = true;
    }

    if (changed) triggerRender();
  });

  return () => {
    unsub();
    pipeline.unregisterMainLayer('wfs_orthophoto');
    pipeline.unregisterMainLayer('wfs_kiut_overlay');
    pipeline.unregisterMainLayer('wfs_mpzp_overlay');
    pipeline.unregisterMainLayer('wfs_bdot_overlay');
    pipeline.unregisterMainLayer('wfs_terrain_shading');
    pipeline.unregisterMainLayer('wfs_trees');
    pipeline.unregisterMainLayer('wfs_parcels_loading');
    pipeline.unregisterMainLayer('wfs_overture_context');
    pipeline.unregisterMainLayer('wfs_mpzp_zones_vector');
    registered = false;
  };
}
