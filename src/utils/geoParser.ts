/**
 * Narzędzie do parsowania linków Google Maps oraz ciągów współrzędnych geograficznych.
 */

export interface ParsedLocation {
  latitude: number;
  longitude: number;
  label?: string;
}

/**
 * Parsuje link Google Maps (lub współrzędne w różnych formatach) i zwraca { latitude, longitude, label }.
 */
export function parseGoogleMapsCoordinates(input: string): ParsedLocation | null {
  if (!input || typeof input !== 'string') return null;
  let decoded = input.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // ignore decode error
  }
  // Replace '+' (URL encoded space) with space
  const normalized = decoded.replace(/\+/g, ' ');

  // 1. Sprawdź wzorzec danych protobuf Google Maps: !3d<lat>!4d<lon> (dokładniejsze współrzędne obiektu)
  const dataMatch = normalized.match(/!3d(-?\d+(?:\.\d+)?)[^\d-]*!4d(-?\d+(?:\.\d+)?)/);
  if (dataMatch) {
    const lat = parseFloat(dataMatch[1]);
    const lon = parseFloat(dataMatch[2]);
    if (isValidLatLon(lat, lon)) {
      return { latitude: lat, longitude: lon, label: extractPlaceName(normalized) };
    }
  }

  // 2. Sprawdź standardowy wzorzec kamery Google Maps: @<lat>,<lon>
  const atMatch = normalized.match(/@(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lon = parseFloat(atMatch[2]);
    if (isValidLatLon(lat, lon)) {
      return { latitude: lat, longitude: lon, label: extractPlaceName(normalized) };
    }
  }

  // 3. Sprawdź parametry URL: ?q=lat,lon lub ?ll=lat,lon lub ?query=lat,lon lub ?sll=lat,lon
  const qMatch = normalized.match(/[?&](?:q|ll|query|sll)=(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lon = parseFloat(qMatch[2]);
    if (isValidLatLon(lat, lon)) {
      return { latitude: lat, longitude: lon, label: extractPlaceName(normalized) };
    }
  }

  // 4. Sprawdź ścieżkę wyszukiwania: /search/<lat>,<lon> lub /place/<lat>,<lon>
  const searchMatch = normalized.match(/(?:\/search\/|\/place\/)(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
  if (searchMatch) {
    const lat = parseFloat(searchMatch[1]);
    const lon = parseFloat(searchMatch[2]);
    if (isValidLatLon(lat, lon)) {
      return { latitude: lat, longitude: lon, label: extractPlaceName(normalized) };
    }
  }

  // 5. Sprawdź format DMS: np. 52°13'47.1"N 21°00'44.0"E
  const dmsMatch = normalized.match(
    /(\d+)°(?:\s*(\d+)'?)?(?:\s*(\d+(?:\.\d+)?)"?)?\s*([NSns])[,;\s]+(\d+)°(?:\s*(\d+)'?)?(?:\s*(\d+(?:\.\d+)?)"?)?\s*([EWew])/
  );
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1], 10) + (parseInt(dmsMatch[2] || '0', 10) / 60) + (parseFloat(dmsMatch[3] || '0') / 3600);
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
    let lon = parseInt(dmsMatch[5], 10) + (parseInt(dmsMatch[6] || '0', 10) / 60) + (parseFloat(dmsMatch[7] || '0') / 3600);
    if (dmsMatch[8].toUpperCase() === 'W') lon = -lon;
    if (isValidLatLon(lat, lon)) {
      return { latitude: lat, longitude: lon };
    }
  }

  // 6. Sprawdź czyste współrzędne dziesiętne: "52.2297, 21.0122" lub "52.2297° N, 21.0122° E"
  const cleanCoords = normalized.replace(/[°NSEWnsew]/g, '').trim();
  const rawMatch = cleanCoords.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1]);
    const lon = parseFloat(rawMatch[2]);
    if (isValidLatLon(lat, lon)) {
      return { latitude: lat, longitude: lon };
    }
  }

  return null;
}

function isValidLatLon(lat: number, lon: number): boolean {
  return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function extractPlaceName(url: string): string | undefined {
  const placeMatch = url.match(/\/place\/([^/@?]+)/);
  if (placeMatch && placeMatch[1]) {
    try {
      const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      const clean = decoded.replace(/[,+]/g, ' ').trim();
      return clean.length > 0 && !/^-?\d+/.test(clean) ? clean.slice(0, 30) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
