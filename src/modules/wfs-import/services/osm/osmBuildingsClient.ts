/**
 * osmBuildingsClient.ts
 *
 * Klient pobierania obrysów budynków z OpenStreetMap (OSM) przez Overpass API
 * z automatycznym przełączaniem endpointów (failover), asemblacją geometrii
 * (wielokąty pojedyncze i relacje multipolygon z dziedzińcami/otworami),
 * ekstrakcją kondygnacji, wysokości, funkcji oraz transformacją do lokalnego układu CAD.
 */

import { BuildingLoop, Point2D, BuildingType } from '../../../../types/geometry';
import { LatLon, wgs84ToCadPoint, CrsDetectionResult } from '../../../../utils/geoTransform';
import { sanitizePolygon } from '../../../../utils/importers/geometrySanitizer';
import { rebuildBuildingSegments } from '../../../../utils/segmentStatistics';
import { ensureOppositeWinding } from '../../../../utils/ringSegments';
import {
  polygonCircleIntersectionRatio,
  isPolygonCCW,
  computePolygonArea,
  getPolygonCentroid,
  intersectionPolygonLoops,
  isPointInPolygon,
} from '../../../../utils/math2d/polygons';
import { parseOsmHeight } from './osmLanduseClient';
import { WfsBbox } from '../city/wfsWarsawClient';

// Zapytanie idzie przez serverless proxy `/api/osm-overpass` (api/osm-overpass.ts) zamiast
// bezpośrednio z przeglądarki do mirrorów Overpass — omija to CORS/timeouty/lokalne blokady
// sieciowe, które potrafią wystąpić tylko na niektórych maszynach/sieciach deweloperskich,
// mimo identycznego kodu klienta w dev i w produkcji.
const OVERPASS_PROXY_URL = '/api/osm-overpass';

// Proxy (api/osm-overpass.ts) próbuje głównego endpointu Overpass z budżetem 180s (dopasowanym
// do [timeout:180] w zapytaniu niżej + margines na transfer), a po awarii sekwencyjnie
// pozostałych mirrorów jako fallback. Timeout klienta musi być WIĘKSZY niż łączny budżet proxy (180s).
const OVERPASS_REQUEST_TIMEOUT_MS = 185000;

// Runda 2 (patrz `fetchOsmBuildings`) dociąga pełną geometrię TYLKO dla relacji, których
// way-członkowie wyszli niekompletni z rundy 1 — zapytanie jest małe (jedna relacja), więc
// dostaje osobny, krótszy budżet niezależny od rundy 1 (nie sumowany z nim w jednym
// AbortController — kilka relacji sekwencyjnie mogłoby inaczej łatwo przekroczyć budżet
// klienta, gdyby dzieliły jeden globalny timeout z dużym zapytaniem rundy 1).
const ROUND2_RELATION_TIMEOUT_MS = 25000;
// Zabezpieczenie przed nietypowym obszarem z bardzo wieloma złożonymi relacjami —
// sekwencyjny dociąg jest z założenia wolniejszy niż równoległy, więc ograniczamy liczbę
// relacji dociąganych w rundzie 2, zamiast ryzykować bardzo długi całkowity czas importu.
const ROUND2_MAX_RELATIONS = 8;

// Runda 0 (discovery) poszerza bbox o stały margines ponad zasięg projektu (`radiusMeters`) —
// Overpass filtruje `relation[...](bbox)` w sposób, który dla relacji złożonych WYŁĄCZNIE z
// way-członków (bez żadnego bezpośredniego węzła jako członka — schemat "Simple 3D Buildings",
// np. wieżowiec Intraco, relation/3211736) potrafi w ogóle nie dopasować relacji, mimo że jej
// way-członkowie leżą w zasięgu — relacja wtedy CAŁKOWICIE znika z wyniku Rundy 1 i nigdy nie
// trafia do `findIncompleteRelations` (bo ta funkcja widzi tylko relacje, które już są w
// zbiorze). Runda 0 to tanie zapytanie (`out ids tags bb;`, bez rekursji) na poszerzonym bboxie,
// które wykrywa takie relacje niezależnie od tego mechanizmu i dorzuca je do tej samej listy co
// dziś zasila celowany dociąg w Rundzie 2.
const ROUND0_BBOX_PADDING_METERS = 100;

// Runda 0 biegnie RÓWNOLEGLE z zapytaniem głównym (Rundą 1, patrz `fetchOsmBuildings`), więc jej
// timeout musi respektować DOKŁADNIE to samo ograniczenie co `OVERPASS_REQUEST_TIMEOUT_MS` wyżej.
const ROUND0_TIMEOUT_MS = OVERPASS_REQUEST_TIMEOUT_MS;

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
  /** Overpass ustawia to pole, gdy własny budżet czasowy zapytania ([timeout:N] w Overpass QL —
   * limit wykonania PO STRONIE SERWERA Overpass, niezależny od timeoutów AbortController po
   * stronie klienta/proxy) zostanie przekroczony w trakcie liczenia — serwer i tak odpowiada
   * HTTP 200 z tym, co zdążył policzyć do tego momentu, więc bez sprawdzenia tego pola taka
   * ucięta odpowiedź wygląda jak pełny sukces. */
  remark?: string;
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
 * Ekstrahuje i estymuje wysokość, rzędną dolnej krawędzi (posadowienie bryły) oraz liczbę kondygnacji z tagów OSM
 */
export function extractOsmBuildingElevation(tags: Record<string, string>): {
  defaultHeight: number;
  elevation: number;
  storeysCount: number;
  heightSource: BuildingLoop['heightSource'];
} {
  // 1. Wysokość dolnej krawędzi bryły od poziomu gruntu (min_height / building:min_level)
  const explicitMinHeight = parseOsmHeight(tags.min_height || tags['building:min_height']);
  const minLevelsRaw = tags['building:min_level'] || tags.min_level;
  const parsedMinLevels = minLevelsRaw ? parseInt(minLevelsRaw, 10) : undefined;
  const minStoreys = parsedMinLevels && !isNaN(parsedMinLevels) && parsedMinLevels > 0 ? parsedMinLevels : undefined;

  let baseElevation = 0.0;
  if (explicitMinHeight !== undefined && explicitMinHeight >= 0) {
    baseElevation = explicitMinHeight;
  } else if (minStoreys !== undefined) {
    baseElevation = minStoreys === 1
      ? FIRST_FLOOR_HEIGHT
      : FIRST_FLOOR_HEIGHT + (minStoreys - 1) * DEFAULT_FLOOR_HEIGHT;
  }

  // 2. Całkowita wysokość dachu bryły od poziomu gruntu (height / building:levels)
  const explicitHeight = parseOsmHeight(tags.height || tags['building:height'] || tags['roof:height']);
  const levelsRaw = tags['building:levels'] || tags.levels || tags['roof:levels'];
  const parsedLevels = levelsRaw ? parseInt(levelsRaw, 10) : undefined;
  const storeys = parsedLevels && !isNaN(parsedLevels) && parsedLevels > 0 ? parsedLevels : undefined;

  let topHeight: number | undefined;
  let derivedStoreys: number = DEFAULT_STOREYS;
  let source: BuildingLoop['heightSource'] = 'default';

  if (explicitHeight !== undefined && explicitHeight > 0) {
    // W OSM tag `height` określa całkowitą wysokość wierzchołka od gruntu.
    // Jeśli `height` jest mniejsze lub równe `baseElevation`, traktujemy `height` jako grubość względną bryły.
    topHeight = explicitHeight > baseElevation ? explicitHeight : baseElevation + explicitHeight;
    const bodyHeight = topHeight - baseElevation;
    derivedStoreys = storeys ?? (bodyHeight > FIRST_FLOOR_HEIGHT
      ? 1 + Math.round((bodyHeight - FIRST_FLOOR_HEIGHT) / DEFAULT_FLOOR_HEIGHT)
      : 1);
    source = 'storeys-wfs';
  } else if (storeys !== undefined) {
    const computedBodyHeight = storeys === 1
      ? FIRST_FLOOR_HEIGHT
      : FIRST_FLOOR_HEIGHT + (storeys - 1) * DEFAULT_FLOOR_HEIGHT;
    topHeight = baseElevation + computedBodyHeight;
    derivedStoreys = storeys;
    source = 'storeys-wfs';
  } else {
    topHeight = baseElevation + DEFAULT_HEIGHT;
    derivedStoreys = DEFAULT_STOREYS;
    source = 'default';
  }

  const effectiveHeight = Math.max(1.0, topHeight - baseElevation);

  return {
    defaultHeight: Number(effectiveHeight.toFixed(1)),
    elevation: Number(baseElevation.toFixed(1)),
    storeysCount: Math.max(1, derivedStoreys),
    heightSource: source,
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

export interface OsmProgressInfo {
  stage: 'baseline' | 'details' | 'assembling';
  message: string;
  foundBuildingsCount?: number;
  currentDetailIndex?: number;
  totalDetailsCount?: number;
}

/**
 * Bezpiecznie scala odpowiedzi Overpass, zachowując pełne tagi i węzły elementów
 * (zapobiega nadpisywaniu tagów przez wpisy szkieletowe `out skel qt`).
 */
export function mergeOverpassResponses(...responses: OverpassResponse[]): OverpassResponse {
  const nodeMap = new Map<number, OverpassNode>();
  const wayMap = new Map<number, OverpassWay>();
  const relMap = new Map<number, OverpassRelation>();

  for (const resp of responses) {
    if (!resp || !resp.elements) continue;
    for (const el of resp.elements) {
      if (el.type === 'node') {
        const existing = nodeMap.get(el.id);
        nodeMap.set(el.id, {
          ...existing,
          ...el,
          tags: el.tags && Object.keys(el.tags).length > 0 ? el.tags : existing?.tags,
        });
      } else if (el.type === 'way') {
        const existing = wayMap.get(el.id);
        wayMap.set(el.id, {
          ...existing,
          ...el,
          nodes: el.nodes && el.nodes.length > 0 ? el.nodes : (existing?.nodes || []),
          tags: el.tags && Object.keys(el.tags).length > 0 ? el.tags : existing?.tags,
        });
      } else if (el.type === 'relation') {
        const existing = relMap.get(el.id);
        relMap.set(el.id, {
          ...existing,
          ...el,
          members: el.members && el.members.length > 0 ? el.members : (existing?.members || []),
          tags: el.tags && Object.keys(el.tags).length > 0 ? el.tags : existing?.tags,
        });
      }
    }
  }

  return {
    elements: [
      ...Array.from(nodeMap.values()),
      ...Array.from(wayMap.values()),
      ...Array.from(relMap.values()),
    ],
  };
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
      const existing = nodes.get(el.id);
      nodes.set(el.id, {
        ...existing,
        ...el,
        tags: el.tags && Object.keys(el.tags).length > 0 ? el.tags : existing?.tags,
      });
      nodeCoords.set(el.id, { lat: el.lat, lon: el.lon });
    } else if (el.type === 'way') {
      const existing = ways.get(el.id);
      ways.set(el.id, {
        ...existing,
        ...el,
        nodes: el.nodes && el.nodes.length > 0 ? el.nodes : (existing?.nodes || []),
        tags: el.tags && Object.keys(el.tags).length > 0 ? el.tags : existing?.tags,
      });
    } else if (el.type === 'relation') {
      const existingIndex = relations.findIndex((r) => r.id === el.id);
      if (existingIndex < 0) {
        relations.push(el);
      } else {
        const existing = relations[existingIndex];
        relations[existingIndex] = {
          ...existing,
          ...el,
          members: el.members && el.members.length > 0 ? el.members : (existing?.members || []),
          tags: el.tags && Object.keys(el.tags).length > 0 ? el.tags : existing?.tags,
        };
      }
    }
  }

  const buildings: BuildingLoop[] = [];
  const processedWayIds = new Set<number>();
  const centerCad = wgs84ToCadPoint(projectCenter, projectCrs, projectCenter);

  // 0. Indeksowanie relacji type=building (łączących outline / building:part)
  const buildingRelationMemberMap = new Map<number, { relId: number; relName?: string }>();
  const outlineWayIdsWithParts = new Set<number>();

  for (const rel of relations) {
    const tags = rel.tags || {};
    if (tags.type === 'building' || (tags.building && tags.type !== 'multipolygon')) {
      const relName = formatOsmBuildingName(rel.id, tags);
      const hasPartMembers = rel.members.some((m) => m.role === 'part' || m.role === '');
      for (const member of rel.members) {
        if (member.type === 'way') {
          buildingRelationMemberMap.set(member.ref, { relId: rel.id, relName });
          // Jeśli relacja zawiera części (part), oznaczamy drogę nadrzędną (outline), aby nie tworzyć z niej zbędnej bryły
          if (member.role === 'outline' && hasPartMembers) {
            outlineWayIdsWithParts.add(member.ref);
            processedWayIds.add(member.ref);
          }
        }
      }
    }
  }

  // 0.5. Geometryczne wykrywanie brył obejmujących (envelope), części 3D oraz wewnętrznych dziedzińców (holes):
  const geometricEnvelopeGroupByPartWayId = new Map<number, string>();
  const geometricEnvelopeGroupByWayId = new Map<number, string>();
  const envelopePartNameMap = new Map<number, string>();
  const envelopeHolesByWayId = new Map<number, Point2D[][]>();

  const wayToCadPolygon = (wayId: number): Point2D[] | null => {
    const way = ways.get(wayId);
    if (!way || !way.nodes) return null;
    const pts: Point2D[] = [];
    for (const nodeId of way.nodes) {
      const coord = nodeCoords.get(nodeId);
      if (coord) pts.push(wgs84ToCadPoint(coord, projectCrs, projectCenter));
    }
    return pts.length >= 3 ? pts : null;
  };

  interface PolyBBox { minX: number; minY: number; maxX: number; maxY: number }
  const computeBBox = (poly: Point2D[]): PolyBBox => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  };
  const bboxesOverlap = (a: PolyBBox, b: PolyBBox): boolean =>
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

  const isPolygonStrictlyInside = (inner: Point2D[], outer: Point2D[]): boolean => {
    if (inner.length < 3 || outer.length < 3) return false;
    let insideCount = 0;
    for (const pt of inner) {
      if (isPointInPolygon(pt, outer)) {
        insideCount++;
      }
    }
    if (insideCount / inner.length < 0.9) return false;
    const centroid = getPolygonCentroid(inner);
    return isPointInPolygon(centroid, outer);
  };

  const partPolygons = new Map<number, Point2D[]>();
  const partBBoxes = new Map<number, PolyBBox>();
  for (const [wayId, way] of ways.entries()) {
    const tags = way.tags || {};
    if (!tags['building:part'] || tags['building:part'] === 'no') continue;
    if (!way.nodes || way.nodes.length < 4) continue;
    const poly = wayToCadPolygon(wayId);
    if (poly) {
      partPolygons.set(wayId, poly);
      partBBoxes.set(wayId, computeBBox(poly));
    }
  }

  const ENVELOPE_FULL_COVERAGE_RATIO = 0.85;
  const findCoveredPartIds = (
    envelopePoly: Point2D[],
    excludeWayId?: number
  ): { coveredPartIds: number[]; courtyardHoles: Point2D[][]; isEnvelopeFullyCovered: boolean } => {
    const coveredPartIds: number[] = [];
    const courtyardHoles: Point2D[][] = [];
    const envelopeBBox = computeBBox(envelopePoly);
    const envelopeArea = computePolygonArea(envelopePoly);
    let nonHoleAreaCovered = 0;

    for (const [partWayId, partPoly] of partPolygons.entries()) {
      if (partWayId === excludeWayId) continue;
      const partBBox = partBBoxes.get(partWayId);
      if (partBBox && !bboxesOverlap(envelopeBBox, partBBox)) continue;
      const partArea = computePolygonArea(partPoly);
      if (partArea <= 0) continue;
      const intersections = intersectionPolygonLoops([envelopePoly], [partPoly]);
      const overlapArea = intersections.reduce((sum, loop) => sum + computePolygonArea(loop), 0);
      if (overlapArea / partArea > 0.5) {
        coveredPartIds.push(partWayId);
        // Sprawdź czy to wewnętrzny dziedziniec / studnia wewnątrz obrysu
        const isCourtyard = partArea < 0.85 * envelopeArea && isPolygonStrictlyInside(partPoly, envelopePoly);
        if (isCourtyard) {
          courtyardHoles.push(partPoly);
        } else {
          nonHoleAreaCovered += overlapArea;
        }
      }
    }
    const isEnvelopeFullyCovered =
      envelopeArea > 0 && nonHoleAreaCovered / envelopeArea > ENVELOPE_FULL_COVERAGE_RATIO;
    return { coveredPartIds, courtyardHoles, isEnvelopeFullyCovered };
  };

  if (partPolygons.size > 0) {
    for (const [wayId, way] of ways.entries()) {
      if (processedWayIds.has(wayId)) continue;
      const tags = way.tags || {};
      if (!tags.building || !way.nodes || way.nodes.length < 4) continue;

      const envelopePoly = wayToCadPolygon(wayId);
      if (!envelopePoly) continue;

      const { coveredPartIds, courtyardHoles, isEnvelopeFullyCovered } = findCoveredPartIds(envelopePoly, wayId);
      if (coveredPartIds.length > 0) {
        const groupId = `group-osm-geo-${wayId}`;
        geometricEnvelopeGroupByWayId.set(wayId, groupId);
        const envelopeName = formatOsmBuildingName(wayId, tags);
        for (const partWayId of coveredPartIds) {
          geometricEnvelopeGroupByPartWayId.set(partWayId, groupId);
          envelopePartNameMap.set(partWayId, envelopeName);
        }
        if (courtyardHoles.length > 0) {
          envelopeHolesByWayId.set(wayId, courtyardHoles);
        }
        if (isEnvelopeFullyCovered) {
          processedWayIds.add(wayId);
        }
      }
    }
  }

  // 1. Przetwarzanie relacji multipolygon (budynki z dziedzińcami / złożone bryły)
  for (const rel of relations) {
    const tags = rel.tags || {};
    if (!tags.building && tags.type !== 'multipolygon') continue;

    const outerWays: number[][] = [];
    const innerWays: number[][] = [];
    let outerWayTagsWithName: Record<string, string> | undefined;

    for (const member of rel.members) {
      if (member.type === 'way') {
        const way = ways.get(member.ref);
        if (way && way.nodes && way.nodes.length >= 2) {
          processedWayIds.add(member.ref);
          if (member.role === 'inner') {
            innerWays.push(way.nodes);
          } else {
            outerWays.push(way.nodes);
            // Relacje multipolygon (zwłaszcza building:part) często same nie mają tagu `name` -
            // gdy dokładnie jeden way outer niesie nazwę/adres (np. pełny obrys budynku z osobnymi
            // otworami dachowymi jako części), przejmujemy ją zamiast generycznej nazwy "Budynek OSM #".
            if (way.tags && (way.tags.name || way.tags['addr:housenumber'])) {
              outerWayTagsWithName = way.tags;
            }
          }
        }
      }
    }

    const outerRings = assembleWaysIntoRings(outerWays, nodeCoords);
    const innerRings = assembleWaysIntoRings(innerWays, nodeCoords);
    if (outerRings.length === 0) continue;

    const { defaultHeight, elevation, storeysCount, heightSource } = extractOsmBuildingElevation(tags);
    const buildingType = resolveBuildingType(tags);
    const hasOwnName = !!(tags.name || tags['addr:housenumber']);
    const buildingName = !hasOwnName && outerWayTagsWithName
      ? formatOsmBuildingName(rel.id, outerWayTagsWithName)
      : formatOsmBuildingName(rel.id, tags);

    // Relacja bez tagu `building` (tylko `building:part`) to CZĘŚĆ budynku, nie pełny envelope -
    // zgodnie z tym samym rozróżnieniem, co dla pojedynczych way'ów w krokach 2/3.
    const isPartOnlyRelation = !tags.building && !!tags['building:part'] && tags['building:part'] !== 'no';
    const idPrefix = isPartOnlyRelation ? 'osm-part-rel' : 'osm-bld-rel';

    const hasMultipleOuterRings = outerRings.length > 1;
    const relGroupId = hasMultipleOuterRings ? `group-osm-rel-${rel.id}` : undefined;

    // Współrzędne CAD otworów liczone raz dla całej relacji — punkt reprezentatywny (pierwszy
    // wierzchołek) każdego otworu decyduje, do KTÓREGO pierścienia zewnętrznego trafi (patrz niżej),
    // zamiast (jak wcześniej) doklejać wszystkie otwory relacji do każdego outer ringa niezależnie
    // od tego, czy geometrycznie w nim leżą — to psuło budynki z >1 outer ringiem (np. rozdzielony
    // kształt zszyty z kilku way'ów), gdzie dziedziniec trafiał do niewłaściwej części budynku.
    const innerRingsCad: Point2D[][] = innerRings.map((innerLatLons) =>
      innerLatLons.map((coord) => wgs84ToCadPoint(coord, projectCrs, projectCenter))
    );

    for (let ri = 0; ri < outerRings.length; ri++) {
      const outerLatLons = outerRings[ri];
      const rawOuterCad: Point2D[] = outerLatLons.map((coord) =>
        wgs84ToCadPoint(coord, projectCrs, projectCenter)
      );

      const bldgId = ri === 0 ? `${idPrefix}-${rel.id}` : `${idPrefix}-${rel.id}-p${ri}`;
      const sanitized = sanitizePolygon(rawOuterCad, {
        buildingId: bldgId,
        defaultHeight,
        buildingType,
        isCityCentre: false,
      });

      if (!sanitized.valid || sanitized.vertices.length < 3) continue;

      // Geometryczne wykrywanie envelope: poligon relacji pokrywający building:part way'e
      // jest odrzucany jako duplikat (patrz blok "0.5" powyżej — ta sama logika, ale dla
      // poligonów wynikających z relacji multipolygon zamiast pojedynczych way'ów).
      // Uwaga: sprawdzamy TYLKO gdy relacja nie ma otworów (innerRings) - obrys zewnętrzny przed
      // odjęciem dziedzińca niemal zawsze "pokrywa" geometrycznie wszystko, co leży w tym dziedzińcu
      // (np. kolejny pierścień budynku), więc dla brył z dziedzińcem test dawałby fałszywe trafienia.
      const { coveredPartIds: relCoveredPartIds, isEnvelopeFullyCovered: isRelEnvelopeFullyCovered } =
        innerRings.length === 0
          ? findCoveredPartIds(sanitized.vertices)
          : { coveredPartIds: [] as number[], isEnvelopeFullyCovered: false };
      if (relCoveredPartIds.length > 0) {
        const groupId = `group-osm-geo-rel-${rel.id}${ri > 0 ? `-p${ri}` : ''}`;
        for (const partWayId of relCoveredPartIds) {
          geometricEnvelopeGroupByPartWayId.set(partWayId, groupId);
        }
        // Envelope relacji kasujemy jako duplikat TYLKO, gdy jego części opisują niemal całą
        // jego powierzchnię (patrz komentarz przy `findCoveredPartIds` powyżej).
        if (isRelEnvelopeFullyCovered) {
          continue;
        }
      }

      // Filtr zasięgu promienia
      if (radiusMeters != null && radiusMeters > 0) {
        const ratio = polygonCircleIntersectionRatio(sanitized.vertices, centerCad.x, centerCad.y, radiusMeters);
        if (ratio < 0.1) continue;
      }

      const outerIsCCW = isPolygonCCW(sanitized.vertices);
      const holes: Point2D[][] = [];

      for (const rawInnerCad of innerRingsCad) {
        // Przypisz otwór do tego outer ringa TYLKO gdy geometrycznie w nim leży — przy jednym
        // outer ringu (typowy przypadek) to zawsze prawda, przy kilku (hasMultipleOuterRings)
        // zapobiega przyklejeniu cudzej dziury do złej części budynku.
        if (rawInnerCad.length === 0 || !isPointInPolygon(rawInnerCad[0], sanitized.vertices)) continue;
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

      const nameWithPart = hasMultipleOuterRings ? `${buildingName} (cz. ${ri + 1}/${outerRings.length})` : buildingName;

      const loop: BuildingLoop = {
        id: bldgId,
        name: nameWithPart,
        layer: 'WFS_BUDYNKI',
        category: 'building',
        groupId: relGroupId,
        isTested: false,
        isIncluded: true,
        isLocked: true,
        isCityCentre: false,
        buildingType,
        defaultHeight,
        heightSource,
        hWindowBottom: 0.85,
        elevation,
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

    const { defaultHeight, elevation, storeysCount, heightSource } = extractOsmBuildingElevation(tags);
    const buildingType = resolveBuildingType(tags);
    const relInfo = buildingRelationMemberMap.get(wayId);
    const buildingName = relInfo?.relName || formatOsmBuildingName(wayId, tags);
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

    const wayGroupId = relInfo
      ? `group-osm-bld-${relInfo.relId}`
      : (geometricEnvelopeGroupByWayId.get(wayId) || undefined);

    const outerIsCCW = isPolygonCCW(sanitized.vertices);
    const holesCad = envelopeHolesByWayId.get(wayId);
    const holes: Point2D[][] = [];
    if (holesCad && holesCad.length > 0) {
      for (const rawHole of holesCad) {
        const sanitizedHole = sanitizePolygon(rawHole, {
          buildingId: `${bldgId}-hole`,
          defaultHeight,
          buildingType,
          isCityCentre: false,
        });
        if (sanitizedHole.valid && sanitizedHole.vertices.length >= 3) {
          holes.push(ensureOppositeWinding(sanitizedHole.vertices, isPolygonCCW(sanitizedHole.vertices), outerIsCCW));
        }
      }
    }

    const loop: BuildingLoop = {
      id: bldgId,
      name: buildingName,
      layer: 'WFS_BUDYNKI',
      category: 'building',
      groupId: wayGroupId,
      isTested: false,
      isIncluded: true,
      isLocked: true,
      isCityCentre: false,
      buildingType,
      defaultHeight,
      heightSource,
      hWindowBottom: 0.85,
      elevation,
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

    const { defaultHeight, elevation, storeysCount, heightSource } = extractOsmBuildingElevation(tags);
    const buildingType = resolveBuildingType(tags);
    const relInfo = buildingRelationMemberMap.get(wayId);
    const inheritedName = envelopePartNameMap.get(wayId);
    const buildingName = (tags.name || tags['addr:housenumber'])
      ? formatOsmBuildingName(wayId, tags)
      : (relInfo?.relName || inheritedName || formatOsmBuildingName(wayId, tags));
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

    const partGroupId = relInfo
      ? `group-osm-bld-${relInfo.relId}`
      : geometricEnvelopeGroupByPartWayId.get(wayId);

    const loop: BuildingLoop = {
      id: bldgId,
      name: buildingName,
      layer: 'WFS_BUDYNKI',
      category: 'building',
      groupId: partGroupId,
      isTested: false,
      isIncluded: true,
      isLocked: true,
      isCityCentre: false,
      buildingType,
      defaultHeight,
      heightSource,
      hWindowBottom: 0.85,
      elevation,
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

  // 4. Failsafe dla relacji Simple 3D Buildings:
  // Jeśli outline relacji został oznaczony jako pominięty (bo relacja zawiera role=part),
  // ale żadna z części tej relacji nie wygenerowała ostatecznie poprawnego poligonu w wyniku
  // (np. brak węzłów części, wykluczenie promieniem lub uszkodzona geometria części),
  // przywracamy outline jako pełnoprawny budynek, aby obiekt nie zniknął całkowicie ze sceny.
  for (const rel of relations) {
    const relGroupId = `group-osm-bld-${rel.id}`;
    const hasGeneratedPart = buildings.some((b) => b.groupId === relGroupId);
    if (!hasGeneratedPart && outlineWayIdsWithParts.size > 0) {
      for (const member of rel.members) {
        if (member.type === 'way' && member.role === 'outline' && outlineWayIdsWithParts.has(member.ref)) {
          const wayId = member.ref;
          const way = ways.get(wayId);
          if (!way || !way.nodes || way.nodes.length < 4) continue;
          const latLons: LatLon[] = [];
          for (const nodeId of way.nodes) {
            const coord = nodeCoords.get(nodeId);
            if (coord) latLons.push(coord);
          }
          if (latLons.length < 3) continue;
          const rawCadPoints: Point2D[] = latLons.map((coord) =>
            wgs84ToCadPoint(coord, projectCrs, projectCenter)
          );
          const tags = way.tags || rel.tags || {};
          const { defaultHeight, elevation, storeysCount, heightSource } = extractOsmBuildingElevation(tags);
          const buildingType = resolveBuildingType(tags);
          const buildingName = formatOsmBuildingName(rel.id, rel.tags || tags);
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
            elevation,
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
      }
    }
  }

  return buildings;
}

async function postOverpassQuery(query: string, timeoutMs: number): Promise<OverpassResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OVERPASS_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new Error(errorBody?.error || `Proxy Overpass zwrócił błąd (HTTP ${res.status}).`);
    }

    return (await res.json()) as OverpassResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Znajduje relacje "budynkowe" (`type=building`/`multipolygon`, albo z tagiem `building`/
 * `building:part`) z rundy 1, których way-członkowie mają niekompletną geometrię — way
 * nieobecny w zbiorze albo brakuje współrzędnych któregoś z jego węzłów. Dzieje się tak,
 * gdy way trafił do zbioru WYŁĄCZNIE przez pojedynczą rekursję (`>;`) z relacji, a nie
 * przez bezpośrednie dopasowanie filtra way'ów — pojedyncza rekursja dociąga taki way jako
 * element zbioru, ale nie zawsze zdąża dociągnąć też jego własne węzły. Takie relacje
 * powinny trafić do celowanego dociągu pełnej geometrii w rundzie 2 (patrz `fetchOsmBuildings`).
 */
function isBuildingRelationTags(tags: Record<string, string> | undefined): boolean {
  const t = tags || {};
  return t.type === 'building' || t.type === 'multipolygon' || !!t.building || !!t['building:part'];
}

export interface IncompleteOsmDiagnostics {
  incompleteRelationIds: number[];
  incompleteWayBuildingIds: number[];
}

/**
 * Krok 2: Weryfikacja kompletności pobranych elementów OSM (relacje 3D, building:part, węzły).
 */
export function findIncompleteBuildingPartsAndRelations(elements: OverpassElement[]): IncompleteOsmDiagnostics {
  const nodeIds = new Set<number>();
  const ways = new Map<number, OverpassWay>();
  const relations: OverpassRelation[] = [];

  for (const el of elements) {
    if (el.type === 'node') nodeIds.add(el.id);
    else if (el.type === 'way') ways.set(el.id, el);
    else if (el.type === 'relation') relations.push(el);
  }

  const incompleteRelationIds: number[] = [];
  const incompleteWayBuildingIds: number[] = [];

  // 1. Sprawdzenie relacji (type=building, multipolygon) pod kątem brakujących członków i węzłów
  for (const rel of relations) {
    if (!isBuildingRelationTags(rel.tags)) continue;

    let hasIncompleteMember = false;
    for (const member of rel.members) {
      if (member.type === 'way') {
        const way = ways.get(member.ref);
        if (!way) {
          hasIncompleteMember = true;
          break;
        }
        if (!way.nodes || way.nodes.length < 2 || way.nodes.some((nodeId) => !nodeIds.has(nodeId))) {
          hasIncompleteMember = true;
          break;
        }
      }
    }
    if (hasIncompleteMember) {
      incompleteRelationIds.push(rel.id);
    }
  }

  // 2. Sprawdzenie dróg budynkowych pod kątem brakujących węzłów
  for (const [wayId, way] of ways.entries()) {
    const tags = way.tags || {};
    if (tags.building && tags.building !== 'no') {
      const isMissingNodes = !way.nodes || way.nodes.length < 4 || way.nodes.some((nId) => !nodeIds.has(nId));
      if (isMissingNodes) {
        incompleteWayBuildingIds.push(wayId);
      }
    }
  }

  return {
    incompleteRelationIds,
    incompleteWayBuildingIds,
  };
}

export function findIncompleteRelations(elements: OverpassElement[]): number[] {
  return findIncompleteBuildingPartsAndRelations(elements).incompleteRelationIds;
}

/**
 * Krok 4: Celowany dociąg pełnej geometrii relacji (po ID) z podwójną rekursją.
 */
async function fetchRelationFull(relId: number, timeoutMs = 25000): Promise<OverpassResponse> {
  const query = `
    [out:json][timeout:25];
    relation(${relId});
    (._;>;>;);
    out body;
  `.trim();
  return postOverpassQuery(query, timeoutMs);
}

/**
 * Krok 4: Zbiorczy dociąg pełnej geometrii wielu relacji naraz po ID.
 */
async function fetchRelationsBatch(relIds: number[], timeoutMs = 30000): Promise<OverpassResponse> {
  if (relIds.length === 0) return { elements: [] };
  const idsStr = relIds.join(',');
  const query = `
    [out:json][timeout:30];
    relation(id:${idsStr});
    (._;>;>;);
    out body;
  `.trim();
  return postOverpassQuery(query, timeoutMs);
}

/**
 * Krok 4: Celowany dociąg budynku wraz z częściami building:part wokół niego.
 */
async function fetchBuildingWithPartsById(wayId: number, timeoutMs = 25000): Promise<OverpassResponse> {
  const query = `
    [out:json][timeout:25];
    (
      way(${wayId});
      nwr(around:10)["building:part"];
    );
    (._;>;);
    out body;
  `.trim();
  return postOverpassQuery(query, timeoutMs);
}

/**
 * Krok 4: Zbiorczy dociąg części building:part dla pakietu budynków (way IDs).
 */
async function fetchBuildingPartsBatch(wayIds: number[], timeoutMs = 35000): Promise<OverpassResponse> {
  if (wayIds.length === 0) return { elements: [] };
  const idsStr = wayIds.join(',');
  const query = `
    [out:json][timeout:35];
    (
      way(id:${idsStr});
      nwr(around:10)["building:part"];
    );
    (._;>;);
    out body;
  `.trim();
  return postOverpassQuery(query, timeoutMs);
}

interface OverpassBounds {
  minlat: number;
  minlon: number;
  maxlat: number;
  maxlon: number;
}

/** Rozszerza bbox o stały margines w metrach. */
function padBbox(bbox: WfsBbox, paddingMeters: number): WfsBbox {
  const [west, south, east, north] = bbox;
  const midLat = (south + north) / 2;
  const latPad = paddingMeters / 111_320;
  const lonPad = paddingMeters / (111_320 * Math.cos((midLat * Math.PI) / 180));
  return [west - lonPad, south - latPad, east + lonPad, north + latPad];
}

/**
 * Krok 1: Dzieli bounding box na siatkę mniejszych kwadrantów (np. 300x300m lub 400x400m z zakładem min. 100m).
 */
export function splitBboxIntoQuadrants(
  bbox: WfsBbox,
  tileSizeMeters = 350,
  overlapMeters = 100
): WfsBbox[] {
  const [west, south, east, north] = bbox;
  const midLat = (south + north) / 2;
  const metersPerLat = 111_320;
  const metersPerLon = 111_320 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180));

  const widthMeters = Math.abs(east - west) * metersPerLon;
  const heightMeters = Math.abs(north - south) * metersPerLat;

  if (widthMeters <= tileSizeMeters && heightMeters <= tileSizeMeters) {
    return [bbox];
  }

  const effectiveOverlap = Math.min(overlapMeters, tileSizeMeters * 0.5);
  const stepMeters = Math.max(50, tileSizeMeters - effectiveOverlap);

  const tileLonDeg = tileSizeMeters / metersPerLon;
  const tileLatDeg = tileSizeMeters / metersPerLat;
  const stepLonDeg = stepMeters / metersPerLon;
  const stepLatDeg = stepMeters / metersPerLat;

  const quadrants: WfsBbox[] = [];

  for (let curSouth = south; curSouth < north; curSouth += stepLatDeg) {
    const qNorth = Math.min(north, curSouth + tileLatDeg);
    const qSouth = curSouth;

    for (let curWest = west; curWest < east; curWest += stepLonDeg) {
      const qEast = Math.min(east, curWest + tileLonDeg);
      const qWest = curWest;

      quadrants.push([qWest, qSouth, qEast, qNorth]);
    }
  }

  return quadrants.length > 0 ? quadrants : [bbox];
}

/**
 * Krok 2: Pobranie pojedynczego kwadrantu z automatycznym retry przy błędzie sieci lub timeout serwera.
 */
async function fetchQuadrantWithRetry(
  quadrantBbox: WfsBbox,
  timeoutMs = 65000,
  maxRetries = 2
): Promise<OverpassResponse | null> {
  const [west, south, east, north] = quadrantBbox;
  const query = `
    [out:json][timeout:60];
    (
      nwr["building"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `.trim();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await postOverpassQuery(query, timeoutMs + attempt * 10000);
      if (resp?.remark && /timeout|timed out|quota/i.test(resp.remark)) {
        throw new Error(`Overpass remark timeout: ${resp.remark}`);
      }
      return resp;
    } catch (err) {
      console.warn(`Kwadrant [${south.toFixed(4)}, ${west.toFixed(4)}] próba ${attempt + 1}/${maxRetries + 1} nie powiodła się:`, err);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  return null;
}

/**
 * Runda 0: tanie zapytanie discovery (bez rekursji) na poszerzonym bboxie, które zwraca same
 * ID/tagi/obwiednie relacji budynkowych.
 */
async function fetchRelationEnvelopes(paddedBbox: WfsBbox): Promise<(OverpassRelation & { bounds?: OverpassBounds })[]> {
  const [west, south, east, north] = paddedBbox;
  const query = `
    [out:json][timeout:30];
    (
      relation["building"]["type"="multipolygon"](${south},${west},${north},${east});
      relation["building:part"]["type"="multipolygon"](${south},${west},${north},${east});
      relation["type"="building"](${south},${west},${north},${east});
    );
    out ids tags bb;
  `.trim();
  try {
    const response = await postOverpassQuery(query, ROUND0_TIMEOUT_MS);
    return response.elements.filter((el): el is OverpassRelation & { bounds?: OverpassBounds } => el.type === 'relation');
  } catch (err) {
    console.warn('Runda 0 (discovery obwiedni relacji OSM) nie powiodła się:', err);
    return [];
  }
}

/**
 * Z relacji znalezionych w Rundzie 0 wybiera te, które są budynkowe, mieszczą się (obwiednią)
 * w promieniu projektu i NIE występują w ogóle w elementach Rundy 1.
 */
export function findMissingBuildingRelationIds(
  envelopes: (OverpassRelation & { bounds?: OverpassBounds })[],
  round1Elements: OverpassElement[],
  projectCenter: LatLon,
  projectCrs: CrsDetectionResult,
  radiusMeters: number
): number[] {
  const round1RelationIds = new Set<number>();
  for (const el of round1Elements) {
    if (el.type === 'relation') round1RelationIds.add(el.id);
  }

  const projectCenterCad = wgs84ToCadPoint(projectCenter, projectCrs, projectCenter);

  const missing: number[] = [];
  for (const rel of envelopes) {
    if (!isBuildingRelationTags(rel.tags)) continue;
    if (round1RelationIds.has(rel.id)) continue;
    if (!rel.bounds) continue;

    const centerLatLon: LatLon = {
      lat: (rel.bounds.minlat + rel.bounds.maxlat) / 2,
      lon: (rel.bounds.minlon + rel.bounds.maxlon) / 2,
    };
    const centerCad = wgs84ToCadPoint(centerLatLon, projectCrs, projectCenter);
    const distance = Math.hypot(centerCad.x - projectCenterCad.x, centerCad.y - projectCenterCad.y);
    if (distance <= radiusMeters + ROUND0_BBOX_PADDING_METERS) missing.push(rel.id);
  }
  return missing;
}

/**
 * Główna procedura pobierania budynków z OpenStreetMap przez Overpass API:
 * Krok 1: Podział na kwadranty 300x300m / 400x400m z zakładem >= 100m.
 * Krok 2: Pobranie bazowych budynków (nwr["building"]) per kwadrant z retry.
 * Krok 3: Deduplikacja i połączenie odpowiedzi kwadrantów.
 * Krok 4: Pobranie building:part oraz relacji 3D dla odebranych budynków wg ID.
 * Krok 5: Weryfikacja kompletności geometrii i węzłów.
 * Krok 6: Asemblacja obiektów CAD (odrzucenie envelope, grupowanie części, holes).
 */
export async function fetchOsmBuildings(
  bbox: WfsBbox,
  projectCenter: LatLon,
  projectCrs: CrsDetectionResult,
  radiusMeters?: number,
  onProgress?: (progress: OsmProgressInfo) => void
): Promise<BuildingLoop[]> {
  const queryBbox = radiusMeters ? padBbox(bbox, Math.max(50, radiusMeters * 0.2)) : bbox;
  const quadrants = splitBboxIntoQuadrants(queryBbox, 350, 100);

  // KROK 1 + KROK 2: Szybki scan bazowy kwadrantami z obsługą retry
  onProgress?.({
    stage: 'baseline',
    message: `Pobieranie budynków OSM (kwadranty: 1/${quadrants.length})...`,
    currentDetailIndex: 1,
    totalDetailsCount: quadrants.length,
  });

  const quadrantResponses: OverpassResponse[] = [];
  const CONCURRENCY = 2;

  for (let i = 0; i < quadrants.length; i += CONCURRENCY) {
    const chunk = quadrants.slice(i, i + CONCURRENCY);
    const chunkPromises = chunk.map((qBbox, idx) => {
      const qIndex = i + idx + 1;
      return fetchQuadrantWithRetry(qBbox, 65000, 2).then((resp) => {
        onProgress?.({
          stage: 'baseline',
          message: `Pobieranie budynków OSM (kwadranty: ${Math.min(qIndex, quadrants.length)}/${quadrants.length})...`,
          currentDetailIndex: Math.min(qIndex, quadrants.length),
          totalDetailsCount: quadrants.length,
        });
        return resp;
      });
    });

    const chunkResults = await Promise.all(chunkPromises);
    for (const r of chunkResults) {
      if (r) quadrantResponses.push(r);
    }
  }

  if (quadrantResponses.length === 0) {
    throw new Error('Żaden kwadrant Overpass API nie zwrócił danych. Sprawdź połączenie z siecią.');
  }

  // KROK 3: Połączenie odpowiedzi i deduplikacja
  let combinedResponse = mergeOverpassResponses(...quadrantResponses);

  const baseWays = (combinedResponse?.elements || []).filter(
    (e): e is OverpassWay => e.type === 'way' && !!e.tags && (!!e.tags.building || !!e.tags['building:part'])
  );
  const baseRels = (combinedResponse?.elements || []).filter(
    (e): e is OverpassRelation =>
      e.type === 'relation' && !!e.tags && (!!e.tags.building || e.tags.type === 'building' || e.tags.type === 'multipolygon')
  );
  const foundCount = baseWays.length + baseRels.length;

  // KROK 4: Pobranie building:part oraz relacji 3D wg ID odebranych budynków
  onProgress?.({
    stage: 'details',
    message: `Znaleziono ${foundCount} budynków. Pobieranie części 3D i relacji...`,
    foundBuildingsCount: foundCount,
  });

  const incomplete = findIncompleteBuildingPartsAndRelations(combinedResponse.elements);
  const baseRelIds = Array.from(new Set([...baseRels.map((r) => r.id), ...incomplete.incompleteRelationIds])).slice(
    0,
    ROUND2_MAX_RELATIONS
  );

  const detailResponses: OverpassResponse[] = [];

  // 4a. Batch dociąg części 3D (building:part) wokół odebranych budynków way
  const WAY_BATCH_SIZE = 25;
  const wayIdsToEnrich = baseWays
    .filter((w) => w.tags && w.tags.building && w.tags.building !== 'no')
    .map((w) => w.id);

  const wayBatches: number[][] = [];
  for (let i = 0; i < wayIdsToEnrich.length; i += WAY_BATCH_SIZE) {
    wayBatches.push(wayIdsToEnrich.slice(i, i + WAY_BATCH_SIZE));
  }

  const totalBatches = wayBatches.length + (baseRelIds.length > 0 ? 1 : 0);
  let batchIndex = 0;

  for (const wayBatch of wayBatches) {
    batchIndex++;
    onProgress?.({
      stage: 'details',
      message: `Dociąganie części 3D budynków (pakiet ${batchIndex}/${totalBatches})...`,
      foundBuildingsCount: foundCount,
      currentDetailIndex: batchIndex,
      totalDetailsCount: totalBatches,
    });
    try {
      const batchResp = await fetchBuildingPartsBatch(wayBatch, 35000);
      if (batchResp && batchResp.elements.length > 0) {
        detailResponses.push(batchResp);
      }
    } catch (err) {
      console.warn(`Nie udało się dociągnąć części 3D dla pakietu budynków:`, err);
    }
  }

  // 4b. Batch dociąg pełnej geometrii relacji (type=building / multipolygon)
  if (baseRelIds.length > 0) {
    batchIndex++;
    onProgress?.({
      stage: 'details',
      message: `Dociąganie geometrii relacji 3D (${baseRelIds.length} relacji)...`,
      foundBuildingsCount: foundCount,
      currentDetailIndex: batchIndex,
      totalDetailsCount: totalBatches,
    });
    try {
      const relsBatchResp = await fetchRelationsBatch(baseRelIds, 35000);
      if (relsBatchResp && relsBatchResp.elements.length > 0) {
        detailResponses.push(relsBatchResp);
      }
    } catch (err) {
      console.warn(`Nie udało się dociągnąć geometrii relacji 3D:`, err);
    }
  }

  if (detailResponses.length > 0) {
    combinedResponse = mergeOverpassResponses(combinedResponse, ...detailResponses);
  }

  // KROK 5 + KROK 6: Weryfikacja kompletności, asemblacja i odrzucenie envelope
  onProgress?.({
    stage: 'assembling',
    message: 'Generowanie i sanityzacja geometrii CAD...',
    foundBuildingsCount: foundCount,
  });

  return parseOverpassBuildingsResponse(combinedResponse, projectCenter, projectCrs, radiusMeters);
}

