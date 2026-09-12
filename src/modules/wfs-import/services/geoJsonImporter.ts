import { BuildingLoop, Point2D, ObjectCategory } from '../../../types/geometry';
import { sanitizePolygon } from '../../../utils/importers/geometrySanitizer';
import {
  cadPointToWgs84,
  wgs84ToCadPoint,
  CrsDetectionResult,
  LatLon,
} from '../../../utils/geoTransform';
import { RawTreeFeature, GeoJsonFeatureCollection } from './wfsWarsawClient';
import { WfsTreeFeature, OvertureLineFeature, OverturePolygonFeature, MpzpZoneFeature } from '../store/useWfsStore';
import { MpzpZoneRawFeature } from './wfsMpzpWarsawClient';
import { polygonCircleIntersectionRatio } from '../../../utils/math2d/polygons';


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

    const rings = extractRings(feature.geometry);
    const props = feature.properties || {};
    const storeys = props.KONDYGNACJE_NADZIEMNE != null
      ? Math.round(Number(props.KONDYGNACJE_NADZIEMNE))
      : null;
    const height = estimateHeight(storeys);
    const heightSource: BuildingLoop['heightSource'] = storeys != null ? 'storeys-wfs' : 'default';
    const rawBuildingId = strOrNullIfMissing(props.ID_BUDYNKU);
    const buildingId = rawBuildingId || `wfs-bld-${now}-${fi}`;

    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri];
      const rawPoints: Point2D[] = ring.map(([x, y]) =>
        wfsCoordToCad(x, y, sourceCrs, projectCrs, projectCenter)
      );

      const sanitized = sanitizePolygon(rawPoints, {
        buildingId: ri === 0 ? buildingId : `${buildingId}-r${ri}`,
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

      const id = ri === 0 ? buildingId : `${buildingId}-r${ri}`;
      const storeysCount = storeys ?? DEFAULT_STOREYS;

      buildings.push({
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
        segments: sanitized.segments,
        isClockwise: !sanitized.isCCW,
        transform: { tx: 0, ty: 0, rotationDeg: 0 },
      });
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

    const rings = extractRings(feature.geometry);
    const props = feature.properties || {};
    const parcelId = strOrNullIfMissing(props.ID_DZIALKI) || `wfs-parcel-${now}-${fi}`;
    const plotNumber = str(props.NUMER_DZIALKI);

    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri];
      const rawPoints: Point2D[] = ring.map(([x, y]) =>
        wfsCoordToCad(x, y, sourceCrs, projectCrs, projectCenter)
      );

      const sanitized = sanitizePolygon(rawPoints, {
        buildingId: ri === 0 ? parcelId : `${parcelId}-r${ri}`,
        defaultHeight: 0,
        buildingType: 'residential',
        isCityCentre: false,
      });

      if (!sanitized.valid) {
        warnings.push(`${parcelId}: ${sanitized.warnings?.join(', ')}`);
        continue;
      }

      const id = ri === 0 ? parcelId : `${parcelId}-r${ri}`;

      parcels.push({
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
        segments: sanitized.segments,
        isClockwise: !sanitized.isCCW,
        transform: { tx: 0, ty: 0, rotationDeg: 0 },
      });
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
