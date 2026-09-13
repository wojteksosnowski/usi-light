import React from 'react';
import { ChevronDown, ChevronRight, Lock, Unlock, Ghost } from 'lucide-react';
import { CircleSelectionIcon } from '../common/CircleSelectionIcon';
import { BuildingLoop } from '@/types/geometry';

interface ObjectCategoryGroupProps {
  id: string;
  title: string;
  count: number;
  icon: React.ReactNode;
  accentColor: string;
  bgRgba: string;
  borderRgba: string;
  items: BuildingLoop[];
  isCollapsed: boolean;
  selectionStatus: 'all' | 'partial' | 'none';
  onToggleCollapse: (id: string) => void;
  onToggleSelection: (items: BuildingLoop[]) => void;
  onToggleMassLock: (items: BuildingLoop[]) => void;
  onToggleMassGhost: (items: BuildingLoop[]) => void;
  children: React.ReactNode;
}

export const ObjectCategoryGroup: React.FC<ObjectCategoryGroupProps> = ({
  id,
  title,
  count,
  icon,
  accentColor,
  bgRgba,
  borderRgba,
  items,
  isCollapsed,
  selectionStatus,
  onToggleCollapse,
  onToggleSelection,
  onToggleMassLock,
  onToggleMassGhost,
  children,
}) => {
  const allLocked = items.length > 0 && items.every((b) => b.isLocked);
  const allGhosted = items.length > 0 && items.every((b) => b.isGhosted);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div
        onClick={() => onToggleCollapse(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px',
          borderRadius: '6px',
          backgroundColor: bgRgba,
          border: `1px solid ${borderRgba}`,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isCollapsed ? (
            <ChevronRight size={13} color={accentColor} />
          ) : (
            <ChevronDown size={13} color={accentColor} />
          )}
          {icon}
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {title} ({count})
          </span>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title={selectionStatus === 'all' ? `Odznacz wszystkie (${title})` : `Zaznacz wszystkie (${title})`}
            onClick={() => onToggleSelection(items)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircleSelectionIcon status={selectionStatus} size={13} />
          </button>

          <button
            type="button"
            title="Zablokuj/odblokuj wszystkie w kategorii"
            onClick={() => onToggleMassLock(items)}
            style={{
              background: 'transparent',
              border: 'none',
              color: allLocked ? 'var(--accent-lock)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {allLocked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>

          <button
            type="button"
            title="Włącz/wyłącz tryb ducha dla wszystkich w kategorii"
            onClick={() => onToggleMassGhost(items)}
            style={{
              background: 'transparent',
              border: 'none',
              color: allGhosted ? 'var(--accent-purple)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ghost size={13} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
          {children}
        </div>
      )}
    </div>
  );
};
