import { FacadeSegment, Point2D } from '../../types/geometry';
import { generateSweepPolygon } from '../../utils/math2d/sweep';
import { rebuildSegmentsForPolygon } from '../../utils/dxfParser';
import { solveRoad } from './roadSolverEngine';
import { RoadSolveInput } from './types';

/** Szerokość cienkiej wstęgi-placeholdera (czyta się jako "linia") gdy trasa jest w toku
 * przeliczania albo solver nie znalazł ścieżki — obiekt Droga nigdy nie zostaje bez geometrii. */
export const PENDING_LINE_WIDTH = 0.4;

/** Wysokość segmentów fasadowych generowanych dla nawierzchni Drogi (obiekt płaski/Obszar). */
const ROAD_SURFACE_HEIGHT = 0.2;

export interface RoadObjectGeometry {
  vertices: Point2D[];
  segments: FacadeSegment[];
  sweepPath: Point2D[];
  roadSolveStatus: 'pending' | 'solved' | 'no_path';
}

function placeholderGeometry(
  pointA: Point2D,
  pointB: Point2D,
  buildingId: string,
  status: 'pending' | 'no_path'
): RoadObjectGeometry {
  const vertices = generateSweepPolygon([pointA, pointB], PENDING_LINE_WIDTH, 'center');
  return {
    vertices,
    segments: rebuildSegmentsForPolygon(vertices, buildingId, ROAD_SURFACE_HEIGHT),
    sweepPath: [pointA, pointB],
    roadSolveStatus: status,
  };
}

/** Wywołuje solveRoad i zawsze zwraca poprawną (niepustą) geometrię obiektu Droga —
 * pełny poligon nawierzchni przy sukcesie, cienki placeholder ("linia") przy niepowodzeniu. */
export function solveRoadObjectGeometry(input: RoadSolveInput, buildingId: string): RoadObjectGeometry {
  const result = solveRoad(input);
  if (result.success && result.polygon.length >= 3) {
    return {
      vertices: result.polygon,
      segments: rebuildSegmentsForPolygon(result.polygon, buildingId, ROAD_SURFACE_HEIGHT),
      sweepPath: result.centerline,
      roadSolveStatus: 'solved',
    };
  }
  return placeholderGeometry(input.pointA, input.pointB, buildingId, 'no_path');
}

/** Placeholder natychmiastowy do użycia podczas przeciągania punktu A/B, przed pełnym
 * przeliczeniem przez solver (patrz useRoadSolverSync) — obiekt wizualnie podąża za kursorem. */
export function pendingRoadObjectGeometry(pointA: Point2D, pointB: Point2D, buildingId: string): RoadObjectGeometry {
  return placeholderGeometry(pointA, pointB, buildingId, 'pending');
}
