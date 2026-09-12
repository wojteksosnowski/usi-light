/**
 * Klient usługi REST BGiK m.st. Warszawy "PrzeznaczenieTerenow" — zwraca strefy MPZP
 * (geometria + atrybuty: przeznaczenie, symbol, wysokość zabudowy, intensywność) w formacie
 * GeoJSON. Usługa nie ma zapytania obszarowego (tylko punktowe/atrybutowe — patrz dokumentacja
 * `reference/Dokumentacja_uslug_REST_SOAP_BGiK.docx`), więc obszar projektu jest próbkowany
 * siatką punktów, a wyniki deduplikowane po `objectid`.
 */

const PRZEZNACZENIE_TERENOW_URL = 'https://mapa.um.warszawa.pl/WebServices/PrzeznaczenieTerenow/wgs84/findByCoordinates';

export interface MpzpZoneRawFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
}

/** Promień Ziemi używany do przeliczenia metrów na stopnie przy generowaniu siatki próbkującej. */
const EARTH_RADIUS_M = 6378137;

/** Generuje siatkę punktów (WGS84) pokrywającą okrąg o danym promieniu wokół środka, z krokiem `stepMeters`. */
function samplingGrid(centerLat: number, centerLon: number, radiusMeters: number, stepMeters: number): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  const latStep = (stepMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonStep = latStep / Math.cos((centerLat * Math.PI) / 180);
  const steps = Math.ceil(radiusMeters / stepMeters);

  for (let iy = -steps; iy <= steps; iy++) {
    for (let ix = -steps; ix <= steps; ix++) {
      const dx = ix * stepMeters;
      const dy = iy * stepMeters;
      if (dx * dx + dy * dy > radiusMeters * radiusMeters) continue;
      points.push({ lat: centerLat + iy * latStep, lon: centerLon + ix * lonStep });
    }
  }
  return points;
}

async function fetchZoneAtPoint(lat: number, lon: number): Promise<MpzpZoneRawFeature | null> {
  try {
    const res = await fetch(`${PRZEZNACZENIE_TERENOW_URL}/${lon}/${lat}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.type !== 'Feature' || !data.geometry) return null;
    return data as MpzpZoneRawFeature;
  } catch {
    return null;
  }
}

/**
 * Pobiera strefy MPZP dla obszaru projektu (środek + promień w metrach), próbkując siatkę
 * punktów co `stepMeters` i deduplikując wyniki po `objectid`. Zapytania wykonywane równolegle
 * w paczkach, żeby nie zalać serwera setkami jednoczesnych requestów.
 */
export async function fetchMpzpZonesInRadius(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  stepMeters = 60,
  concurrency = 8
): Promise<MpzpZoneRawFeature[]> {
  const points = samplingGrid(centerLat, centerLon, radiusMeters, stepMeters);
  const byObjectId = new Map<string, MpzpZoneRawFeature>();

  for (let i = 0; i < points.length; i += concurrency) {
    const batch = points.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((p) => fetchZoneAtPoint(p.lat, p.lon)));
    for (const feature of results) {
      if (!feature) continue;
      const objectId = String(feature.properties?.objectid ?? '');
      if (!objectId || byObjectId.has(objectId)) continue;
      byObjectId.set(objectId, feature);
    }
  }

  return Array.from(byObjectId.values());
}
