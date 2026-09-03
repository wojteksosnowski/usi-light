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
  isGeodetic: boolean;
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

// Parametry elipsoidy GRS80 (zgodne z ETRF89 / PL-1992 / PL-2000)
const GRS80_A = 6378137.0; // półoś wielka w metrach
const GRS80_F = 1 / 298.257222101; // spłaszczenie
const GRS80_E2 = 2 * GRS80_F - GRS80_F * GRS80_F; // pierwszy mimośród podniesiony do kwadratu

/**
 * Automatycznie wykrywa układ współrzędnych na podstawie analizy statystycznej wierzchołków.
 */
export function detectCoordinateSystem(points: Point2D[]): CrsDetectionResult {
  if (!points || points.length === 0) {
    return {
      crs: 'LOCAL',
      description: 'Układ lokalny CAD (punkt odniesienia z ustawień projektu)',
      isGeodetic: false,
    };
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
  // strefa 5: 5 400 000 .. 5 600 000 m
  // strefa 6: 6 400 000 .. 6 600 000 m
  // strefa 7: 7 400 000 .. 7 600 000 m
  // strefa 8: 8 400 000 .. 8 600 000 m
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
      return {
        crs: crsMap[zone],
        description: `Układ PL-2000 strefa ${zone} (południk ${(zone * 3)}° E)`,
        isGeodetic: true,
        zone,
      };
    }
  }

  // 2. Sprawdź PL-1992 (EPSG:2180):
  // Cała Polska w jednym pasie:
  // Northing (X_geod): ~ 130 000 .. 870 000 m
  // Easting (Y_geod):  ~ 170 000 .. 860 000 m
  // Przykład z reference/mapa.dxf: X_cad = 573200, Y_cad = 246100 (Kraków)
  if (
    avgX >= 100_000 && avgX <= 900_000 &&
    avgY >= 100_000 && avgY <= 900_000
  ) {
    return {
      crs: 'EPSG:2180',
      description: 'Układ PL-1992 (EPSG:2180, cała Polska, południk 19° E)',
      isGeodetic: true,
    };
  }

  // 3. Sprawdź WGS84 w stopniach dziesiętnych
  if (avgX >= 13.0 && avgX <= 25.0 && avgY >= 48.0 && avgY <= 56.0) {
    return {
      crs: 'EPSG:4326',
      description: 'Współrzędne geograficzne WGS84 (stopnie)',
      isGeodetic: true,
    };
  }

  return {
    crs: 'LOCAL',
    description: 'Układ lokalny CAD (odniesienie do środka projektu)',
    isGeodetic: false,
  };
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
  // 1. Układ PL-1992 (EPSG:2180)
  if (crsInfo.crs === 'EPSG:2180') {
    return transverseMercatorToWgs84(point.x, point.y, 19.0, 0.9993, 500000, -5300000);
  }

  // 2. Układ PL-2000 (strefy 5..8)
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

  // 3. WGS84 bezpośrednio
  if (crsInfo.crs === 'EPSG:4326') {
    return { lat: point.y, lon: point.x };
  }

  // 4. Układ lokalny CAD wokół zadanego centrum projektu
  // Stały punkt bazowy: punkt CAD (0,0) odpowiada dokładnie (centerLat, centerLon).
  // Dzięki temu ruch obiektów/budynków na scenie NIE powoduje przesuwania podkładu satelitarnego (zero efektu paralaksy).
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

/**
 * Odwrotność: WGS84 -> punkt CAD (x, y)
 */
export function wgs84ToCadPoint(
  latLon: LatLon,
  crsInfo: CrsDetectionResult,
  projectCenterLatLon?: LatLon
): Point2D {
  if (crsInfo.crs === 'EPSG:2180' || crsInfo.crs.startsWith('EPSG:217')) {
    // Forward Gauss-Kruger
    const lon0 = crsInfo.crs === 'EPSG:2180' ? 19.0 : (crsInfo.zone || 7) * 3;
    const k0 = crsInfo.crs === 'EPSG:2180' ? 0.9993 : 0.999923;
    const falseEast = crsInfo.crs === 'EPSG:2180' ? 500000 : (crsInfo.zone || 7) * 1_000_000 + 500_000;
    const falseNorth = crsInfo.crs === 'EPSG:2180' ? -5300000 : 0;

    const latRad = (latLon.lat * Math.PI) / 180;
    const lonRad = (latLon.lon * Math.PI) / 180;
    const lon0Rad = (lon0 * Math.PI) / 180;

    const e2 = GRS80_E2;
    const N = GRS80_A / Math.sqrt(1 - e2 * Math.pow(Math.sin(latRad), 2));
    const T = Math.pow(Math.tan(latRad), 2);
    const C = (e2 / (1 - e2)) * Math.pow(Math.cos(latRad), 2);
    const A = (lonRad - lon0Rad) * Math.cos(latRad);

    const M = GRS80_A * (
      (1 - e2/4 - 3*e2*e2/64 - 5*Math.pow(e2, 3)/256) * latRad
      - (3*e2/8 + 3*e2*e2/32 + 45*Math.pow(e2, 3)/1024) * Math.sin(2*latRad)
      + (15*e2*e2/256 + 45*Math.pow(e2, 3)/1024) * Math.sin(4*latRad)
      - (35*Math.pow(e2, 3)/3072) * Math.sin(6*latRad)
    );

    const x = falseEast + k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * (e2 / (1 - e2))) * Math.pow(A, 5) / 120);
    const y = falseNorth + k0 * (M + N * Math.tan(latRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * (e2 / (1 - e2))) * Math.pow(A, 6) / 720));

    return { x, y };
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
