/**
 * Klient WFS dla krakowskiego serwisu EGiB (MapServer):
 * https://geodezja.eco.um.krakow.pl/krakow-egib
 *
 * Serwer nie wysyła nagłówków CORS, więc zapytania idą przez własny proxy
 * serverless `/api/krakow-wfs` (api/krakow-wfs.ts) zamiast bezpośrednio z przeglądarki.
 *
 * Warstwy ms:budynki / ms:dzialki mają te same nazwy atrybutów co warszawski
 * GeoServer (ID_BUDYNKU, KONDYGNACJE_NADZIEMNE, ID_DZIALKI, NUMER_DZIALKI),
 * ale serwer nie udostępnia outputFormat=application/json (błąd
 * "not a permitted output format") — trzeba pobrać GML i sparsować geometrię
 * ręcznie, tak jak dla drzew warszawskich (parseTreesGml).
 *
 * Uwaga na kolejność osi — sprawdzone empirycznie na żywym serwerze:
 * - Parametr BBOX zapytania GetFeature: (easting, northing) — INNA konwencja
 *   niż `wgs84BboxToEpsg2178()` z wfsWarsawClient.ts (tam: northing, easting).
 * - `gml:posList` w geometrii odpowiedzi: (northing, easting) — trzeba odwrócić
 *   pary na [easting, northing], zgodnie z tym czego oczekuje geoJsonImporter.ts.
 * - Część atrybutów bywa niedostępna publicznie i wraca jako tekst
 *   "brak_uprawnień" zamiast liczby (np. KONDYGNACJE_NADZIEMNE) — trzeba to
 *   odfiltrować, inaczej `Number("brak_uprawnień")` daje NaN i psuje wysokość budynku.
 */

import { GeoJsonFeatureCollection, WfsBbox, wgs84BboxToEpsg2178Bounds } from './wfsWarsawClient';
import { parseWfsPolygonGml } from './wfsGmlUtils';

const KRAKOW_WFS_URL = '/api/krakow-wfs';

/** Bbox WGS84 -> EPSG:2178 w kolejności easting,northing (wymaganej przez ten serwer). */
function wgs84BboxToEpsg2178EN(bbox: WfsBbox): string {
  const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2178Bounds(bbox);
  return `${minE},${minN},${maxE},${maxN}`;
}

export async function fetchKrakowBuildings(bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '1.1.0',
    REQUEST: 'GetFeature',
    TYPENAME: 'ms:budynki',
    BBOX: wgs84BboxToEpsg2178EN(bbox),
  });

  const res = await fetch(`${KRAKOW_WFS_URL}?${params}`);
  if (!res.ok) throw new Error(`WFS Kraków budynki: ${res.status}`);
  const gml = await res.text();
  return parseWfsPolygonGml(gml, 'featureMember', 'budynki', ['ID_BUDYNKU'], ['KONDYGNACJE_NADZIEMNE']);
}

export async function fetchKrakowParcels(bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '1.1.0',
    REQUEST: 'GetFeature',
    TYPENAME: 'ms:dzialki',
    BBOX: wgs84BboxToEpsg2178EN(bbox),
  });

  const res = await fetch(`${KRAKOW_WFS_URL}?${params}`);
  if (!res.ok) throw new Error(`WFS Kraków działki: ${res.status}`);
  const gml = await res.text();
  return parseWfsPolygonGml(gml, 'featureMember', 'dzialki', ['ID_DZIALKI', 'NUMER_DZIALKI']);
}
