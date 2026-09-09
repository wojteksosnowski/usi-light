import React from 'react';
import { ZoneCornerType, ZoneOffsetModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { SegmentedControl } from '../controls/SegmentedControl';
import { signHint } from './signHint';

const ZONE_CORNER_OPTIONS: { value: ZoneCornerType; label: string }[] = [
  { value: 'miter', label: 'Proste' },
  { value: 'round', label: 'Zaokrąglone' },
  { value: 'chamfer', label: 'Ścięte' },
];

export const ZoneOffsetFields: React.FC<ModifierFieldsProps<ZoneOffsetModifier>> = ({ modifier, onChange }) => {
  const distanceHint = signHint(modifier.distance, ['Offset do wnętrza (-)', 'var(--accent-rose)'], ['Bufor zewnętrzny (+)', 'var(--accent-cyan)']);

  return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
    <LabeledNumberField
      label="Odsunięcie strefy (m):"
      value={modifier.distance}
      onChange={(distance) => onChange({ distance })}
      hint={distanceHint.text}
      hintColor={distanceHint.color}
    />
    <SegmentedControl
      label="Typ naroży:"
      value={modifier.cornerType ?? 'miter'}
      options={ZONE_CORNER_OPTIONS}
      onChange={(cornerType) => onChange({ cornerType })}
      accentVar="var(--accent-cyan-light)"
    />
  </div>
  );
};
