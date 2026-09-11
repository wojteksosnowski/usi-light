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

export type Ring = Array<[number, number]>;

/** Jedna część wielokąta: pierścień zewnętrzny + ewentualne pierścienie-otwory (enklawy). */
export interface PolygonPart {
  outer: Ring;
  holes: Ring[];
}

/**
 * Parsuje geometrię WKT (POLYGON / MULTIPOLYGON) ze standardu ULDK/PostGIS.
 * Obsługuje opcjonalny prefix "SRID=2180;".
 * Zachowuje przynależność pierścieni: pierwszy pierścień każdej części to granica
 * zewnętrzna, kolejne to otwory (np. działka-enklawa wycięta w środku innej działki).
 */
export function parseWktToPolygonParts(wktString: string): PolygonPart[] {
  if (!wktString || typeof wktString !== 'string') return [];

  // Usunięcie prefixu SRID jeśli występuje
  const clean = wktString.replace(/^SRID=\d+;/i, '').trim();

  const parts: PolygonPart[] = [];

  const ringGroupToPart = (ringGroup: string): PolygonPart | null => {
    const ringStrs = splitTopLevel(ringGroup);
    const rings: Ring[] = [];
    for (const ringStr of ringStrs) {
      const ring = parseCoordinateList(stripOuterParens(ringStr));
      if (ring.length >= 3) rings.push(ring);
    }
    if (rings.length === 0) return null;
    return { outer: rings[0], holes: rings.slice(1) };
  };

  // 1. Obsługa MULTIPOLYGON((poly1 rings...), (poly2 rings...), ...)
  if (clean.startsWith('MULTIPOLYGON')) {
    const inner = extractOuterParenContent(clean, 'MULTIPOLYGON');
    if (inner) {
      const polyGroups = splitTopLevel(inner);
      for (const polyGroup of polyGroups) {
        const part = ringGroupToPart(stripOuterParens(polyGroup));
        if (part) parts.push(part);
      }
    }
    return parts;
  }

  // 2. Obsługa POLYGON((x y, x y, ...), (x y, ...))
  if (clean.startsWith('POLYGON')) {
    const inner = extractOuterParenContent(clean, 'POLYGON');
    if (inner) {
      const part = ringGroupToPart(inner);
      if (part) parts.push(part);
    }
    return parts;
  }

  return parts;
}

/** Zwraca zawartość między najbardziej zewnętrznymi nawiasami po nazwie typu geometrii WKT. */
function extractOuterParenContent(clean: string, typeName: string): string | null {
  const rest = clean.slice(typeName.length).trim();
  if (!rest.startsWith('(') || !rest.endsWith(')')) return null;
  return rest.slice(1, -1);
}

function stripOuterParens(s: string): string {
  const t = s.trim();
  if (t.startsWith('(') && t.endsWith(')')) return t.slice(1, -1);
  return t;
}

/** Dzieli listę oddzieloną przecinkami na najwyższym poziomie zagnieżdżenia nawiasów. */
function splitTopLevel(s: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
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

  // ULDK nie oferuje zapytania obszarowego (tylko point-lookup GetParcelByXY),
  // więc kompletność pokrycia zależy wyłącznie od gęstości siatki próbkowania.
  // Siatka kwadratowa pokrywająca cały okrąg zasięgu, z krokiem poniżej typowej
  // szerokości najwęższej działki miejskiej — żeby nie przeoczyć wąskich/małych działek
  // leżących między punktami próbkowania.
  const GRID_STEP_METERS = radiusMeters <= 100 ? 10 : radiusMeters <= 200 ? 14 : 18;
  const samplePoints: Array<{ x: number; y: number }> = [];
  for (let dx = -radiusMeters; dx <= radiusMeters; dx += GRID_STEP_METERS) {
    for (let dy = -radiusMeters; dy <= radiusMeters; dy += GRID_STEP_METERS) {
      if (dx * dx + dy * dy <= radiusMeters * radiusMeters) {
        samplePoints.push({ x: center2180.x + dx, y: center2180.y + dy });
      }
    }
  }

  // Zapytania w batchach równoległych (ULDK jest szybki, ale siatka może liczyć
  // setki punktów dla większych promieni — unikamy jednorazowego zalewu tysiącami fetchy).
  const SAMPLE_CONCURRENCY = 24;
  for (let i = 0; i < samplePoints.length; i += SAMPLE_CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = samplePoints.slice(i, i + SAMPLE_CONCURRENCY);
    await Promise.allSettled(
      batch.map((pt) =>
        fetchParcelByEpsg2180(pt.x, pt.y, signal).then((raw) => {
          if (raw && raw.id && !parcelsMap.has(raw.id)) {
            parcelsMap.set(raw.id, raw);
          }
        })
      )
    );
  }

  const sourceCrs: CrsDetectionResult = {
    crs: 'EPSG:2180',
    description: 'PL-1992 (EPSG:2180)',
    geodeticLabel: 'ETRF2000-PL / CS1992',
    isGeodetic: true,
  };

  const loops: BuildingLoop[] = [];

  for (const [id, raw] of parcelsMap) {
    const parts = parseWktToPolygonParts(raw.wkt);
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      // Uwaga: renderujemy wyłącznie granicę zewnętrzną części wielokąta.
      // Pierścienie-otwory (np. działka-enklawa wycięta w środku innej działki) NIE są
      // wycinane z bryły — BuildingLoop nie ma koncepcji wielopierścieniowego wielokąta.
      // Zamiast tworzyć fantomową, nakładającą się bryłę w miejscu otworu (jak poprzednio),
      // po prostu pomijamy pierścienie-otwory i sygnalizujemy to w konsoli.
      if (part.holes.length > 0) {
        console.warn(
          `[ULDK] Działka ${id} (część ${pi}) zawiera ${part.holes.length} nieodwzorowany(ch) otwór(ów) — ` +
          `render pominie wycięcie enklawy w środku bryły.`
        );
      }

      const cadPoints: Point2D[] = part.outer.map(([x2180, y2180]) => {
        // Konwersja EPSG:2180 -> WGS84 -> CAD
        const latLon = cadPointToWgs84({ x: x2180, y: y2180 }, sourceCrs);
        return wgs84ToCadPoint(latLon, projectCrs, projectCenter);
      });

      const loopId = pi === 0 ? `uldk-${id}` : `uldk-${id}-p${pi}`;
      const sanitized = sanitizePolygon(cadPoints, {
        buildingId: loopId,
        defaultHeight: 0,
        buildingType: 'residential',
        isCityCentre: false,
      });

      if (!sanitized.valid) continue;

      // Filtr zasięgu: działka musi mieć co najmniej 10% powierzchni wewnątrz okręgu projektu
      const ratio = polygonCircleIntersectionRatio(sanitized.vertices, 0, 0, radiusMeters);
      if (ratio < 0.1) continue;

      loops.push({
        id: loopId,
        name: raw.plotNumber
          ? `Działka nr ${raw.plotNumber}${part.holes.length > 0 ? ' (⚠ zawiera nieodwzorowany otwór)' : ''}`
          : `Działka ${id}`,
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
