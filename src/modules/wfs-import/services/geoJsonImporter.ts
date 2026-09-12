import { BuildingLoop, Point2D, ObjectCategory } from '../../../types/geometry';
import { sanitizePolygon } from '../../../utils/importers/geometrySanitizer';
import {
  cadPointToWgs84,
  wgs84ToCadPoint,
  CrsDetectionResult,
  LatLon,
} from '../../../utils/geoTransform';
import { RawTreeFeature, GeoJsonFeatureCollection } from './wfsWarsawClient';
import { WfsTreeFeature, OvertureLineFeature, OverturePolygonFeature, MpzpZoneFeature, LandCoverFeature } from '../store/useWfsStore';
import { MpzpZoneRawFeature } from './wfsMpzpWarsawClient';
import { polygonCircleIntersectionRatio, isPolygonCCW } from '../../../utils/math2d/polygons';
import { rebuildBuildingSegments } from '../../../utils/segmentStatistics';
import { ensureOppositeWinding } from '../../../utils/ringSegments';


const DEFAULT_FLOOR_HEIGHT = 3.0;
const FIRST_FLOOR_HEIGHT = 3.5;
const DEFAULT_HEIGHT = 15.0;
const DEFAULT_STOREYS = 5;

export interface ImportResult {
  buildings: BuildingLoop[];
  parcels: BuildingLoop[];
  warnings: string[];
}

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function strOrUndefined(v: unknown): string | undefined {
  return v != null ? String(v) : undefined;
}

/**
 * Odczytuje atrybut tekstowy WFS odrzucając wartości niereprezentujące realnych danych — serwisy GUGiK
 * (EGiB, Kraków) potrafią zwrócić dosłowny tekst "None" (serializacja Pythonowego None) zamiast pustej
 * wartości, gdy atrybut jest niedostępny. Traktowanie "None" jak prawdziwego ID powodowało kolizje —
 * wiele budynków bez ID_BUDYNKU dostawało ten sam identyfikator "None" i były traktowane jako jeden obiekt.
 */
function strOrNullIfMissing(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'none') return null;
  return s;
}

/**
 * Konwertuje surowe współrzędne WFS (EPSG:2178 lub EPSG:2180)
 * na lokalne współrzędne CAD projektu.
 */
function wfsCoordToCad(
  x: number,
  y: number,
  sourceCrs: CrsDetectionResult,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon
): Point2D {
  const latLon = cadPointToWgs84({ x, y }, sourceCrs);
  return wgs84ToCadPoint(latLon, projectCrs, projectCenter);
}

function extractRings(geometry: { type: string; coordinates: unknown }): number[][][] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates as number[][][];
  }
  if (geometry.type === 'MultiPolygon') {
    const mp = geometry.coordinates as number[][][][];
    return mp.flatMap((poly) => poly);
  }
  return [];
}

interface PolygonStructure {
  outer: number[][];
  holes: number[][][];
}

/**
 * Jak `extractRings`, ale zachowuje hierarchię obrys-zewnętrzny/otwory zamiast spłaszczać
 * wszystkie pierścienie do jednej listy (GeoJSON `Polygon.coordinates[0]` = obrys, `[1..]` = otwory;
 * `MultiPolygon` = lista takich struktur, po jednej na część).
 */
function extractPolygonStructures(geometry: { type: string; coordinates: unknown }): PolygonStructure[] {
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][];
    if (coords.length === 0) return [];
    return [{ outer: coords[0], holes: coords.slice(1) }];
  }
  if (geometry.type === 'MultiPolygon') {
    const mp = geometry.coordinates as number[][][][];
    return mp.filter((poly) => poly.length > 0).map((poly) => ({ outer: poly[0], holes: poly.slice(1) }));
  }
  return [];
}

function estimateHeight(storeys: number | null): number {
  if (storeys == null || storeys <= 0) return DEFAULT_HEIGHT;
  if (storeys === 1) return FIRST_FLOOR_HEIGHT;
  return FIRST_FLOOR_HEIGHT + (storeys - 1) * DEFAULT_FLOOR_HEIGHT;
}

export function importBuildingsFromGeoJson(
  collection: GeoJsonFeatureCollection,
  sourceCrs: CrsDetectionResult,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon,
  radiusMeters?: number
): ImportResult {
  const buildings: BuildingLoop[] = [];
  const warnings: string[] = [];
  const now = Date.now();

  for (let fi = 0; fi < collection.features.length; fi++) {
    const feature = collection.features[fi];
    if (!feature.geometry) continue;

    const structures = extractPolygonStructures(feature.geometry);
    const props = feature.properties || {};
    const storeys = props.KONDYGNACJE_NADZIEMNE != null
      ? Math.round(Number(props.KONDYGNACJE_NADZIEMNE))
      : null;
    const height = estimateHeight(storeys);
    const heightSource: BuildingLoop['heightSource'] = storeys != null ? 'storeys-wfs' : 'default';
    const rawBuildingId = strOrNullIfMissing(props.ID_BUDYNKU);
    const buildingId = rawBuildingId || `wfs-bld-${now}-${fi}`;

    for (let si = 0; si < structures.length; si++) {
      const struct = structures[si];
      const rawPoints: Point2D[] = struct.outer.map(([x, y]) =>
        wfsCoordToCad(x, y, sourceCrs, projectCrs, projectCenter)
      );

      const id = si === 0 ? buildingId : `${buildingId}-p${si}`;

      const sanitized = sanitizePolygon(rawPoints, {
        buildingId: id,
        defaultHeight: height,
        buildingType: 'residential',
        isCityCentre: false,
      });

      if (!sanitized.valid) {
        warnings.push(`${buildingId}: ${sanitized.warnings?.join(', ')}`);
        continue;
      }

      // Filtr zasięgu: budynek musi mieć co najmniej 50% powierzchni wewnątrz okręgu projektu
      if (radiusMeters != null && radiusMeters > 0) {
        const ratio = polygonCircleIntersectionRatio(sanitized.vertices, 0, 0, radiusMeters);
        if (ratio < 0.1) continue;
      }

      const storeysCount = storeys ?? DEFAULT_STOREYS;
      const outerIsCCW = isPolygonCCW(sanitized.vertices);
      const holes: Point2D[][] = [];
      for (const rawHole of struct.holes) {
        const rawHolePoints: Point2D[] = rawHole.map(([x, y]) =>
          wfsCoordToCad(x, y, sourceCrs, projectCrs, projectCenter)
        );
        const sanitizedHole = sanitizePolygon(rawHolePoints, {
          buildingId: `${id}-hole`,
          defaultHeight: height,
          buildingType: 'residential',
          isCityCentre: false,
        });
        if (!sanitizedHole.valid) continue;
        holes.push(ensureOppositeWinding(sanitizedHole.vertices, isPolygonCCW(sanitizedHole.vertices), outerIsCCW));
      }

      const buildingBase: BuildingLoop = {
        id,
        name: `WFS ${rawBuildingId || `#${fi + 1}`}`,
        layer: 'WFS_BUDYNKI',
        category: 'building',
        isTested: false,
        isIncluded: true,
        isLocked: true,
        isCityCentre: false,
        buildingType: 'residential',
        defaultHeight: height,
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

      buildings.push(rebuildBuildingSegments(buildingBase, sanitized.vertices));
    }
  }

  return { buildings, parcels: [], warnings };
}

export function importParcelsFromGeoJson(
  collection: GeoJsonFeatureCollection,
  sourceCrs: CrsDetectionResult,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon
): ImportResult {
  const parcels: BuildingLoop[] = [];
  const warnings: string[] = [];
  const now = Date.now();

  for (let fi = 0; fi < collection.features.length; fi++) {
    const feature = collection.features[fi];
    if (!feature.geometry) continue;

    const structures = extractPolygonStructures(feature.geometry);
    const props = feature.properties || {};
    const parcelId = strOrNullIfMissing(props.ID_DZIALKI) || `wfs-parcel-${now}-${fi}`;
    const plotNumber = str(props.NUMER_DZIALKI);

    for (let si = 0; si < structures.length; si++) {
      const struct = structures[si];
      const rawPoints: Point2D[] = struct.outer.map(([x, y]) =>
        wfsCoordToCad(x, y, sourceCrs, projectCrs, projectCenter)
      );

      const id = si === 0 ? parcelId : `${parcelId}-p${si}`;

      const sanitized = sanitizePolygon(rawPoints, {
        buildingId: id,
        defaultHeight: 0,
        buildingType: 'residential',
        isCityCentre: false,
      });

      if (!sanitized.valid) {
        warnings.push(`${parcelId}: ${sanitized.warnings?.join(', ')}`);
        continue;
      }

      const outerIsCCW = isPolygonCCW(sanitized.vertices);
      const holes: Point2D[][] = [];
      for (const rawHole of struct.holes) {
        const rawHolePoints: Point2D[] = rawHole.map(([x, y]) =>
          wfsCoordToCad(x, y, sourceCrs, projectCrs, projectCenter)
        );
        const sanitizedHole = sanitizePolygon(rawHolePoints, {
          buildingId: `${id}-hole`,
          defaultHeight: 0,
          buildingType: 'residential',
          isCityCentre: false,
        });
        if (!sanitizedHole.valid) continue;
        holes.push(ensureOppositeWinding(sanitizedHole.vertices, isPolygonCCW(sanitizedHole.vertices), outerIsCCW));
      }

      const parcelBase: BuildingLoop = {
        id,
        name: `Działka ${plotNumber || `#${fi + 1}`}`,
        layer: 'WFS_DZIALKI',
        category: 'boundary' as ObjectCategory,
        areaType: 'plot',
        plotNumber: strOrUndefined(props.NUMER_DZIALKI),
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

      parcels.push(rebuildBuildingSegments(parcelBase, sanitized.vertices));
    }
  }

  return { buildings: [], parcels, warnings };
}

function extractLineStrings(geometry: { type: string; coordinates: unknown }): number[][][] {
  if (geometry.type === 'LineString') {
    return [geometry.coordinates as number[][]];
  }
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates as number[][][];
  }
  return [];
}

/**
 * Konwertuje cechy liniowe (drogi/koleje) z Overture Maps (WGS84) na OvertureLineFeature
 * w lokalnych współrzędnych CAD. Overture nie wymaga kroku EPSG→WGS84 (dane są już WGS84).
 */
export function importOvertureLines(
  collection: GeoJsonFeatureCollection,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon
): OvertureLineFeature[] {
  const result: OvertureLineFeature[] = [];

  for (let fi = 0; fi < collection.features.length; fi++) {
    const feature = collection.features[fi];
    if (!feature.geometry) continue;

    const lines = extractLineStrings(feature.geometry);
    const props = feature.properties || {};
    const featureId = str(props.id) || `overture-line-${fi}`;
    const className = strOrUndefined(props.class) ?? null;

    for (let li = 0; li < lines.length; li++) {
      const points: Point2D[] = lines[li].map(([lon, lat]) =>
        wgs84ToCadPoint({ lat, lon }, projectCrs, projectCenter)
      );
      if (points.length < 2) continue;

      result.push({
        id: li === 0 ? featureId : `${featureId}-${li}`,
        points,
        className,
      });
    }
  }

  return result;
}

/**
 * Konwertuje cechy powierzchniowe (zieleń/wody) z Overture Maps (WGS84) na OverturePolygonFeature
 * w lokalnych współrzędnych CAD.
 */
export function importOverturePolygons(
  collection: GeoJsonFeatureCollection,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon
): OverturePolygonFeature[] {
  const result: OverturePolygonFeature[] = [];

  for (let fi = 0; fi < collection.features.length; fi++) {
    const feature = collection.features[fi];
    if (!feature.geometry) continue;

    const rawRings = extractRings(feature.geometry);
    if (rawRings.length === 0) continue;

    const props = feature.properties || {};
    const featureId = str(props.id) || `overture-poly-${fi}`;
    const className = strOrUndefined(props.class) ?? null;

    const rings: Point2D[][] = rawRings
      .map((ring) => ring.map(([lon, lat]) => wgs84ToCadPoint({ lat, lon }, projectCrs, projectCenter)))
      .filter((ring) => ring.length >= 3);

    if (rings.length === 0) continue;

    result.push({ id: featureId, rings, className });
  }

  return result;
}

/**
 * Konwertuje surowe strefy MPZP z usługi REST BGiK "PrzeznaczenieTerenow" (WGS84, patrz
 * `wfsMpzpWarsawClient.ts`) na MpzpZoneFeature w lokalnych współrzędnych CAD.
 */
export function importMpzpZonesFromGeoJson(
  features: MpzpZoneRawFeature[],
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon
): MpzpZoneFeature[] {
  const result: MpzpZoneFeature[] = [];

  for (let fi = 0; fi < features.length; fi++) {
    const feature = features[fi];
    if (!feature.geometry) continue;

    const rawRings = extractRings(feature.geometry as { type: string; coordinates: unknown });
    if (rawRings.length === 0) continue;

    const props = feature.properties || {};
    const featureId = strOrNullIfMissing(props.objectid) ?? `mpzp-zone-${fi}`;

    const rings: Point2D[][] = rawRings
      .map((ring) => ring.map(([lon, lat]) => wgs84ToCadPoint({ lat, lon }, projectCrs, projectCenter)))
      .filter((ring) => ring.length >= 3);

    if (rings.length === 0) continue;

    result.push({
      id: featureId,
      rings,
      funSymb: strOrNullIfMissing(props.fun_symb),
      funNazwa: strOrNullIfMissing(props.fun_nazwa),
      maxWysokosc: strOrNullIfMissing(props.max_wys),
      intenZab: strOrNullIfMissing(props.inten_zab),
      powBio: strOrNullIfMissing(props.pow_bio),
      liczKond: strOrNullIfMissing(props.licz_kond),
      nazwaPlan: strOrNullIfMissing(props.nazwa_plan),
    });
  }

  return result;
}

/**
 * Konwertuje jednostki pokrycia terenu z ogólnopolskiej usługi WFS GUGiK "wfsLCV" (patrz
 * `wfsLcvClient.ts`) na LandCoverFeature w lokalnych współrzędnych CAD. Zachowuje otwory
 * wewnętrzne (`extractPolygonStructures()`) — te geometrie realnie mają enklawy/wyspy.
 * Bez sanityzacji do segmentów budynku (`sanitizePolygon` tu służy tylko do odrzucenia
 * zdegenerowanych punktów/krawędzi i wyznaczenia kierunku nawijania) — to czysta geometria
 * referencyjna, nie `BuildingLoop`.
 */
export function importLandCoverFromGeoJson(
  collection: GeoJsonFeatureCollection,
  sourceCrs: CrsDetectionResult,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon
): LandCoverFeature[] {
  const result: LandCoverFeature[] = [];

  for (let fi = 0; fi < collection.features.length; fi++) {
    const feature = collection.features[fi];
    if (!feature.geometry) continue;

    const structures = extractPolygonStructures(feature.geometry);
    const props = feature.properties || {};
    const classHref = strOrNullIfMissing(props.class);
    const landCoverClass = classHref ? classHref.split('/').filter(Boolean).pop() ?? null : null;

    for (let si = 0; si < structures.length; si++) {
      const struct = structures[si];
      const rawPoints: Point2D[] = struct.outer.map(([x, y]) =>
        wfsCoordToCad(x, y, sourceCrs, projectCrs, projectCenter)
      );

      const id = `lcv-${fi}-${si}`;
      const sanitized = sanitizePolygon(rawPoints, { buildingId: id, defaultHeight: 0 });
      if (!sanitized.valid) continue;

      const outerIsCCW = isPolygonCCW(sanitized.vertices);
      const holes: Point2D[][] = [];
      for (const rawHole of struct.holes) {
        const rawHolePoints: Point2D[] = rawHole.map(([x, y]) =>
          wfsCoordToCad(x, y, sourceCrs, projectCrs, projectCenter)
        );
        const sanitizedHole = sanitizePolygon(rawHolePoints, { buildingId: `${id}-hole`, defaultHeight: 0 });
        if (!sanitizedHole.valid) continue;
        holes.push(ensureOppositeWinding(sanitizedHole.vertices, isPolygonCCW(sanitizedHole.vertices), outerIsCCW));
      }

      result.push({
        id,
        outer: sanitized.vertices,
        holes: holes.length > 0 ? holes : undefined,
        landCoverClass,
      });
    }
  }

  return result;
}

/**
 * Konwertuje surowe dane drzew z WFS (GML) na WfsTreeFeature
 * z pozycjami w lokalnych współrzędnych CAD.
 */
export function importTrees(
  rawTrees: RawTreeFeature[],
  sourceCrs: CrsDetectionResult,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon
): WfsTreeFeature[] {
  return rawTrees
    .filter((t) => t.x !== 0 || t.y !== 0)
    .map((t) => {
      const pos = wfsCoordToCad(t.x, t.y, sourceCrs, projectCrs, projectCenter);
      return {
        id: t.objectId,
        position: pos,
        inventoryNumber: t.inventoryNumber,
        namePolish: t.namePolish,
        nameLatin: t.nameLatin,
        height: t.height,
        trunkCircumference: t.trunkCircumference,
        managingUnit: t.managingUnit,
        updatedAt: t.updatedAt,
      };
    });
}
