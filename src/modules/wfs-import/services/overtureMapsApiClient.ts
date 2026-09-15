/**
 * Klient publicznego REST API https://api.overturemapsapi.com (projekt open-source
 * thatapicompany/overture-maps-api, https://www.overturemapsapi.com) — udostępnia dane
 * Overture Maps (drogi/koleje z tematu `transportation`, zieleń — `land_use`+`land_cover` —
 * z tematu `base`) przez zwykłe zapytania lat/lng/radius z otwartym CORS. Zweryfikowane
 * działającym zapytaniem na środowisku demo — nie wymaga własnego proxy/serverless.
 * `/base` w tym API NIE zawiera wód powierzchniowych (zweryfikowane empirycznie: brak wyników
 * `type=water` nawet nad rzeką) — nie próbować z niego renderować wód.
 *
 * Klucz `DEMO-API-KEY` działa tylko dla kilku miast demo (NY, Londyn, Paryż, Sydney).
 * Dla pozostałych lokalizacji (m.in. Poznania) wymagany własny darmowy klucz z rejestracji
 * na overturemapsapi.com — ustawiony w `APP_CONFIG.overtureMapsApi.apiKey`.
 */

import { GeoJsonFeatureCollection } from './wfsWarsawClient';
import { APP_CONFIG } from '../../../config/appConfig';

const OVERTURE_MAPS_API_BASE_URL = 'https://api.overturemapsapi.com';

async function fetchOvertureGeoJson(
  path: string,
  lat: number,
  lon: number,
  radiusMeters: number
): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    radius: String(radiusMeters),
    format: 'geojson',
  });

  const res = await fetch(`${OVERTURE_MAPS_API_BASE_URL}/${path}?${params}`, {
    headers: { 'x-api-key': APP_CONFIG.overtureMapsApi.apiKey },
  });
  if (!res.ok) throw new Error(`Overture Maps API (${path}): ${res.status}`);
  return res.json();
}

/** Segmenty transportu (drogi, koleje) z tematu Overture `transportation`. */
export function fetchOvertureTransportation(
  lat: number,
  lon: number,
  radiusMeters: number
): Promise<GeoJsonFeatureCollection> {
  return fetchOvertureGeoJson('transportation', lat, lon, radiusMeters);
}

/** Poligony użytkowania/pokrycia terenu (zieleń — park, ogród, trawnik itp.) z tematu Overture `base`. */
export function fetchOvertureBase(
  lat: number,
  lon: number,
  radiusMeters: number
): Promise<GeoJsonFeatureCollection> {
  return fetchOvertureGeoJson('base', lat, lon, radiusMeters);
}

/** `properties.subtype` cechy transportu wg schematu Overture (`road` | `rail`, ew. inne wartości). */
export function isRailSegment(feature: GeoJsonFeatureCollection['features'][number]): boolean {
  return feature.properties?.subtype === 'rail';
}

export function isRoadSegment(feature: GeoJsonFeatureCollection['features'][number]): boolean {
  return feature.properties?.subtype === 'road';
}
