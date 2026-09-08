/**
 * uldkClient.ts
 *
 * Klient GUGiK ULDK (Usługa Lokalizacji Działek Katastralnych)
 * Umożliwia pobieranie wektorowych geometrii działek ewidencyjnych (WKT / EPSG:2180)
 * dla obszaru CAŁEJ POLSKI bez ograniczeń CORS (Access-Control-Allow-Origin: *).
 */

import { Point2D, BuildingLoop, ObjectCategory } from '../../../types/geometry';
import { sanitizePolygon } from '../../../utils/importers/geometrySanitizer';
import {
  cadPointToWgs84,
  wgs84ToCadPoint,
  CrsDetectionResult,
  LatLon,
} from '../../../utils/geoTransform';
import { wgs84ToEpsg2180 } from '../utils/wgs84ToEpsg2180';
import { polygonCircleIntersectionRatio } from '../../../utils/math2d/polygons';


const ULDK_BASE_URL = 'https://uldk.gugik.gov.pl/';

export interface UldkParcelRaw {
  id: string;
  plotNumber: string;
  regionName?: string;
  wkt: string;
  srid: number;
}

export interface UldkParcelResult {
  parcel: BuildingLoop;
  raw: UldkParcelRaw;
}

/**
 * Parsuje geometrię WKT (POLYGON / MULTIPOLYGON) ze standardu ULDK/PostGIS.
 * Obsługuje opcjonalny prefix "SRID=2180;".
 */
export function parseWktToRings(wktString: string): Array<Array<[number, number]>> {
  if (!wktString || typeof wktString !== 'string') return [];

  // Usunięcie prefixu SRID jeśli występuje
  let clean = wktString.replace(/^SRID=\d+;/i, '').trim();

  const rings: Array<Array<[number, number]>> = [];

  // 1. Obsługa MULTIPOLYGON (((x y, ...), (x y, ...)), ((x y, ...)))
  if (clean.startsWith('MULTIPOLYGON')) {
    const coordsMatch = clean.match(/\(\(\(([\s\S]+?)\)\)\)/g) || clean.match(/\(\(([\s\S]+?)\)\)/g);
    if (coordsMatch) {
      for (const polyStr of coordsMatch) {
        const ringMatches = polyStr.match(/\(([^()]+)\)/g);
        if (ringMatches) {
          for (const ringStr of ringMatches) {
            const ring = parseCoordinateList(ringStr);
            if (ring.length >= 3) rings.push(ring);
          }
        }
      }
    }
    return rings;
  }

  // 2. Obsługa POLYGON ((x y, x y, ...), (x y, ...))
  if (clean.startsWith('POLYGON')) {
    const ringMatches = clean.match(/\(([^()]+)\)/g);
    if (ringMatches) {
      for (const ringStr of ringMatches) {
        const ring = parseCoordinateList(ringStr);
        if (ring.length >= 3) rings.push(ring);
      }
    }
    return rings;
  }

  return rings;
}

function parseCoordinateList(ringStr: string): Array<[number, number]> {
  const inner = ringStr.replace(/[()]/g, '').trim();
  const pairs = inner.split(/\s*,\s*/);
  const coords: Array<[number, number]> = [];

  for (const pair of pairs) {
    const parts = pair.trim().split(/\s+/);
    if (parts.length >= 2) {
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        coords.push([x, y]);
      }
    }
  }

  return coords;
}

/**
 * Pobiera działkę ewidencyjną z ULDK po współrzędnych X, Y w układzie EPSG:2180.
 */
export async function fetchParcelByEpsg2180(
  x2180: number,
  y2180: number,
  signal?: AbortSignal
): Promise<UldkParcelRaw | null> {
  const params = new URLSearchParams({
    request: 'GetParcelByXY',
    xy: `${x2180.toFixed(2)},${y2180.toFixed(2)}`,
    result: 'id,numer,geom_wkt',
    srid: '2180',
  });

  try {
    const res = await fetch(`${ULDK_BASE_URL}?${params}`, { signal });
    if (!res.ok) return null;
    const text = await res.text();

    const lines = text.trim().split('\n');
    // Odpowiedź ULDK ma kod statusu w pierwszej linii (0 = sukces, -1/inny = brak/błąd)
    const status = parseInt(lines[0], 10);
    if (status !== 0 || lines.length < 2) return null;

    const dataLine = lines[1].trim();
    const parts = dataLine.split('|');
    if (parts.length < 2) return null;

    const id = parts[0].trim();
    let plotNumber = '';
    let wkt = '';

    if (parts.length >= 3) {
      plotNumber = parts[1].trim();
      wkt = parts[2].trim();
    } else {
      wkt = parts[1].trim();
    }

    return {
      id,
      plotNumber,
      wkt,
      srid: 2180,
    };
  } catch {
    return null;
  }
}

/**
 * Pobiera działkę główną oraz sąsiednie działki w promieniu wokół punktu geograficznego (WGS84).
 */
export async function fetchParcelsInRadius(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon,
  signal?: AbortSignal
): Promise<BuildingLoop[]> {
  const center2180 = wgs84ToEpsg2180(centerLat, centerLon);
  const parcelsMap = new Map<string, UldkParcelRaw>();

  // Siatka próbkowania wewnątrz okręgu projektu (środek + punkty kardynalne i pośrednie)
  const steps = radiusMeters <= 50
    ? [0, 25, 45]
    : radiusMeters <= 100
      ? [0, 40, 80]
      : radiusMeters <= 200
        ? [0, 60, 120, 180]
        : [0, 100, 200, 350, 460]; // 500m — 5 pierścieni
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];

  const samplePoints: Array<{ x: number; y: number }> = [{ x: center2180.x, y: center2180.y }];

  for (const r of steps) {
    if (r === 0) continue;
    for (const a of angles) {
      const rad = (a * Math.PI) / 180;
      samplePoints.push({
        x: center2180.x + r * Math.cos(rad),
        y: center2180.y + r * Math.sin(rad),
      });
    }
  }

  // Zapytania równoległe (ULDK jest bardzo szybki i stabilny)
  const fetchPromises = samplePoints.map((pt) =>
    fetchParcelByEpsg2180(pt.x, pt.y, signal).then((raw) => {
      if (raw && raw.id && !parcelsMap.has(raw.id)) {
        parcelsMap.set(raw.id, raw);
      }
    })
  );

  await Promise.allSettled(fetchPromises);

  const sourceCrs: CrsDetectionResult = {
    crs: 'EPSG:2180',
    description: 'PL-1992 (EPSG:2180)',
    geodeticLabel: 'ETRF2000-PL / CS1992',
    isGeodetic: true,
  };

  const loops: BuildingLoop[] = [];

  for (const [id, raw] of parcelsMap) {
    const rings = parseWktToRings(raw.wkt);
    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri];
      const cadPoints: Point2D[] = ring.map(([x2180, y2180]) => {
        // Konwersja EPSG:2180 -> WGS84 -> CAD
        const latLon = cadPointToWgs84({ x: x2180, y: y2180 }, sourceCrs);
        return wgs84ToCadPoint(latLon, projectCrs, projectCenter);
      });

      const loopId = ri === 0 ? `uldk-${id}` : `uldk-${id}-r${ri}`;
      const sanitized = sanitizePolygon(cadPoints, {
        buildingId: loopId,
        defaultHeight: 0,
        buildingType: 'residential',
        isCityCentre: false,
      });

      if (!sanitized.valid) continue;

      // Filtr zasięgu: działka musi mieć co najmniej 50% powierzchni wewnątrz okręgu projektu
      const ratio = polygonCircleIntersectionRatio(sanitized.vertices, 0, 0, radiusMeters);
      if (ratio < 0.5) continue;

      loops.push({
        id: loopId,
        name: raw.plotNumber ? `Działka nr ${raw.plotNumber}` : `Działka ${id}`,
        layer: 'WFS_DZIALKI',
        category: 'boundary' as ObjectCategory,
        areaType: 'plot',
        plotNumber: raw.plotNumber || undefined,
        isTested: false,
        isIncluded: true,
        isLocked: true,
        isCityCentre: false,
        buildingType: 'residential',
        defaultHeight: 0,
        hWindowBottom: 0,
        elevation: 0.0,
        firstFloorHeight: 0,
        typicalFloorHeight: 0,
        storeysCount: 0,
        vertices: sanitized.vertices,
        segments: sanitized.segments,
        isClockwise: !sanitized.isCCW,
        transform: { tx: 0, ty: 0, rotationDeg: 0 },
      });
    }
  }

  return loops;
}
