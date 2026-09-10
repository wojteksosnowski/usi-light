import React from 'react';
import { LabeledSelectOption } from './LabeledSelect';

export interface IndexPillSelectorProps<T extends string | number> {
  label: string;
  value: T;
  placeholderValue: T;
  placeholderLabel: string;
  options: LabeledSelectOption<T>[];
  onChange: (value: T | undefined) => void;
  accentVar?: string;
  disabled?: boolean;
}

/**
 * Generyczny selektor pigułkowy (styl "Zakres kondygnacji") do wyboru indeksu krawędzi/wierzchołka,
 * z opcją domyślną (placeholder). Zastępuje LabeledSelect tam, gdzie liczba opcji jest niewielka
 * i pożądany jest jednolity wygląd z StoryRangeSelector.
 */
export function IndexPillSelector<T extends string | number>({
  label,
  value,
  placeholderValue,
  placeholderLabel,
  options,
  onChange,
  accentVar = 'var(--accent-purple)',
  disabled = false,
}: IndexPillSelectorProps<T>) {
  const isPlaceholderSelected = value === placeholderValue;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{label}</label>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '2px',
          backgroundColor: 'var(--bg-input)',
          borderRadius: '7px',
          padding: '2px',
          border: '1px solid var(--border-light)',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          title={placeholderLabel}
          style={{
            flex: '1 1 auto',
            padding: '3px 6px',
            borderRadius: '5px',
            fontSize: '10px',
            fontWeight: isPlaceholderSelected ? 700 : 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: 'none',
            backgroundColor: isPlaceholderSelected ? `color-mix(in srgb, ${accentVar} 25%, transparent)` : 'transparent',
            color: isPlaceholderSelected ? accentVar : 'var(--text-muted)',
            letterSpacing: '0.02em',
            transition: 'all 0.15s ease',
          }}
        >
          Auto
        </button>
        {options.map((opt, i) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              title={opt.label}
              style={{
                flex: '1 1 auto',
                minWidth: '22px',
                padding: '3px 4px',
                borderRadius: '5px',
                fontSize: '10px',
                fontWeight: isSelected ? 700 : 500,
                cursor: disabled ? 'not-allowed' : 'pointer',
                border: 'none',
                backgroundColor: isSelected ? `color-mix(in srgb, ${accentVar} 25%, transparent)` : 'transparent',
                color: isSelected ? accentVar : 'var(--text-muted)',
                letterSpacing: '0.02em',
                transition: 'all 0.15s ease',
              }}
            >
              #{i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
