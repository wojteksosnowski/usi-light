import React from 'react';
import { TerraceModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { LabeledSelect } from '../controls/LabeledSelect';
import { StoryRangeSelector } from '../StoryRangeSelector';
import { signHint } from './signHint';

export const TerraceFields: React.FC<ModifierFieldsProps<TerraceModifier>> = ({ modifier, onChange, context }) => {
  const depthHint = signHint(modifier.depth, ['Cofnięcie ściany (-)', 'var(--accent-orange)'], ['Nadwieszenie ściany (+)', 'var(--accent-blue)']);

  return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      <LabeledNumberField
        label="Uskok kaskady (m):"
        value={modifier.depth}
        onChange={(depth) => onChange({ depth })}
        hint={depthHint.text}
        hintColor={depthHint.color}
      />
      <StoryRangeSelector
        value={modifier.storiesCount}
        allowWholeBuilding={true}
        onChange={(storiesCount) => onChange({ storiesCount })}
      />
    </div>

    {context.availableEdges.length > 1 && (
      <LabeledSelect
        label="Modyfikowana krawędź ściany:"
        value={modifier.edgeIndex ?? -1}
        placeholderValue={-1}
        placeholderLabel="Domyślna (najdłuższa krawędź)"
        options={context.availableEdges}
        onChange={(edgeIndex) => onChange({ edgeIndex })}
      />
    )}
  </div>
  );
};
