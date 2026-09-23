import React from 'react';
import { ChevronDown, ChevronRight, Lock, Unlock, Ghost, Briefcase, EyeOff, Lightbulb, LightbulbOff, Magnet } from 'lucide-react';
import { CircleSelectionIcon } from '../common/CircleSelectionIcon';
import { BuildingLoop } from '@/types/geometry';

interface ObjectScopeSubgroupProps {
  id: string;
  label: string;
  count: number;
  scope: 'inProject' | 'outsideProject';
  items: BuildingLoop[];
  isCollapsed: boolean;
  selectionStatus: 'all' | 'partial' | 'none';
  onToggleCollapse: (id: string) => void;
  onToggleSelection: (items: BuildingLoop[]) => void;
  onToggleMassLock: (items: BuildingLoop[]) => void;
  onToggleMassGhost: (items: BuildingLoop[]) => void;
  onToggleMassVisibility: (items: BuildingLoop[]) => void;
  onToggleMassSnapExclusion: (items: BuildingLoop[]) => void;
  children: React.ReactNode;
}

export const ObjectScopeSubgroup: React.FC<ObjectScopeSubgroupProps> = ({
  id,
  label,
  count,
  scope,
  items,
  isCollapsed,
  selectionStatus,
  onToggleCollapse,
  onToggleSelection,
  onToggleMassLock,
  onToggleMassGhost,
  onToggleMassVisibility,
  onToggleMassSnapExclusion,
  children,
}) => {
  if (items.length === 0) return null;

  const allLocked = items.length > 0 && items.every((b) => b.isLocked);
  const allGhosted = items.length > 0 && items.every((b) => b.isGhosted);
  const allVisible = items.length > 0 && items.every((b) => b.isVisible !== false);
  const allSnapExcluded = items.length > 0 && items.every((b) => b.isSnapExcluded);

  const isInProject = scope === 'inProject';
  const scopeColor = isInProject ? 'var(--accent-indigo)' : 'var(--text-secondary)';
  const scopeBg = isInProject ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-input)';
  const scopeBorder = isInProject ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid var(--border-color)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
      {/* Scope Header */}
      <div
        onClick={() => onToggleCollapse(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 6px',
          borderRadius: '5px',
          backgroundColor: scopeBg,
          border: scopeBorder,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {isCollapsed ? (
            <ChevronRight size={12} color={scopeColor} />
          ) : (
            <ChevronDown size={12} color={scopeColor} />
          )}
          {isInProject ? (
            <Briefcase size={11} color="var(--accent-indigo)" />
          ) : (
            <EyeOff size={11} color="var(--text-muted)" />
          )}
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              color: isInProject ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {label} ({count})
          </span>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title={selectionStatus === 'all' ? `Odznacz (${label})` : `Zaznacz (${label})`}
            onClick={() => onToggleSelection(items)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircleSelectionIcon status={selectionStatus} size={12} />
          </button>

          <button
            type="button"
            title={allLocked ? `Odblokuj (${label})` : `Zablokuj (${label})`}
            onClick={() => onToggleMassLock(items)}
            style={{
              background: 'transparent',
              border: 'none',
              color: allLocked ? 'var(--accent-lock)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            {allLocked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>

          <button
            type="button"
            title={allGhosted ? `Wyłącz ducha (${label})` : `Włącz ducha (${label})`}
            onClick={() => onToggleMassGhost(items)}
            style={{
              background: 'transparent',
              border: 'none',
              color: allGhosted ? 'var(--accent-purple)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <Ghost size={12} />
          </button>

          <button
            type="button"
            title={allVisible ? `Ukryj (${label})` : `Pokaż (${label})`}
            onClick={() => onToggleMassVisibility(items)}
            style={{
              background: 'transparent',
              border: 'none',
              color: allVisible ? 'var(--accent-amber)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            {allVisible ? <Lightbulb size={12} /> : <LightbulbOff size={12} />}
          </button>

          <button
            type="button"
            title={allSnapExcluded ? `Włącz do OSNAP (${label})` : `Wyłącz z OSNAP (${label})`}
            onClick={() => onToggleMassSnapExclusion(items)}
            style={{
              background: 'transparent',
              border: 'none',
              color: allSnapExcluded ? '#92400e' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <Magnet size={12} />
          </button>
        </div>
      </div>

      {/* Scope Items */}
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
          {children}
        </div>
      )}
    </div>
  );
};
