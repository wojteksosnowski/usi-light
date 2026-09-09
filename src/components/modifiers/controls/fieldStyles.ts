import React from 'react';

/** Wspólny wrapper (etykieta + kontrolka w kolumnie) używany przez wszystkie kontrolki pól modyfikatorów. */
export const FIELD_WRAPPER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
};

/** Wspólny styl etykiety pola. */
export const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--text-secondary)',
};

/** Wspólne "chrome" pola input/select (tło, obramowanie, zaokrąglenie, typografia). */
export const FIELD_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'var(--bg-input)',
  border: '1px solid var(--border-light)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  padding: '4px 6px',
  fontSize: '11px',
};
