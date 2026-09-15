/**
 * Klient WFS dla gdyńskiego serwisu MPZP (Biuro Planowania Przestrzennego Miasta Gdyni):
 * Warstwy planistyczne zgodne ze standardem APP: akty planowania przestrzennego (obrysy planów).
 * Upstream: https://geo.bppmg.pl/server/services/MPZP/ZbiorDanychPrzestrzennychMPZP/MapServer/WFSServer
 */

import { WfsBbox, wgs84BboxToEpsg2177 } from './wfsWarsawClient';
import { parseWfsPolygonGml } from './wfsGmlUtils';
import { MpzpZoneRawFeature, MpzpLineRawFeature } from './wfsMpzpWarsawClient';

const GDYNIA_WFS_URL = '/api/gdynia-mpzp-wfs';

export async function fetchGdyniaMpzp(bbox: WfsBbox): Promise<{
  zones: MpzpZoneRawFeature[];
  lines: MpzpLineRawFeature[];
}> {
  const bboxStr = `${wgs84BboxToEpsg2177(bbox)},urn:ogc:def:crs:EPSG::2177`;

  // 1. Akty planowania przestrzennego (granice i statusy MPZP)
  let zones: MpzpZoneRawFeature[] = [];
  try {
    const paramsZones = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'MPZP_ZbiorDanychPrzestrzennychMPZP:AktPlanowaniaPrzestrzennego.MPZP',
      BBOX: bboxStr,
    });
    const res = await fetch(`${GDYNIA_WFS_URL}?${paramsZones}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsPolygonGml(
        gml,
        'featureMember',
        'AktPlanowaniaPrzestrzennego.MPZP',
        [
          'tytul',
          'nazwaWlasna',
          'status',
          'obowiazujeOd',
          'przestrzenNazw',
          'lokalnyId',
        ]
      );
      zones = parsed.features as unknown as MpzpZoneRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania planów MPZP Gdynia:', e);
  }

  return { zones, lines: [] };
}
