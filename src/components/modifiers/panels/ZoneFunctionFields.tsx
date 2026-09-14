import React from 'react';
import { BuildingType } from '../../../types/geometry';
import { ZoneFunctionModifier, ZoneFunctionScope } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { SegmentedControl } from '../controls/SegmentedControl';
import { IndexPillSelector } from '../controls/IndexPillSelector';
import { StoryRangeSelector } from '../StoryRangeSelector';

const BUILDING_TYPE_OPTIONS: { value: BuildingType; label: string }[] = [
  { value: 'residential', label: 'Mieszkania' },
  { value: 'service', label: 'Usługi' },
  { value: 'garage', label: 'Garaż' },
];

const SCOPE_OPTIONS: { value: ZoneFunctionScope; label: string }[] = [
  { value: 'storeys', label: 'Całe kondygnacje' },
  { value: 'edge_offset', label: 'Pas od krawędzi' },
];

export const ZoneFunctionFields: React.FC<ModifierFieldsProps<ZoneFunctionModifier>> = ({
  modifier,
  onChange,
  context,
}) => {
  const currentType = modifier.buildingType || 'service';
  const currentScope = modifier.scope || 'storeys';
  const { availableEdges } = context;

  const storyRangeSelector = (
    <StoryRangeSelector
      value={modifier.storiesCount}
      allowWholeBuilding={true}
      onChange={(storiesCount) => onChange({ storiesCount })}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
      <SegmentedControl
        label="Docelowe przeznaczenie:"
        value={currentType}
        options={BUILDING_TYPE_OPTIONS}
        onChange={(buildingType) => onChange({ buildingType })}
        accentVar={
          currentType === 'service'
            ? 'var(--accent-amber)'
            : currentType === 'garage'
            ? 'var(--text-secondary)'
            : 'var(--accent-indigo)'
        }
      />

      <SegmentedControl
        label="Zakres zmiany:"
        value={currentScope}
        options={SCOPE_OPTIONS}
        onChange={(scope) => onChange({ scope })}
        accentVar="var(--accent-cyan)"
      />

      {currentScope === 'edge_offset' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'flex-start' }}>
          <LabeledNumberField
            label="Głębokość pasma d (m):"
            value={modifier.depth ?? 10.0}
            min={0.5}
            step={0.5}
            onChange={(depth) => onChange({ depth: Math.max(0.5, depth) })}
            hint={`Trakt o głębokości ${modifier.depth ?? 10.0}m`}
            hintColor="var(--accent-cyan)"
          />

          {storyRangeSelector}
        </div>
      )}

      {currentScope === 'storeys' && storyRangeSelector}

      {currentScope === 'edge_offset' && availableEdges.length > 1 && (
        <IndexPillSelector
          label="Krawędź odniesienia:"
          value={modifier.edgeIndex ?? -1}
          placeholderValue={-1}
          placeholderLabel="Domyślna (najdłuższa krawędź)"
          options={availableEdges}
          onChange={(edgeIndex) => onChange({ edgeIndex })}
          accentVar="var(--accent-cyan)"
        />
      )}
    </div>
  );
};
