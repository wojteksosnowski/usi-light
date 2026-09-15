import React from 'react';
import { FIELD_WRAPPER_STYLE, FIELD_LABEL_STYLE, FIELD_INPUT_STYLE } from './fieldStyles';
import { MiniToggle, MiniToggleProps } from './MiniToggle';

export interface LabeledNumberFieldProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  hintColor?: string;
  /** Gdy true, pole prezentuje wartość wyliczoną automatycznie (np. tryb "auto") — tekst wyszarzony, pole tylko do odczytu. */
  grayed?: boolean;
  /** Gdy true, pole jest zablokowane. */
  disabled?: boolean;
  /** Opcjonalna stała lub minimalna szerokość pola input (np. '64px', '80px', '100%'). */
  inputWidth?: string | number;
  /** Opcjonalny przełącznik MiniToggle umieszczony w tym samym wierszu po prawej stronie pola tekstowego. */
  toggle?: MiniToggleProps | null;
  /** Opcjonalny dodatkowy element (slot) po prawej stronie pola input. */
  rightSlot?: React.ReactNode;
}

/**
 * Generyczne pole liczbowe z etykietą, opcjonalnym przełącznikiem MiniToggle (w tej samej linii)
 * i podpowiedzią pod polem. Używane uniwersalnie przez panele modyfikatorów.
 */
export const LabeledNumberField: React.FC<LabeledNumberFieldProps> = ({
  label,
  value,
  onChange,
  unit,
  step = 0.5,
  min,
  max,
  hint,
  hintColor = 'var(--text-muted)',
  grayed = false,
  disabled = false,
  inputWidth,
  toggle,
  rightSlot,
}) => {
  const isReadOnly = grayed || disabled;
  const hasInlineItems = Boolean(toggle || rightSlot);
  const resolvedWidth = inputWidth ?? (hasInlineItems ? '64px' : '100%');
  const resolvedFlex = inputWidth ? undefined : hasInlineItems ? '0 0 64px' : '1';

  return (
    <div style={FIELD_WRAPPER_STYLE}>
      {label && <label style={FIELD_LABEL_STYLE}>{label}</label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          readOnly={isReadOnly}
          disabled={disabled}
          onChange={(e) => !isReadOnly && onChange(parseFloat(e.target.value) || 0)}
          style={{
            ...FIELD_INPUT_STYLE,
            width: resolvedWidth,
            flex: resolvedFlex,
            fontFamily: 'monospace',
            fontWeight: 600,
            color: grayed ? 'var(--text-muted)' : FIELD_INPUT_STYLE.color,
            cursor: isReadOnly ? 'default' : undefined,
          }}
        />
        {unit && <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{unit}</span>}
        {toggle && <MiniToggle {...toggle} />}
        {rightSlot}
      </div>
      {hint && <span style={{ fontSize: '9px', color: hintColor }}>{hint}</span>}
    </div>
  );
};
