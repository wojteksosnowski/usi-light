import React from 'react';
import { FIELD_WRAPPER_STYLE, FIELD_LABEL_STYLE, FIELD_INPUT_STYLE } from './fieldStyles';

export interface LabeledNumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  hintColor?: string;
}

/**
 * Generyczne pole liczbowe z etykietą, opcjonalną jednostką i podpowiedzią pod polem.
 * Używane przez wszystkie panele pól modyfikatorów (src/components/modifiers/panels/*).
 */
export const LabeledNumberField: React.FC<LabeledNumberFieldProps> = ({
  label,
  value,
  onChange,
  step = 0.5,
  min,
  max,
  hint,
  hintColor = 'var(--text-muted)',
}) => {
  return (
    <div style={FIELD_WRAPPER_STYLE}>
      <label style={FIELD_LABEL_STYLE}>{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ ...FIELD_INPUT_STYLE, fontFamily: 'monospace', fontWeight: 600 }}
      />
      {hint && <span style={{ fontSize: '9px', color: hintColor }}>{hint}</span>}
    </div>
  );
};
