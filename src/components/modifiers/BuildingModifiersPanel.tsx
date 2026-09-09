import React from 'react';
import { useSceneStore } from '../../store';
import { Modifier, StoryFootprint } from '../../types/modifiers';
import { SetbackPenthouseIcon } from '../icons/SetbackPenthouseIcon';
import { FloatingInspectorCard } from '../common/FloatingInspectorCard';
import { BuildingIsoPreview } from '../preview/BuildingIsoPreview';
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

  const fieldContext = { availableEdges, availableVertices };

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
      {/* 1:1 Isometric Preview */}
      <div style={{ marginBottom: '14px' }}>
        <BuildingIsoPreview building={selectedBuilding} />
      </div>

      {/* Modifier Stack List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
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
