import React from 'react';

export interface StoryRangeSelectorProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  allowWholeBuilding?: boolean;
  disabled?: boolean;
}

const WINDOW_HALF = 3;
const MAX_ABS = 6;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Domyślne (wyśrodkowane wokół `v`) przesunięcie okna - rozciągnięte tylko na tyle, by pomieścić `v`. */
const computeDefaultShift = (v: number): number => {
  if (v > WINDOW_HALF) return clamp(v - WINDOW_HALF, -WINDOW_HALF, WINDOW_HALF);
  if (v < -WINDOW_HALF) return clamp(v + WINDOW_HALF, -WINDOW_HALF, WINDOW_HALF);
  return 0;
};

export const StoryRangeSelector: React.FC<StoryRangeSelectorProps> = ({
  value,
  onChange,
  label = 'Zakres kondygnacji:',
  allowWholeBuilding = true,
  disabled = false,
}) => {
  // Przesuwające się okno pigułek: wybór skrajnej wartości odsłania kolejną w tym kierunku,
  // aż do granicy MAX_ABS - patrz [[musimy-naprawic-to-zolte-breezy-wind]].
  const [shift, setShift] = React.useState(() => computeDefaultShift(value));
  // Śledzi ostatnią wartość wyemitowaną przez ten komponent przez onChange, żeby odróżnić
  // "ja właśnie zmieniłem value" (nie nadpisuj shiftu ustawionego w handleSelect) od zmiany
  // faktycznie zewnętrznej (np. przełączenie na inny modyfikator) - patrz [[musimy-naprawic-to-zolte-breezy-wind]].
  const lastEmittedRef = React.useRef(value);

  const windowMin = -WINDOW_HALF + shift;
  const windowMax = WINDOW_HALF + shift;

  React.useEffect(() => {
    if (value !== lastEmittedRef.current) {
      setShift(computeDefaultShift(value));
      lastEmittedRef.current = value;
    }
  }, [value]);

  const options: number[] = [];
  for (let v = windowMin; v <= windowMax; v++) {
    if (v === 0 && !allowWholeBuilding) continue;
    options.push(v);
  }

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

  const handleSelect = (opt: number) => {
    lastEmittedRef.current = opt;
    onChange(opt);
    if (opt === windowMax && windowMax < MAX_ABS) {
      setShift((s) => s + 1);
    } else if (opt === windowMin && windowMin > -MAX_ABS) {
      setShift((s) => s - 1);
    } else {
      setShift(computeDefaultShift(opt));
    }
  };

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
              onClick={() => handleSelect(opt)}
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
                color: isSelected ? 'var(--accent-purple)' : 'var(--text-muted)',
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
