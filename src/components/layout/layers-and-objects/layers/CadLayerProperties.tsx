import React from 'react';
import { BuildingLoop } from '@/types/geometry';

interface CadLayerPropertiesProps {
  selectedLayerName: string;
  layerBuildings: BuildingLoop[];
  onUpdateLayerBuildings: (layerName: string, updates: Partial<BuildingLoop>) => void;
}

export const CadLayerProperties: React.FC<CadLayerPropertiesProps> = ({
  selectedLayerName,
  layerBuildings,
  onUpdateLayerBuildings,
}) => {
  if (layerBuildings.length === 0) return null;

  const allIncluded = layerBuildings.every((b) => b.isIncluded !== false);
  const someIncluded = layerBuildings.some((b) => b.isIncluded !== false);
  const allTested = layerBuildings.every((b) => b.isTested);
  const someTested = layerBuildings.some((b) => b.isTested);
  const allCityCentre = layerBuildings.every((b) => b.isCityCentre);
  const someCityCentre = layerBuildings.some((b) => b.isCityCentre);
  const commonHeight = layerBuildings[0]?.defaultHeight ?? 15;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        paddingTop: '8px',
        marginTop: '2px',
        borderTop: '1px dashed var(--border-light)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Wysokość H dla warstwy (m)
        </label>
        <input
          type="number"
          step="0.5"
          value={commonHeight}
          onChange={(e) => {
            const val = parseFloat(e.target.value) || 0;
            onUpdateLayerBuildings(selectedLayerName, { defaultHeight: val, heightSource: 'manual' });
          }}
          style={{
            width: '80px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-light)',
            borderRadius: '6px',
            padding: '5px 8px',
            color: 'var(--accent-cyan)',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            fontSize: '12px',
            textAlign: 'right',
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
        <button
          type="button"
          onClick={() => onUpdateLayerBuildings(selectedLayerName, { isIncluded: !allIncluded })}
          className={`btn-tile ${allIncluded ? 'active-emerald' : someIncluded ? 'active-amber' : 'inactive'}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '6px 4px',
            textAlign: 'center',
            minHeight: '48px',
          }}
          title="Dodaj do analiz §12/§56 (wszystkie obiekty na warstwie) — nie wpływa na cień ani parametry"
        >
          <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Dodaj do analiz</span>
          <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
            {allIncluded ? 'TAK' : someIncluded ? 'CZĘŚĆ' : 'NIE'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateLayerBuildings(selectedLayerName, { isTested: !allTested })}
          className={`btn-tile ${allTested ? 'active-indigo' : someTested ? 'active-amber' : 'inactive'}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '6px 4px',
            textAlign: 'center',
            minHeight: '48px',
          }}
          title="W projekcie (wszystkie obiekty na warstwie) — wlicza się do cienia i parametrów"
        >
          <span style={{ fontSize: '10px', lineHeight: '1.2' }}>W projekcie</span>
          <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
            {allTested ? 'TAK' : someTested ? 'CZĘŚĆ' : 'NIE'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateLayerBuildings(selectedLayerName, { isCityCentre: !allCityCentre })}
          className={`btn-tile ${allCityCentre ? 'active-amber' : someCityCentre ? 'active-indigo' : 'inactive'}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '6px 4px',
            textAlign: 'center',
            minHeight: '48px',
          }}
          title="Zabudowa śródmiejska (wszystkie obiekty na warstwie)"
        >
          <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Zabudowa śródmiejska</span>
          <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
            {allCityCentre ? 'TAK' : someCityCentre ? 'CZĘŚĆ' : 'NIE'}
          </span>
        </button>
      </div>
    </div>
  );
};
