export { useWfsStore } from './store/useWfsStore';
export type { WfsTreeFeature, WfsImportStatus, WfsImportOptions, ProjectRadius } from './store/useWfsStore';

export { geocodeAddress, geocodeAddressDebounced, latLonToBbox } from './services/shared/geocoding';
export type { GeocodingResult } from './services/shared/geocoding';

export {
  fetchParcelByEpsg2180,
  fetchParcelsInRadius,
  parseWktToPolygonParts,
} from './services/national/uldkClient';
export type { UldkParcelRaw, UldkParcelResult, PolygonPart, Ring } from './services/national/uldkClient';

export {
  fetchWarsawBuildings,
  fetchWarsawParcels,
  fetchWarsawTrees,
} from './services/city/wfsWarsawClient';
export type { WfsBbox, RawTreeFeature } from './services/city/wfsWarsawClient';

export {
  importBuildingsFromGeoJson,
  importParcelsFromGeoJson,
  importTrees,
} from './services/shared/geoJsonImporter';
export type { ImportResult } from './services/shared/geoJsonImporter';

export { registerGeoLayers } from './registerGeoLayers';
export { useGeoTileWarmup } from './hooks/useGeoTileWarmup';
