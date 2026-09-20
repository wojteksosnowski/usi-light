/**
 * Miejskie nadpisania (override) warstw WMS GESUT/BDOT500 — pozwalają wybrać lokalny serwis
 * miejski zamiast krajowego GUGiK dla projektów leżących w granicach danego miasta.
 *
 * Wzorowane na `mpzpSources.ts` (`MpzpSource`/`findMpzpSource`): bbox-priority match, pierwsze
 * trafienie wygrywa; brak trafienia = pozostań przy krajowym fallbacku (`registerGeoLayers.ts`).
 */

const POZNAN_BBOX: [number, number, number, number] = [16.70, 52.30, 17.15, 52.50];

export interface WmsCityOverride {
  name: string;
  /** [west, south, east, north] w WGS84 */
  bbox: [number, number, number, number];
  baseUrl: string;
  layers: string;
}

// Nazwy warstw zweryfikowane empirycznie na podstawie realnych wywołań GetMap w dumpie HAR
// portalu (reference/sipmapy.geopoz.poznan.pl.har) — serwer WMS (MapServer pod aliasami
// wmsgesut/wmsbdot) na nieznaną nazwę w LAYERS odpowiada pustym/przezroczystym obrazkiem
// (HTTP 200) zamiast błędem, więc literówka w nazwie nie jest widoczna jako błąd sieciowy —
// po prostu warstwa nic nie pokazuje mimo statusu "ready".
export const GESUT_CITY_SOURCES: WmsCityOverride[] = [
  {
    name: 'Poznań',
    bbox: POZNAN_BBOX,
    baseUrl: 'https://portal.geopoz.poznan.pl/wmsgesut',
    layers:
      'siec_wodociagowa,siec_kanalizacyjna,siec_gazowa,siec_elektroenergetyczna,siec_cieplownicza,siec_telekomunikacyjna,siec_specjalna,siec_niezidentyfikowana,inne_urzadzenia_towarzyszace_linie,inne_urzadzenia_towarzyszace_punkty',
  },
];

export const BDOT_CITY_SOURCES: WmsCityOverride[] = [
  {
    name: 'Poznań',
    bbox: POZNAN_BBOX,
    baseUrl: 'https://portal.geopoz.poznan.pl/wmsbdot',
    layers:
      'rzezba_terenu,wody,sport_i_rekreacja,zagospodarowanie_terenu,komunikacja,ogrodzenia,budowle,budynki',
  },
];

export function findWmsCityOverride(sources: WmsCityOverride[], lat: number, lon: number): WmsCityOverride | null {
  for (const source of sources) {
    const [west, south, east, north] = source.bbox;
    if (lon >= west && lon <= east && lat >= south && lat <= north) return source;
  }
  return null;
}
