import React from 'react';
import { CheckCircle2, FlaskConical, Building2, Lock, Unlock, Ghost, ArrowUpToLine, ArrowDownToLine, Layers } from 'lucide-react';
import { BuildingLoop } from '../../types/geometry';
import { useSceneStore } from '../../store';
import { toRomanNumeral } from '@/utils/buildingFloorCalculator';

interface BuildingLabelMiniPanelProps {
  building: BuildingLoop;
  /** Pozycja ekranowa środka karty etykiety, wokół której zakotwiczony jest minipanel. */
  anchor: { sx: number; sy: number };
  onClose: () => void;
}

interface ToggleDef {
  key: 'isIncluded' | 'isTested' | 'isCityCentre' | 'isLocked' | 'isGhosted';
  label: string;
  title: string;
  isActive: (b: BuildingLoop) => boolean;
  activeColor: string;
  getIcon: (active: boolean) => React.ComponentType<{ size?: number }>;
}

const TOGGLES: ToggleDef[] = [
  {
    key: 'isIncluded',
    label: 'Dodaj do analiz',
    title: 'Dodaj obiekt jako przeszkodę do analiz §12 i §56, nawet jeśli nie jest w projekcie — nie wpływa na cień ani parametry',
    isActive: (b) => b.isIncluded !== false,
    activeColor: 'var(--accent-emerald)',
    getIcon: () => CheckCircle2,
  },
  {
    key: 'isTested',
    label: 'W projekcie',
    title: 'Oznacz obiekt jako część projektowanego zamierzenia — wlicza się do cienia i parametrów',
    isActive: (b) => Boolean(b.isTested),
    activeColor: 'var(--accent-indigo)',
    getIcon: () => FlaskConical,
  },
  {
    key: 'isCityCentre',
    label: 'Zabudowa śródmiejska',
    title: 'Włącz normę zabudowy śródmiejskiej dla obiektu',
    isActive: (b) => Boolean(b.isCityCentre),
    activeColor: 'var(--accent-amber)',
    getIcon: () => Building2,
  },
  {
    key: 'isLocked',
    label: 'Zablokuj',
    title: 'Zablokuj przesuwanie i edycję obiektu',
    isActive: (b) => Boolean(b.isLocked),
    activeColor: 'var(--accent-lock)',
    getIcon: (active) => (active ? Lock : Unlock),
  },
  {
    key: 'isGhosted',
    label: 'Duch',
    title: 'Włącz tryb ducha (pomijanie kliknięć i selekcji)',
    isActive: (b) => Boolean(b.isGhosted),
    activeColor: 'var(--accent-purple)',
    getIcon: () => Ghost,
  },
];

export const BuildingLabelMiniPanel: React.FC<BuildingLabelMiniPanelProps> = ({ building, anchor, onClose }) => {
  const updateBuilding = useSceneStore((s) => s.updateBuilding);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="ui-card building-label-mini-panel-spring"
      style={{
        position: 'absolute',
        left: anchor.sx,
        top: anchor.sy + 6,
        transformOrigin: 'top center',
        zIndex: 60,
        padding: '8px',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: '176px',
        boxShadow: '0 8px 24px rgba(2, 6, 23, 0.5)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes buildingLabelMiniPanelSpring {
          0% { transform: translateX(-50%) translateY(-6px) scale(0.85); opacity: 0; }
          55% { transform: translateX(-50%) translateY(1px) scale(1.04); opacity: 1; }
          80% { transform: translateX(-50%) translateY(0) scale(0.98); }
          100% { transform: translateX(-50%) translateY(0) scale(1); }
        }
        .building-label-mini-panel-spring {
          animation: buildingLabelMiniPanelSpring 260ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>
      {building.name && (
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={building.name}
        >
          {building.name}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2px',
          paddingBottom: '6px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
          <ArrowUpToLine size={13} />
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
            {building.defaultHeight}m
          </span>
        </div>
        {typeof building.storeysCount === 'number' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
            <Layers size={13} />
            <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {toRomanNumeral(building.storeysCount)}
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          color: 'var(--text-secondary)',
          marginBottom: '2px',
          paddingBottom: '6px',
          borderBottom: '1px solid var(--border-color)',
        }}
        title="Posadowienie / rzędna dolnej krawędzi"
      >
        <ArrowDownToLine size={13} />
        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Posadowienie</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginLeft: 'auto' }}>
          {(building.elevation ?? 0).toFixed(1)}m
        </span>
      </div>

      {TOGGLES.map((t) => {
        const active = t.isActive(building);
        const Icon = t.getIcon(active);
        return (
          <button
            key={t.key}
            type="button"
            className="modifier-card-icon-btn"
            onClick={() => updateBuilding(building.id, { [t.key]: !active } as Partial<BuildingLoop>)}
            title={t.title}
            style={{
              width: '100%',
              height: '24px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '8px',
              padding: '0 8px',
              color: active ? t.activeColor : 'var(--text-muted)',
              borderColor: active ? t.activeColor : 'var(--border-light)',
            }}
          >
            <Icon size={13} />
            <span style={{ fontSize: '10.5px', color: 'var(--text-primary)', flex: 1, textAlign: 'left' }}>
              {t.label}
            </span>
            <span style={{ fontSize: '9px', fontWeight: 700, color: active ? t.activeColor : 'var(--text-muted)' }}>
              {active ? 'TAK' : 'NIE'}
            </span>
          </button>
        );
      })}
    </div>
  );
};
