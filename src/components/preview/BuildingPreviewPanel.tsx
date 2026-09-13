import React from 'react';
import { useSceneStore } from '../../store';
import { BuildingIsoPreview } from './BuildingIsoPreview';

export const BuildingPreviewPanel: React.FC = React.memo(() => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);

  const selectedBuilding = React.useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  if (!selectedBuilding || selectedBuilding.category === 'boundary') {
    return null;
  }

  const modifiers = selectedBuilding.modifiers || [];

  // Compute active highlight edge from the first enabled modifier with edgeIndex (terrace/bay_window/corner_cut)
  const activeHighlight = React.useMemo(() => {
    const modWithEdge = modifiers.find((m) => m.enabled && 'edgeIndex' in m && (m as any).edgeIndex !== undefined);
    if (!modWithEdge) return undefined;
    const edgeIdx = (modWithEdge as any).edgeIndex;
    if (edgeIdx === undefined || edgeIdx === -1) return 0;
    return edgeIdx;
  }, [modifiers]);

  const activeHighlightColor = React.useMemo(() => {
    const modWithEdge = modifiers.find((m) => m.enabled && 'edgeIndex' in m && (m as any).edgeIndex !== undefined);
    if (!modWithEdge) return '#fed7aa';
    if (modWithEdge.type === 'terrace') return '#fed7aa';
    if (modWithEdge.type === 'bay_window') return '#fef08a';
    if (modWithEdge.type === 'corner_cut') return '#7dd3fc';
    return '#fed7aa';
  }, [modifiers]);

  const groupBuildings = React.useMemo(() => {
    if (!selectedBuilding || !selectedBuilding.groupId) return undefined;
    const inGroup = buildings.filter(
      (b) => b.groupId === selectedBuilding.groupId && b.category !== 'boundary'
    );
    return inGroup.length > 1 ? inGroup : undefined;
  }, [buildings, selectedBuilding]);

  return (
    <div
      style={{
        width: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--border-light, #334155)',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
        backgroundColor: '#eeeeee',
      }}
    >
      <BuildingIsoPreview
        building={selectedBuilding}
        groupBuildings={groupBuildings}
        highlightEdgeIndex={activeHighlight}
        highlightColor={activeHighlightColor}
      />
    </div>
  );
});
