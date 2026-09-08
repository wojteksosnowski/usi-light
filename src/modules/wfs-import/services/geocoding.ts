export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'USI-Light/1.0';
const DEBOUNCE_MS = 350;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function geocodeAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeocodingResult | null> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return Promise.resolve(null);

  const params = new URLSearchParams({
    q: trimmed,
    format: 'json',
    limit: '1',
    countrycodes: 'pl',
    addressdetails: '1',
  });

  return fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  })
    .then((res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .then((data: Array<{ lat: string; lon: string; display_name: string }>) => {
      if (!data || data.length === 0) return null;
      const hit = data[0];
      return {
        lat: parseFloat(hit.lat),
        lon: parseFloat(hit.lon),
        displayName: hit.display_name,
      };
    })
    .catch(() => null);
}

export function geocodeAddressDebounced(
  query: string,
  callback: (result: GeocodingResult | null) => void
): () => void {
  if (debounceTimer) clearTimeout(debounceTimer);

  const controller = new AbortController();

  debounceTimer = setTimeout(() => {
    geocodeAddress(query, controller.signal).then(callback);
  }, DEBOUNCE_MS);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    controller.abort();
  };
}

export function latLonToBbox(
  lat: number,
  lon: number,
  radiusMeters: number
): [number, number, number, number] {
  const latDelta = radiusMeters / 111_320;
  const lonDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    lon - lonDelta,
    lat - latDelta,
    lon + lonDelta,
    lat + latDelta,
  ];
}
