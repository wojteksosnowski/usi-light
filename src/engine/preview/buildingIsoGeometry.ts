import type { BuildingLoop, Point2D } from '@/types/geometry';

export interface IsoSolid {
  polygon: Point2D[];
  holes: Point2D[][];
  hBottom: number;
  hTop: number;
}

/**
 * Resolves the set of extrudable solids for the isometric preview.
 * Prefers the already-computed story-aware footprints (which reflect all
 * active modifiers); falls back to a single monolithic extrusion of the
 * base footprint when no story data is available. Polygons are used as-is
 * (including whatever rotation `rotateBuilding` baked into the vertices) so
 * the preview reflects the building's actual orientation on the plan;
 * recentering onto the camera target happens separately via a bounding-box
 * center in BuildingIsoPreview.
 */
export function getBuildingSolids(building: BuildingLoop): IsoSolid[] {
  const normalize = (pt: Point2D) => pt;

  if (building.storyPolygons && building.storyPolygons.length > 0) {
    return building.storyPolygons
      .filter((story) => story.polygon.length >= 3 && story.hTop > story.hBottom)
      .map((story) => ({
        polygon: story.polygon.map(normalize),
        holes: (story.holes ?? []).map((hole) => hole.map(normalize)),
        hBottom: story.hBottom,
        hTop: story.hTop,
      }));
  }

  if (building.vertices.length < 3 || building.defaultHeight <= 0) {
    return [];
  }

  const hBottom = building.elevation ?? 0;
  return [
    {
      polygon: building.vertices.map(normalize),
      holes: [],
      hBottom,
      hTop: hBottom + building.defaultHeight,
    },
  ];
}
