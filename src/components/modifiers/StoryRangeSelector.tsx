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
  const options = [-3, -2, -1, ...(allowWholeBuilding ? [0] : []), 1, 2, 3];

  const formatLabel = (v: number) => (v === 0 ? '0' : v > 0 ? `+${v}` : `${v}`);

  const formatTitle = (v: number) => {
    if (v === 0) return 'Cała bryła (wszystkie kondygnacje)';
    const abs = Math.abs(v);
    return v < 0
      ? `${abs} ${abs === 1 ? 'ostatnia kondygnacja' : 'ostatnie kondygnacje'} od góry (poddasze)`
      : `${abs} ${abs === 1 ? 'kondygnacja' : 'kondygnacje'} od dołu (parter / podcień)`;
  };

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          backgroundColor: 'var(--bg-input)',
          borderRadius: '7px',
          padding: '2px',
          border: '1px solid var(--border-light)',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {options.map((opt) => {
          const isSelected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              title={formatTitle(opt)}
              style={{
                flex: 1,
                padding: '3px 0',
                borderRadius: '5px',
                fontSize: '10px',
                fontWeight: isSelected ? 700 : 500,
                cursor: disabled ? 'not-allowed' : 'pointer',
                border: 'none',
                backgroundColor: isSelected ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                color: isSelected ? '#c084fc' : '#64748b',
                letterSpacing: '0.02em',
                transition: 'all 0.15s ease',
              }}
            >
              {formatLabel(opt)}
            </button>
          );
        })}
      </div>
      {hintText && (
        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
          {hintText}
        </span>
      )}
    </div>
  );
};
