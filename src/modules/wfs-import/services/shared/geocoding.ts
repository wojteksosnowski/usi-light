export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
}

export interface ReverseGeocodingResult {
  lat: number;
  lon: number;
  city?: string;
  district?: string;
  formattedProjectName: string;
  displayName: string;
}

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'USI-Light/1.0';
const DEBOUNCE_MS = 350;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let reverseDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function extractCityAndDistrict(address?: Record<string, string | undefined>): {
  city?: string;
  district?: string;
  formattedProjectName: string;
} {
  if (!address) {
    return { formattedProjectName: 'Projekt' };
  }

  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.hamlet;

  let district =
    address.suburb ||
    address.neighbourhood ||
    address.city_district ||
    address.district ||
    address.borough ||
    address.quarter ||
    address.residential;

  // Wyczyść ewentualne powtórzenia nazwy miasta w nazwie dzielnicy
  if (district && city && district.toLowerCase() === city.toLowerCase()) {
    district = undefined;
  }

  let formattedProjectName = 'Projekt';
  if (city && district) {
    formattedProjectName = `${city} - ${district}`;
  } else if (city) {
    formattedProjectName = city;
  } else if (district) {
    formattedProjectName = district;
  }

  return {
    city,
    district,
    formattedProjectName,
  };
}

export function reverseGeocodeLocation(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<ReverseGeocodingResult | null> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    format: 'json',
    addressdetails: '1',
  });

  return fetch(`${NOMINATIM_REVERSE_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  })
    .then((res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .then((data: { display_name?: string; address?: Record<string, string | undefined> }) => {
      if (!data) return null;
      const { city, district, formattedProjectName } = extractCityAndDistrict(data.address);
      return {
        lat,
        lon,
        city,
        district,
        formattedProjectName: formattedProjectName !== 'Projekt' ? formattedProjectName : `Lokalizacja (${lat.toFixed(2)}°N)`,
        displayName: data.display_name || formattedProjectName,
      };
    })
    .catch(() => null);
}

export function reverseGeocodeLocationDebounced(
  lat: number,
  lon: number,
  callback: (result: ReverseGeocodingResult | null) => void
): () => void {
  if (reverseDebounceTimer) clearTimeout(reverseDebounceTimer);

  const controller = new AbortController();

  reverseDebounceTimer = setTimeout(() => {
    reverseGeocodeLocation(lat, lon, controller.signal).then(callback);
  }, DEBOUNCE_MS);

  return () => {
    if (reverseDebounceTimer) clearTimeout(reverseDebounceTimer);
    controller.abort();
  };
}

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

  return fetch(`${NOMINATIM_SEARCH_URL}?${params}`, {
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

