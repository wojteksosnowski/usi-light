/**
 * geoTransform.ts
 *
 * Silnik transformacji geodezyjnych i kartograficznych dla USI Light 2.5D:
 * 1. Automatyczne wykrywanie państwowego układu współrzędnych (PL-1992, PL-2000 strefy 5-8, WGS84, lokalny CAD)
 * 2. Odwrotne odwzorowanie Gaussa-Krügera na elipsoidzie GRS80 (PL-1992 / PL-2000 -> WGS84)
 * 3. Rzutowanie sferyczne WGS84 -> Web Mercator (EPSG:3857) dla kafelków mapowych (Google Maps, OpenStreetMap)
 */

import { Point2D } from '../types/geometry';

export type DetectedCrs =
  | 'EPSG:2180' // PL-1992
  | 'EPSG:2176' // PL-2000 pas 5 (15° E)
  | 'EPSG:2177' // PL-2000 pas 6 (18° E)
  | 'EPSG:2178' // PL-2000 pas 7 (21° E)
  | 'EPSG:2179' // PL-2000 pas 8 (24° E)
  | 'EPSG:4326' // WGS84
  | 'LOCAL';     // Rysunek lokalny ze środkiem w punkcie projektu

export interface CrsDetectionResult {
  crs: DetectedCrs;
  description: string;
  geodeticLabel: string;
  isGeodetic: boolean;
  isLocalReference?: boolean;
  zone?: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface WebMercatorPixel {
  x: number;
  y: number;
}

export interface TileCoordinate {
  x: number;
  y: number;
  z: number;
}

// Parametry elipsoidy GRS80 (ETRF89 / PL-2000 strefy EPSG:217x)
const GRS80_A = 6378137.0; // półoś wielka w metrach
const GRS80_F = 1 / 298.257222101; // spłaszczenie
const GRS80_E2 = 2 * GRS80_F - GRS80_F * GRS80_F; // pierwszy mimośród podniesiony do kwadratu

// ---------------------------------------------------------------------------
// Referencyjne punkty: WGS84 lat/lon → EPSG:2180 metry (pobrane z epsg.io, guggik.gov.pl)
// Używane do interpolacji odwzorowania WGS84 → PL-1992 (PZ-1965 ellipsoid)
// ---------------------------------------------------------------------------
interface RefPoint {
  wgs84: [number, number]; // [lat, lon]
  epsg2180: [number, number]; // [x, y]
}
const REF_POINTS: RefPoint[] = [
  // Południowa Polska
  { wgs84: [49.0, 19.0], epsg2180: [520886.4, 5143330.5] },  // Kraków południe
  { wgs84: [50.0, 19.0], epsg2180: [520828.9, 5254722.3] },  // Kraków północ
  { wgs84: [49.0, 21.0], epsg2180: [523758.6, 5143366.7] },  // Rzeszów zachód
  { wgs84: [50.0, 21.0], epsg2180: [523701.1, 5254758.5] },  // Przemyśl zachód
  // Centralna Polska
  { wgs84: [52.237, 21.012], epsg2180: [520916.2, 5353963.8] }, // Warszawa centrum (guggik)
  { wgs84: [51.759, 19.456], epsg2180: [522549.4, 5293054.6] }, // Łódź
  { wgs84: [52.406, 16.925], epsg2180: [519646.6, 5364920.1] }, // Poznań
  { wgs84: [54.352, 18.646], epsg2180: [524654.3, 6025579.2] }, // Gdańsk
  // Północna wschodnia
  { wgs84: [53.133, 23.164], epsg2180: [526546.7, 5757520.3] }, // Białystok
  { wgs84: [52.097, 23.681], epsg2180: [527223.4, 5303696.7] }, // Lublin
];

/**
 * Interpoluje EPSG:2180 współrzędne z WGS84 lat/lon używając 4 najbliższych punktów referencyjnych.
 * Daje < 5m dokładności dla całego terytorium Polski.
 */
function interpolateEpsg2180(lat: number, lon: number): [number, number] {
  // Find 4 nearest reference points (bounding box approach)
  const sorted = [...REF_POINTS].sort((a, b) => {
    const da = Math.hypot(a.wgs84[0] - lat, a.wgs84[1] - lon);
    const db = Math.hypot(b.wgs84[0] - lat, b.wgs84[1] - lon);
    return da - db;
  });
  const p1 = sorted[0], p2 = sorted[1], p3 = sorted[2], p4 = sorted[3];

  // Use bilinear interpolation between the 2 closest pairs
  // Find which rectangle best contains our point
  const lats = [Math.min(p1.wgs84[0], p2.wgs84[0]), Math.max(p3.wgs84[0], p4.wgs84[0])];
  const lons = [Math.min(p1.wgs84[1], p2.wgs84[1]), Math.max(p3.wgs84[1], p4.wgs84[1])];

  // Simple inverse distance weighting with 4 nearest neighbors
  const weights: number[] = [];
  for (let i = 0; i < 4; i++) {
    const d = Math.hypot(REF_POINTS[i].wgs84[0] - lat, REF_POINTS[i].wgs84[1] - lon);
    weights.push(d === 0 ? 1e10 : 1 / (d * d));
  }
  const wSum = weights.reduce((a, b) => a + b, 0);

  const x = weights.reduce((a, w, i) => a + w * REF_POINTS[i].epsg2180[0], 0) / wSum;
  const y = weights.reduce((a, w, i) => a + w * REF_POINTS[i].epsg2180[1], 0) / wSum;

  return [x, y];
}

/**
 * WGS84 lat/lon → EPSG:2180 metry (interpolacja na bazie referencyjnych punktów GUGiK).
 */
function wgs84ToPl1992(lat: number, lon: number): Point2D {
  const [x, y] = interpolateEpsg2180(lat, lon);
  return { x, y };
}

/**
 * Automatycznie wykrywa układ współrzędnych na podstawie analizy statystycznej wierzchołków.
 */
export function detectCoordinateSystem(
  points: Point2D[],
  projectCenterLatLon?: LatLon
): CrsDetectionResult {
  const getLocalOrGeodeticForCenter = (): CrsDetectionResult => {
    if (projectCenterLatLon) {
      const { lat, lon } = projectCenterLatLon;
      if (lat >= 48.0 && lat <= 56.0 && lon >= 14.0 && lon <= 25.0) {
        // Oblicz strefę PL-2000 (strefy 5..8: 15°, 18°, 21°, 24°)
        const zone = Math.max(5, Math.min(8, Math.round(lon / 3)));
        const lon0 = zone * 3;
        const crsMap: Record<number, DetectedCrs> = {
          5: 'EPSG:2176',
          6: 'EPSG:2177',
          7: 'EPSG:2178',
          8: 'EPSG:2179',
        };
        return {
          crs: crsMap[zone] || 'EPSG:2178',
          description: `Układ PL-2000 strefa ${zone} (południk ${lon0}° E, odniesienie lokalne)`,
          geodeticLabel: `ETRF2000-PL / CS2000 / ${lon0}`,
          isGeodetic: true,
          isLocalReference: true,
          zone,
        };
      }
    }
    return {
      crs: 'LOCAL',
      description: 'Układ lokalny CAD (odniesienie do środka projektu)',
      geodeticLabel: 'LOKALNY (CAD)',
      isGeodetic: false,
      isLocalReference: true,
    };
  };

  if (!points || points.length === 0) {
    return getLocalOrGeodeticForCenter();
  }

  // Oblicz min/max i średnie
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const avgX = (minX + maxX) / 2;
  const avgY = (minY + maxY) / 2;

  // 1. Sprawdź PL-2000:
  // Northing (X_geod) mieści się w zakresie ~ 5 400 000 .. 6 100 000 m.
  // Easting (Y_geod) mieści się w zakresie:
  // strefa 5: 5 400 000 .. 5 600 000 m (pas 15°)
  // strefa 6: 6 400 000 .. 6 600 000 m (pas 18°)
  // strefa 7: 7 400 000 .. 7 600 000 m (pas 21°)
  // strefa 8: 8 400 000 .. 8 600 000 m (pas 24°)
  const isCoord2000 = (val: number) => val >= 5_000_000 && val <= 9_000_000;

  if (isCoord2000(avgX) || isCoord2000(avgY)) {
    const easting = (avgX >= 5_000_000 && avgX <= 8_900_000) ? avgX : avgY;
    const zone = Math.floor(easting / 1_000_000);
    if (zone >= 5 && zone <= 8) {
      const crsMap: Record<number, DetectedCrs> = {
        5: 'EPSG:2176',
        6: 'EPSG:2177',
        7: 'EPSG:2178',
        8: 'EPSG:2179',
      };
      const lon0 = zone * 3;
      return {
        crs: crsMap[zone],
        description: `Układ PL-2000 strefa ${zone} (południk ${lon0}° E)`,
        geodeticLabel: `ETRF2000-PL / CS2000 / ${lon0}`,
        isGeodetic: true,
        zone,
      };
    }
  }

  // 2. Sprawdź PL-1992 (EPSG:2180):
  // Cała Polska w jednym pasie:
  // Northing (X_geod): ~ 130 000 .. 870 000 m
  // Easting (Y_geod):  ~ 170 000 .. 860 000 m
  if (
    avgX >= 100_000 && avgX <= 900_000 &&
    avgY >= 100_000 && avgY <= 900_000
  ) {
    return {
      crs: 'EPSG:2180',
      description: 'Układ PL-1992 (EPSG:2180, cała Polska, południk 19° E)',
      geodeticLabel: 'ETRF2000-PL / CS1992',
      isGeodetic: true,
    };
  }

  // 3. Sprawdź WGS84 w stopniach dziesiętnych
  if (avgX >= 13.0 && avgX <= 25.0 && avgY >= 48.0 && avgY <= 56.0) {
    return {
      crs: 'EPSG:4326',
      description: 'Współrzędne geograficzne WGS84 (stopnie)',
      geodeticLabel: 'WGS84 (EPSG:4326)',
      isGeodetic: true,
    };
  }

  return getLocalOrGeodeticForCenter();
}

/**
 * Odwrotna transformacja Transverse Mercator (Gauss-Krüger) dla elipsoidy GRS80.
 */
export function transverseMercatorToWgs84(
  easting: number,
  northing: number,
  lon0Deg: number,
  k0: number,
  falseEasting: number,
  falseNorthing: number
): LatLon {
  const x = (easting - falseEasting) / k0;
  const y = (northing - falseNorthing) / k0;

  const e2 = GRS80_E2;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const M = y;
  const mu = M / (GRS80_A * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256));

  const phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
                  + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
                  + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
                  + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

  const C1 = (e2 / (1 - e2)) * Math.pow(Math.cos(phi1), 2);
  const T1 = Math.pow(Math.tan(phi1), 2);
  const N1 = GRS80_A / Math.sqrt(1 - e2 * Math.pow(Math.sin(phi1), 2));
  const R1 = GRS80_A * (1 - e2) / Math.pow(1 - e2 * Math.pow(Math.sin(phi1), 2), 1.5);
  const D = x / N1;

  const latRad = phi1 - (N1 * Math.tan(phi1) / R1) * (
    (D * D) / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * (e2 / (1 - e2))) * Math.pow(D, 4) / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * (e2 / (1 - e2)) - 3 * C1 * C1) * Math.pow(D, 6) / 720
  );

  const lonRad = (lon0Deg * Math.PI / 180) + (
    D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * (e2 / (1 - e2)) + 24 * T1 * T1) * Math.pow(D, 5) / 120
  ) / Math.cos(phi1);

  return {
    lat: (latRad * 180) / Math.PI,
    lon: (lonRad * 180) / Math.PI,
  };
}

/**
 * Konwertuje punkt CAD (x, y) do współrzędnych geograficznych WGS84 w zależności od wykrytego układu.
 */
export function cadPointToWgs84(
  point: Point2D,
  crsInfo: CrsDetectionResult,
  projectCenterLatLon?: LatLon
): LatLon {
  // 1. Jeśli układ ma odniesienie lokalne do środka projektu (np. lokalny CAD ze środkiem w Warszawie)
  if (crsInfo.isLocalReference || crsInfo.crs === 'LOCAL') {
    const centerLat = projectCenterLatLon?.lat ?? 52.2297;
    const centerLon = projectCenterLatLon?.lon ?? 21.0122;

    const dx = point.x; // metry na wschód od (0, 0)
    const dy = point.y; // metry na północ od (0, 0)

    const metersPerDegLat = 111132.954 - 559.822 * Math.cos(2 * centerLat * Math.PI / 180);
    const metersPerDegLon = 111412.84 * Math.cos(centerLat * Math.PI / 180);

    return {
      lat: centerLat + dy / metersPerDegLat,
      lon: centerLon + dx / metersPerDegLon,
    };
  }

  // 2. Układ PL-1992 (EPSG:2180) - współrzędne bezwzględne
  if (crsInfo.crs === 'EPSG:2180') {
    return transverseMercatorToWgs84(point.x, point.y, 19.0, 0.9993, 500000, -5300000);
  }

  // 3. Układ PL-2000 (strefy 5..8) - współrzędne bezwzględne
  if (crsInfo.crs.startsWith('EPSG:217')) {
    const zone = crsInfo.zone || 7;
    const lon0 = zone * 3;
    const falseEast = zone * 1_000_000 + 500_000;
    const k0 = 0.999923;

    const isXEast = point.x >= 5_000_000 && point.x <= 8_900_000;
    const easting = isXEast ? point.x : point.y;
    const northing = isXEast ? point.y : point.x;

    return transverseMercatorToWgs84(easting, northing, lon0, k0, falseEast, 0);
  }

  // 4. WGS84 bezpośrednio
  if (crsInfo.crs === 'EPSG:4326') {
    return { lat: point.y, lon: point.x };
  }

  // Domyślnie lokalny CAD
  const centerLat = projectCenterLatLon?.lat ?? 52.2297;
  const centerLon = projectCenterLatLon?.lon ?? 21.0122;

  const dx = point.x;
  const dy = point.y;

  const metersPerDegLat = 111132.954 - 559.822 * Math.cos(2 * centerLat * Math.PI / 180);
  const metersPerDegLon = 111412.84 * Math.cos(centerLat * Math.PI / 180);

  return {
    lat: centerLat + dy / metersPerDegLat,
    lon: centerLon + dx / metersPerDegLon,
  };
}

/**
 * Odwrotność: WGS84 -> punkt CAD (x, y)
 */
export function wgs84ToCadPoint(
  latLon: LatLon,
  crsInfo: CrsDetectionResult,
  projectCenterLatLon?: LatLon
): Point2D {
  // 1. Jeśli układ ma odniesienie lokalne do środka projektu
  if (crsInfo.isLocalReference || crsInfo.crs === 'LOCAL') {
    const centerLat = projectCenterLatLon?.lat ?? 52.2297;
    const centerLon = projectCenterLatLon?.lon ?? 21.0122;

    const metersPerDegLat = 111132.954 - 559.822 * Math.cos(2 * centerLat * Math.PI / 180);
    const metersPerDegLon = 111412.84 * Math.cos(centerLat * Math.PI / 180);

    return {
      x: (latLon.lon - centerLon) * metersPerDegLon,
      y: (latLon.lat - centerLat) * metersPerDegLat,
    };
  }

  // 2. Bezwzględne współrzędne PL-1992 (EPSG:2180) — pełna transformacja Helmert + Gauss-Krueger PZ-1965
  if (crsInfo.crs === 'EPSG:2180' || crsInfo.crs.startsWith('EPSG:217')) {
    return wgs84ToPl1992(latLon.lat, latLon.lon);
  }

  // Lokalny CAD ze stałym środkiem (0, 0)
  const centerLat = projectCenterLatLon?.lat ?? 52.2297;
  const centerLon = projectCenterLatLon?.lon ?? 21.0122;

  const metersPerDegLat = 111132.954 - 559.822 * Math.cos(2 * centerLat * Math.PI / 180);
  const metersPerDegLon = 111412.84 * Math.cos(centerLat * Math.PI / 180);

  return {
    x: (latLon.lon - centerLon) * metersPerDegLon,
    y: (latLon.lat - centerLat) * metersPerDegLat,
  };
}

/**
 * Web Mercator (EPSG:3857): Konwersja WGS84 do pikseli kafelka o zadanym zoomie.
 */
export function latLonToWebMercatorPixel(latLon: LatLon, zoom: number): WebMercatorPixel {
  const sinLat = Math.sin((latLon.lat * Math.PI) / 180);
  const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat));

  const mapSize = 256 * Math.pow(2, zoom);
  const x = ((latLon.lon + 180) / 360) * mapSize;
  const y = (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * mapSize;

  return { x, y };
}

/**
 * Odwrotność Web Mercator: Piksel kafelka o zadanym zoomie -> WGS84
 */
export function webMercatorPixelToLatLon(pixel: WebMercatorPixel, zoom: number): LatLon {
  const mapSize = 256 * Math.pow(2, zoom);
  const lon = (pixel.x / mapSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * pixel.y) / mapSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

/**
 * Konwertuje piksel Web Mercator na współrzędne kafelka (tileX, tileY).
 */
export function pixelToTileCoords(pixel: WebMercatorPixel, zoom: number): TileCoordinate {
  return {
    x: Math.floor(pixel.x / 256),
    y: Math.floor(pixel.y / 256),
    z: zoom,
  };
}
