import React from 'react';

interface SimpleLayerToggleProps {
  label: string;
  active: boolean;
  dotColorVar?: string;
  onToggle: () => void;
}

/**
 * Reużywalny przełącznik widoczności warstwy zgodny z UI Design System.
 */
export const SimpleLayerToggle: React.FC<SimpleLayerToggleProps> = ({
  label,
  active,
  dotColorVar = 'var(--accent-emerald)',
  onToggle,
}) => (
  <div className="project-layer-toggle-row">
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: active ? dotColorVar : 'var(--text-muted)',
          boxShadow: active ? `0 0 6px ${dotColorVar}` : 'none',
        }}
      />
      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
    </div>
    <button
      type="button"
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <div
        className={`project-toggle-switch ${active ? 'active' : ''}`}
        style={{
          backgroundColor: active ? dotColorVar : 'var(--border-light)',
        }}
      >
        <div className="project-toggle-dot" />
      </div>
    </button>
  </div>
);
