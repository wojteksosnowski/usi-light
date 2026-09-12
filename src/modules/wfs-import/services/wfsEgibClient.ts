/**
 * Klient krajowej zbiorczej usługi WFS EGiB (GUGiK):
 * https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza
 *
 * Używany jako ogólnopolski fallback pobierania budynków dla miast bez
 * własnego dedykowanego serwisu WFS (np. Wrocław, Gdańsk, Poznań) — analogicznie
 * do tego jak `uldkClient.ts` jest ogólnopolskim fallbackiem dla działek.
 *
 * Serwer nie wysyła nagłówków CORS, więc zapytania idą przez własny proxy
 * serverless `/api/egib-wfs` (api/egib-wfs.ts) zamiast bezpośrednio z przeglądarki.
 *
 * Pułapka z kolejnością osi: to WFS 2.0.0 i zapytania/geometrie używają referencji
 * `urn:ogc:def:crs:EPSG::XXXX`, co wymusza OFICJALNĄ kolejność osi EPSG — dla 4326
 * to (lat, lon), a dla 2180 to (northing, easting) — NIE zwyczajową kolejność
 * (lon,lat / easting,northing) używaną przez starsze serwisy WFS 1.1.0 (Warszawa,
 * Kraków). Sprawdzone empirycznie: bbox w kolejności lon,lat zwraca 0 wyników
 * (fałszywie sugerując brak pokrycia terenu), bbox w kolejności lat,lon zwraca
 * poprawne dane. Ta sama odwrócona kolejność dotyczy `gml:posList` w geometrii
 * odpowiedzi — pary trzeba odwrócić na [easting, northing], tak jak w `wfsKrakowClient.ts`.
 *
 * Warstwy ms:budynki / ms:dzialki mają te same nazwy atrybutów co Kraków/Warszawa
 * (ID_BUDYNKU, KONDYGNACJE_NADZIEMNE), ale serwer nie udostępnia
 * outputFormat=application/json — trzeba pobrać GML i sparsować geometrię ręcznie.
 * Odpowiedź to WFS 2.0.0 (`wfs:member`), nie WFS 1.1.0 (`gml:featureMember`) jak
 * u Krakowa/drzew warszawskich.
 */

import { GeoJsonFeatureCollection, WfsBbox } from './wfsWarsawClient';
import { parseWfsPolygonGml } from './wfsGmlUtils';
import { CrsDetectionResult } from '../../../utils/geoTransform';

const EGIB_WFS_URL = '/api/egib-wfs';

export const EPSG_2180: CrsDetectionResult = {
  crs: 'EPSG:2180',
  description: 'PL-1992 (EPSG:2180)',
  geodeticLabel: 'ETRF2000-PL / CS1992',
  isGeodetic: true,
};

/** Bbox WGS84 [west, south, east, north] -> parametr BBOX w kolejności lat,lon wymaganej przez urn:ogc:def:crs:EPSG::4326. */
function wgs84BboxToUrnLatLon(bbox: WfsBbox): string {
  const [west, south, east, north] = bbox;
  return `${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326`;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

async function fetchAllPages(
  typeNames: 'ms:budynki' | 'ms:dzialki',
  featureTagName: string,
  textProperties: string[],
  numericProperties: string[],
  bbox: WfsBbox
): Promise<GeoJsonFeatureCollection['features'][]> {
  const pages: GeoJsonFeatureCollection['features'][] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames,
      bbox: wgs84BboxToUrnLatLon(bbox),
      count: String(PAGE_SIZE),
      startIndex: String(page * PAGE_SIZE),
    });

    const res = await fetch(`${EGIB_WFS_URL}?${params}`);
    if (!res.ok) throw new Error(`WFS EGiB ${typeNames}: ${res.status}`);
    const gml = await res.text();
    const parsed = parseWfsPolygonGml(gml, 'member', featureTagName, textProperties, numericProperties);
    pages.push(parsed.features);

    if (parsed.memberCount < PAGE_SIZE) break;
  }
  return pages;
}

export async function fetchEgibBuildings(bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  const pages = await fetchAllPages('ms:budynki', 'budynki', ['ID_BUDYNKU'], ['KONDYGNACJE_NADZIEMNE'], bbox);
  return { type: 'FeatureCollection', features: pages.flat() };
}
