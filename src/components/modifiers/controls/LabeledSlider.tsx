import React from 'react';
import { FIELD_WRAPPER_STYLE, FIELD_LABEL_STYLE } from './fieldStyles';

export interface LabeledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  accentVar?: string;
}

/**
 * Generyczny suwak z etykietą i sformatowaną wartością po prawej stronie nagłówka.
 * Używane przez wszystkie panele pól modyfikatorów (src/components/modifiers/panels/*).
 */
export const LabeledSlider: React.FC<LabeledSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 0.05,
  onChange,
  formatValue,
  accentVar = 'var(--accent-cyan-light)',
}) => {
  return (
    <div style={FIELD_WRAPPER_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={FIELD_LABEL_STYLE}>{label}</label>
        <span style={{ fontSize: '9.5px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          accentColor: accentVar,
          cursor: 'pointer',
          height: '4px',
        }}
      />
    </div>
  );
};
