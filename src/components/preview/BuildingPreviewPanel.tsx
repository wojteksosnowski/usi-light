import React from 'react';
import { useSceneStore, useUiStore } from '../../store';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useStableWhileInteracting } from '@/hooks/useStableWhileInteracting';
import { getActiveHighlightEdgeIndex } from '@/types/modifiers';
import { BuildingIsoPreview } from './BuildingIsoPreview';

export const BuildingPreviewPanel: React.FC = React.memo(() => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const expandedModifierId = useUiStore((s) => s.expandedModifierId);
  const isInteracting = useCadToolStore((s) => s.isInteracting);

  const selectedBuilding = React.useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  // During active CAD dragging / interaction, freeze the 3D preview reference
  // to avoid re-creating 3D geometries and triggering WebGL context lost storms at 60 FPS.
  const effectiveBuilding = useStableWhileInteracting(selectedBuilding, isInteracting);

  if (!effectiveBuilding || effectiveBuilding.category === 'boundary') {
    return null;
  }

  const activeHighlight = getActiveHighlightEdgeIndex(
    effectiveBuilding.modifiers,
    expandedModifierId
  );

  const rawGroupBuildings = React.useMemo(() => {
    if (!effectiveBuilding || !effectiveBuilding.groupId) return undefined;
    const inGroup = buildings.filter(
      (b) => b.groupId === effectiveBuilding.groupId && b.category !== 'boundary'
    );
    return inGroup.length > 1 ? inGroup : undefined;
  }, [buildings, effectiveBuilding]);

  const effectiveGroupBuildings = useStableWhileInteracting(rawGroupBuildings, isInteracting);

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
