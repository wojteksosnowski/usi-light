import React from 'react';
import { SztycaModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';

export const SztycaFields: React.FC<ModifierFieldsProps<SztycaModifier>> = ({ modifier, onChange }) => {
  const currentOffset = modifier.offset ?? 0;
  const offsetHint =
    currentOffset < 0
      ? 'Cofnięcie od krawędzi szczytu'
      : currentOffset > 0
      ? 'Nadwieszenie poza szczyt'
      : 'Ten sam obrys co szczyt';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <LabeledNumberField
          label="Dodatkowe kondygnacje:"
          value={modifier.storiesCount}
          min={1}
          max={50}
          step={1}
          onChange={(storiesCount) => onChange({ storiesCount: Math.max(1, Math.round(storiesCount)) })}
          hint={`+${modifier.storiesCount} ${modifier.storiesCount === 1 ? 'kondygnacja' : 'kondygnacje'}`}
          hintColor="var(--accent-purple-light)"
        />

        <LabeledNumberField
          label="Wysokość kondygnacji (m):"
          value={modifier.storeyHeight}
          min={1.0}
          max={20.0}
          step={0.5}
          onChange={(storeyHeight) => onChange({ storeyHeight: Math.max(0.5, storeyHeight) })}
          hint={`Razem: +${(modifier.storiesCount * modifier.storeyHeight).toFixed(1)}m`}
          hintColor="var(--accent-purple)"
        />
      </div>

      <LabeledNumberField
        label="Odsunięcie obrysu sztycy (m):"
        value={currentOffset}
        step={0.5}
        onChange={(offset) => onChange({ offset })}
        hint={offsetHint}
        hintColor={currentOffset < 0 ? 'var(--accent-purple)' : currentOffset > 0 ? 'var(--accent-cyan)' : 'var(--text-secondary)'}
      />
    </div>
  );
};
