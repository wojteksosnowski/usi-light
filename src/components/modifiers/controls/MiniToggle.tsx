import React from 'react';

export interface MiniToggleProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  accentVar?: string;
  title?: string;
}

/**
 * Kompaktowy przełącznik (switch) dla trybu "auto" parametru liczbowego — bez wyświetlania
 * samej wartości w przycisku (wartość widać w powiązanym polu liczbowym obok/pod spodem).
 */
export const MiniToggle: React.FC<MiniToggleProps> = ({
  label,
  checked,
  onChange,
  accentVar = 'var(--accent-emerald)',
  title,
}) => {
  return (
    <button
      type="button"
      onClick={onChange}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontSize: '9px',
          fontWeight: checked ? 700 : 500,
          color: checked ? accentVar : 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          position: 'relative',
          display: 'inline-block',
          width: '24px',
          height: '13px',
          borderRadius: '999px',
          backgroundColor: checked ? accentVar : 'var(--bg-input)',
          border: `1px solid ${checked ? accentVar : 'var(--border-light)'}`,
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '1px',
            left: checked ? '12px' : '1px',
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            backgroundColor: checked ? '#0f172a' : 'var(--text-muted)',
            transition: 'left 0.15s ease',
          }}
        />
      </span>
    </button>
  );
};
