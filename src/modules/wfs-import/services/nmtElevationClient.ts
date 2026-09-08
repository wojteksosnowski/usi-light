/**
 * nmtElevationClient.ts
 *
 * Klient GUGiK NMT REST API do pobierania rzędnej terenu dla pojedynczych punktów.
 * Serwis: http://services.gugik.gov.pl/nmt/
 * CORS: Access-Control-Allow-Origin: * (działa bezpośrednio z przeglądarki)
 * Zwraca wysokość w metrach n.p.m. (PL-KRON86-NH) dla współrzędnych EPSG:2180.
 */

import { BuildingLoop } from '../../../types/geometry';
import { cadPointToWgs84, CrsDetectionResult, LatLon } from '../../../utils/geoTransform';
import { wgs84ToEpsg2180 } from '../utils/wgs84ToEpsg2180';
import { APP_CONFIG } from '../../../config/appConfig';

const NMT_BASE_URL = 'http://services.gugik.gov.pl/nmt/';
const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';

/**
 * Pobiera rzędną terenu dla punktu w WGS84, używając GUGiK NMT REST API.
 * Fallback do Open-Elevation (SRTM 30m) jeśli GUGiK niedostępny.
 *
 * @returns wysokość w metrach n.p.m. lub null jeśli nie udało się pobrać
 */
export async function fetchTerrainElevation(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<number | null> {
  // Konwertuj WGS84 -> EPSG:2180 (wymagane przez GUGiK NMT)
  const { x, y } = wgs84ToEpsg2180(lat, lon);
  const url = `${NMT_BASE_URL}?request=GetHbyXY&x=${x.toFixed(2)}&y=${y.toFixed(2)}`;

  try {
    const res = await fetch(url, { signal });
    if (res.ok) {
      const text = (await res.text()).trim();
      const val = parseFloat(text);
      if (isFinite(val)) return val;
    }
  } catch {
    // GUGiK niedostępny — próbuj fallback
  }

  // Fallback: Open-Elevation (SRTM 30m, ~±5m dokładność)
  if (APP_CONFIG.geo.nmtFallbackEnabled) {
    try {
      const fbRes = await fetch(
        `${OPEN_ELEVATION_URL}?locations=${lat.toFixed(6)},${lon.toFixed(6)}`,
        { signal }
      );
      if (fbRes.ok) {
        const json = await fbRes.json();
        const elev = json?.results?.[0]?.elevation;
        if (typeof elev === 'number' && isFinite(elev)) return elev;
      }
    } catch {
      // brak internetu lub serwis niedostępny
    }
  }

  return null;
}

/**
 * Pomocnicza funkcja centroida wierzchołków wielokąta.
 */
function polygonCentroid2D(vertices: { x: number; y: number }[]): { x: number; y: number } {
  if (vertices.length === 0) return { x: 0, y: 0 };
  let cx = 0, cy = 0;
  for (const v of vertices) { cx += v.x; cy += v.y; }
  return { x: cx / vertices.length, y: cy / vertices.length };
}

/**
 * Pobiera rzędne terenu dla centroidów listy budynków/działek.
 * Wysyła zapytania równolegle (batche po nmtConcurrency).
 *
 * @returns Mapa: buildingId → wysokość n.p.m. (metry)
 */
export async function fetchBuildingElevations(
  buildings: BuildingLoop[],
  crsInfo: CrsDetectionResult,
  projectCenter?: LatLon,
  signal?: AbortSignal
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (buildings.length === 0) return result;

  const concurrency = APP_CONFIG.geo.nmtConcurrency;

  for (let i = 0; i < buildings.length; i += concurrency) {
    if (signal?.aborted) break;
    const batch = buildings.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(async (b) => {
        try {
          const centroid = polygonCentroid2D(b.vertices);
          const wgs = cadPointToWgs84(centroid, crsInfo, projectCenter);
          const elev = await fetchTerrainElevation(wgs.lat, wgs.lon, signal);
          if (elev !== null) result.set(b.id, elev);
        } catch {
          // pomiń ten budynek
        }
      })
    );
  }

  return result;
}
