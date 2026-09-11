import { Point2D } from '../../types/geometry';
import { generateSweepPolygon } from '../../utils/math2d/sweep';
import { isPointInPolygon } from '../../utils/math2d/polygons';
import { dilateObstacles, dilateObstaclesForRoad, insetPlot, isSegmentClear } from './obstacleZone';
import { buildVisibilityGraph } from './visibilityGraph';
import { findShortestPath } from './pathfind';
import { smoothCenterlineWithArcs } from './smoothPath';
import { RoadSolveInput, RoadSolveResult } from './types';

/**
 * Wyznacza optymalną, bezkolizyjną drogę łączącą pointA z pointB:
 * 1. Dylatacja przeszkód i stref buforowych o W/2 (oraz adaptacyjna dylatacja wierzchołków dla R_min).
 * 2. Znalezienie najkrótszej bezkolizyjnej trasy algorytmem Dijkstry po grafie widoczności.
 * 3. Automatyczne wygładzanie zakrętów łukami kołowymi o nienaruszalnym minimalnym promieniu (R >= minTurnRadius).
 * 4. Generowanie wstęgi drogowej o zadanej szerokości W.
 */
export function solveRoad(input: RoadSolveInput): RoadSolveResult {
  const { pointA, pointB, width, obstacles, plot, minTurnRadius } = input;
  const halfWidth = width / 2;
  const effectiveRadius = minTurnRadius ?? 6.0;

  const dilatedObstacles = dilateObstacles(obstacles, halfWidth);
  const roadDilatedObstacles = dilateObstaclesForRoad(obstacles, halfWidth, effectiveRadius);
  const plotInset = plot && plot.length >= 3 ? insetPlot(plot, halfWidth) : null;
  // Działka ogranicza korytarz drogowy, gdy oba punkty A i B leżą wewnątrz działki (droga wewnętrzna).
  // Jeśli droga stanowi zjazd, drogę dojazdową lub włączenie z zewnątrz (A lub B poza działką),
  // obrys działki nie blokuje trasy.
  const isInternalRoad = Boolean(
    plotInset && isPointInPolygon(pointA, plotInset) && isPointInPolygon(pointB, plotInset)
  );
  const effectivePlotInset = isInternalRoad ? plotInset : null;

  for (const obstacle of dilatedObstacles) {
    if (isPointInPolygon(pointA, obstacle) || isPointInPolygon(pointB, obstacle)) {
      return { centerline: [], polygon: [], success: false, reason: 'point_blocked' };
    }
  }

  let centerline: Point2D[] | null;

  // Szybka ścieżka: gdy odcinek A->B jest już wolny, unikamy budowy pełnego grafu.
  if (isSegmentClear(pointA, pointB, dilatedObstacles, effectivePlotInset)) {
    centerline = [pointA, pointB];
  } else {
    const graph = buildVisibilityGraph(pointA, pointB, dilatedObstacles, effectivePlotInset, roadDilatedObstacles);
    centerline = findShortestPath(graph, 0, 1);
  }

  if (!centerline || centerline.length < 2) {
    return { centerline: [], polygon: [], success: false, reason: 'no_path' };
  }

  let radiusFullyMet: boolean | undefined;

  if (effectiveRadius > 1e-6) {
    const smoothed = smoothCenterlineWithArcs(centerline, effectiveRadius, obstacles, halfWidth, effectivePlotInset);
    centerline = smoothed.path;
    radiusFullyMet = smoothed.fullyMet;
  }

  const polygon = generateSweepPolygon(centerline, width, 'center');
  return { centerline, polygon, success: true, radiusFullyMet };
}
