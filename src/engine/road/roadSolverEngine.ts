import { Point2D } from '../../types/geometry';
import { generateSweepPolygon } from '../../utils/math2d/sweep';
import { isPointInPolygon } from '../../utils/math2d/polygons';
import { dilateObstacles, insetPlot, isSegmentClear } from './obstacleZone';
import { buildVisibilityGraph } from './visibilityGraph';
import { findShortestPath } from './pathfind';
import { smoothCenterlineWithArcs } from './smoothPath';
import { RoadSolveInput, RoadSolveResult } from './types';

/**
 * Wyznacza drogę łączącą pointA z pointB, omijającą przeszkody, algorytmem
 * grafu widoczności (strategia 'shortest'): dylatacja przeszkód o W/2, wierzchołki
 * przeszkód jako węzły grafu, Dijkstra po krawędziach nieprzecinających przeszkód.
 */
export function solveRoad(input: RoadSolveInput): RoadSolveResult {
  const { pointA, pointB, width, obstacles, plot, strategy, minTurnRadius } = input;
  const halfWidth = width / 2;

  const dilatedObstacles = dilateObstacles(obstacles, halfWidth);
  const plotInset = plot && plot.length >= 3 ? insetPlot(plot, halfWidth) : null;

  for (const obstacle of dilatedObstacles) {
    if (isPointInPolygon(pointA, obstacle) || isPointInPolygon(pointB, obstacle)) {
      return { centerline: [], polygon: [], success: false, reason: 'point_blocked' };
    }
  }
  if (plotInset) {
    if (!isPointInPolygon(pointA, plotInset) || !isPointInPolygon(pointB, plotInset)) {
      return { centerline: [], polygon: [], success: false, reason: 'point_blocked' };
    }
  }

  let centerline: Point2D[] | null;

  // Szybka ścieżka: gdy odcinek A->B jest już wolny, unikamy budowy pełnego grafu.
  if (isSegmentClear(pointA, pointB, dilatedObstacles, plotInset)) {
    centerline = [pointA, pointB];
  } else {
    const graph = buildVisibilityGraph(pointA, pointB, dilatedObstacles, plotInset);
    centerline = findShortestPath(graph, 0, 1);
  }

  if (!centerline || centerline.length < 2) {
    return { centerline: [], polygon: [], success: false, reason: 'no_path' };
  }

  let radiusFullyMet: boolean | undefined;
  const effectiveStrategy = strategy ?? 'centered_smooth';
  const effectiveRadius = minTurnRadius ?? 6.0;

  if (effectiveStrategy === 'centered_smooth' && effectiveRadius > 1e-6) {
    const smoothed = smoothCenterlineWithArcs(centerline, effectiveRadius, obstacles, halfWidth, plotInset);
    centerline = smoothed.path;
    radiusFullyMet = smoothed.fullyMet;
  }

  const polygon = generateSweepPolygon(centerline, width, 'center');
  return { centerline, polygon, success: true, radiusFullyMet };
}
