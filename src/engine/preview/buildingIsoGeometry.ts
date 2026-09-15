import type { BuildingLoop, BuildingType, Point2D } from '@/types/geometry';

export interface IsoSolid {
  polygon: Point2D[];
  holes: Point2D[][];
  hBottom: number;
  hTop: number;
  // Dziedziczone ID krawędzi obrysu (patrz StoryFootprint.edgeOrigins) — pozwala podglądowi 3D
  // podświetlić DOKŁADNIE tę samą ścianę na każdej kondygnacji zamiast surowego indeksu pozycyjnego,
  // który może wskazywać różne, niepowiązane krawędzie na różnych kondygnacjach (patrz BuildingIsoPreview.tsx).
  edgeOrigins?: (number | null)[];
  buildingType?: BuildingType;
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
        edgeOrigins: story.edgeOrigins,
        buildingType: story.buildingType ?? building.buildingType ?? 'residential',
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
      buildingType: building.buildingType ?? 'residential',
    },
  ];
}

export interface FrameBounds {
  center: { x: number; y: number; z: number };
  radius: number;
  groundY: number;
}

/**
 * Computes rotation-invariant bounding parameters (center, radius, groundY)
 * directly from the 3D vertices of the solids.
 *
 * The radius is computed as the maximum 3D Euclidean distance from the center,
 * which is mathematically invariant under rigid 2D/3D rotations of the building.
 */
export function computeBuildingFrameBounds(solids: IsoSolid[]): FrameBounds | null {
  if (solids.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let groundY = Infinity;
  let topY = -Infinity;

  const points3D: { x: number; y: number; z: number }[] = [];

  for (const solid of solids) {
    if (solid.hBottom < groundY) groundY = solid.hBottom;
    if (solid.hTop > topY) topY = solid.hTop;

    const addPolygonPoints = (pts: Point2D[]) => {
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minZ) minZ = p.y;
        if (p.y > maxZ) maxZ = p.y;

        points3D.push({ x: p.x, y: solid.hBottom, z: p.y });
        points3D.push({ x: p.x, y: solid.hTop, z: p.y });
      }
    };

    addPolygonPoints(solid.polygon);
    for (const hole of solid.holes) {
      addPolygonPoints(hole);
    }
  }

  if (points3D.length === 0 || !Number.isFinite(groundY) || !Number.isFinite(topY)) {
    return null;
  }

  // Centroid / center of the solid vertices in 3D:
  // (In CAD 2D coordinates: X -> 3D X, Y -> 3D Z; height -> 3D Y)
  const centerX = (minX + maxX) / 2;
  const centerY = (groundY + topY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  let maxDistSq = 0;
  for (const pt of points3D) {
    const dx = pt.x - centerX;
    const dy = pt.y - centerY;
    const dz = pt.z - centerZ;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
    }
  }

  const radius = Math.max(Math.sqrt(maxDistSq), 0.1);

  return {
    center: { x: centerX, y: centerY, z: centerZ },
    radius,
    groundY,
  };
}

/**
 * Stała macierz rzutu izometrycznego 3D -> 2D (kąt 30 stopni):
 * [ cos(30°), -cos(30°),  0 ]
 * [ sin(30°),  sin(30°), -1 ]
 */
const COS_30 = Math.cos((30 * Math.PI) / 180); // ~0.866025
const SIN_30 = Math.sin((30 * Math.PI) / 180); // 0.5

export function projectToIso(
  x: number,
  y: number,
  z: number,
  scale: number = 1.0,
  out?: Point2D
): Point2D {
  const sx = (x * COS_30 - y * COS_30) * scale;
  const sy = (x * SIN_30 + y * SIN_30 - z) * scale;
  if (out) {
    out.x = sx;
    out.y = sy;
    return out;
  }
  return { x: sx, y: sy };
}

export function projectPointsToIsoBuffer(
  points3D: Float32Array, // [x0, y0, z0, x1, y1, z1, ...]
  scale: number = 1.0,
  out2D?: Float32Array // [x0, y0, x1, y1, ...]
): Float32Array {
  const count = Math.floor(points3D.length / 3);
  const out = out2D && out2D.length >= count * 2 ? out2D : new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = points3D[i * 3];
    const y = points3D[i * 3 + 1];
    const z = points3D[i * 3 + 2];
    out[i * 2] = (x * COS_30 - y * COS_30) * scale;
    out[i * 2 + 1] = (x * SIN_30 + y * SIN_30 - z) * scale;
  }
  return out;
}
