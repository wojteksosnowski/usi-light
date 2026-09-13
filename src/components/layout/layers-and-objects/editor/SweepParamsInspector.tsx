import React from 'react';
import { BuildingLoop } from '@/types/geometry';

interface SweepParamsInspectorProps {
  building: BuildingLoop;
  onUpdate: (updates: Partial<BuildingLoop>) => void;
}

export const SweepParamsInspector: React.FC<SweepParamsInspectorProps> = ({
  building,
  onUpdate,
}) => {
  if (!building.sweepPath || building.sweepPath.length < 2) return null;

  const alignment = building.sweepAlignment || 'center';

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: '8px',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontSize: '11px' }}>
        Parametry Wstęgi (Sweep)
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Szerokość (m)</label>
        <input
          type="number"
          step="0.5"
          min="0.5"
          value={building.sweepWidth ?? 6.0}
          onChange={(e) => onUpdate({ sweepWidth: parseFloat(e.target.value) || 1.0 })}
          style={{
            width: '70px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-light)',
            borderRadius: '5px',
            padding: '4px 6px',
            color: 'var(--accent-cyan)',
            fontSize: '11px',
            fontWeight: 'bold',
            textAlign: 'right',
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Wyrównanie</label>
        <div
          style={{
            display: 'flex',
            gap: '2px',
            backgroundColor: 'var(--bg-input)',
            padding: '2px',
            borderRadius: '5px',
            border: '1px solid var(--border-light)',
          }}
        >
          <button
            type="button"
            onClick={() => onUpdate({ sweepAlignment: 'center' })}
            style={{
              padding: '2px 5px',
              fontSize: '9.5px',
              fontWeight: alignment === 'center' ? 700 : 500,
              borderRadius: '3px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: alignment === 'center' ? 'var(--accent-cyan)' : 'transparent',
              color: alignment === 'center' ? 'var(--bg-main)' : 'var(--text-secondary)',
            }}
          >
            Oś
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ sweepAlignment: 'left' })}
            style={{
              padding: '2px 5px',
              fontSize: '9.5px',
              fontWeight: alignment === 'left' ? 700 : 500,
              borderRadius: '3px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: alignment === 'left' ? 'var(--accent-cyan)' : 'transparent',
              color: alignment === 'left' ? 'var(--bg-main)' : 'var(--text-secondary)',
            }}
          >
            Lewo
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ sweepAlignment: 'right' })}
            style={{
              padding: '2px 5px',
              fontSize: '9.5px',
              fontWeight: alignment === 'right' ? 700 : 500,
              borderRadius: '3px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: alignment === 'right' ? 'var(--accent-cyan)' : 'transparent',
              color: alignment === 'right' ? 'var(--bg-main)' : 'var(--text-secondary)',
            }}
          >
            Prawo
          </button>
        </div>
      </div>
    </div>
  );
};
