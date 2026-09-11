import React from 'react';
import { FIELD_WRAPPER_STYLE, FIELD_LABEL_STYLE } from './fieldStyles';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  Icon?: React.ComponentType<{ size?: number; color?: string }>;
}

export interface SegmentedControlProps<T extends string | number> {
  label?: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  accentVar?: string;
}

/**
 * Generyczny rząd przycisków do wyboru jednej z kilku wartości enum (typ naroża, kąt, tryb ścięcia, zakres).
 * Używane przez wszystkie panele pól modyfikatorów (src/components/modifiers/panels/*).
 */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  accentVar = 'var(--accent-cyan-light)',
}: SegmentedControlProps<T>) {
  return (
    <div style={FIELD_WRAPPER_STYLE}>
      {label && <label style={FIELD_LABEL_STYLE}>{label}</label>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${options.length}, 1fr)`,
          gap: '4px',
        }}
      >
        {options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                display: 'flex',
                flexDirection: opt.Icon ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                padding: opt.Icon ? '5px 0' : '4px 2px',
                fontSize: '9.5px',
                fontWeight: isSelected ? 700 : 500,
                borderRadius: '4px',
                border: isSelected ? `1px solid ${accentVar}` : '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-input)',
                color: isSelected ? accentVar : 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              {opt.Icon && <opt.Icon size={14} color={isSelected ? accentVar : 'var(--text-secondary)'} />}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
