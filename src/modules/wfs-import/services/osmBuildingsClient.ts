/**
 * osmBuildingsClient.ts
 *
 * Klient pobierania obrysów budynków z OpenStreetMap (OSM) przez Overpass API
 * z automatycznym przełączaniem endpointów (failover), asemblacją geometrii
 * (wielokąty pojedyncze i relacje multipolygon z dziedzińcami/otworami),
 * ekstrakcją kondygnacji, wysokości, funkcji oraz transformacją do lokalnego układu CAD.
 */

import { BuildingLoop, Point2D, BuildingType } from '../../../types/geometry';
import { LatLon, wgs84ToCadPoint, CrsDetectionResult } from '../../../utils/geoTransform';
import { sanitizePolygon } from '../../../utils/importers/geometrySanitizer';
import { rebuildBuildingSegments } from '../../../utils/segmentStatistics';
import { ensureOppositeWinding } from '../../../utils/ringSegments';
import { polygonCircleIntersectionRatio, isPolygonCCW } from '../../../utils/math2d/polygons';
import { parseOsmHeight } from './osmLanduseClient';
import { WfsBbox } from './wfsWarsawClient';

export const OVERPASS_ENDPOINTS = [
  'http://overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'http://lz4.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const OVERPASS_REQUEST_TIMEOUT_MS = 8000;

const DEFAULT_FLOOR_HEIGHT = 3.0;
const FIRST_FLOOR_HEIGHT = 3.5;
const DEFAULT_HEIGHT = 15.0;
const DEFAULT_STOREYS = 5;

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

interface OverpassRelationMember {
  type: 'way' | 'node' | 'relation';
  ref: number;
  role: 'outer' | 'inner' | string;
}

interface OverpassRelation {
  type: 'relation';
  id: number;
  members: OverpassRelationMember[];
  tags?: Record<string, string>;
}

type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

export interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Rozpoznaje typ budynku na podstawie tagów OSM
 */
export function resolveBuildingType(tags: Record<string, string>): BuildingType {
  const bldg = (tags.building || '').toLowerCase();
  const amenity = (tags.amenity || '').toLowerCase();
  const shop = (tags.shop || '').toLowerCase();
  const office = (tags.office || '').toLowerCase();
  const landuse = (tags.landuse || '').toLowerCase();

  // Garaże i budynki gospodarcze
  if (
    bldg === 'garage' ||
    bldg === 'garages' ||
    bldg === 'shed' ||
    bldg === 'carport' ||
    bldg === 'hangar' ||
    bldg === 'parking' ||
    bldg === 'service_garage'
  ) {
    return 'garage';
  }

  // Usługowe, handlowe, publiczne, biurowe, edukacja
  if (
    bldg === 'commercial' ||
    bldg === 'retail' ||
    bldg === 'office' ||
    bldg === 'school' ||
    bldg === 'kindergarten' ||
    bldg === 'university' ||
    bldg === 'college' ||
    bldg === 'hospital' ||
    bldg === 'clinic' ||
    bldg === 'hotel' ||
    bldg === 'supermarket' ||
    bldg === 'public' ||
    bldg === 'civic' ||
    bldg === 'industrial' ||
    bldg === 'warehouse' ||
    amenity ||
    shop ||
    office ||
    landuse === 'commercial' ||
    landuse === 'retail'
  ) {
    return 'service';
  }

  // Domyślnie mieszkalny
  return 'residential';
}

/**
 * Ekstrahuje i estymuje wysokość oraz liczbę kondygnacji z tagów OSM
 */
export function extractOsmBuildingElevation(tags: Record<string, string>): {
  defaultHeight: number;
  storeysCount: number;
  heightSource: BuildingLoop['heightSource'];
} {
  const explicitHeight = parseOsmHeight(tags.height);
  const levelsRaw = tags['building:levels'] || tags.levels || tags['roof:levels'];
  const parsedLevels = levelsRaw ? parseInt(levelsRaw, 10) : undefined;
  const storeys = parsedLevels && !isNaN(parsedLevels) && parsedLevels > 0 ? parsedLevels : undefined;

  if (explicitHeight !== undefined && explicitHeight > 0) {
    const derivedStoreys = storeys ?? (explicitHeight > FIRST_FLOOR_HEIGHT
      ? 1 + Math.round((explicitHeight - FIRST_FLOOR_HEIGHT) / DEFAULT_FLOOR_HEIGHT)
      : 1);
    return {
      defaultHeight: Number(explicitHeight.toFixed(1)),
      storeysCount: derivedStoreys,
      heightSource: 'storeys-wfs',
    };
  }

  if (storeys !== undefined) {
    const computedHeight = storeys === 1
      ? FIRST_FLOOR_HEIGHT
      : FIRST_FLOOR_HEIGHT + (storeys - 1) * DEFAULT_FLOOR_HEIGHT;
    return {
      defaultHeight: Number(computedHeight.toFixed(1)),
      storeysCount: storeys,
      heightSource: 'storeys-wfs',
    };
  }

  return {
    defaultHeight: DEFAULT_HEIGHT,
    storeysCount: DEFAULT_STOREYS,
    heightSource: 'default',
  };
}

/**
 * Buduje czytelną nazwę budynku z tagów OSM
 */
export function formatOsmBuildingName(id: number | string, tags: Record<string, string>): string {
  if (tags.name) return tags.name;
  const street = tags['addr:street'] || tags['addr:place'];
  const houseNr = tags['addr:housenumber'] || tags['addr:conscriptionnumber'];
  if (street && houseNr) return `${street} ${houseNr}`;
  if (street) return `${street}`;
  if (tags.building && tags.building !== 'yes') {
    return `Budynek (${tags.building}) #${id}`;
  }
  return `Budynek OSM #${id}`;
}

/** Łączy segmenty krawędzi (ways) w zamknięte pętle */
function assembleWaysIntoRings(wayNodeIds: number[][], nodeMap: Map<number, LatLon>): LatLon[][] {
  const segments = wayNodeIds.filter((ids) => ids.length >= 2);
  const rings: LatLon[][] = [];
  const remaining = [...segments];

  while (remaining.length > 0) {
    const current = [...remaining.shift()!];
    let changed = true;
    while (changed) {
      changed = false;
      const startNode = current[0];
      const endNode = current[current.length - 1];

      if (startNode === endNode && current.length >= 4) {
        break; // pętla domknięta
      }

      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const segStart = seg[0];
        const segEnd = seg[seg.length - 1];

        if (endNode === segStart) {
          current.push(...seg.slice(1));
          remaining.splice(i, 1);
          changed = true;
          break;
        } else if (endNode === segEnd) {
          current.push(...[...seg].reverse().slice(1));
          remaining.splice(i, 1);
          changed = true;
          break;
        } else if (startNode === segEnd) {
          current.unshift(...seg.slice(0, -1));
          remaining.splice(i, 1);
          changed = true;
          break;
        } else if (startNode === segStart) {
          current.unshift(...[...seg].reverse().slice(0, -1));
          remaining.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    const ringCoords: LatLon[] = [];
    for (const id of current) {
      const coord = nodeMap.get(id);
      if (coord) ringCoords.push(coord);
    }
    if (ringCoords.length >= 3) {
      rings.push(ringCoords);
    }
  }

  return rings;
}

/**
 * Parsuje odpowiedź Overpass API do obiektów BuildingLoop
 */
export function parseOverpassBuildingsResponse(
  responseData: OverpassResponse,
  projectCenter: LatLon,
  projectCrs: CrsDetectionResult,
  radiusMeters?: number
): BuildingLoop[] {
  const nodes = new Map<number, OverpassNode>();
  const nodeCoords = new Map<number, LatLon>();
  const ways = new Map<number, OverpassWay>();
  const relations: OverpassRelation[] = [];

  for (const el of responseData.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, el);
      nodeCoords.set(el.id, { lat: el.lat, lon: el.lon });
    } else if (el.type === 'way') {
      ways.set(el.id, el);
    } else if (el.type === 'relation') {
      relations.push(el);
    }
  }

  const buildings: BuildingLoop[] = [];
  const processedWayIds = new Set<number>();
  const centerCad = wgs84ToCadPoint(projectCenter, projectCrs, projectCenter);

  // 1. Przetwarzanie relacji multipolygon (budynki z dziedzińcami / złożone bryły)
  for (const rel of relations) {
    const tags = rel.tags || {};
    if (!tags.building) continue;

    const outerWays: number[][] = [];
    const innerWays: number[][] = [];

    for (const member of rel.members) {
      if (member.type === 'way') {
        const way = ways.get(member.ref);
        if (way && way.nodes && way.nodes.length >= 2) {
          processedWayIds.add(member.ref);
          if (member.role === 'inner') {
            innerWays.push(way.nodes);
          } else {
            outerWays.push(way.nodes);
          }
        }
      }
    }

    const outerRings = assembleWaysIntoRings(outerWays, nodeCoords);
    const innerRings = assembleWaysIntoRings(innerWays, nodeCoords);
    if (outerRings.length === 0) continue;

    const { defaultHeight, storeysCount, heightSource } = extractOsmBuildingElevation(tags);
    const buildingType = resolveBuildingType(tags);
    const buildingName = formatOsmBuildingName(rel.id, tags);

    for (let ri = 0; ri < outerRings.length; ri++) {
      const outerLatLons = outerRings[ri];
      const rawOuterCad: Point2D[] = outerLatLons.map((coord) =>
        wgs84ToCadPoint(coord, projectCrs, projectCenter)
      );

      const bldgId = ri === 0 ? `osm-bld-rel-${rel.id}` : `osm-bld-rel-${rel.id}-p${ri}`;
      const sanitized = sanitizePolygon(rawOuterCad, {
        buildingId: bldgId,
        defaultHeight,
        buildingType,
        isCityCentre: false,
      });

      if (!sanitized.valid || sanitized.vertices.length < 3) continue;

      // Filtr zasięgu promienia
      if (radiusMeters != null && radiusMeters > 0) {
        const ratio = polygonCircleIntersectionRatio(sanitized.vertices, centerCad.x, centerCad.y, radiusMeters);
        if (ratio < 0.1) continue;
      }

      const outerIsCCW = isPolygonCCW(sanitized.vertices);
      const holes: Point2D[][] = [];

      for (const innerLatLons of innerRings) {
        const rawInnerCad: Point2D[] = innerLatLons.map((coord) =>
          wgs84ToCadPoint(coord, projectCrs, projectCenter)
        );
        const sanitizedHole = sanitizePolygon(rawInnerCad, {
          buildingId: `${bldgId}-hole`,
          defaultHeight,
          buildingType,
          isCityCentre: false,
        });
        if (sanitizedHole.valid && sanitizedHole.vertices.length >= 3) {
          holes.push(ensureOppositeWinding(sanitizedHole.vertices, isPolygonCCW(sanitizedHole.vertices), outerIsCCW));
        }
      }

      const loop: BuildingLoop = {
        id: bldgId,
        name: buildingName,
        layer: 'WFS_BUDYNKI',
        category: 'building',
        isTested: false,
        isIncluded: true,
        isLocked: true,
        isCityCentre: false,
        buildingType,
        defaultHeight,
        heightSource,
        hWindowBottom: 0.85,
        elevation: 0.0,
        firstFloorHeight: FIRST_FLOOR_HEIGHT,
        typicalFloorHeight: DEFAULT_FLOOR_HEIGHT,
        storeysCount,
        vertices: sanitized.vertices,
        holes: holes.length > 0 ? holes : undefined,
        segments: sanitized.segments,
        isClockwise: !sanitized.isCCW,
        transform: { tx: 0, ty: 0, rotationDeg: 0 },
      };

      buildings.push(rebuildBuildingSegments(loop, sanitized.vertices));
    }
  }

  // 2. Przetwarzanie pojedynczych dróg (ways) oznaczonych jako building
  for (const [wayId, way] of ways.entries()) {
    if (processedWayIds.has(wayId)) continue;
    const tags = way.tags || {};
    if (!tags.building) continue;
    if (!way.nodes || way.nodes.length < 4) continue;

    const latLons: LatLon[] = [];
    for (const nodeId of way.nodes) {
      const coord = nodeCoords.get(nodeId);
      if (coord) latLons.push(coord);
    }
    if (latLons.length < 3) continue;

    const rawCadPoints: Point2D[] = latLons.map((coord) =>
      wgs84ToCadPoint(coord, projectCrs, projectCenter)
    );

    const { defaultHeight, storeysCount, heightSource } = extractOsmBuildingElevation(tags);
    const buildingType = resolveBuildingType(tags);
    const buildingName = formatOsmBuildingName(wayId, tags);
    const bldgId = `osm-bld-${wayId}`;

    const sanitized = sanitizePolygon(rawCadPoints, {
      buildingId: bldgId,
      defaultHeight,
      buildingType,
      isCityCentre: false,
    });

    if (!sanitized.valid || sanitized.vertices.length < 3) continue;

    if (radiusMeters != null && radiusMeters > 0) {
      const ratio = polygonCircleIntersectionRatio(sanitized.vertices, centerCad.x, centerCad.y, radiusMeters);
      if (ratio < 0.1) continue;
    }

    const loop: BuildingLoop = {
      id: bldgId,
      name: buildingName,
      layer: 'WFS_BUDYNKI',
      category: 'building',
      isTested: false,
      isIncluded: true,
      isLocked: true,
      isCityCentre: false,
      buildingType,
      defaultHeight,
      heightSource,
      hWindowBottom: 0.85,
      elevation: 0.0,
      firstFloorHeight: FIRST_FLOOR_HEIGHT,
      typicalFloorHeight: DEFAULT_FLOOR_HEIGHT,
      storeysCount,
      vertices: sanitized.vertices,
      segments: sanitized.segments,
      isClockwise: !sanitized.isCCW,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    buildings.push(rebuildBuildingSegments(loop, sanitized.vertices));
  }

  // 3. Przetwarzanie pojedynczych dróg (ways) oznaczonych jako building:part (bryły składowe)
  for (const [wayId, way] of ways.entries()) {
    if (processedWayIds.has(wayId)) continue;
    const tags = way.tags || {};
    if (!tags['building:part'] || tags['building:part'] === 'no') continue;
    if (!way.nodes || way.nodes.length < 4) continue;

    const latLons: LatLon[] = [];
    for (const nodeId of way.nodes) {
      const coord = nodeCoords.get(nodeId);
      if (coord) latLons.push(coord);
    }
    if (latLons.length < 3) continue;

    const rawCadPoints: Point2D[] = latLons.map((coord) =>
      wgs84ToCadPoint(coord, projectCrs, projectCenter)
    );

    const { defaultHeight, storeysCount, heightSource } = extractOsmBuildingElevation(tags);
    const buildingType = resolveBuildingType(tags);
    const buildingName = formatOsmBuildingName(wayId, tags);
    const bldgId = `osm-part-${wayId}`;

    const sanitized = sanitizePolygon(rawCadPoints, {
      buildingId: bldgId,
      defaultHeight,
      buildingType,
      isCityCentre: false,
    });

    if (!sanitized.valid || sanitized.vertices.length < 3) continue;

    if (radiusMeters != null && radiusMeters > 0) {
      const ratio = polygonCircleIntersectionRatio(sanitized.vertices, centerCad.x, centerCad.y, radiusMeters);
      if (ratio < 0.1) continue;
    }

    const loop: BuildingLoop = {
      id: bldgId,
      name: buildingName,
      layer: 'WFS_BUDYNKI',
      category: 'building',
      isTested: false,
      isIncluded: true,
      isLocked: true,
      isCityCentre: false,
      buildingType,
      defaultHeight,
      heightSource,
      hWindowBottom: 0.85,
      elevation: 0.0,
      firstFloorHeight: FIRST_FLOOR_HEIGHT,
      typicalFloorHeight: DEFAULT_FLOOR_HEIGHT,
      storeysCount,
      vertices: sanitized.vertices,
      segments: sanitized.segments,
      isClockwise: !sanitized.isCCW,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    buildings.push(rebuildBuildingSegments(loop, sanitized.vertices));
  }

  return buildings;
}

/**
 * Pobiera budynki z OpenStreetMap przez Overpass API dla zadanego BBox i transformuje do układu CAD projektu.
 */
export async function fetchOsmBuildings(
  bbox: WfsBbox,
  projectCenter: LatLon,
  projectCrs: CrsDetectionResult,
  radiusMeters?: number
): Promise<BuildingLoop[]> {
  const [west, south, east, north] = bbox;

  const query = `
    [out:json][timeout:25];
    (
      way["building"](${south},${west},${north},${east});
      way["building:part"](${south},${west},${north},${east});
      relation["building"]["type"="multipolygon"](${south},${west},${north},${east});
      relation["building:part"]["type"="multipolygon"](${south},${west},${north},${east});
      relation["type"="building"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `.trim();

  let responseData: OverpassResponse | null = null;
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OVERPASS_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
          'User-Agent': 'USILightCAD/2.5D (https://github.com/usi-light)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{')) {
          responseData = JSON.parse(text) as OverpassResponse;
          break;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  if (!responseData) {
    throw new Error(
      `Nie udało się pobrać budynków z OpenStreetMap (Overpass API): ${lastError?.message || 'Błąd połączenia'}`
    );
  }

  return parseOverpassBuildingsResponse(responseData, projectCenter, projectCrs, radiusMeters);
}
