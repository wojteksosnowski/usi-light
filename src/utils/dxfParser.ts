import DxfParser from 'dxf-parser';
import { BuildingLoop, FacadeSegment, Point2D } from '../types/geometry';
import {
  calculateOutwardNormal,
  isPolygonCCW,
} from '../utils/math2d';

interface DxfEntity {
  type: string;
  layer?: string;
  vertices?: { x: number; y: number }[];
  shape?: boolean;
}

export type DxfUnitOption = 'auto' | 'm' | 'dm' | 'cm' | 'mm';

export interface DxfUnitInfo {
  unit: DxfUnitOption;
  scale: number;
  unitName: string;
  source: string;
  insunits?: number;
}

export interface DxfParseResult {
  buildings: BuildingLoop[];
  unitInfo: DxfUnitInfo;
}

/**
 * Determines the scale multiplier to convert DXF units into meters (m).
 */
export function resolveDxfScale(
  parsedHeader: any,
  maxCoord: number,
  unitOption: DxfUnitOption = 'auto'
): DxfUnitInfo {
  if (unitOption === 'm') {
    return {
      unit: 'm',
      scale: 1.0,
      unitName: 'Metry [m]',
      source: 'Wymuszone przez użytkownika (1 j. = 1.0 m)',
    };
  }
  if (unitOption === 'dm') {
    return {
      unit: 'dm',
      scale: 0.1,
      unitName: 'Decymetry [dm]',
      source: 'Wymuszone przez użytkownika (1 j. = 0.1 m)',
    };
  }
  if (unitOption === 'cm') {
    return {
      unit: 'cm',
      scale: 0.01,
      unitName: 'Centymetry [cm]',
      source: 'Wymuszone przez użytkownika (1 j. = 0.01 m / 100 j. = 1m)',
    };
  }
  if (unitOption === 'mm') {
    return {
      unit: 'mm',
      scale: 0.001,
      unitName: 'Milimetry [mm]',
      source: 'Wymuszone przez użytkownika (1 j. = 0.001 m / 1000 j. = 1m)',
    };
  }

  // Auto mode: check header $INSUNITS
  const insunitsRaw = parsedHeader?.['$INSUNITS'] ?? parsedHeader?.INSUNITS;
  const insunits =
    typeof insunitsRaw === 'number'
      ? insunitsRaw
      : insunitsRaw !== undefined && insunitsRaw !== null
      ? parseInt(String(insunitsRaw), 10)
      : undefined;

  if (insunits !== undefined && !isNaN(insunits) && insunits > 0) {
    switch (insunits) {
      case 1:
        return {
          unit: 'auto',
          scale: 0.0254,
          unitName: 'Cale (in)',
          source: 'Wykryto z nagłówka DXF ($INSUNITS = 1)',
          insunits,
        };
      case 2:
        return {
          unit: 'auto',
          scale: 0.3048,
          unitName: 'Stopy (ft)',
          source: 'Wykryto z nagłówka DXF ($INSUNITS = 2)',
          insunits,
        };
      case 4:
        return {
          unit: 'auto',
          scale: 0.001,
          unitName: 'Milimetry [mm]',
          source: 'Wykryto z nagłówka DXF ($INSUNITS = 4: mm)',
          insunits,
        };
      case 5:
        return {
          unit: 'auto',
          scale: 0.01,
          unitName: 'Centymetry [cm]',
          source: 'Wykryto z nagłówka DXF ($INSUNITS = 5: cm)',
          insunits,
        };
      case 6:
        return {
          unit: 'auto',
          scale: 1.0,
          unitName: 'Metry [m]',
          source: 'Wykryto z nagłówka DXF ($INSUNITS = 6: m)',
          insunits,
        };
      case 14:
        return {
          unit: 'auto',
          scale: 0.1,
          unitName: 'Decymetry [dm]',
          source: 'Wykryto z nagłówka DXF ($INSUNITS = 14: dm)',
          insunits,
        };
      default:
        break;
    }
  }

  // Fallback heuristic based on geometry coordinate magnitudes
  if (maxCoord > 1000) {
    return {
      unit: 'auto',
      scale: 0.001,
      unitName: 'Milimetry [mm]',
      source: 'Auto-detekcja heurystyczna (koordynaty > 1000)',
      insunits: insunits || 0,
    };
  } else if (maxCoord > 200) {
    return {
      unit: 'auto',
      scale: 0.01,
      unitName: 'Centymetry [cm]',
      source: 'Auto-detekcja heurystyczna (koordynaty 200-1000)',
      insunits: insunits || 0,
    };
  } else {
    return {
      unit: 'auto',
      scale: 1.0,
      unitName: 'Metry [m]',
      source: 'Auto-detekcja (standard: metry)',
      insunits: insunits || 0,
    };
  }
}

/**
 * Parses raw DXF string into 2.5D BuildingLoops with unit metadata.
 */
export function parseDxfWithMetadata(
  dxfText: string,
  unitOption: DxfUnitOption = 'auto'
): DxfParseResult {
  const parser = new DxfParser();
  let parsed: any;
  try {
    parsed = parser.parseSync(dxfText);
  } catch (err) {
    console.error('Failed to parse DXF:', err);
    throw new Error('Nieprawidłowy format pliku DXF');
  }

  if (!parsed || !parsed.entities) {
    return {
      buildings: [],
      unitInfo: resolveDxfScale(parsed?.header, 0, unitOption),
    };
  }

  // Find max coordinate in entities to assist heuristic auto-detection
  let maxCoord = 0;
  for (const entity of parsed.entities) {
    if (entity.vertices) {
      for (const v of entity.vertices) {
        if (Math.abs(v.x) > maxCoord) maxCoord = Math.abs(v.x);
        if (Math.abs(v.y) > maxCoord) maxCoord = Math.abs(v.y);
      }
    }
  }

  const unitInfo = resolveDxfScale(parsed.header, maxCoord, unitOption);
  const scaleUnit = unitInfo.scale;

  const loops: BuildingLoop[] = [];
  let buildingCount = 1;

  for (const entity of parsed.entities) {
    // Process LWPOLYLINE and POLYLINE
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      if (entity.vertices && entity.vertices.length >= 3) {
        const rawPoints: Point2D[] = entity.vertices.map((v: any) => ({
          x: v.x * scaleUnit,
          y: v.y * scaleUnit,
        }));

        // Remove closing duplicate vertex if present
        const pFirst = rawPoints[0];
        const pLast = rawPoints[rawPoints.length - 1];
        if (
          rawPoints.length > 3 &&
          Math.hypot(pFirst.x - pLast.x, pFirst.y - pLast.y) < 1e-4
        ) {
          rawPoints.pop();
        }

        const isCCW = isPolygonCCW(rawPoints);
        const segments: FacadeSegment[] = [];

        for (let i = 0; i < rawPoints.length; i++) {
          const p1 = rawPoints[i];
          const p2 = rawPoints[(i + 1) % rawPoints.length];
          const normal = calculateOutwardNormal(p1, p2, isCCW);
          const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);

          segments.push({
            id: `seg-${i + 1}`,
            p1,
            p2,
            normal,
            length: len,
            angleRad: Math.atan2(p2.y - p1.y, p2.x - p1.x),
            hTop: 15.0, // Default 15m
            hWindowBottom: 0.85, // Default 0.85m
            isCityCentre: false,
            buildingType: 'residential',
          });
        }

        const layerName = entity.layer || '0';
        const isTestedDefault = buildingCount === 1;

        loops.push({
          id: `bldg-${buildingCount}`,
          name: `Budynek ${buildingCount} (${layerName})`,
          layer: layerName,
          isTested: isTestedDefault,
          isCityCentre: false,
          buildingType: 'residential',
          defaultHeight: 15.0,
          hWindowBottom: 0.85,
          vertices: rawPoints,
          segments,
          isClockwise: !isCCW,
          transform: {
            tx: 0,
            ty: 0,
            rotationDeg: 0,
          },
        });

        buildingCount++;
      }
    }
  }

  return {
    buildings: loops,
    unitInfo,
  };
}

/**
 * Parses raw DXF string into 2.5D BuildingLoops.
 */
export function parseDxfContent(
  dxfText: string,
  unitOption: DxfUnitOption = 'auto'
): BuildingLoop[] {
  return parseDxfWithMetadata(dxfText, unitOption).buildings;
}

/**
 * Creates built-in sample buildings for instant testing without uploading files.
 */
export function createSampleBuildings(): BuildingLoop[] {
  // Building 1 (Investigated - 4-story residential building, 12m height)
  const bldg1Vertices: Point2D[] = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 30, y: 22 },
    { x: 10, y: 22 },
  ];

  // Building 2 (Neighbor / Obstacle to South - 18m height)
  const bldg2Vertices: Point2D[] = [
    { x: 8, y: -8 },
    { x: 32, y: -8 },
    { x: 32, y: 2 },
    { x: 8, y: 2 },
  ];

  // Building 3 (Neighbor / Obstacle to West - 25m height)
  const bldg3Vertices: Point2D[] = [
    { x: -15, y: 8 },
    { x: 2, y: 8 },
    { x: 2, y: 24 },
    { x: -15, y: 24 },
  ];

  function buildLoop(
    id: string,
    name: string,
    vertices: Point2D[],
    isTested: boolean,
    hTop: number
  ): BuildingLoop {
    const isCCW = isPolygonCCW(vertices);
    const segments: FacadeSegment[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % vertices.length];
      const normal = calculateOutwardNormal(p1, p2, isCCW);
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      segments.push({
        id: `${id}-seg-${i + 1}`,
        p1,
        p2,
        normal,
        length: len,
        angleRad: Math.atan2(p2.y - p1.y, p2.x - p1.x),
        hTop,
        hWindowBottom: 0.85,
        isCityCentre: false,
        buildingType: 'residential',
      });
    }

    return {
      id,
      name,
      layer: isTested ? 'BUD_PROJEKTOWANY' : 'BUD_SASIEDNI',
      isTested,
      isCityCentre: false,
      buildingType: 'residential',
      defaultHeight: hTop,
      hWindowBottom: 0.85,
      vertices,
      segments,
      isClockwise: !isCCW,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };
  }

  return [
    buildLoop('bldg-1', 'Budynek A (Projektowany / Badany)', bldg1Vertices, true, 12.0),
    buildLoop('bldg-2', 'Budynek B (Istniejący Południe, H=18m)', bldg2Vertices, false, 18.0),
    buildLoop('bldg-3', 'Budynek C (Istniejący Zachód, H=25m)', bldg3Vertices, false, 25.0),
  ];
}
