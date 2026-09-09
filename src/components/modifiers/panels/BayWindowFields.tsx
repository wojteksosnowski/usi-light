import React from 'react';
import { BayWindowAngle, BayWindowModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { SegmentedControl } from '../controls/SegmentedControl';
import { LabeledSlider } from '../controls/LabeledSlider';
import { LabeledSelect } from '../controls/LabeledSelect';
import { StoryRangeSelector } from '../StoryRangeSelector';

const BAY_WINDOW_ANGLE_OPTIONS: { value: BayWindowAngle; label: string }[] = [
  { value: 90, label: '90°' },
  { value: 60, label: '60°' },
  { value: 45, label: '45°' },
  { value: 30, label: '30°' },
];

export const BayWindowFields: React.FC<ModifierFieldsProps<BayWindowModifier>> = ({ modifier, onChange, context }) => {
  const currentAngle = modifier.sideAngle ?? 45;
  const currentPos = modifier.positionRatio ?? 0.5;
  const { availableEdges } = context;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <LabeledNumberField
          label="Szerokość (m):"
          value={modifier.width}
          min={0.5}
          onChange={(width) => onChange({ width: Math.max(0.1, width) })}
        />
        <LabeledNumberField
          label="Wysunięcie (m):"
          value={modifier.projection}
          step={0.2}
          onChange={(projection) => onChange({ projection })}
        />
      </div>

      <StoryRangeSelector
        value={modifier.storiesCount}
        label="Kondygnacja:"
        allowWholeBuilding={true}
        onChange={(storiesCount) => onChange({ storiesCount })}
      />

      <SegmentedControl
        label="Kąt ścian bocznych:"
        value={currentAngle}
        options={BAY_WINDOW_ANGLE_OPTIONS}
        onChange={(sideAngle) => onChange({ sideAngle })}
        accentVar="var(--accent-yellow)"
      />

      <div style={{ display: 'grid', gridTemplateColumns: availableEdges.length > 1 ? '1.2fr 0.8fr' : '1fr', gap: '8px', alignItems: 'center' }}>
        <LabeledSlider
          label="Pozycja wzdłuż krawędzi:"
          value={currentPos}
          min={0}
          max={1}
          step={0.05}
          onChange={(positionRatio) => onChange({ positionRatio })}
          formatValue={(v) => (v === 0.5 ? 'Środek (50%)' : `${Math.round(v * 100)}%`)}
          accentVar="var(--accent-yellow)"
        />

        {availableEdges.length > 1 && (
          <LabeledSelect
            label="Krawędź:"
            value={modifier.edgeIndex ?? -1}
            placeholderValue={-1}
            placeholderLabel="Domyślna (najdłuższa)"
            options={availableEdges}
            onChange={(edgeIndex) => onChange({ edgeIndex })}
          />
        )}
      </div>

      <span style={{ fontSize: '9px', color: modifier.projection >= 0 ? 'var(--accent-yellow)' : 'var(--accent-rose)' }}>
        {modifier.projection >= 0
          ? `Wysunięcie na zewnątrz (+${modifier.projection}m)`
          : `Wcięcie do wnętrza (${modifier.projection}m)`}
        {' • '}
        {currentAngle === 90 ? 'Boki 90°' : `Kąt boków ${currentAngle}°`}
        {' • '}
        {modifier.storiesCount === 0
          ? 'Wszystkie kondygnacje / obszar'
          : modifier.storiesCount < 0
          ? `${Math.abs(modifier.storiesCount)} od góry`
          : `${modifier.storiesCount} od dołu`}
      </span>
    </div>
  );
};
