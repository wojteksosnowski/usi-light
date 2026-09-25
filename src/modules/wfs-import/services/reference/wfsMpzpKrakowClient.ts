/**
 * Klient WFS dla krakowskiego serwisu MPZP (MSIP Kraków / ArcGIS Server):
 * Warstwy planistyczne: strefy przeznaczenia oraz granice planów obowiązujących.
 * Upstream: https://msip3.um.krakow.pl/server/services/Pobieranie/BP_MPZP_POBIERANIE/MapServer/WFSServer
 */

import { WfsBbox, wgs84BboxToEpsg2178 } from '../city/wfsWarsawClient';
import { parseWfsPolygonGml } from '../shared/wfsGmlUtils';
import { MpzpZoneRawFeature, MpzpLineRawFeature } from './wfsMpzpWarsawClient';

const KRAKOW_WFS_URL = '/api/wfs?target=krakow-mpzp-wfs';

export async function fetchKrakowMpzp(bbox: WfsBbox): Promise<{
  zones: MpzpZoneRawFeature[];
  lines: MpzpLineRawFeature[];
}> {
  const bboxStr = `${wgs84BboxToEpsg2178(bbox)},urn:ogc:def:crs:EPSG::2178`;

  // 1. Strefy przeznaczenia
  const zoneProps = [
    'oznaczenie',
    'opis_oznaczenia',
    'nazwa_mpzp',
    'rodzaj_oznaczenia',
    'SYMBOL',
    'PRZEZNACZENIE',
    'NAZWA_PLANU',
    'WYSOKOSC_ZABUDOWY',
    'INTENSYWNOSC_MAX',
    'INTENSYWNOSC_MIN',
    'POW_BIOLOGICZNIE_CZYNNA',
    'www',
  ];
  let zones: MpzpZoneRawFeature[] = [];
  try {
    const paramsZones = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'BP_MPZP_POBIERANIE:Przeznaczenia_MPZP',
      BBOX: bboxStr,
      PROPERTYNAME: ['SHAPE', ...zoneProps].join(','),
    });
    const res = await fetch(`${KRAKOW_WFS_URL}&${paramsZones}`);
    if (res.ok) {
      const gml = await res.text();
      const parsed = parseWfsPolygonGml(
        gml,
        'featureMember',
        'Przeznaczenia_MPZP',
        zoneProps
      );
      zones = parsed.features as unknown as MpzpZoneRawFeature[];
    }
  } catch (e) {
    console.warn('Błąd pobierania stref MPZP Kraków:', e);
  }

  return { zones, lines: [] };
}
