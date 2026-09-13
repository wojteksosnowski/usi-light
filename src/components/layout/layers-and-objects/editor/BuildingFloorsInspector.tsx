import React from 'react';
import { BuildingLoop } from '@/types/geometry';
import { calculateBuildingFloors } from '@/utils/buildingFloorCalculator';

interface BuildingFloorsInspectorProps {
  building: BuildingLoop;
  onUpdate: (updates: Partial<BuildingLoop>) => void;
}

export const BuildingFloorsInspector: React.FC<BuildingFloorsInspectorProps> = ({
  building,
  onUpdate,
}) => {
  const h1 = building.firstFloorHeight ?? 3.0;
  const ht = building.typicalFloorHeight ?? 3.0;
  const floorCalc = calculateBuildingFloors(
    building.defaultHeight,
    h1,
    ht,
    building.elevation ?? 0.0
  );

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          backgroundColor: 'var(--bg-input)',
          padding: '6px 8px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
            Wys. parteru H₁
          </label>
          <input
            type="number"
            step="0.1"
            value={h1}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 3.0;
              onUpdate({ firstFloorHeight: val });
            }}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-light)',
              borderRadius: '5px',
              padding: '4px 6px',
              color: 'var(--text-primary)',
              fontSize: '11px',
              textAlign: 'right',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
            Kond. typowa Hₜ
          </label>
          <input
            type="number"
            step="0.05"
            value={ht}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 3.0;
              onUpdate({ typicalFloorHeight: val });
            }}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-light)',
              borderRadius: '5px',
              padding: '4px 6px',
              color: 'var(--text-primary)',
              fontSize: '11px',
              textAlign: 'right',
            }}
          />
        </div>
      </div>

      {/* Automatyczna liczba kondygnacji (cyfry rzymskie) + Attyka */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Liczba kondygnacji:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: 'var(--accent-cyan)',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                letterSpacing: '0.05em',
              }}
              title={`Liczba kondygnacji pełnych: ${floorCalc.storeysCount}`}
            >
              {floorCalc.storeysRoman} ({floorCalc.storeysCount})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Wysokość attyki (Hₐ):</span>
          <span
            style={{
              fontWeight: 600,
              fontFamily: 'monospace',
              color: floorCalc.atticHeight > 0.001 ? 'var(--accent-amber)' : 'var(--text-muted)',
            }}
          >
            {floorCalc.atticHeight.toFixed(2)} m
          </span>
        </div>

        <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-light)', paddingTop: '4px' }}>
          H = {h1.toFixed(2)}m (parter) + {floorCalc.storeysCount > 1 ? `${floorCalc.storeysCount - 1}×${ht.toFixed(2)}m` : '0m'} + {floorCalc.atticHeight.toFixed(2)}m (attyka) = <b>{building.defaultHeight.toFixed(2)}m</b>
        </div>
      </div>
    </>
  );
};
