import { createWfsProxyHandler } from './_lib/wfsProxy';

/**
 * Proxy dla wrocławskiego serwisu WFS MPZP (ArcGIS / GeoServer):
 * Upstream: http://gis1.um.wroc.pl/arcgis/services/ogc/OGC_mpzp/MapServer/WFSServer
 */
export default createWfsProxyHandler(
  'http://gis1.um.wroc.pl/arcgis/services/ogc/OGC_mpzp/MapServer/WFSServer',
  new Set([
    'OGC_mpzp:tereny',
    'OGC_mpzp:przeznaczenie_terenu_-_uproszczona_klasyfikacja',
    'OGC_mpzp:linie_zabudowy',
    'OGC_mpzp:linie_rozgraniczajace',
    'OGC_mpzp:obowiazujace_plany_miejscowe',
  ]),
  'TYPENAME'
);
