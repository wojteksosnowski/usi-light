/**
 * Klient WFS dla wrocławskiego serwisu MPZP (Geoportal Wrocław / ArcGIS Server):
 * Warstwy planistyczne: strefy przeznaczenia (tereny) oraz linie zabudowy / rozgraniczające.
 * Upstream: http://gis1.um.wroc.pl/arcgis/services/ogc/OGC_mpzp/MapServer/WFSServer
 */

import { WfsBbox, wgs84BboxToEpsg2177 } from './wfsWarsawClient';
import { parseWfsPolygonGml, parseWfsLineStringGml } from './wfsGmlUtils';
import { MpzpZoneRawFeature, MpzpLineRawFeature } from './wfsMpzpWarsawClient';

const WROCLAW_WFS_URL = '/api/wfs?target=wroclaw-mpzp-wfs';

export async function fetchWroclawMpzp(bbox: WfsBbox): Promise<{
  zones: MpzpZoneRawFeature[];
  lines: MpzpLineRawFeature[];
}> {
  const bboxStr = `${wgs84BboxToEpsg2177(bbox)},urn:ogc:def:crs:EPSG:6.9:2177`;

  // 1. Strefy przeznaczenia / tereny
  let zones: MpzpZoneRawFeature[] = [];
  try {
    const paramsZones = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'OGC_mpzp:tereny',
      BBOX: bboxStr,
    });
    const res = await fetch(`${WROCLAW_WFS_URL}&${paramsZones}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsPolygonGml(
        gml,
        'featureMember',
        'tereny',
        [
          'symbol',
          'kod_przeznaczenia_glownego',
          'przeznaczenie_glowne',
          'opis',
          'nazwa_planu',
          'nr_planu',
          'nr_uchwaly',
          'url',
        ]
      );
      zones = parsed.features as unknown as MpzpZoneRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania stref MPZP Wrocław:', e);
  }

  // 2. Linie planistyczne / zabudowy
  let lines: MpzpLineRawFeature[] = [];
  try {
    const paramsLines = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'OGC_mpzp:linie_zabudowy',
      BBOX: bboxStr,
    });
    const res = await fetch(`${WROCLAW_WFS_URL}&${paramsLines}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsLineStringGml(gml, 'linie_zabudowy', [
        'rodzaj_linii',
        'opis',
        'nazwa_planu',
        'nr_planu',
      ]);
      lines = parsed.features as unknown as MpzpLineRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania linii MPZP Wrocław:', e);
  }

  return { zones, lines };
}
