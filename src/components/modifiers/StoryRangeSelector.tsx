import React from 'react';

export interface StoryRangeSelectorProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  allowWholeBuilding?: boolean;
  disabled?: boolean;
}

export const StoryRangeSelector: React.FC<StoryRangeSelectorProps> = ({
  value,
  onChange,
  label = 'Zakres kondygnacji:',
  allowWholeBuilding = true,
  disabled = false,
}) => {
  const options = [
    ...(allowWholeBuilding ? [{ value: 0, label: 'Cała bryła (0)' }] : []),
    { value: -1, label: 'Ostatnia kondygnacja (-1)' },
    { value: -2, label: '2 ostatnie kondygnacje (-2)' },
    { value: -3, label: '3 ostatnie kondygnacje (-3)' },
    { value: -4, label: '4 ostatnie kondygnacje (-4)' },
    { value: 1, label: 'Parter (+1)' },
    { value: 2, label: '2 dolne kondygnacje (+2)' },
    { value: 3, label: '3 dolne kondygnacje (+3)' },
  ];

  let hintText = '';
  if (value === 0) {
    hintText = 'Wszystkie kondygnacje';
  } else if (value < 0) {
    const abs = Math.abs(value);
    hintText = `${abs} od góry (poddasze)`;
  } else if (value > 0) {
    hintText = `${value} od dołu (podcień)`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        style={{
          width: '100%',
          backgroundColor: 'var(--bg-input)',
          border: '1px solid var(--border-light)',
          borderRadius: '6px',
          color: 'var(--text-primary)',
          padding: '4px 6px',
          fontSize: '11px',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hintText && (
        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
          {hintText}
        </span>
      )}
    </div>
  );
};
