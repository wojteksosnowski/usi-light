import React from 'react';
import { FIELD_WRAPPER_STYLE, FIELD_LABEL_STYLE, FIELD_INPUT_STYLE } from './fieldStyles';

export interface LabeledSelectOption<T extends string | number> {
  value: T;
  label: string;
}

export interface LabeledSelectProps<T extends string | number> {
  label: string;
  value: T;
  placeholderValue: T;
  placeholderLabel: string;
  options: LabeledSelectOption<T>[];
  onChange: (value: T | undefined) => void;
}

/**
 * Generyczny select z etykietą i opcją "domyślną" (placeholder), używany do wyboru krawędzi/wierzchołka.
 * Używane przez panele pól modyfikatorów (src/components/modifiers/panels/*) obsługujące edgeIndex/vertexIndex.
 */
export function LabeledSelect<T extends string | number>({
  label,
  value,
  placeholderValue,
  placeholderLabel,
  options,
  onChange,
}: LabeledSelectProps<T>) {
  return (
    <div style={FIELD_WRAPPER_STYLE}>
      <label style={FIELD_LABEL_STYLE}>{label}</label>
      <select
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = (typeof placeholderValue === 'number' ? parseInt(raw, 10) : raw) as T;
          onChange(parsed === placeholderValue ? undefined : parsed);
        }}
        style={{ ...FIELD_INPUT_STYLE, padding: '3px 4px', fontSize: '10px', cursor: 'pointer' }}
      >
        <option value={placeholderValue}>{placeholderLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
