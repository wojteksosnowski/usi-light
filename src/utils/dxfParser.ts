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

/**
 * Parses raw DXF string into 2.5D BuildingLoops.
 */
export function parseDxfContent(dxfText: string): BuildingLoop[] {
  const parser = new DxfParser();
  let parsed: any;
  try {
    parsed = parser.parseSync(dxfText);
  } catch (err) {
    console.error('Failed to parse DXF:', err);
    throw new Error('Nieprawidłowy format pliku DXF');
  }

  if (!parsed || !parsed.entities) {
    return [];
  }

  const loops: BuildingLoop[] = [];
  let buildingCount = 1;

  for (const entity of parsed.entities) {
    // Process LWPOLYLINE and POLYLINE
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      if (entity.vertices && entity.vertices.length >= 3) {
        const rawPoints: Point2D[] = entity.vertices.map((v: any) => ({
          x: v.x,
          y: v.y,
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

  return loops;
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
