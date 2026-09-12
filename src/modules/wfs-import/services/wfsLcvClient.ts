/**
 * Klient ogólnopolskiej usługi WFS GUGiK "pokrycie terenu" (INSPIRE Land Cover, wfsLCV,
 * typ obiektu `lcv:LandCoverUnit`, źródło BDOT10k). Geometrie bywają gęste i mają realne
 * otwory wewnętrzne (enklawy/wyspy) — parsowane przez `parseWfsPolygonGmlWithHoles`.
 *
 * WFS 2.0.0 na tym serwisie bywa zawodny (timeouty) przy większych bbox z powodu złożoności
 * geometrii — używamy WFS 1.1.0 (`gml:featureMember`), tak jak `wfsKrakowClient.ts`.
 * Serwer nie wysyła nagłówków CORS (ten sam host co krajowy EGiB) i nie wspiera
 * `outputFormat=application/json` z pełnymi atrybutami — zapytanie idzie przez proxy
 * `/api/lcv-wfs` (patrz `api/lcv-wfs.ts`), odpowiedź to GML parsowany ręcznie.
 */

import { GeoJsonFeatureCollection, WfsBbox } from './wfsWarsawClient';
import { parseWfsPolygonGmlWithHoles } from './wfsGmlUtils';

const LCV_WFS_URL = '/api/lcv-wfs';

/** Limit cech na żądanie — geometrie pokrycia terenu bywają bardzo złożone (obserwowano >3000 wierzchołków/obiekt). */
const MAX_FEATURES = 500;

/**
 * Bbox WGS84 [west, south, east, north] -> parametr BBOX w kolejności lat,lon.
 * Zweryfikowane empirycznie na tym serwisie: mimo że to WFS 1.1.0 (gdzie Kraków np. używa
 * zwyczajowej kolejności easting,northing bez referencji URN), referencja
 * `urn:ogc:def:crs:EPSG::4326` w parametrze BBOX wymusza tu OFICJALNĄ kolejność osi EPSG
 * (lat,lon) — tak samo jak w krajowym EGiB (`wfsEgibClient.ts`). Kolejność lon,lat zwraca
 * `numberOfFeatures="0"` na niepustym obszarze.
 */
function wgs84BboxToUrnLatLon(bbox: WfsBbox): string {
  const [west, south, east, north] = bbox;
  return `${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326`;
}

export async function fetchLandCoverUnits(bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: 'lcv:LandCoverUnit',
    bbox: wgs84BboxToUrnLatLon(bbox),
    maxFeatures: String(MAX_FEATURES),
  });

  const res = await fetch(`${LCV_WFS_URL}?${params}`);
  if (!res.ok) throw new Error(`WFS LCV: ${res.status}`);
  const gml = await res.text();
  return parseWfsPolygonGmlWithHoles(gml, 'LandCoverUnit', [], ['class']);
}
