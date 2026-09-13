import React from 'react';
import { Ruler } from 'lucide-react';
import { TerraceModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { IndexPillSelector } from '../controls/IndexPillSelector';
import { SegmentedControl } from '../controls/SegmentedControl';
import { StoryRangeSelector } from '../StoryRangeSelector';
import { TerraceDropIcon, TerraceStepsIcon } from '../../common/CustomCadIcons';
import { computeEdgeAdjacentPerpendicularDistance } from '../../../utils/math2d/dimensions';
import { signHint } from './signHint';

const TERRACE_VARIANT_OPTIONS: { value: 'drop' | 'steps'; label: string; Icon: React.FC<{ size?: number; color?: string }> }[] = [
  { value: 'drop', label: 'Uskok (drop)', Icon: TerraceDropIcon },
  { value: 'steps', label: 'Stopnie (steps)', Icon: TerraceStepsIcon },
];

export const TerraceFields: React.FC<ModifierFieldsProps<TerraceModifier>> = ({ modifier, onChange, context }) => {
  const currentVariant = modifier.variant ?? 'drop';
  const isAuto = modifier.autoDistance ?? false;
  const depthHint = signHint(
    modifier.depth,
    ['Cofnięcie ściany (-)', 'var(--accent-orange)'],
    ['Nadwieszenie ściany (+)', 'var(--accent-blue)']
  );

  const calculatedDist = React.useMemo(() => {
    const buildingVertices = context.building?.vertices;
    if (!buildingVertices || buildingVertices.length < 3) return null;
    return computeEdgeAdjacentPerpendicularDistance(buildingVertices, modifier.edgeIndex);
  }, [context.building?.vertices, modifier.edgeIndex]);

  // Synchronizacja na żywo gdy włączony jest tryb auto
  React.useEffect(() => {
    if (isAuto && calculatedDist !== null && calculatedDist > 0) {
      const sign = modifier.depth >= 0 ? (modifier.depth === 0 ? -1 : 1) : -1;
      const targetDepth = sign * calculatedDist;
      if (Math.abs(modifier.depth - targetDepth) > 1e-4) {
        onChange({ depth: targetDepth });
      }
    }
  }, [isAuto, calculatedDist, modifier.depth, onChange]);

  const handleToggleAuto = () => {
    const nextAuto = !isAuto;
    if (nextAuto && calculatedDist !== null && calculatedDist > 0) {
      const sign = modifier.depth >= 0 ? (modifier.depth === 0 ? -1 : 1) : -1;
      onChange({ autoDistance: true, depth: sign * calculatedDist });
    } else {
      onChange({ autoDistance: false });
    }
  };

  const handleManualDepthChange = (depth: number) => {
    // Ręczna zmiana wartości wyłącza tryb auto
    onChange({ depth, autoDistance: false });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
      <SegmentedControl
        label="Tryb tarasu:"
        value={currentVariant}
        options={TERRACE_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ variant })}
        accentVar="var(--accent-orange)"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {currentVariant === 'steps' ? 'Uskok łączny a (m):' : 'Głębokość uskoku a (m):'}
            </span>
            {calculatedDist !== null && (
              <button
                type="button"
                onClick={handleToggleAuto}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  background: isAuto ? 'rgba(254, 215, 170, 0.25)' : 'rgba(254, 215, 170, 0.08)',
                  border: isAuto ? '1px solid var(--accent-orange)' : '1px solid rgba(254, 215, 170, 0.25)',
                  borderRadius: '4px',
                  color: isAuto ? 'var(--text-primary)' : 'var(--accent-orange)',
                  fontSize: '9px',
                  fontWeight: isAuto ? 700 : 500,
                  padding: '1px 5px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title={isAuto ? 'Tryb Auto aktywny (wyliczany na żywo). Kliknij aby przejść w tryb ręczny.' : `Włącz tryb Auto (${calculatedDist}m)`}
              >
                <Ruler size={10} />
                <span>Auto: {calculatedDist}m {isAuto ? '●' : ''}</span>
              </button>
            )}
          </div>
          <LabeledNumberField
            label=""
            value={modifier.depth}
            onChange={handleManualDepthChange}
            hint={isAuto ? `Tryb Auto: ${depthHint.text}` : depthHint.text}
            hintColor={depthHint.color}
          />
        </div>

        <StoryRangeSelector
          value={modifier.storiesCount}
          allowWholeBuilding={true}
          onChange={(storiesCount) => onChange({ storiesCount })}
        />
      </div>

      {context.availableEdges.length > 1 && (
        <IndexPillSelector
          label="Krawędź:"
          value={modifier.edgeIndex ?? -1}
          placeholderValue={-1}
          placeholderLabel="Domyślna (najdłuższa krawędź)"
          options={context.availableEdges}
          onChange={(edgeIndex) => onChange({ edgeIndex })}
          accentVar="var(--accent-orange)"
        />
      )}
    </div>
  );
};
