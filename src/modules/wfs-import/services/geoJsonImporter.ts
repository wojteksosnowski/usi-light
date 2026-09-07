import { BuildingLoop, Point2D, ObjectCategory } from '../../../types/geometry';
import { sanitizePolygon } from '../../../utils/importers/geometrySanitizer';
import {
  cadPointToWgs84,
  wgs84ToCadPoint,
  CrsDetectionResult,
  LatLon,
} from '../../../utils/geoTransform';
import { RawTreeFeature } from './wfsWarsawClient';
import { WfsTreeFeature } from '../store/useWfsStore';

const DEFAULT_FLOOR_HEIGHT = 3.0;
const FIRST_FLOOR_HEIGHT = 3.5;
const DEFAULT_HEIGHT = 15.0;
const DEFAULT_STOREYS = 5;

export interface ImportResult {
  buildings: BuildingLoop[];
  parcels: BuildingLoop[];
  warnings: string[];
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

function extractRings(geometry: GeoJSON.Geometry): number[][][] {
  if (geometry.type === 'Polygon') {
    return (geometry as GeoJSON.Polygon).coordinates;
  }
  if (geometry.type === 'MultiPolygon') {
    const mp = geometry as GeoJSON.MultiPolygon;
    return mp.coordinates.flatMap((poly) => poly);
  }
  return [];
}

function estimateHeight(storeys: number | null): number {
  if (storeys == null || storeys <= 0) return DEFAULT_HEIGHT;
  if (storeys === 1) return FIRST_FLOOR_HEIGHT;
  return FIRST_FLOOR_HEIGHT + (storeys - 1) * DEFAULT_FLOOR_HEIGHT;
}

export function importBuildingsFromGeoJson(
  collection: GeoJSON.FeatureCollection,
  sourceCrs: CrsDetectionResult,
  projectCrs: CrsDetectionResult,
  projectCenter: LatLon
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
    const buildingId = props.ID_BUDYNKU || `wfs-bld-${now}-${fi}`;

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

      const id = ri === 0 ? buildingId : `${buildingId}-r${ri}`;
      const storeysCount = storeys ?? DEFAULT_STOREYS;

      buildings.push({
        id,
        name: `WFS ${props.ID_BUDYNKU || `#${fi + 1}`}`,
        layer: 'WFS_BUDYNKI',
        category: 'building',
        isTested: false,
        isIncluded: true,
        isLocked: true,
        isCityCentre: false,
        buildingType: 'residential',
        defaultHeight: height,
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
  collection: GeoJSON.FeatureCollection,
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
    const parcelId = props.ID_DZIALKI || `wfs-parcel-${now}-${fi}`;
    const plotNumber = props.NUMER_DZIALKI || '';

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
        plotNumber: plotNumber || undefined,
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
