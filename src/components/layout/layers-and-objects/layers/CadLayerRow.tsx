import React, { memo } from 'react';
import { Lock, Unlock, Ghost, Lightbulb, LightbulbOff, Magnet } from 'lucide-react';
import { CircleSelectionIcon } from '../common/CircleSelectionIcon';
import { CadLayerSettings, BuildingLoop } from '@/types/geometry';

interface CadLayerRowProps {
  name: string;
  count: number;
  isSelected: boolean;
  setting?: CadLayerSettings;
  layerBuildings: BuildingLoop[];
  selectionStatus: 'all' | 'partial' | 'none';
  onSelectLayer: (name: string) => void;
  onToggleSelection: (buildings: BuildingLoop[]) => void;
  onToggleLock: (name: string) => void;
  onToggleGhost: (name: string) => void;
  onToggleVisibility: (name: string) => void;
  onToggleSnapExclusion: (name: string) => void;
}

export const CadLayerRow = memo<CadLayerRowProps>(({
  name,
  count,
  isSelected,
  setting = {},
  layerBuildings,
  selectionStatus,
  onSelectLayer,
  onToggleSelection,
  onToggleLock,
  onToggleGhost,
  onToggleVisibility,
  onToggleSnapExclusion,
}) => {
  const isLocked = setting.isLocked === true;
  const isGhosted = setting.isGhosted === true;
  const isVisible = setting.isVisible !== false;
  const isSnapExcluded = setting.isSnapExcluded === true;

  return (
    <div
      onClick={() => onSelectLayer(name)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        borderRadius: '8px',
        cursor: 'pointer',
        backgroundColor: isSelected
          ? 'rgba(99, 102, 241, 0.16)'
          : 'var(--bg-input)',
        border: isSelected
          ? '1px solid rgba(99, 102, 241, 0.45)'
          : '1px solid var(--border-color)',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: isSelected ? 700 : 500,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={name}
        >
          {name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--border-color)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontWeight: 600,
            }}
          >
            {count} ob.
          </span>
        </div>
      </div>

      {/* 5 Action Controls: Selekcja, Kłódka, Duch, Żarówka, Magnes */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onToggleSelection(layerBuildings)}
          title={
            selectionStatus === 'all'
              ? 'Odznacz obiekty na tej warstwie'
              : 'Zaznacz obiekty na tej warstwie'
          }
          style={{
            padding: '4px',
            borderRadius: '5px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircleSelectionIcon status={selectionStatus} size={13} />
        </button>

        <button
          type="button"
          onClick={() => onToggleLock(name)}
          title={isLocked ? 'Odblokuj przesuwanie i edycję' : 'Zablokuj przesuwanie i edycję'}
          style={{
            padding: '4px',
            borderRadius: '5px',
            border: 'none',
            backgroundColor: isLocked ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
            color: isLocked ? 'var(--accent-lock)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isLocked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>

        <button
          type="button"
          onClick={() => onToggleGhost(name)}
          title={isGhosted ? 'Wyłącz tryb Ducha' : 'Włącz tryb Ducha'}
          style={{
            padding: '4px',
            borderRadius: '5px',
            border: 'none',
            backgroundColor: isGhosted ? 'rgba(192, 132, 252, 0.2)' : 'transparent',
            color: isGhosted ? 'var(--accent-purple)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ghost size={13} />
        </button>

        <button
          type="button"
          onClick={() => onToggleVisibility(name)}
          title={isVisible ? 'Wyłącz warstwę' : 'Włącz warstwę'}
          style={{
            padding: '4px',
            borderRadius: '5px',
            border: 'none',
            backgroundColor: isVisible ? 'rgba(250, 204, 21, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            color: isVisible ? 'var(--accent-amber)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isVisible ? <Lightbulb size={13} /> : <LightbulbOff size={13} />}
        </button>

        <button
          type="button"
          onClick={() => onToggleSnapExclusion(name)}
          title={isSnapExcluded ? 'Włącz warstwę do OSNAP' : 'Wyłącz warstwę z OSNAP (magnes)'}
          style={{
            padding: '4px',
            borderRadius: '5px',
            border: 'none',
            backgroundColor: isSnapExcluded ? 'rgba(146, 64, 14, 0.2)' : 'transparent',
            color: isSnapExcluded ? '#92400e' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Magnet size={13} />
        </button>
      </div>
    </div>
  );
});

CadLayerRow.displayName = 'CadLayerRow';
