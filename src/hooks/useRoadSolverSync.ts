import { useEffect, useRef } from 'react';
import { BuildingLoop, Point2D } from '../types/geometry';
import { pointsEqual } from '../utils/math2d/vec2';
import { gatherRoadObstacles, findPlotBoundary, isLiveRoad } from '../engine/road/gatherObstacles';
import { solveRoadObjectGeometry } from '../engine/road/roadObjectGeometry';

const RECOMPUTE_DEBOUNCE_MS = 80;
const GEOMETRY_EPSILON = 1e-3;

function pathsEqual(a: Point2D[] | undefined, b: Point2D[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!pointsEqual(a[i], b[i], GEOMETRY_EPSILON)) return false;
  }
  return true;
}

/**
 * Utrzymuje obiekty typu 'road' żywe: co zmianę sceny (przesunięcie/dodanie/usunięcie przeszkody,
 * przesunięcie punktu A/B drogi) przelicza trasę solverem na nowo i zapisuje wynik z powrotem
 * do store'a. Droga nie jest jednorazowym generatorem — solver stoi za obiektem stale.
 */
export function useRoadSolverSync(
  buildings: BuildingLoop[],
  updateBuilding: (id: string, patch: Partial<BuildingLoop>) => void,
  isInteracting: boolean
) {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (isInteracting) return;

    const recompute = () => {
      const roads = buildings.filter(isLiveRoad);
      if (roads.length === 0) return;

      const plot = findPlotBoundary(buildings);
      // gatherRoadObstacles już wyklucza wszystkie żywe drogi (w tym każdą z `roads`), więc
      // ten sam zbiór przeszkód jest ważny dla każdej drogi przeliczanej w pętli poniżej.
      const obstacles = gatherRoadObstacles(buildings);

      for (const road of roads) {
        const geometry = solveRoadObjectGeometry(
          {
            pointA: road.roadPointA!,
            pointB: road.roadPointB!,
            width: road.sweepWidth ?? 5.0,
            obstacles,
            plot,
            minTurnRadius: road.roadMinTurnRadius ?? 6.0,
          },
          road.id
        );

        const centerlineChanged = !pathsEqual(road.sweepPath, geometry.sweepPath);
        const polygonChanged = !pathsEqual(road.vertices, geometry.vertices);
        const statusChanged = (road.roadSolveStatus ?? 'solved') !== geometry.roadSolveStatus;
        if (!centerlineChanged && !polygonChanged && !statusChanged) continue;

        updateBuilding(road.id, {
          vertices: geometry.vertices,
          segments: geometry.segments,
          sweepPath: geometry.sweepPath,
          roadSolveStatus: geometry.roadSolveStatus,
        });
      }
    };

    debounceTimerRef.current = setTimeout(recompute, RECOMPUTE_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [buildings, updateBuilding, isInteracting]);
}
