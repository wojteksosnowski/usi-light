import { BuildingLoop, Point2D } from '../../types/geometry';

/**
 * Tożsamość "żywego generatora drogi" — rozpoznawana przez obecność roadPointA/B, NIE przez
 * category (kategoria/typ obszaru to swobodnie edytowalna klasyfikacja, niezależna od bycia
 * generatorem). Jedna definicja reużywana wszędzie, gdzie kod musi rozpoznać obiekt Drogi.
 */
export function isLiveRoad(building: BuildingLoop): boolean {
  return Boolean(building.roadPointA && building.roadPointB);
}

/** Znajduje obrys działki (category:'boundary', areaType 'plot' lub domyślny) w scenie. */
export function findPlotBoundary(buildings: BuildingLoop[]): Point2D[] | null {
  const plotBuilding = buildings.find((b) => b.category === 'boundary' && (b.areaType ?? 'plot') === 'plot');
  return plotBuilding ? plotBuilding.vertices : null;
}

/**
 * Zbiera obrysy przeszkód, które droga musi omijać: wszystkie budynki (niezależnie od isTested —
 * ta flaga dotyczy tylko roli w analizie nasłonecznienia/przesłaniania, nie tego, czy budynek
 * fizycznie istnieje), place zabaw oraz wyliczone strefy buforowe (zonePolygons).
 */
export function gatherRoadObstacles(buildings: BuildingLoop[]): Point2D[][] {
  const obstacles: Point2D[][] = [];

  for (const building of buildings) {
    if (building.isIncluded === false) continue;
    // Żywy generator drogi nigdy nie jest przeszkodą dla innych dróg.
    if (isLiveRoad(building)) continue;

    const isPlayground = building.category === 'boundary' && building.areaType === 'playground';
    const isObstacleBuilding = building.category === 'building' || building.category === undefined;

    if (isObstacleBuilding || isPlayground) {
      if (building.vertices && building.vertices.length >= 3) {
        obstacles.push(building.vertices);
      }
    }

    if (building.zonePolygons) {
      for (const zone of building.zonePolygons) {
        if (zone.polygon && zone.polygon.length >= 3) {
          obstacles.push(zone.polygon);
        }
      }
    }
  }

  return obstacles;
}
