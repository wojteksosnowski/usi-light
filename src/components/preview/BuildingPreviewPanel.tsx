import React from 'react';
import { useSceneStore, useUiStore } from '../../store';
import { getActiveHighlightEdgeIndex } from '@/types/modifiers';
import { BuildingIsoPreview } from './BuildingIsoPreview';

export const BuildingPreviewPanel: React.FC = React.memo(() => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const expandedModifierId = useUiStore((s) => s.expandedModifierId);

  const selectedBuilding = React.useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  if (!selectedBuilding || selectedBuilding.category === 'boundary') {
    return null;
  }

  const activeHighlight = getActiveHighlightEdgeIndex(
    selectedBuilding.modifiers,
    expandedModifierId
  );

  const groupBuildings = React.useMemo(() => {
    if (!selectedBuilding || !selectedBuilding.groupId) return undefined;
    const inGroup = buildings.filter(
      (b) => b.groupId === selectedBuilding.groupId && b.category !== 'boundary'
    );
    return inGroup.length > 1 ? inGroup : undefined;
  }, [buildings, selectedBuilding]);

  return (
    <div className="building-preview-card">
      <BuildingIsoPreview
        building={selectedBuilding}
        groupBuildings={groupBuildings}
        highlightEdgeIndex={activeHighlight}
      />
    </div>
  );
});
