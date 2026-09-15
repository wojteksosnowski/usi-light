/**
 * uldkClient.ts
 *
 * Klient GUGiK ULDK (Usługa Lokalizacji Działek Katastralnych)
 * Umożliwia pobieranie wektorowych geometrii działek ewidencyjnych (WKT / EPSG:2180)
 * dla obszaru CAŁEJ POLSKI bez ograniczeń CORS (Access-Control-Allow-Origin: *).
 */

import { Point2D, Vector2D, BuildingLoop, ObjectCategory } from '../../../types/geometry';
import { sanitizePolygon } from '../../../utils/importers/geometrySanitizer';
import {
  cadPointToWgs84,
  wgs84ToCadPoint,
  CrsDetectionResult,
  LatLon,
} from '../../../utils/geoTransform';
import { wgs84ToEpsg2180 } from '../utils/wgs84ToEpsg2180';
import { polygonCircleIntersectionRatio, isPolygonCCW, isPointInPolygon, computePointsBoundingBox } from '../../../utils/math2d/polygons';
import { calculateOutwardNormal } from '../../../utils/math2d/vec2';
import { rebuildBuildingSegments } from '../../../utils/segmentStatistics';
import { ensureOppositeWinding } from '../../../utils/ringSegments';


const ULDK_BASE_URL = 'https://uldk.gugik.gov.pl/';

/** Limity ekspansji BFS wykrywania sąsiednich działek (patrz `fetchParcelsInRadius`). */
const UldkExpansionLimits = {
  MIN_EXPANSION_MARGIN_METERS: 30,
  MAX_PROBE_COUNT: 5000,
  MAX_PARCEL_COUNT: 500,
} as const;

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
function rawParcelToLoops(
  id: string,
  raw: UldkParcelRaw,
  parts: PolygonPart[],
  sourceCrs: CrsDetectionResult,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon,
  radiusMeters: number
): BuildingLoop[] {
  const loops: BuildingLoop[] = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];

    const toCad = ([x2180, y2180]: [number, number]): Point2D => {
      const latLon = cadPointToWgs84({ x: x2180, y: y2180 }, sourceCrs);
      return wgs84ToCadPoint(latLon, projectCrs, projectCenter);
    };

    const cadPoints: Point2D[] = part.outer.map(toCad);

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

    const outerIsCCW = isPolygonCCW(sanitized.vertices);
    const holes: Point2D[][] = [];
    for (const hole of part.holes) {
      const holePoints = hole.map(toCad);
      const sanitizedHole = sanitizePolygon(holePoints, {
        buildingId: `${loopId}-hole`,
        defaultHeight: 0,
        buildingType: 'residential',
        isCityCentre: false,
      });
      if (!sanitizedHole.valid) continue;
      holes.push(ensureOppositeWinding(sanitizedHole.vertices, isPolygonCCW(sanitizedHole.vertices), outerIsCCW));
    }

    const parcelBase: BuildingLoop = {
      id: loopId,
      name: raw.plotNumber
        ? `Działka nr ${raw.plotNumber}${holes.length > 0 ? ' (z otworem)' : ''}`
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
      holes: holes.length > 0 ? holes : undefined,
      segments: sanitized.segments,
      isClockwise: !sanitized.isCCW,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    loops.push(rebuildBuildingSegments(parcelBase, sanitized.vertices));
  }
  return loops;
}

/**
 * Generuje punkty próbne tuż za granicą pierścienia (środki krawędzi + wierzchołki),
 * przesunięte na zewnątrz o `epsilon` metrów wzdłuż normalnej/dwusiecznej kąta.
 * Używane do rekurencyjnej ekspansji wykrywania działek: sąsiednia działka
 * (niezależnie od jej rozmiaru) leży tuż za granicą działki już znalezionej.
 */
function generateProbePointsForRing(ring: Ring, epsilon: number = 0.5): Array<{ x: number; y: number }> {
  const n = ring.length;
  if (n < 3) return [];

  const points: Point2D[] = ring.map(([x, y]) => ({ x, y }));
  const ccw = isPolygonCCW(points);

  const edgeNormals: Vector2D[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    edgeNormals.push(calculateOutwardNormal(p1, p2, ccw));
  }

  const probes: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  const addProbe = (x: number, y: number) => {
    const key = `${x.toFixed(2)},${y.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    probes.push({ x, y });
  };

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const normal = edgeNormals[i];

    // Środek krawędzi przesunięty na zewnątrz.
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    addProbe(midX + normal.x * epsilon, midY + normal.y * epsilon);

    // Wierzchołek p2: dwusieczna kąta zewnętrznego jako suma normalnych dwóch
    // przyległych krawędzi (fallback na samą normalną krawędzi przy ostrych narożnikach).
    const nextNormal = edgeNormals[(i + 1) % n];
    let bx = normal.x + nextNormal.x;
    let by = normal.y + nextNormal.y;
    const bLen = Math.hypot(bx, by);
    if (bLen < 1e-6) {
      bx = nextNormal.x;
      by = nextNormal.y;
    } else {
      bx /= bLen;
      by /= bLen;
    }
    addProbe(p2.x + bx * epsilon, p2.y + by * epsilon);
  }

  return probes;
}

export async function fetchParcelsInRadius(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
  onPartialParcels?: (loops: BuildingLoop[]) => void
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
  const sourceCrs: CrsDetectionResult = {
    crs: 'EPSG:2180',
    description: 'PL-1992 (EPSG:2180)',
    geodeticLabel: 'ETRF2000-PL / CS1992',
    isGeodetic: true,
  };

  const SAMPLE_CONCURRENCY = 24;
  const loops: BuildingLoop[] = [];

  // Kolejka BFS ekspansji granicznej: dla każdej znalezionej działki próbkujemy punkty
  // tuż za jej krawędziami/wierzchołkami, żeby wykryć sąsiadów niezależnie od ich
  // rozmiaru (siatka regularna sama w sobie przeoczy wąskie/małe działki między punktami).
  const expansionQueue: Ring[] = [];
  const EXPANSION_MARGIN = Math.max(GRID_STEP_METERS, UldkExpansionLimits.MIN_EXPANSION_MARGIN_METERS);
  const MAX_PROBE_COUNT = UldkExpansionLimits.MAX_PROBE_COUNT;
  const MAX_PARCEL_COUNT = UldkExpansionLimits.MAX_PARCEL_COUNT;
  let totalProbesIssued = 0;

  const isWithinExpandableRange = (x: number, y: number): boolean => {
    const dx = x - center2180.x;
    const dy = y - center2180.y;
    const r = radiusMeters + EXPANSION_MARGIN;
    return dx * dx + dy * dy <= r * r;
  };

  // Obrysy już pobranych działek — żeby nie wysyłać do ULDK punktów próbnych, które
  // i tak wylądują wewnątrz działki, którą już mamy (np. gdy punkt wygenerowany tuż
  // za krawędzią jednej działki trafia w obręb sąsiedniej, już znalezionej).
  const knownParcelRings: Array<{ minX: number; maxX: number; minY: number; maxY: number; points: Point2D[] }> = [];

  const isInsideKnownParcel = (x: number, y: number): boolean => {
    for (const ring of knownParcelRings) {
      if (x < ring.minX || x > ring.maxX || y < ring.minY || y > ring.maxY) continue;
      if (isPointInPolygon({ x, y }, ring.points)) return true;
    }
    return false;
  };

  const registerFoundParcel = (id: string, raw: UldkParcelRaw) => {
    parcelsMap.set(id, raw);
    const parts = parseWktToPolygonParts(raw.wkt);
    const partialLoops = rawParcelToLoops(id, raw, parts, sourceCrs, projectCrs, projectCenter, radiusMeters);
    loops.push(...partialLoops);
    if (onPartialParcels && partialLoops.length > 0) onPartialParcels(partialLoops);

    if (parcelsMap.size < MAX_PARCEL_COUNT) {
      for (const part of parts) {
        const withinRange = part.outer.some(([x, y]) => isWithinExpandableRange(x, y));
        if (withinRange) expansionQueue.push(part.outer);

        const points: Point2D[] = part.outer.map(([x, y]) => ({ x, y }));
        const { minX, maxX, minY, maxY } = computePointsBoundingBox(points);
        knownParcelRings.push({ minX, maxX, minY, maxY, points });
      }
    }
  };

  /** Odpytuje ULDK dla batcha punktów, rejestruje nowo znalezione działki i raportuje postęp.
   * Punkty leżące już wewnątrz dotychczas pobranej działki są pomijane — nie mają sensu jako zapytanie. */
  const fetchAndRegisterBatch = async (
    batch: Array<{ x: number; y: number }>,
    onBatchDone: () => void
  ): Promise<void> => {
    const pointsToQuery = batch.filter((pt) => !isInsideKnownParcel(pt.x, pt.y));
    const newlyFound: Array<[string, UldkParcelRaw]> = [];
    await Promise.allSettled(
      pointsToQuery.map((pt) =>
        fetchParcelByEpsg2180(pt.x, pt.y, signal).then((raw) => {
          if (raw && raw.id && !parcelsMap.has(raw.id)) {
            newlyFound.push([raw.id, raw]);
          }
        })
      )
    );
    onBatchDone();
    for (const [id, raw] of newlyFound) {
      if (!parcelsMap.has(id)) registerFoundParcel(id, raw);
    }
  };

  // ===== Faza 1: siatka-seed =====
  for (let i = 0; i < samplePoints.length; i += SAMPLE_CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = samplePoints.slice(i, i + SAMPLE_CONCURRENCY);
    await fetchAndRegisterBatch(batch, () => {
      onProgress?.(Math.min(i + SAMPLE_CONCURRENCY, samplePoints.length), samplePoints.length);
    });
  }

  // ===== Faza 2: rekurencyjna ekspansja wzdłuż granic znalezionych działek =====
  while (
    expansionQueue.length > 0 &&
    totalProbesIssued < MAX_PROBE_COUNT &&
    parcelsMap.size < MAX_PARCEL_COUNT &&
    !signal?.aborted
  ) {
    const ring = expansionQueue.shift()!;
    const probes = generateProbePointsForRing(ring, 0.5).filter((p) => isWithinExpandableRange(p.x, p.y));

    for (let i = 0; i < probes.length; i += SAMPLE_CONCURRENCY) {
      if (signal?.aborted || totalProbesIssued >= MAX_PROBE_COUNT) break;
      const batch = probes.slice(i, i + SAMPLE_CONCURRENCY);
      totalProbesIssued += batch.length;
      await fetchAndRegisterBatch(batch, () => {
        const estimatedRemaining = expansionQueue.length * 8;
        onProgress?.(samplePoints.length + totalProbesIssued, samplePoints.length + totalProbesIssued + estimatedRemaining);
      });
    }
  }

  return loops;
}
