/**
 * Klient WFS dla poznańskiego serwisu MPZP (GEOPOZ Poznań):
 * Warstwy planistyczne: strefy przeznaczenia oraz linie zabudowy.
 */

import { WfsBbox, wgs84BboxToEpsg2178EN } from './wfsWarsawClient';
import { parseWfsPolygonGml, parseWfsLineStringGml } from './wfsGmlUtils';
import { MpzpZoneRawFeature, MpzpLineRawFeature } from './wfsMpzpWarsawClient';

const POZNAN_WFS_URL = '/api/poznan-wfs';

export async function fetchPoznanMpzp(bbox: WfsBbox): Promise<{
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
      TYPENAME: 'poznan:mpzp_strefy',
      BBOX: bboxStr,
    });
    const res = await fetch(`${POZNAN_WFS_URL}?${paramsZones}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsPolygonGml(
        gml,
        'featureMember',
        'mpzp_strefy',
        ['SYMBOL', 'PRZEZNACZENIE', 'NAZWA_PLANU', 'MAX_WYSOKOSC', 'INTENSYWNOSC', 'POW_BIOLOGICZNA']
      );
      zones = parsed.features as unknown as MpzpZoneRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania stref MPZP Poznań:', e);
  }

  // 2. Linie planistyczne / zabudowy
  let lines: MpzpLineRawFeature[] = [];
  try {
    const paramsLines = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'poznan:mpzp_linie',
      BBOX: bboxStr,
    });
    const res = await fetch(`${POZNAN_WFS_URL}?${paramsLines}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsLineStringGml(gml, 'mpzp_linie', ['TYP', 'RODZAJ', 'OPIS']);
      lines = parsed.features as unknown as MpzpLineRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania linii MPZP Poznań:', e);
  }

  return { zones, lines };
}
