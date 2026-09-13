/**
 * Klient WFS dla wrocławskiego serwisu MPZP (Geoportal Wrocław / GeoServer):
 * Warstwy planistyczne: strefy przeznaczenia oraz linie zabudowy / rozgraniczające.
 */

import { WfsBbox, wgs84BboxToEpsg2178EN } from './wfsWarsawClient';
import { parseWfsPolygonGml, parseWfsLineStringGml } from './wfsGmlUtils';
import { MpzpZoneRawFeature, MpzpLineRawFeature } from './wfsMpzpWarsawClient';

const WROCLAW_WFS_URL = '/api/wroclaw-wfs';

export async function fetchWroclawMpzp(bbox: WfsBbox): Promise<{
  zones: MpzpZoneRawFeature[];
  lines: MpzpLineRawFeature[];
}> {
  const bboxStr = wgs84BboxToEpsg2178EN(bbox);

  // 1. Strefy przeznaczenia
  let zones: MpzpZoneRawFeature[] = [];
  try {
    const paramsZones = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'wroclaw:mpzp_przeznaczenie',
      BBOX: bboxStr,
    });
    const res = await fetch(`${WROCLAW_WFS_URL}?${paramsZones}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsPolygonGml(
        gml,
        'featureMember',
        'mpzp_przeznaczenie',
        ['SYMBOL', 'OPIS', 'NAZWA_PLANU', 'MAX_WYSOKOSC', 'INTENSYWNOSC', 'POW_BIOLOGICZNA']
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
      TYPENAME: 'wroclaw:mpzp_linie_zabudowy',
      BBOX: bboxStr,
    });
    const res = await fetch(`${WROCLAW_WFS_URL}?${paramsLines}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsLineStringGml(gml, 'mpzp_linie_zabudowy', ['TYP', 'RODZAJ', 'OPIS']);
      lines = parsed.features as unknown as MpzpLineRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania linii MPZP Wrocław:', e);
  }

  return { zones, lines };
}
