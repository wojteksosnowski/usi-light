/**
 * Źródła danych wektorowych planów miejscowych (MPZP) dla polskich miast.
 *
 * Umożliwia pobieranie wektorowych stref przeznaczenia oraz linii planistycznych
 * (linie zabudowy nieprzekraczalne, obowiązujące, linie rozgraniczające)
 * z serwisów miejskich (Warszawa, Kraków, Wrocław, Poznań, Gdynia) oraz usług krajowych.
 */

import { CrsDetectionResult } from '../../../../utils/geoTransform';
import { WfsBbox, EPSG_2178, EPSG_2177 } from '../city/wfsWarsawClient';
import { fetchWarsawMpzpZones, MpzpZoneRawFeature, MpzpLineRawFeature } from './wfsMpzpWarsawClient';
import { fetchKrakowMpzp } from './wfsMpzpKrakowClient';
import { fetchWroclawMpzp } from './wfsMpzpWroclawClient';
import { fetchPoznanMpzp } from './wfsMpzpPoznanClient';
import { fetchGdyniaMpzp } from './wfsMpzpGdyniaClient';

export interface MpzpFetchResult {
  zones: MpzpZoneRawFeature[];
  lines: MpzpLineRawFeature[];
}

export interface MpzpSource {
  name: string;
  /** [west, south, east, north] w WGS84 */
  bbox: [number, number, number, number];
  sourceCrs: CrsDetectionResult;
  fetchMpzp: (
    bbox: WfsBbox,
    projectRadius: number,
    centerLat: number,
    centerLon: number
  ) => Promise<MpzpFetchResult>;
}

export const MPZP_SOURCES: MpzpSource[] = [
  {
    name: 'Warszawa',
    bbox: [20.85, 52.09, 21.27, 52.37],
    sourceCrs: EPSG_2178,
    fetchMpzp: async (_bbox, projectRadius, centerLat, centerLon) => {
      const zones = await fetchWarsawMpzpZones(centerLat, centerLon, projectRadius);
      return { zones, lines: [] };
    },
  },
  {
    name: 'Kraków',
    bbox: [19.75, 49.96, 20.25, 50.15],
    sourceCrs: EPSG_2178,
    fetchMpzp: async (bbox) => {
      return fetchKrakowMpzp(bbox);
    },
  },
  {
    name: 'Wrocław',
    bbox: [16.80, 51.02, 17.20, 51.21],
    sourceCrs: EPSG_2177,
    fetchMpzp: async (bbox) => {
      return fetchWroclawMpzp(bbox);
    },
  },
  {
    name: 'Poznań',
    bbox: [16.70, 52.30, 17.15, 52.50],
    sourceCrs: EPSG_2177,
    fetchMpzp: async (bbox) => {
      return fetchPoznanMpzp(bbox);
    },
  },
  {
    name: 'Gdynia',
    bbox: [18.35, 54.42, 18.65, 54.60],
    sourceCrs: EPSG_2177,
    fetchMpzp: async (bbox) => {
      return fetchGdyniaMpzp(bbox);
    },
  },
];

export function findMpzpSource(lat: number, lon: number): MpzpSource | null {
  for (const source of MPZP_SOURCES) {
    const [west, south, east, north] = source.bbox;
    if (lon >= west && lon <= east && lat >= south && lat <= north) return source;
  }
  return null;
}
