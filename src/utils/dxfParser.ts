import DxfParser from 'dxf-parser';
import { BuildingLoop, FacadeSegment, Point2D, ObjectCategory, AreaType } from '../types/geometry';
import {
  calculateOutwardNormal,
  isPolygonCCW,
} from '@/utils/math2d';
import { computeLineEquation } from './segmentStatistics';
import {
  CrsDetectionResult,
  detectCoordinateSystem,
  computePointsGeoContext,
  GeoContext,
} from './geoTransform';

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

export interface DxfLayerStats {
  layer: string;
  category: ObjectCategory;
  areaType?: AreaType;
  entityCount: number;
  polygonCount: number;
}

export interface DxfInspectionReport {
  totalEntities: number;
  totalPolygons: number;
  buildingCount: number;
  boundaryCount: number;
  layers: DxfLayerStats[];
  unitInfo: DxfUnitInfo;
  crs?: CrsDetectionResult;
  geoContext: GeoContext;
}

export interface DxfParseResult {
  buildings: BuildingLoop[];
  unitInfo: DxfUnitInfo;
  crs?: CrsDetectionResult;
  report: DxfInspectionReport;
}

/**
 * Automatycznie klasyfikuje warstwę DXF na podstawie nazewnictwa stosowanego w polskich mapach (EGiB, BDOT500, CAD).
 */
export function classifyDxfLayer(layerName: string): { category: ObjectCategory; areaType?: AreaType } {
  const norm = (layerName || '').toUpperCase().trim();

  // Granice działek / kontury / strefy
  if (
    norm.includes('DZIA') ||
    norm.includes('PARCEL') ||
    norm.includes('EGDB') ||
    norm.includes('GRANIC') ||
    norm.startsWith('D-') ||
    norm.startsWith('DZ_') ||
    norm.includes('EGB_DZIA') ||
    norm.includes('BOUNDARY') ||
    norm.includes('PLOT')
  ) {
    return { category: 'boundary', areaType: 'plot' };
  }

  // Place zabaw
  if (norm.includes('PLAYGROUND') || norm.includes('PLAC_ZABAW') || norm.includes('ZABAW')) {
    return { category: 'boundary', areaType: 'playground' };
  }

  // Balkony / tarasy
  if (norm.includes('BALCONY') || norm.includes('BALKON') || norm.includes('TARAS') || norm.includes('TERRACE')) {
    return { category: 'balcony' };
  }

  // Domyślnie budynek
  return { category: 'building' };
}

/**
 * Łączy odcinki linii (LINE) o wspólnych wierzchołkach w zamknięte pętle poligonowe.
 */
export function assembleDxfLinesIntoLoops(
  lines: { p1: Point2D; p2: Point2D; layer: string }[],
  tolerance = 0.05
): { layer: string; vertices: Point2D[] }[] {
  if (!lines || lines.length === 0) return [];

  // Grupuj po warstwie
  const byLayer = new Map<string, { p1: Point2D; p2: Point2D }[]>();
  for (const l of lines) {
    const arr = byLayer.get(l.layer) || [];
    arr.push({ p1: l.p1, p2: l.p2 });
    byLayer.set(l.layer, arr);
  }

  const result: { layer: string; vertices: Point2D[] }[] = [];

  for (const [layer, layerLines] of byLayer.entries()) {
    const unused = [...layerLines];

    while (unused.length > 0) {
      const firstSeg = unused.shift()!;
      const currentChain: Point2D[] = [firstSeg.p1, firstSeg.p2];

      let extended = true;
      while (extended && unused.length > 0) {
        extended = false;
        const tail = currentChain[currentChain.length - 1];

        for (let i = 0; i < unused.length; i++) {
          const seg = unused[i];
          const d1 = Math.hypot(seg.p1.x - tail.x, seg.p1.y - tail.y);
          const d2 = Math.hypot(seg.p2.x - tail.x, seg.p2.y - tail.y);

          if (d1 <= tolerance) {
            currentChain.push(seg.p2);
            unused.splice(i, 1);
            extended = true;
            break;
          } else if (d2 <= tolerance) {
            currentChain.push(seg.p1);
            unused.splice(i, 1);
            extended = true;
            break;
          }
        }
      }

      if (currentChain.length >= 4) {
        const head = currentChain[0];
        const tail = currentChain[currentChain.length - 1];
        if (Math.hypot(head.x - tail.x, head.y - tail.y) <= tolerance * 2) {
          // Zamknięta pętla
          currentChain.pop(); // Usuń powtórzony koniec
          if (currentChain.length >= 3) {
            result.push({ layer, vertices: currentChain });
          }
        }
      }
    }
  }

  return result;
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

  // Geodetic coordinate check: in Polish coordinate systems (PL-1992, PL-2000), coordinates are 100,000 to 9,000,000 meters!
  // Geodetic map DXFs (often exported from GIS/QGIS with default AutoCAD templates having INSUNITS=1/inches)
  // are strictly in METERS, never in inches.
  if (maxCoord >= 100_000 && maxCoord <= 9_000_000) {
    return {
      unit: 'auto',
      scale: 1.0,
      unitName: 'Metry [m] (Układ geodezyjny)',
      source: 'Auto-detekcja (współrzędne państwowe geodezyjne w metrach)',
      insunits: insunits || 0,
    };
  }

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
 * Parses raw DXF string into 2.5D BuildingLoops with rich unit and geodetic metadata.
 */
export function parseDxfWithMetadata(
  dxfText: string,
  unitOption: DxfUnitOption = 'auto'
): DxfParseResult {
  const emptyReport: DxfInspectionReport = {
    totalEntities: 0,
    totalPolygons: 0,
    buildingCount: 0,
    boundaryCount: 0,
    layers: [],
    unitInfo: resolveDxfScale({}, 0, unitOption),
    geoContext: computePointsGeoContext([]),
  };

  if (!dxfText || typeof dxfText !== 'string' || dxfText.trim().length === 0) {
    return {
      buildings: [],
      unitInfo: emptyReport.unitInfo,
      report: emptyReport,
    };
  }

  const parser = new DxfParser();
  let parsed: any;
  try {
    parsed = parser.parseSync(dxfText);
  } catch (err: any) {
    console.error('Failed to parse DXF:', err);
    return {
      buildings: [],
      unitInfo: {
        unit: unitOption,
        scale: 1.0,
        unitName: 'Błąd pliku DXF',
        source: err?.message || 'Nieprawidłowy format pliku DXF',
      },
      report: emptyReport,
    };
  }

  const rawEntities: { type: string; layer: string; vertices: Point2D[] }[] = [];
  const rawLines: { p1: Point2D; p2: Point2D; layer: string }[] = [];

  // 1. Zwykłe encje z dxf-parser (LWPOLYLINE, POLYLINE, LINE, 3DFACE)
  if (parsed && Array.isArray(parsed.entities)) {
    for (const entity of parsed.entities) {
      if (!entity) continue;
      const layer = entity.layer || '0';

      if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
        if (Array.isArray(entity.vertices) && entity.vertices.length >= 3) {
          const valid = entity.vertices.filter(
            (v: any) => v && Number.isFinite(v.x) && Number.isFinite(v.y)
          );
          if (valid.length >= 3) {
            rawEntities.push({
              type: entity.type,
              layer,
              vertices: valid.map((v: any) => ({ x: v.x, y: v.y })),
            });
          }
        }
      } else if (entity.type === 'LINE') {
        if (
          Array.isArray(entity.vertices) &&
          entity.vertices.length >= 2 &&
          Number.isFinite(entity.vertices[0]?.x) &&
          Number.isFinite(entity.vertices[1]?.x)
        ) {
          rawLines.push({
            p1: { x: entity.vertices[0].x, y: entity.vertices[0].y },
            p2: { x: entity.vertices[1].x, y: entity.vertices[1].y },
            layer,
          });
        }
      } else if (entity.type === '3DFACE') {
        if (Array.isArray(entity.vertices) && entity.vertices.length >= 3) {
          const valid = entity.vertices.filter(
            (v: any) => v && Number.isFinite(v.x) && Number.isFinite(v.y)
          );
          if (valid.length >= 3) {
            rawEntities.push({
              type: '3DFACE',
              layer,
              vertices: valid.map((v: any) => ({ x: v.x, y: v.y })),
            });
          }
        }
      }
    }
  }

  // 2. Bezpośrednia ekstrakcja encji HATCH z pliku DXF
  const lines = dxfText.split(/\r?\n/).map((l) => l.trim());
  let inEntitiesSection = false;
  let currentHatch: { type: string; layer: string; vertices: Point2D[]; _curX?: number } | null = null;

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i], 10);
    const val = lines[i + 1];

    if (code === 2 && val === 'ENTITIES') {
      inEntitiesSection = true;
      continue;
    }
    if (code === 0 && val === 'ENDSEC' && inEntitiesSection) {
      if (currentHatch && currentHatch.vertices.length >= 3) {
        rawEntities.push({ type: 'HATCH', layer: currentHatch.layer, vertices: currentHatch.vertices });
      }
      inEntitiesSection = false;
      break;
    }

    if (inEntitiesSection) {
      if (code === 0) {
        if (currentHatch && currentHatch.vertices.length >= 3) {
          rawEntities.push({ type: 'HATCH', layer: currentHatch.layer, vertices: currentHatch.vertices });
          currentHatch = null;
        }
        if (val === 'HATCH') {
          currentHatch = { type: 'HATCH', layer: '0', vertices: [] };
        }
      } else if (currentHatch) {
        if (code === 8) {
          currentHatch.layer = val;
        } else if (code === 10) {
          currentHatch._curX = parseFloat(val);
        } else if (code === 20 && currentHatch._curX !== undefined) {
          const y = parseFloat(val);
          const x = currentHatch._curX;
          delete currentHatch._curX;
          if (Number.isFinite(x) && Number.isFinite(y)) {
            // W HATCH punkt (0,0) w nagłówku to elevation/origin point
            // Odrzucamy (0,0) gdy rzeczywiste współrzędne pętli są różne od zera
            if (x !== 0 || y !== 0) {
              currentHatch.vertices.push({ x, y });
            }
          }
        }
      }
    }
  }
  if (currentHatch && currentHatch.vertices.length >= 3) {
    rawEntities.push({ type: 'HATCH', layer: currentHatch.layer, vertices: currentHatch.vertices });
  }

  // 3. Połącz linie (LINE) w pętle poligonowe
  if (rawLines.length > 0) {
    const assembled = assembleDxfLinesIntoLoops(rawLines);
    for (const loop of assembled) {
      rawEntities.push({
        type: 'LINE_LOOP',
        layer: loop.layer,
        vertices: loop.vertices,
      });
    }
  }

  // Oblicz maxCoord
  let maxCoord = 0;
  for (const ent of rawEntities) {
    for (const v of ent.vertices) {
      if (Math.abs(v.x) > maxCoord) maxCoord = Math.abs(v.x);
      if (Math.abs(v.y) > maxCoord) maxCoord = Math.abs(v.y);
    }
  }
  for (const l of rawLines) {
    if (Math.abs(l.p1.x) > maxCoord) maxCoord = Math.abs(l.p1.x);
    if (Math.abs(l.p1.y) > maxCoord) maxCoord = Math.abs(l.p1.y);
    if (Math.abs(l.p2.x) > maxCoord) maxCoord = Math.abs(l.p2.x);
    if (Math.abs(l.p2.y) > maxCoord) maxCoord = Math.abs(l.p2.y);
  }

  const unitInfo = resolveDxfScale(parsed?.header, maxCoord, unitOption);
  const scaleUnit = unitInfo.scale || 1.0;

  const loops: BuildingLoop[] = [];
  const layerStatsMap = new Map<string, DxfLayerStats>();
  let buildingCount = 1;
  let boundaryCount = 1;

  for (const entity of rawEntities) {
    const rawPoints: Point2D[] = entity.vertices.map((v) => ({
      x: v.x * scaleUnit,
      y: v.y * scaleUnit,
    }));

    // Usuń powtórzony ostatni wierzchołek zamykający
    const pFirst = rawPoints[0];
    const pLast = rawPoints[rawPoints.length - 1];
    if (
      rawPoints.length > 3 &&
      Math.hypot(pFirst.x - pLast.x, pFirst.y - pLast.y) < 1e-4
    ) {
      rawPoints.pop();
    }

    if (rawPoints.length < 3) continue;

    const layerName = entity.layer || '0';
    const classification = classifyDxfLayer(layerName);
    const isBoundary = classification.category === 'boundary';
    const isCCW = isPolygonCCW(rawPoints);
    const segments: FacadeSegment[] = [];

    const defaultH = isBoundary ? 0.0 : 15.0;

    for (let i = 0; i < rawPoints.length; i++) {
      const p1 = rawPoints[i];
      const p2 = rawPoints[(i + 1) % rawPoints.length];
      const normal = calculateOutwardNormal(p1, p2, isCCW);
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      segments.push({
        id: isBoundary ? `bound-${boundaryCount}-seg-${i + 1}` : `bldg-${buildingCount}-seg-${i + 1}`,
        p1,
        p2,
        normal,
        length: len,
        angleRad: Math.atan2(p2.y - p1.y, p2.x - p1.x),
        hTop: defaultH,
        hWindowBottom: 0.85,
        isCityCentre: false,
        buildingType: 'residential',
        lineEquation: computeLineEquation(p1, p2, normal),
      });
    }

    const objId = isBoundary ? `bound-${boundaryCount}` : `bldg-${buildingCount}`;
    const objName = isBoundary
      ? `Działka ${boundaryCount} (${layerName})`
      : `Budynek ${buildingCount} (${layerName})`;

    loops.push({
      id: objId,
      name: objName,
      layer: layerName,
      isTested: !isBoundary && buildingCount === 1,
      isCityCentre: false,
      buildingType: 'residential',
      category: classification.category,
      areaType: classification.areaType,
      firstFloorHeight: 3.0,
      typicalFloorHeight: 3.0,
      storeysCount: isBoundary ? 0 : 5,
      defaultHeight: defaultH,
      heightSource: 'default',
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

    if (isBoundary) {
      boundaryCount++;
    } else {
      buildingCount++;
    }

    // Aktualizuj statystyki warstw
    const existingStats = layerStatsMap.get(layerName) || {
      layer: layerName,
      category: classification.category,
      areaType: classification.areaType,
      entityCount: 0,
      polygonCount: 0,
    };
    existingStats.entityCount++;
    existingStats.polygonCount++;
    layerStatsMap.set(layerName, existingStats);
  }

  // Wykryj układ geodezyjny i wyznacz geoContext
  const allVertices: Point2D[] = loops.flatMap((l) => l.vertices);
  const geoContext = computePointsGeoContext(allVertices);
  const crs = geoContext.crsInfo;

  const report: DxfInspectionReport = {
    totalEntities: rawEntities.length + rawLines.length,
    totalPolygons: loops.length,
    buildingCount: loops.filter((l) => l.category === 'building').length,
    boundaryCount: loops.filter((l) => l.category === 'boundary').length,
    layers: Array.from(layerStatsMap.values()),
    unitInfo,
    crs,
    geoContext,
  };

  return {
    buildings: loops,
    unitInfo,
    crs,
    report,
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
        lineEquation: computeLineEquation(p1, p2, normal),
      });
    }

    const count = hTop > 3.5 ? 1 + Math.max(1, Math.round((hTop - 3.5) / 2.875)) : 1;
    return {
      id,
      name,
      layer: isTested ? 'BUD_PROJEKTOWANY' : 'BUD_SASIEDNI',
      isTested,
      category: 'building',
      firstFloorHeight: 3.0,
      typicalFloorHeight: 3.0,
      storeysCount: count,
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

/**
 * Creates a valid BuildingLoop from user-drawn vertices (Rectangle or Polyline).
 */
export function createBuildingFromVertices(
  vertices: Point2D[],
  name?: string,
  defaultHeight: number = 15.0,
  isTested: boolean = false,
  category: import('../types/geometry').ObjectCategory = 'building'
): BuildingLoop {
  const isCCW = isPolygonCCW(vertices);
  const newId = `bldg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const segments: FacadeSegment[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const normal = calculateOutwardNormal(p1, p2, isCCW);

    segments.push({
      id: `${newId}-seg-${segments.length + 1}`,
      p1,
      p2,
      normal,
      length: len,
      angleRad: Math.atan2(dy, dx),
      hTop: defaultHeight,
      hBase: 0.0,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
      lineEquation: computeLineEquation(p1, p2, normal),
    });
  }

  const count = defaultHeight > 3.5 ? 1 + Math.max(1, Math.round((defaultHeight - 3.5) / 2.875)) : 1;

  return {
    id: newId,
    name: name || `Budynek ${newId.slice(-4)}`,
    layer: isTested ? 'BUD_PROJEKTOWANY' : 'BUD_NOWY',
    isTested,
    category,
    elevation: 0.0,
    firstFloorHeight: 3.0,
    typicalFloorHeight: 3.0,
    storeysCount: count,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight,
    heightSource: 'default',
    hWindowBottom: 0.85,
    vertices: [...vertices],
    segments,
    isClockwise: !isCCW,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };
}
