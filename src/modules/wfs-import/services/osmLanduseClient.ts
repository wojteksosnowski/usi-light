/**
 * osmLanduseClient.ts
 *
 * Klient pobierania danych o zagospodarowaniu terenu (landuse, leisure, natural, amenity)
 * z OpenStreetMap (OSM) przez Overpass API z automatycznym przełączaniem endpointów (failover),
 * parsowaniem geometrii (ways, relacje multipolygon z otworami) oraz transformacją do współrzędnych sceny CAD.
 */

import { Point2D } from '../../../types/geometry';
import { LatLon, wgs84ToCadPoint, CrsDetectionResult } from '../../../utils/geoTransform';
import { OsmLanduseFeature } from '../store/useOsmLanduseStore';
import { WfsTreeFeature } from '../store/useWfsStore';

/** Bbox [west, south, east, north] */
export type OsmBbox = [number, number, number, number];

export interface OsmFetchResult {
  features: OsmLanduseFeature[];
  trees: WfsTreeFeature[];
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

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

interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Rozpoznaje ID warstwy na podstawie tagów OSM
 */
export function matchOsmLayerId(tags: Record<string, string>): string {
  const highway = tags.highway;
  const railway = tags.railway;
  const natural = tags.natural;
  const landuse = tags.landuse;
  const leisure = tags.leisure;
  const amenity = tags.amenity;
  const waterway = tags.waterway;

  // 1. Drzewa i zieleń wysoka
  if (
    natural === 'tree' ||
    natural === 'tree_row' ||
    natural === 'tree_group'
  ) {
    return 'osm_trees';
  }

  // 2. Drogi główne i tranzytowe
  if (
    highway === 'motorway' ||
    highway === 'trunk' ||
    highway === 'primary' ||
    highway === 'secondary' ||
    highway === 'tertiary' ||
    highway === 'motorway_link' ||
    highway === 'trunk_link' ||
    highway === 'primary_link' ||
    highway === 'secondary_link' ||
    highway === 'tertiary_link'
  ) {
    return 'osm_roads_highways';
  }

  // 3. Ścieżki, chodniki, drogi rowerowe i ciągi piesze
  if (
    highway === 'pedestrian' ||
    highway === 'footway' ||
    highway === 'cycleway' ||
    highway === 'path' ||
    highway === 'steps' ||
    highway === 'track' ||
    highway === 'bridleway'
  ) {
    return 'osm_roads_paths';
  }

  // 4. Drogi lokalne, dojazdowe i pozostałe ulice
  if (
    highway === 'residential' ||
    highway === 'unclassified' ||
    highway === 'living_street' ||
    highway === 'service' ||
    highway === 'road' ||
    (highway && highway !== 'no')
  ) {
    return 'osm_roads_local';
  }

  // 5. Kolej i transport szynowy
  if (
    railway === 'rail' ||
    railway === 'light_rail' ||
    railway === 'subway' ||
    railway === 'tram' ||
    railway === 'narrow_gauge' ||
    railway === 'funicular' ||
    railway === 'monorail' ||
    (railway && railway !== 'no' && railway !== 'abandoned')
  ) {
    return 'osm_railways';
  }

  // 6. Parkingi i place manewrowe
  if (
    amenity === 'parking' ||
    amenity === 'parking_space' ||
    amenity === 'bicycle_parking'
  ) {
    return 'osm_parking';
  }

  // 7. Wody i cieki wodne
  if (
    natural === 'water' ||
    waterway === 'riverbank' ||
    waterway === 'dock' ||
    waterway === 'river' ||
    waterway === 'stream' ||
    waterway === 'canal' ||
    waterway === 'drain' ||
    waterway === 'ditch' ||
    landuse === 'basin' ||
    landuse === 'reservoir' ||
    landuse === 'salt_pond'
  ) {
    return 'osm_landuse_water';
  }

  // 8. Lasy i zadrzewienia
  if (
    landuse === 'forest' ||
    natural === 'wood' ||
    natural === 'scrub' ||
    natural === 'heath'
  ) {
    return 'osm_landuse_forest';
  }

  // 9. Parki, zieleńce i łąki
  if (
    leisure === 'park' ||
    leisure === 'garden' ||
    leisure === 'village_green' ||
    landuse === 'grass' ||
    landuse === 'meadow' ||
    landuse === 'recreation_ground' ||
    landuse === 'greenfield'
  ) {
    return 'osm_landuse_green';
  }

  // 10. Uprawy i tereny rolne
  if (
    landuse === 'farmland' ||
    landuse === 'farmyard' ||
    landuse === 'orchard' ||
    landuse === 'allotments' ||
    landuse === 'vineyard' ||
    landuse === 'plant_nursery'
  ) {
    return 'osm_landuse_farmland';
  }

  // 11. Sport i rekreacja
  if (
    leisure === 'pitch' ||
    leisure === 'track' ||
    leisure === 'sports_centre' ||
    leisure === 'stadium' ||
    leisure === 'playground' ||
    leisure === 'golf_course' ||
    leisure === 'water_park' ||
    leisure === 'fitness_station'
  ) {
    return 'osm_landuse_sports';
  }

  // 12. Edukacja i usługi publiczne
  if (
    amenity === 'school' ||
    amenity === 'university' ||
    amenity === 'college' ||
    amenity === 'kindergarten' ||
    amenity === 'hospital' ||
    amenity === 'clinic' ||
    amenity === 'townhall' ||
    amenity === 'community_centre' ||
    landuse === 'civic' ||
    landuse === 'religious' ||
    landuse === 'cemetery'
  ) {
    return 'osm_landuse_civic';
  }

  // 13. Usługi i handel
  if (
    landuse === 'commercial' ||
    landuse === 'retail' ||
    landuse === 'office'
  ) {
    return 'osm_landuse_commercial';
  }

  // 14. Przemysł, magazyny i infrastruktura
  if (
    landuse === 'industrial' ||
    landuse === 'quarry' ||
    landuse === 'port' ||
    landuse === 'landfill' ||
    landuse === 'construction'
  ) {
    return 'osm_landuse_industrial';
  }

  // 15. Tereny mieszkaniowe
  if (landuse === 'residential') {
    return 'osm_landuse_residential';
  }

  return 'osm_landuse_other';
}

/** Słownik rozpoznawania rodzaju botanicznego (genus) na podstawie nazw polskich i łacińskich */
export function detectTreeGenus(tags: Record<string, string>): string | undefined {
  if (tags.genus) return tags.genus.trim();
  const text = `${tags.species || ''} ${tags['species:la'] || ''} ${tags['species:pl'] || ''} ${tags.name || ''}`.toLowerCase();
  
  if (text.includes('quercus') || text.includes('dąb') || text.includes('dab')) return 'Quercus';
  if (text.includes('tilia') || text.includes('lipa')) return 'Tilia';
  if (text.includes('acer') || text.includes('klon') || text.includes('jawor')) return 'Acer';
  if (text.includes('betula') || text.includes('brzoza')) return 'Betula';
  if (text.includes('pinus') || text.includes('sosna')) return 'Pinus';
  if (text.includes('picea') || text.includes('świerk') || text.includes('swierk')) return 'Picea';
  if (text.includes('abies') || text.includes('jodła') || text.includes('jodla')) return 'Abies';
  if (text.includes('larix') || text.includes('modrzew')) return 'Larix';
  if (text.includes('thuja') || text.includes('żywotnik') || text.includes('tuja')) return 'Thuja';
  if (text.includes('taxus') || text.includes('cis')) return 'Taxus';
  if (text.includes('juniperus') || text.includes('jałowiec') || text.includes('jalowiec')) return 'Juniperus';
  if (text.includes('pseudotsuga') || text.includes('daglezja')) return 'Pseudotsuga';
  if (text.includes('fraxinus') || text.includes('jesion')) return 'Fraxinus';
  if (text.includes('carpinus') || text.includes('grab')) return 'Carpinus';
  if (text.includes('fagus') || text.includes('buk')) return 'Fagus';
  if (text.includes('platanus') || text.includes('platan')) return 'Platanus';
  if (text.includes('aesculus') || text.includes('kasztan')) return 'Aesculus';
  if (text.includes('salix') || text.includes('wierzba')) return 'Salix';
  if (text.includes('populus') || text.includes('topola') || text.includes('osika')) return 'Populus';
  if (text.includes('robinia') || text.includes('akacja')) return 'Robinia';
  if (text.includes('sorbus') || text.includes('jarząb') || text.includes('jarzab') || text.includes('jarzębina')) return 'Sorbus';
  if (text.includes('ulmus') || text.includes('wiąz') || text.includes('wiaz')) return 'Ulmus';
  if (text.includes('alnus') || text.includes('olsza') || text.includes('olcha')) return 'Alnus';
  if (text.includes('prunus') || text.includes('śliwa') || text.includes('wiśnia') || text.includes('czeremcha')) return 'Prunus';
  if (text.includes('malus') || text.includes('jabłoń') || text.includes('jablon')) return 'Malus';
  if (text.includes('pyrus') || text.includes('grusza')) return 'Pyrus';
  if (text.includes('juglans') || text.includes('orzech')) return 'Juglans';
  if (text.includes('castanea') || text.includes('kasztan jadalny')) return 'Castanea';
  if (text.includes('catalpa') || text.includes('surmia')) return 'Catalpa';
  if (text.includes('ginkgo') || text.includes('miłorząb') || text.includes('milorzab')) return 'Ginkgo';
  if (text.includes('magnolia')) return 'Magnolia';

  return undefined;
}

/** Określa typ liścia (needleleaved / broadleaved) na podstawie rodzaju i tagów */
export function resolveLeafType(tags: Record<string, string>, genus?: string): string {
  if (tags.leaf_type) return tags.leaf_type;
  const g = (genus || tags.genus || '').toLowerCase();
  const needleGenera = ['pinus', 'picea', 'abies', 'larix', 'thuja', 'taxus', 'juniperus', 'pseudotsuga', 'tsuga', 'chamaecyparis'];
  if (needleGenera.includes(g)) return 'needleleaved';
  return 'broadleaved';
}

/** Parsuje wysokość drzewa z OSM do liczby metrów */
export function parseOsmHeight(val?: string): number | undefined {
  if (!val) return undefined;
  const num = parseFloat(val.replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(num) || num <= 0 ? undefined : num;
}

/** Parsuje obwód pnia z OSM i normalizuje do centymetrów (np. circumference="1.45" -> "145", lub diameter="280" -> obwód pnia ~88cm) */
export function parseOsmCircumference(val?: string, tags?: Record<string, string>): string | undefined {
  if (val) {
    const cleaned = val.trim().toLowerCase();
    const num = parseFloat(cleaned.replace(',', '.'));
    if (!isNaN(num) && num > 0) {
      if (cleaned.includes('m') && !cleaned.includes('cm')) {
        return String(Math.round(num * 100));
      }
      if (num < 10) {
        return String(Math.round(num * 100));
      }
      return String(Math.round(num));
    }
  }

  // W OSM i inwentaryzacjach miejskich (np. Geopoz), tag `diameter` lub `diameter_trunk` oznacza średnicę pnia w mm lub cm
  if (tags) {
    const rawTrunk = tags.diameter_trunk || tags['trunk:diameter'] || tags.diameter;
    if (rawTrunk) {
      // Obsługa formatów wielopniowych np. "45| 34" lub liczb całkowitych w mm np. "280" / "510"
      const firstPart = rawTrunk.split(/[|;/]/)[0].trim();
      const num = parseFloat(firstPart.replace(',', '.'));
      if (!isNaN(num) && num > 0) {
        let diamCm = num;
        if (num >= 50) {
          // Jeśli liczba jest >= 50 (np. 280, 510, 820), jest to średnica pnia w milimetrach
          diamCm = num / 10;
        }
        // Obwód C = pi * d
        const circumCm = Math.round(diamCm * Math.PI);
        return String(circumCm);
      }
    }
  }

  return undefined;
}

/** Parsuje średnicę korony z OSM w metrach */
export function parseOsmCrownDiameter(tags: Record<string, string>): number | undefined {
  const raw = tags.diameter_crown || tags['crown:diameter'] || tags.crown_diameter;
  if (!raw) return undefined;
  const num = parseFloat(raw.replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(num) || num <= 0 ? undefined : Math.min(35, num);
}

/** Szybki deterministyczny hash z ID węzła OSM zwracający liczbę z zakresu [0, 1) */
export function getPseudoRandomSeed(idOrSeed: number | string): number {
  let h = typeof idOrSeed === 'number' ? idOrSeed : 0;
  if (typeof idOrSeed === 'string') {
    for (let i = 0; i < idOrSeed.length; i++) {
      h = (Math.imul(31, h) + idOrSeed.charCodeAt(i)) | 0;
    }
  }
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

/**
 * Szacuje parametry dendrologiczne (wysokość i średnica korony) drzewa,
 * gdy nie są one wprost podane w tagach OSM.
 * Zawiera deterministyczną, naturalną wariację gabarytów w oparciu o ID węzła OSM.
 */
export function estimateTreeDimensions(
  tags: Record<string, string>,
  genus?: string,
  seedId?: number | string
): { height: number; crownDiameter: number } {
  const explicitHeight = parseOsmHeight(tags.height);
  const explicitCrown = parseOsmCrownDiameter(tags);
  const circumCm = parseFloat(parseOsmCircumference(tags.circumference, tags) || '0') || 0;
  const isNeedle = resolveLeafType(tags, genus) === 'needleleaved';

  // Ziarno losowe per konkretny punkt OSM (deterministyczne, identyczne przy każdym odświeżeniu)
  const rand1 = seedId != null ? getPseudoRandomSeed(seedId) : 0.5;
  const rand2 = seedId != null ? getPseudoRandomSeed(`${seedId}_crown`) : 0.5;

  // 1. Wyznaczenie wysokości H
  let height = explicitHeight;
  if (!height) {
    if (circumCm > 0) {
      // Obwód 50cm -> H ~ 8m; obwód 200cm -> H ~ 18m; obwód 400cm -> H ~ 26m
      height = Math.max(5, Math.min(32, 4 + Math.sqrt(circumCm) * 1.1));
    } else if (explicitCrown) {
      height = Math.max(4, Math.min(30, explicitCrown * (isNeedle ? 2.5 : 1.8)));
    } else {
      // Subtelny naturalny rozrzut wysokości (±15-18%):
      // Liściaste: 10.0m - 14.0m (baza 12m)
      // Iglaste: 11.8m - 16.2m (baza 14m)
      const baseHeight = isNeedle ? 14.0 : 12.0;
      const heightVariation = (rand1 - 0.5) * (isNeedle ? 4.4 : 4.0);
      height = Math.max(5.0, baseHeight + heightVariation);
    }
  }

  // 2. Wyznaczenie średnicy korony D_crown
  let crownDiameter = explicitCrown;
  if (!crownDiameter) {
    const g = (genus || '').toLowerCase();
    // Współczynnik rozłożystości korony w relacji do wysokości
    let crownRatio = isNeedle ? 0.35 : 0.55;
    if (['quercus', 'tilia', 'platanus', 'aesculus', 'fagus', 'juglans'].includes(g)) {
      crownRatio = 0.68; // Gatunki rozłożyste
    } else if (['populus', 'thuja', 'juniperus', 'cupressus'].includes(g)) {
      crownRatio = 0.28; // Gatunki kolumnowe/strzeliste
    } else if (['betula', 'salix', 'alnus'].includes(g)) {
      crownRatio = 0.48;
    }

    if (circumCm > 0) {
      crownDiameter = Math.max(2.5, Math.min(22, 1.8 + Math.sqrt(circumCm) * 0.45));
    } else {
      // Dyskretna wariacja kształtu/rozłożystości korony (±8%)
      const ratioVariation = 1.0 + (rand2 - 0.5) * 0.16;
      crownDiameter = Math.max(2.5, Math.min(22, height * crownRatio * ratioVariation));
    }
  }

  return { height: Number(height.toFixed(1)), crownDiameter: Number(crownDiameter.toFixed(1)) };
}

/** Sprawdza czy drzewo w OSM jest oznaczone jako pomnik przyrody lub obiekt chroniony */
export function isOsmNaturalMonument(tags: Record<string, string>): boolean {
  return (
    tags.denotation === 'natural_monument' ||
    tags.denotation === 'monument' ||
    tags.monument === 'yes' ||
    tags.natural_monument === 'yes' ||
    tags.protected === 'yes' ||
    tags.heritage === 'yes'
  );
}

/** Oblicza pole wielokąta ze wzoru Gaussa (Shoelace) */
function computePolygonArea(vertices: Point2D[]): number {
  if (vertices.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

/** Oblicza długość polilinii (trasy) w metrach */
export function computePolylineLength(points: Point2D[]): number {
  if (points.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    len += Math.hypot(dx, dy);
  }
  return len;
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
 * Pobiera dane Landuse, dróg, infrastruktury oraz drzew z Overpass API dla zadanego BBox i transformuje do układu CAD projektu.
 * Ogranicza drzewa i obiekty do promienia projektu (radiusMeters + margines na korony).
 */
export async function fetchOsmLanduse(
  bbox: OsmBbox,
  projectCenter: LatLon,
  projectCrs: CrsDetectionResult,
  radiusMeters?: number
): Promise<OsmFetchResult> {
  const [west, south, east, north] = bbox;

  const query = `
    [out:json][timeout:30];
    (
      way["landuse"](${south},${west},${north},${east});
      relation["landuse"](${south},${west},${north},${east});
      way["leisure"](${south},${west},${north},${east});
      relation["leisure"](${south},${west},${north},${east});
      way["natural"~"water|wood|scrub|wetland|heath"](${south},${west},${north},${east});
      relation["natural"~"water|wood|scrub|wetland|heath"](${south},${west},${north},${east});
      way["amenity"~"school|university|college|kindergarten|hospital|clinic|townhall|community_centre|parking|parking_space|bicycle_parking"](${south},${west},${north},${east});
      relation["amenity"~"school|university|college|kindergarten|hospital|clinic|townhall|community_centre|parking|parking_space|bicycle_parking"](${south},${west},${north},${east});
      way["highway"](${south},${west},${north},${east});
      relation["highway"](${south},${west},${north},${east});
      way["railway"](${south},${west},${north},${east});
      relation["railway"](${south},${west},${north},${east});
      way["waterway"](${south},${west},${north},${east});
      relation["waterway"](${south},${west},${north},${east});
      node["natural"="tree"](${south},${west},${north},${east});
      way["natural"="tree_row"](${south},${west},${north},${east});
      way["natural"="tree_group"](${south},${west},${north},${east});
      relation["natural"="tree_group"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `.trim();

  let responseData: OverpassResponse | null = null;
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (res.ok) {
        responseData = (await res.json()) as OverpassResponse;
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!responseData) {
    throw new Error(
      `Nie udało się pobrać danych z Overpass API: ${lastError?.message || 'Błąd połączenia'}`
    );
  }

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

  const features: OsmLanduseFeature[] = [];
  const trees: WfsTreeFeature[] = [];
  const processedWayIds = new Set<number>();
  const maxTreeDist = radiusMeters != null ? radiusMeters + 15 : Infinity;

  // 1. Przetwarzanie pojedynczych drzew (nodes)
  for (const [nodeId, node] of nodes.entries()) {
    const tags = node.tags;
    if (!tags || tags.natural !== 'tree') continue;

    const pos = wgs84ToCadPoint({ lat: node.lat, lon: node.lon }, projectCrs, projectCenter);
    const distFromCenter = Math.hypot(pos.x, pos.y);
    if (distFromCenter > maxTreeDist) continue;

    const genus = detectTreeGenus(tags);
    const leafType = resolveLeafType(tags, genus);
    const dims = estimateTreeDimensions(tags, genus, nodeId);
    const nameLatin = tags.species || tags['species:la'] || (genus ? `${genus} sp.` : '');
    const namePolish = tags['species:pl'] || tags.name || '';
    const trunkCircumference = parseOsmCircumference(tags.circumference, tags);
    const isMonument = isOsmNaturalMonument(tags);

    trees.push({
      id: `osm_tree_${nodeId}`,
      position: pos,
      nameLatin,
      namePolish,
      genus: genus || tags.genus,
      height: dims.height,
      trunkCircumference,
      crownDiameter: dims.crownDiameter,
      leafType,
      leafCycle: tags.leaf_cycle,
      isMonument,
      source: 'osm',
      tags,
    });
  }

  // 2. Przetwarzanie relacji (Multipolygons)
  for (const rel of relations) {
    const tags = rel.tags || {};
    const layerId = matchOsmLayerId(tags);

    const outerWayNodes: number[][] = [];
    const innerWayNodes: number[][] = [];

    for (const member of rel.members) {
      if (member.type === 'way') {
        const way = ways.get(member.ref);
        if (way && way.nodes.length >= 2) {
          if (tags.type === 'multipolygon' || tags.type === 'boundary') {
            processedWayIds.add(way.id);
          }
          if (member.role === 'inner') {
            innerWayNodes.push(way.nodes);
          } else {
            outerWayNodes.push(way.nodes);
          }
        }
      }
    }

    const outerRings = assembleWaysIntoRings(outerWayNodes, nodeCoords);
    const innerRings = assembleWaysIntoRings(innerWayNodes, nodeCoords);

    const holes: Point2D[][] = innerRings.map((ring) =>
      ring.map((ll) => wgs84ToCadPoint(ll, projectCrs, projectCenter))
    );

    for (const outerRing of outerRings) {
      const polygon: Point2D[] = outerRing.map((ll) =>
        wgs84ToCadPoint(ll, projectCrs, projectCenter)
      );

      if (polygon.length >= 3) {
        const area = computePolygonArea(polygon);
        features.push({
          id: `osm_rel_${rel.id}`,
          layerId,
          name: tags.name,
          osmType: 'relation',
          osmId: rel.id,
          tags,
          geometryType: 'polygon',
          polygon,
          holes: holes.length > 0 ? holes : undefined,
          areaM2: area,
        });
      }
    }
  }

  // 3. Przetwarzanie pojedynczych linii i wielokątów (ways)
  for (const [wayId, way] of ways.entries()) {
    if (processedWayIds.has(wayId)) continue;
    if (!way.tags) continue;
    if (way.nodes.length < 2) continue;

    // A. Szpalery drzew (tree_row)
    if (way.tags.natural === 'tree_row') {
      const genus = detectTreeGenus(way.tags);
      const leafType = resolveLeafType(way.tags, genus);
      const nameLatin = way.tags.species || way.tags['species:la'] || (genus ? `${genus} sp.` : '');
      const namePolish = way.tags['species:pl'] || way.tags.name || '';
      const trunkCircumference = parseOsmCircumference(way.tags.circumference);
      const isMonument = isOsmNaturalMonument(way.tags);

      for (let i = 0; i < way.nodes.length; i++) {
        const coord = nodeCoords.get(way.nodes[i]);
        if (coord) {
          const pos = wgs84ToCadPoint(coord, projectCrs, projectCenter);
          const distFromCenter = Math.hypot(pos.x, pos.y);
          if (distFromCenter > maxTreeDist) continue;

          const dims = estimateTreeDimensions(way.tags, genus, `${way.id}_${i}`);

          trees.push({
            id: `osm_treerow_${way.id}_${i}`,
            position: pos,
            nameLatin,
            namePolish,
            genus: genus || way.tags.genus,
            height: dims.height,
            trunkCircumference,
            crownDiameter: dims.crownDiameter,
            leafType,
            leafCycle: way.tags.leaf_cycle,
            isMonument,
            source: 'osm',
            tags: way.tags,
          });
        }
      }
      continue;
    }

    const layerId = matchOsmLayerId(way.tags);
    const isClosed = way.nodes[0] === way.nodes[way.nodes.length - 1];
    const isAreaExplicit = way.tags.area === 'yes';
    const isHighway = !!way.tags.highway;
    const isRailway = !!way.tags.railway;
    const isWaterwayLinear =
      !!way.tags.waterway &&
      ['river', 'stream', 'canal', 'drain', 'ditch'].includes(way.tags.waterway);
    const isParking =
      way.tags.amenity === 'parking' ||
      way.tags.amenity === 'parking_space' ||
      way.tags.amenity === 'bicycle_parking';

    const pts: Point2D[] = [];
    for (const nodeId of way.nodes) {
      const coord = nodeCoords.get(nodeId);
      if (coord) {
        pts.push(wgs84ToCadPoint(coord, projectCrs, projectCenter));
      }
    }
    if (pts.length < 2) continue;

    // Linie: drogi, tory, cieki (chyba że oznaczono jawnie jako area=yes lub parking)
    const treatAsLine =
      (!isAreaExplicit && (isHighway || isRailway || isWaterwayLinear) && !isParking) ||
      (!isClosed && pts.length >= 2);

    if (treatAsLine) {
      const length = computePolylineLength(pts);
      features.push({
        id: `osm_way_${way.id}`,
        layerId,
        name: way.tags.name,
        osmType: 'way',
        osmId: way.id,
        tags: way.tags,
        geometryType: 'line',
        points: pts,
        lengthM: length,
      });
    } else if (isClosed && pts.length >= 3) {
      const area = computePolygonArea(pts);
      features.push({
        id: `osm_way_${way.id}`,
        layerId,
        name: way.tags.name,
        osmType: 'way',
        osmId: way.id,
        tags: way.tags,
        geometryType: 'polygon',
        polygon: pts,
        areaM2: area,
      });
    }
  }

  return { features, trees };
}
