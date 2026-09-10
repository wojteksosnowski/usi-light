import React from 'react';
import { CornerCutModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { SegmentedControl } from '../controls/SegmentedControl';
import { LabeledSelect } from '../controls/LabeledSelect';
import { StoryRangeSelector } from '../StoryRangeSelector';
import { ChamferIcon, FilletIcon, NotchIcon } from '../../common/CustomCadIcons';

const CORNER_CUT_MODE_OPTIONS: { value: CornerCutModifier['mode']; label: string; Icon: React.FC<{ size?: number; color?: string }> }[] = [
  { value: 'chamfer', label: 'Ukośne', Icon: ChamferIcon },
  { value: 'fillet', label: 'Zaokrąglenie', Icon: FilletIcon },
  { value: 'notch', label: 'Karo', Icon: NotchIcon },
];

const CORNER_CUT_SCOPE_OPTIONS: { value: CornerCutModifier['scope']; label: string }[] = [
  { value: 'all', label: 'Wszystkie narożniki' },
  { value: 'edge', label: 'Narożniki krawędzi' },
  { value: 'vertex', label: 'Jeden narożnik' },
];

export const CornerCutFields: React.FC<ModifierFieldsProps<CornerCutModifier>> = ({ modifier, onChange, context }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      <LabeledNumberField
        label="Wartość d (m):"
        value={modifier.depth}
        step={0.1}
        min={0.1}
        onChange={(depth) => onChange({ depth: Math.max(0.1, depth) })}
      />
      <StoryRangeSelector
        value={modifier.storiesCount}
        allowWholeBuilding={true}
        onChange={(storiesCount) => onChange({ storiesCount })}
      />
    </div>

    <SegmentedControl
      label="Tryb ścięcia:"
      value={modifier.mode}
      options={CORNER_CUT_MODE_OPTIONS}
      onChange={(mode) => onChange({ mode })}
      accentVar="var(--accent-cyan-light)"
    />

    <SegmentedControl
      label="Zakres ścięcia:"
      value={modifier.scope}
      options={CORNER_CUT_SCOPE_OPTIONS}
      onChange={(scope) => onChange({ scope })}
      accentVar="var(--accent-cyan-light)"
    />

    {modifier.scope === 'edge' && (
      <LabeledSelect
        label="Krawędź:"
        value={modifier.edgeIndex ?? -1}
        placeholderValue={-1}
        placeholderLabel="Domyślna (pierwsza)"
        options={context.availableEdges}
        onChange={(edgeIndex) => onChange({ edgeIndex })}
      />
    )}

    {modifier.scope === 'vertex' && (
      <LabeledSelect
        label="Narożnik:"
        value={modifier.vertexIndex ?? -1}
        placeholderValue={-1}
        placeholderLabel="Domyślny (pierwszy)"
        options={context.availableVertices}
        onChange={(vertexIndex) => onChange({ vertexIndex })}
      />
    )}
  </div>
);
