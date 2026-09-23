import type { BuildingLoop } from '@/types/geometry';
import { generateSweepPolygon } from '@/utils/math2d/sweep';
import { applyBuildingModifiers } from '@/engine/modifiers/modifierPipeline';

type LiveVertexPreview = { buildingId: string; vertexIndex: number; point: { x: number; y: number } } | null;

/**
 * Patches an in-progress (uncommitted) vertex drag position from the cheap `liveVertexPreview`
 * channel into `building` and re-derives sweep/modifier-dependent geometry, so 3D previews can
 * reflect the drag before it commits to useSceneStore on mouseup.
 */
export function applyLiveVertexPreviewPatch(
  building: BuildingLoop | null,
  liveVertexPreview: LiveVertexPreview
): BuildingLoop | null {
  if (!building || !liveVertexPreview || liveVertexPreview.buildingId !== building.id) {
    return building;
  }

  const isSweep = Array.isArray(building.sweepPath) && building.sweepPath.length >= 2;
  let candidate: BuildingLoop;
  if (isSweep) {
    const sweepPath = building.sweepPath!.map((v, idx) =>
      idx === liveVertexPreview.vertexIndex ? liveVertexPreview.point : v
    );
    const sweepPoly = generateSweepPolygon(
      sweepPath,
      building.sweepWidth || 12,
      building.sweepAlignment || 'center'
    );
    candidate = { ...building, sweepPath, vertices: sweepPoly };
  } else {
    const vertices = building.vertices.map((v, idx) =>
      idx === liveVertexPreview.vertexIndex ? liveVertexPreview.point : v
    );
    candidate = { ...building, vertices };
  }

  const modRes = applyBuildingModifiers(candidate);
  return {
    ...candidate,
    storyPolygons: modRes.storyPolygons && modRes.storyPolygons.length > 0 ? modRes.storyPolygons : undefined,
    zonePolygons: modRes.zonePolygons && modRes.zonePolygons.length > 0 ? modRes.zonePolygons : undefined,
    segments: modRes.segments,
  };
}
