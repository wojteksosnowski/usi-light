import React from 'react';
import { StoryOffsetModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { StoryRangeSelector } from '../StoryRangeSelector';

export const StoryOffsetFields: React.FC<ModifierFieldsProps<StoryOffsetModifier>> = ({ modifier, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '4px' }}>
    <LabeledNumberField
      label="Przesunięcie (m):"
      value={modifier.distance}
      onChange={(distance) => onChange({ distance })}
      hint={modifier.distance < 0 ? 'Cofnięcie (wcięcie)' : modifier.distance > 0 ? 'Nadwieszenie' : 'Brak'}
      hintColor={modifier.distance < 0 ? 'var(--accent-purple)' : 'var(--accent-cyan)'}
    />
    <StoryRangeSelector
      value={modifier.storiesCount}
      allowWholeBuilding={false}
      onChange={(storiesCount) => onChange({ storiesCount })}
    />
  </div>
);
