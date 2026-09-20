import { useMemo } from 'react';
import type { BuildingLoop } from '@/types/geometry';
import { translateBuildingGeometry } from '@/store/useSceneStore';
import { getPolygonCentroid } from '@/utils/math2d/polygons';
import { getCompoundGroupBuildings } from '@/utils/compoundObjectPipeline';

/**
 * Localizes a building (and its compound group) to its own coordinate frame for the 3D preview,
 * so that the object's position in the scene never affects the preview's camera framing - only
 * genuine shape edits do.
 *
 * The anchor (translation offset) is derived from `anchorBuilding` - the last state committed to
 * useSceneStore - never from `displayBuilding`, which may include an in-progress, uncommitted
 * live edit (e.g. a dragged vertex). This way the anchor never drifts while a drag is in
 * progress: only the edited piece moves, not the object's position. See BuildingPreviewPanel.tsx
 * for the full rationale.
 */
export function useLocalizedBuilding(
  anchorBuilding: BuildingLoop | null,
  displayBuilding: BuildingLoop | null | undefined,
  allBuildings: BuildingLoop[]
): { localizedBuilding: BuildingLoop | null | undefined; localizedGroupBuildings: BuildingLoop[] | undefined } {
  const anchor = useMemo(
    () => (anchorBuilding ? getPolygonCentroid(anchorBuilding.vertices) : null),
    [anchorBuilding]
  );

  const localizedBuilding = useMemo(() => {
    if (!displayBuilding || !anchor) return displayBuilding;
    return translateBuildingGeometry(displayBuilding, -anchor.x, -anchor.y);
  }, [displayBuilding, anchor]);

  const localizedGroupBuildings = useMemo(() => {
    if (!anchorBuilding || !anchorBuilding.groupId || !anchor) return undefined;
    const inGroup = getCompoundGroupBuildings(allBuildings, anchorBuilding.groupId);
    if (inGroup.length <= 1) return undefined;
    return inGroup.map((b) => translateBuildingGeometry(b, -anchor.x, -anchor.y));
  }, [allBuildings, anchorBuilding, anchor]);

  return { localizedBuilding, localizedGroupBuildings };
}
