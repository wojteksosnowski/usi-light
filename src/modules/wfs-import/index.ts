export { useWfsStore } from './store/useWfsStore';
export type { WfsTreeFeature, WfsImportStatus, WfsImportOptions, ProjectRadius } from './store/useWfsStore';

export { geocodeAddress, geocodeAddressDebounced, latLonToBbox } from './services/geocoding';
export type { GeocodingResult } from './services/geocoding';

export {
  fetchParcelByEpsg2180,
  fetchParcelsInRadius,
  parseWktToPolygonParts,
} from './services/uldkClient';
export type { UldkParcelRaw, UldkParcelResult, PolygonPart, Ring } from './services/uldkClient';

export {
  fetchWarsawBuildings,
  fetchWarsawParcels,
  fetchWarsawTrees,
} from './services/wfsWarsawClient';
export type { WfsBbox, RawTreeFeature } from './services/wfsWarsawClient';

export {
  fetchDsmBbox,
  fetchDtmBbox,
  parseAaigrid,
} from './services/wcsGugikClient';
export type { AaigridData } from './services/wcsGugikClient';

export {
  analyzeBuildingHeights,
} from './utils/terrainAnalyzer';
export type { TerrainAnalysisResult } from './utils/terrainAnalyzer';

export {
  importBuildingsFromGeoJson,
  importParcelsFromGeoJson,
  importTrees,
} from './services/geoJsonImporter';
export type { ImportResult } from './services/geoJsonImporter';

export { registerGeoLayers } from './registerGeoLayers';
