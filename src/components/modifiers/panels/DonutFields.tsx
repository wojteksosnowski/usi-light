import React from 'react';
import { DonutModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { StoryRangeSelector } from '../StoryRangeSelector';

export const DonutFields: React.FC<ModifierFieldsProps<DonutModifier>> = ({ modifier, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      <LabeledNumberField
        label="Offset otworu (m):"
        value={modifier.offset}
        step={1.0}
        onChange={(offset) => onChange({ offset })}
        hint={`Wcięcie do środka: ${modifier.offset}m`}
        hintColor="var(--accent-emerald-light)"
      />
      <StoryRangeSelector
        value={modifier.storiesCount}
        allowWholeBuilding={true}
        onChange={(storiesCount) => onChange({ storiesCount })}
      />
    </div>
  </div>
);
