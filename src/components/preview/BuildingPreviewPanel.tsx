import React from 'react';
import { useSceneStore, useUiStore } from '../../store';
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

  const modifiers = selectedBuilding.modifiers || [];

  // Podświetlenie krawędzi ma odpowiadać modyfikatorowi aktualnie rozwiniętemu (akordeon) w panelu
  // Modyfikatorów. Gdy rozwinięty modyfikator nie ma krawędzi (np. story_offset), brak podświetlenia -
  // nie spadamy na inny modyfikator, bo to by nie odpowiadało otwartej karcie. Fallback na pierwszy
  // modyfikator z krawędzią stosujemy tylko gdy nic nie jest jeszcze rozwinięte (np. tuż po montowaniu).
  const activeHighlight = React.useMemo(() => {
    const hasEdge = (m: (typeof modifiers)[number]) => m.enabled && 'edgeIndex' in m && (m as any).edgeIndex !== undefined;

    if (expandedModifierId) {
      const expandedMod = modifiers.find((m) => m.id === expandedModifierId);
      if (!expandedMod || !hasEdge(expandedMod)) return undefined;
      const edgeIdx = (expandedMod as any).edgeIndex;
      return edgeIdx === undefined || edgeIdx === -1 ? 0 : edgeIdx;
    }

    const modWithEdge = modifiers.find(hasEdge);
    if (!modWithEdge) return undefined;
    const edgeIdx = (modWithEdge as any).edgeIndex;
    return edgeIdx === undefined || edgeIdx === -1 ? 0 : edgeIdx;
  }, [modifiers, expandedModifierId]);

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
      />
    </div>
  );
});
