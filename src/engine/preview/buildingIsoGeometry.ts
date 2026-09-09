import type { BuildingLoop, Point2D } from '@/types/geometry';
import { getPolygonCentroid, rotatePointAroundPivot } from '@/utils/math2d/polygons';

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
 * base footprint when no story data is available. All returned polygons
 * are normalized (recentered + counter-rotated relative to the base
 * footprint, undoing whatever `rotateBuilding` baked into the vertices) so
 * the preview is independent of the building's scene placement/rotation —
 * abstracted away from wherever/however the building happens to sit on the
 * plan.
 */
export function getBuildingSolids(building: BuildingLoop): IsoSolid[] {
  const pivot = getPolygonCentroid(building.vertices);
  const angleRad = (-(building.transform?.rotationDeg || 0) * Math.PI) / 180;
  const normalize = (pt: Point2D) => rotatePointAroundPivot(pt, pivot, angleRad);

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
