/**
 * Klient WFS dla poznańskiego serwisu MPZP (Miejska Pracownia Urbanistyczna w Poznaniu):
 * Warstwy planistyczne zgodne ze standardem APP: wydzielenia planistyczne oraz linie zabudowy.
 * Upstream: https://gis.mpu.pl/server/services/Hosted/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer
 */

import { WfsBbox, wgs84BboxToEpsg2177 } from '../city/wfsWarsawClient';
import { parseWfsPolygonGml, parseWfsLineStringGml } from '../shared/wfsGmlUtils';
import { MpzpZoneRawFeature, MpzpLineRawFeature } from './wfsMpzpWarsawClient';

const POZNAN_WFS_URL = '/api/wfs?target=poznan-mpzp-wfs';

export async function fetchPoznanMpzp(bbox: WfsBbox): Promise<{
  zones: MpzpZoneRawFeature[];
  lines: MpzpLineRawFeature[];
}> {
  const bboxStr = `${wgs84BboxToEpsg2177(bbox)},urn:ogc:def:crs:EPSG::2177`;

  // 1. Wydzielenia planistyczne (strefy przeznaczenia)
  const zoneProps = [
    'symbol',
    'symb_t',
    'symb_t_o',
    'przeznaczenie_nazwa',
    'przeznaczenie_kod',
    'rodz_zab',
    'kod_ter',
    'aktPlanowania_link',
  ];
  let zones: MpzpZoneRawFeature[] = [];
  try {
    const paramsZones = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'ZbiorDanychPrzestrzennychMPZP:app.WydzieleniePlanistyczne.MPZP',
      BBOX: bboxStr,
      PROPERTYNAME: ['SHAPE', ...zoneProps].join(','),
    });
    const res = await fetch(`${POZNAN_WFS_URL}&${paramsZones}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsPolygonGml(
        gml,
        'featureMember',
        'app.WydzieleniePlanistyczne.MPZP',
        zoneProps
      );
      zones = parsed.features as unknown as MpzpZoneRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania stref MPZP Poznań:', e);
  }

  // 2. Linie zabudowy
  const lineProps = ['rodzajLinii', 'typ_linii', 'kod_lz', 'aktPlanowania_link'];
  let lines: MpzpLineRawFeature[] = [];
  try {
    const paramsLines = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'ZbiorDanychPrzestrzennychMPZP:app.LinieZabudowy.MPZP',
      BBOX: bboxStr,
      PROPERTYNAME: ['SHAPE', ...lineProps].join(','),
    });
    const res = await fetch(`${POZNAN_WFS_URL}&${paramsLines}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsLineStringGml(gml, 'app.LinieZabudowy.MPZP', lineProps);
      lines = parsed.features as unknown as MpzpLineRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania linii MPZP Poznań:', e);
  }

  return { zones, lines };
}
