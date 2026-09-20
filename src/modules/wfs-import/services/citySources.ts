import { CrsDetectionResult } from '../../../utils/geoTransform';
import { GeoJsonFeatureCollection, WfsBbox, fetchWarsawBuildings, EPSG_2177, EPSG_2178 } from './wfsWarsawClient';
import { fetchKrakowBuildings, fetchKrakowParcels } from './wfsKrakowClient';
import { fetchPoznanBuildings, fetchPoznanParcels } from './wfsPoznanClient';
import { fetchEgibBuildings, EPSG_2180 } from './wfsEgibClient';

export interface CitySource {
  name: string;
  /** [west, south, east, north] w WGS84 */
  bbox: [number, number, number, number];
  sourceCrs: CrsDetectionResult;
  fetchBuildings: (bbox: WfsBbox) => Promise<GeoJsonFeatureCollection>;
  /** Jeśli podane, lokalne działki miasta zastępują (dla tego miasta) ogólnopolski ULDK. */
  fetchParcels?: (bbox: WfsBbox) => Promise<GeoJsonFeatureCollection>;
  /**
   * Czy serwis realnie wypełnia atrybut KONDYGNACJE_NADZIEMNE (liczba wysokość budynku).
   * Domyślnie `true`. Ogólnopolski fallback EGiB zwraca to pole jako puste (`None`) dla
   * większości powiatów, więc dla niego ustawiamy `false` — wysokość trzeba dobrać inną
   * metodą (LiDAR NMPT−NMT, patrz `terrainAnalyzer.ts`) zamiast ufać stałej wartości domyślnej.
   */
  hasStoreyHeights?: boolean;
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
    // Serwer krakowski bywa niedostępny dla KONDYGNACJE_NADZIEMNE i zwraca tekst "brak_uprawnień"
    // zamiast liczby (patrz komentarz w wfsKrakowClient.ts) — ten sam problem co EGiB.
    hasStoreyHeights: false,
  },
  {
    name: 'Poznań',
    bbox: [16.70, 52.30, 17.15, 52.50],
    sourceCrs: EPSG_2177,
    fetchBuildings: fetchPoznanBuildings,
    fetchParcels: fetchPoznanParcels,
    // Nazwy/wypełnienie atrybutu wysokości nie zostały jeszcze zweryfikowane na żywym
    // serwerze (patrz komentarz w wfsPoznanClient.ts) — traktujemy jak Kraków/EGiB dopóki
    // nie zostanie to potwierdzone.
    hasStoreyHeights: false,
  },
  // Ogólnopolski fallback: krajowa zbiorcza usługa WFS EGiB (GUGiK) dla budynków,
  // dla miast/gmin bez własnego dedykowanego serwisu (np. Wrocław, Gdańsk).
  // Bez `fetchParcels` — działki nadal idą przez ogólnopolski ULDK (`fetchParcelsInRadius`
  // w uldkClient.ts), który ma lepsze pokrycie/dokładność dla granic działek.
  // Musi być ostatnim wpisem: dopasowuje się dopiero gdy żadne dedykowane miasto nie pasuje
  // (pierwsze pasujące bbox wygrywa w findCitySource()).
  {
    name: 'Polska (EGiB, fallback krajowy)',
    bbox: [14.0, 49.0, 24.5, 55.0],
    sourceCrs: EPSG_2180,
    fetchBuildings: fetchEgibBuildings,
    hasStoreyHeights: false,
  },
];

/** Ostatni wpis w CITY_SOURCES jest zawsze krajowym fallbackiem EGiB (patrz komentarz wyżej). */
const NATIONAL_EGIB = CITY_SOURCES[CITY_SOURCES.length - 1];

export function findCitySource(lat: number, lon: number): CitySource | null {
  for (const city of CITY_SOURCES) {
    const [west, south, east, north] = city.bbox;
    if (lon >= west && lon <= east && lat >= south && lat <= north) return city;
  }
  return null;
}

/**
 * Pobiera budynki z dedykowanego serwisu miejskiego; jeśli ten padnie (błąd sieci/serwera),
 * automatycznie próbuje krajowego fallbacku EGiB zamiast po cichu zwracać pustkę — realizuje
 * zasadę "obowiązuje w granicach miasta, jeśli nie ładuje się -> fallback krajowy".
 * Zwraca `null` gdy `citySource` jest `null` (poza obszarem `CITY_SOURCES`, wywołujący powinien
 * wtedy w ogóle nie korzystać z WFS budynków miejskich).
 */
export async function fetchBuildingsWithFallback(
  citySource: CitySource | null,
  bbox: WfsBbox
): Promise<{ geojson: GeoJsonFeatureCollection; source: CitySource } | null> {
  if (!citySource) return null;
  try {
    return { geojson: await citySource.fetchBuildings(bbox), source: citySource };
  } catch (err) {
    if (citySource === NATIONAL_EGIB) throw err; // już jesteśmy na fallbacku, nie ma gdzie dalej
    console.warn(`[WFS] ${citySource.name} budynki niedostępne, fallback krajowy (EGiB):`, err);
    return { geojson: await NATIONAL_EGIB.fetchBuildings(bbox), source: NATIONAL_EGIB };
  }
}
