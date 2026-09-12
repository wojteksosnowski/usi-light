import { CrsDetectionResult } from '../../../utils/geoTransform';
import { GeoJsonFeatureCollection, WfsBbox, fetchWarsawBuildings, EPSG_2178 } from './wfsWarsawClient';
import { fetchKrakowBuildings, fetchKrakowParcels } from './wfsKrakowClient';
import { fetchEgibBuildings, EPSG_2180 } from './wfsEgibClient';

export interface CitySource {
  name: string;
  /** [west, south, east, north] w WGS84 */
  bbox: [number, number, number, number];
  sourceCrs: CrsDetectionResult;
  fetchBuildings: (bbox: WfsBbox) => Promise<GeoJsonFeatureCollection>;
  /** Jeśli podane, lokalne działki miasta zastępują (dla tego miasta) ogólnopolski ULDK. */
  fetchParcels?: (bbox: WfsBbox) => Promise<GeoJsonFeatureCollection>;
}

export const CITY_SOURCES: CitySource[] = [
  {
    name: 'Warszawa',
    bbox: [20.85, 52.09, 21.27, 52.37],
    sourceCrs: EPSG_2178,
    fetchBuildings: fetchWarsawBuildings,
  },
  {
    name: 'Kraków',
    bbox: [19.75, 49.96, 20.25, 50.15],
    sourceCrs: EPSG_2178,
    fetchBuildings: fetchKrakowBuildings,
    fetchParcels: fetchKrakowParcels,
  },
  // Ogólnopolski fallback: krajowa zbiorcza usługa WFS EGiB (GUGiK) dla budynków,
  // dla miast/gmin bez własnego dedykowanego serwisu (np. Wrocław, Gdańsk, Poznań).
  // Bez `fetchParcels` — działki nadal idą przez ogólnopolski ULDK (`fetchParcelsInRadius`
  // w uldkClient.ts), który ma lepsze pokrycie/dokładność dla granic działek.
  // Musi być ostatnim wpisem: dopasowuje się dopiero gdy żadne dedykowane miasto nie pasuje
  // (pierwsze pasujące bbox wygrywa w findCitySource()).
  {
    name: 'Polska (EGiB, fallback krajowy)',
    bbox: [14.0, 49.0, 24.5, 55.0],
    sourceCrs: EPSG_2180,
    fetchBuildings: fetchEgibBuildings,
  },
];

export function findCitySource(lat: number, lon: number): CitySource | null {
  for (const city of CITY_SOURCES) {
    const [west, south, east, north] = city.bbox;
    if (lon >= west && lon <= east && lat >= south && lat <= north) return city;
  }
  return null;
}
