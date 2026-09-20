import React from 'react';
import { Layers, RotateCw, ArrowRight } from 'lucide-react';
import { BuildingLoop } from '@/types/geometry';

interface CompoundObjectInspectorProps {
  groupBuildings: BuildingLoop[];
  selectedBuilding: BuildingLoop;
  onUpdateGroup: (groupId: string, patch: Partial<BuildingLoop>) => void;
  onRotateGroup: (groupId: string, targetDeg: number) => void;
  onEnterGroup: (groupId: string) => void;
}

export const CompoundObjectInspector: React.FC<CompoundObjectInspectorProps> = ({
  groupBuildings,
  selectedBuilding,
  onUpdateGroup,
  onRotateGroup,
  onEnterGroup,
}) => {
  const groupId = selectedBuilding.groupId!;
  const targetForAttributes = groupBuildings[0] || selectedBuilding;

  const currentRotDeg = targetForAttributes.transform?.rotationDeg !== undefined
    ? targetForAttributes.transform.rotationDeg
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 1. Nazwa grupy logicznej */}
      <div>
        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          Nazwa obiektu logicznego
        </label>
        <input
          type="text"
          value={targetForAttributes.name.replace(/\s*\(cz\..*?\)/g, '') || `Grupa ${groupId}`}
          onChange={(e) => onUpdateGroup(groupId, { name: e.target.value })}
          style={{
            width: '100%',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            padding: '7px 10px',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        />
      </div>

      {/* 2. Informacja o kategorii (Połączony Obiekt Logiczny) */}
      <div
        style={{
          padding: '8px 10px',
          borderRadius: '8px',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={14} color="#38bdf8" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#e0f2fe' }}>
            Obiekt Logiczny ({groupBuildings.length} brył)
          </span>
        </div>
        <button
          type="button"
          onClick={() => onEnterGroup(groupId)}
          style={{
            padding: '4px 8px',
            borderRadius: '5px',
            border: '1px solid #38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.25)',
            color: '#38bdf8',
            fontSize: '10px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title="Wejdź do środka grupy, aby edytować parametry pojedynczej bryły"
        >
          <span>Edytuj bryły</span>
          <ArrowRight size={11} />
        </button>
      </div>

      {/* 4. Wspólny Obrót Całej Grupy */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Obrót (°)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RotateCw size={12} color="var(--text-secondary)" />
          <input
            type="number"
            step="1"
            value={Number(currentRotDeg.toFixed(1))}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              onRotateGroup(groupId, val);
            }}
            style={{
              width: '80px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              padding: '6px 8px',
              color: 'var(--accent-indigo)',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'right',
              fontFamily: 'monospace',
            }}
          />
        </div>
      </div>

      {/* 5. Zunifikowany blok 3 przełączników obok siebie */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginTop: '4px' }}>
        <button
          type="button"
          onClick={() => onUpdateGroup(groupId, { isIncluded: targetForAttributes.isIncluded === false ? true : false })}
          className={`btn-tile ${targetForAttributes.isIncluded !== false ? 'active-emerald' : 'inactive'}`}
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
          title="Dodaj obiekt logiczny do analiz — stan synchronizowany dla wszystkich brył"
        >
          <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Dodaj do analiz</span>
          <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
            {targetForAttributes.isIncluded !== false ? 'TAK' : 'NIE'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateGroup(groupId, { isTested: !targetForAttributes.isTested })}
          className={`btn-tile ${targetForAttributes.isTested ? 'active-indigo' : 'inactive'}`}
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
          title="Oznacz obiekt logiczny jako część projektowanego zamierzenia — wlicza się do cienia i parametrów"
        >
          <span style={{ fontSize: '10px', lineHeight: '1.2' }}>W projekcie</span>
          <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
            {targetForAttributes.isTested ? 'TAK' : 'NIE'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateGroup(groupId, { isCityCentre: !targetForAttributes.isCityCentre })}
          className={`btn-tile ${targetForAttributes.isCityCentre ? 'active-amber' : 'inactive'}`}
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
          title="Włącz normę zabudowy śródmiejskiej dla całego obiektu logicznego"
        >
          <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Zabudowa śródmiejska</span>
          <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
            {targetForAttributes.isCityCentre ? 'TAK' : 'NIE'}
          </span>
        </button>
      </div>
    </div>
  );
};
