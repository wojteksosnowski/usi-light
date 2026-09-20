import React from 'react';
import type { BuildingLoop } from '@/types/geometry';
import { useSceneStore, useUiStore } from '../../store';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useStableWhileInteracting } from '@/hooks/useStableWhileInteracting';
import { getActiveHighlightEdgeIndex } from '@/types/modifiers';
import { getCompoundGroupBuildings } from '@/utils/compoundObjectPipeline';
import { findSelectedBuilding } from '@/utils/geometrySelectors';
import { BuildingIsoPreview } from './BuildingIsoPreview';

export const BuildingPreviewPanel: React.FC = React.memo(() => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const expandedModifierId = useUiStore((s) => s.expandedModifierId);
  const isInteracting = useCadToolStore((s) => s.isInteracting);

  const selectedBuilding = React.useMemo(
    () => findSelectedBuilding(buildings, selectedBuildingId),
    [buildings, selectedBuildingId]
  );

  // During active CAD dragging / interaction, freeze the 3D preview reference
  // to avoid re-creating 3D geometries and triggering WebGL context lost storms at 60 FPS.
  const stableBuilding = useStableWhileInteracting(selectedBuilding, isInteracting);

  // Grace state: if a building id is selected but momentarily doesn't resolve (a store-update
  // race between `selectedBuildingId` and `buildings`), keep showing the last-known building for
  // that tick instead of unmounting the WebGL canvas, which is expensive to recreate. This only
  // applies while something is actually selected — an intentional deselection still renders null.
  const lastKnownBuildingRef = React.useRef<BuildingLoop | null>(null);
  React.useEffect(() => {
    if (stableBuilding) {
      lastKnownBuildingRef.current = stableBuilding;
    }
  }, [stableBuilding]);
  const effectiveBuilding = stableBuilding ?? (selectedBuildingId ? lastKnownBuildingRef.current : null);

  const activeHighlight = getActiveHighlightEdgeIndex(
    effectiveBuilding?.modifiers,
    expandedModifierId
  );

  const rawGroupBuildings = React.useMemo(() => {
    if (!effectiveBuilding || !effectiveBuilding.groupId) return undefined;
    const inGroup = getCompoundGroupBuildings(buildings, effectiveBuilding.groupId);
    return inGroup.length > 1 ? inGroup : undefined;
  }, [buildings, effectiveBuilding]);

  const effectiveGroupBuildings = useStableWhileInteracting(rawGroupBuildings, isInteracting);

  if (!effectiveBuilding) {
    return null;
  }

  return (
    <div className="building-preview-card">
      <BuildingIsoPreview
        building={effectiveBuilding}
        groupBuildings={effectiveGroupBuildings}
        highlightEdgeIndex={activeHighlight}
      />
    </div>
  );
});
