import React from 'react';
import { useSceneStore, useUiStore } from '../../store';
import { Modifier, StoryFootprint } from '../../types/modifiers';
import { SetbackPenthouseIcon } from '../icons/SetbackPenthouseIcon';
import { FloatingInspectorCard } from '../common/FloatingInspectorCard';
import { ModifierCard } from './ModifierCard';
import { MODIFIER_DESCRIPTORS } from './modifierDescriptors';
import { buildGlobalIndexOptions } from './modifierIndexOptions';

interface BuildingModifiersPanelProps {
  onClose?: () => void;
  isEmbedded?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export const BuildingModifiersPanel: React.FC<BuildingModifiersPanelProps> = React.memo(({
  onClose,
  isEmbedded = false,
  isCollapsed,
  onToggleCollapse,
}) => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const updateBuildingModifier = useSceneStore((s) => s.updateBuildingModifier);
  const removeBuildingModifier = useSceneStore((s) => s.removeBuildingModifier);
  const reorderBuildingModifiers = useSceneStore((s) => s.reorderBuildingModifiers);
  const toggleBuildingModifier = useSceneStore((s) => s.toggleBuildingModifier);

  const selectedBuilding = React.useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  const modifiers = selectedBuilding?.modifiers || [];
  const storyPolygons: StoryFootprint[] = selectedBuilding?.storyPolygons || [];

  // Akordeon: jeden modyfikator rozwinięty naraz. Domyślnie pierwszy; nowo dodany modyfikator się rozwija.
  // Stan trzymany w useUiStore (nie lokalnie), żeby podgląd 3D mógł podświetlić krawędź odpowiadającą
  // aktualnie otwartej karcie, nie tylko pierwszemu modyfikatorowi z listy.
  const expandedId = useUiStore((s) => s.expandedModifierId);
  const setExpandedId = useUiStore((s) => s.setExpandedModifierId);
  const prevModifierIdsRef = React.useRef<string[]>(modifiers.map((m) => m.id));

  React.useEffect(() => {
    const prevIds = prevModifierIdsRef.current;
    const currentIds = modifiers.map((m) => m.id);
    const addedId = currentIds.find((id) => !prevIds.includes(id));
    if (addedId) {
      setExpandedId(addedId);
    } else if (expandedId && !currentIds.includes(expandedId)) {
      setExpandedId(currentIds[0] ?? null);
    } else if (!expandedId && currentIds.length > 0) {
      setExpandedId(currentIds[0]);
    }
    prevModifierIdsRef.current = currentIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifiers]);

  const availableEdges = React.useMemo(
    () => (selectedBuilding ? buildGlobalIndexOptions(selectedBuilding.vertices?.length || 0, storyPolygons, 'edge') : []),
    [selectedBuilding, storyPolygons]
  );

  const availableVertices = React.useMemo(
    () => (selectedBuilding ? buildGlobalIndexOptions(selectedBuilding.vertices?.length || 0, storyPolygons, 'vertex') : []),
    [selectedBuilding, storyPolygons]
  );

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!selectedBuilding) return null;

  const fieldContext = { availableEdges, availableVertices, building: selectedBuilding };

  return (
    <FloatingInspectorCard
      title="Modyfikatory"
      badge={modifiers.length > 0 ? modifiers.length : undefined}
      icon={<SetbackPenthouseIcon size={18} color="#c084fc" />}
      accentColor="purple"
      onClose={onClose}
      isEmbedded={isEmbedded}
      width={isEmbedded ? '100%' : 360}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {/* Modifier Stack List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '0px' }}>
        {modifiers.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              color: 'var(--text-secondary)',
              fontSize: '11.5px',
            }}
          >
            Brak modyfikatorów na tym obiekcie.
            <br />
            Dodaj <b>Uskok</b>, <b>Strefę</b> lub <b>Wykusz</b> z paska narzędzi.
          </div>
        ) : (
          modifiers.map((mod, idx) => (
            <ModifierCard
              key={mod.id}
              modifier={mod}
              index={idx}
              isFirst={idx === 0}
              isLast={idx === modifiers.length - 1}
              descriptor={MODIFIER_DESCRIPTORS[mod.type]}
              context={fieldContext}
              isExpanded={expandedId === mod.id}
              onToggleExpand={() => setExpandedId(expandedId === mod.id ? null : mod.id)}
              onToggle={() => toggleBuildingModifier(selectedBuilding.id, mod.id)}
              onMoveUp={() => reorderBuildingModifiers(selectedBuilding.id, idx, idx - 1)}
              onMoveDown={() => reorderBuildingModifiers(selectedBuilding.id, idx, idx + 1)}
              onRemove={() => removeBuildingModifier(selectedBuilding.id, mod.id)}
              onPatch={(patch: Partial<Modifier>) => updateBuildingModifier(selectedBuilding.id, mod.id, patch)}
            />
          ))
        )}
      </div>
    </FloatingInspectorCard>
  );
});
