import React, { memo } from 'react';
import { Lock, Unlock, Ghost, Lightbulb, LightbulbOff, Magnet } from 'lucide-react';
import { CircleSelectionIcon } from '../common/CircleSelectionIcon';
import { BuildingLoop } from '@/types/geometry';

interface ObjectTreeItemProps {
  item: BuildingLoop;
  isSelected: boolean;
  variant?: 'building' | 'plot' | 'playground' | 'balcony';
  onSelect: (id: string, isMulti: boolean) => void;
  onToggleLock: (id: string, currentLocked: boolean) => void;
  onToggleGhost: (id: string, currentGhosted: boolean) => void;
  onToggleVisibility: (id: string, currentVisible: boolean) => void;
  onToggleSnapExclusion: (id: string, currentSnapExcluded: boolean) => void;
}

export const ObjectTreeItem = memo<ObjectTreeItemProps>(({
  item,
  isSelected,
  variant = 'building',
  onSelect,
  onToggleLock,
  onToggleGhost,
  onToggleVisibility,
  onToggleSnapExclusion,
}) => {
  const isLocked = item.isLocked === true;
  const isGhosted = item.isGhosted === true;
  const isVisible = item.isVisible !== false;
  const isSnapExcluded = item.isSnapExcluded === true;

  // Variant styling tokens
  const getVariantStyles = () => {
    switch (variant) {
      case 'plot':
        return {
          selectedBg: 'rgba(244, 63, 94, 0.2)',
          selectedBorder: '1px solid rgba(244, 63, 94, 0.5)',
          selectedText: 'var(--accent-rose)',
        };
      case 'playground':
        return {
          selectedBg: 'rgba(16, 185, 129, 0.2)',
          selectedBorder: '1px solid rgba(16, 185, 129, 0.5)',
          selectedText: 'var(--accent-emerald)',
        };
      case 'balcony':
        return {
          selectedBg: 'rgba(56, 189, 248, 0.2)',
          selectedBorder: '1px solid rgba(56, 189, 248, 0.5)',
          selectedText: 'var(--accent-cyan)',
        };
      case 'building':
      default:
        return {
          selectedBg: 'rgba(99, 102, 241, 0.2)',
          selectedBorder: '1px solid rgba(99, 102, 241, 0.5)',
          selectedText: 'var(--text-primary)',
        };
    }
  };

  const vStyles = getVariantStyles();
  const displayName = (variant === 'plot' && item.plotNumber)
    ? item.plotNumber
    : item.name;

  return (
    <div
      onClick={() => onSelect(item.id, false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 6px',
        borderRadius: '5px',
        backgroundColor: isSelected ? vStyles.selectedBg : 'var(--bg-input)',
        border: isSelected ? vStyles.selectedBorder : '1px solid var(--border-color)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          fontWeight: isSelected ? 700 : 500,
          color: isSelected ? vStyles.selectedText : 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
        title={displayName}
      >
        {displayName}
      </span>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title={isSelected ? 'Odznacz' : 'Zaznacz'}
          onClick={() => onSelect(item.id, true)}
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
          <CircleSelectionIcon status={isSelected ? 'all' : 'none'} size={12} />
        </button>

        <button
          type="button"
          title={isLocked ? 'Odblokuj' : 'Zablokuj'}
          onClick={() => onToggleLock(item.id, isLocked)}
          style={{
            background: 'transparent',
            border: 'none',
            color: isLocked ? 'var(--accent-lock)' : 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>

        <button
          type="button"
          title={isGhosted ? 'Wyłącz ducha' : 'Włącz ducha'}
          onClick={() => onToggleGhost(item.id, isGhosted)}
          style={{
            background: 'transparent',
            border: 'none',
            color: isGhosted ? 'var(--accent-purple)' : 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ghost size={12} />
        </button>

        <button
          type="button"
          title={isVisible ? 'Ukryj' : 'Pokaż'}
          onClick={() => onToggleVisibility(item.id, isVisible)}
          style={{
            background: 'transparent',
            border: 'none',
            color: isVisible ? 'var(--accent-amber)' : 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isVisible ? <Lightbulb size={12} /> : <LightbulbOff size={12} />}
        </button>

        <button
          type="button"
          title={isSnapExcluded ? 'Włącz do OSNAP' : 'Wyłącz z OSNAP (magnes)'}
          onClick={() => onToggleSnapExclusion(item.id, isSnapExcluded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: isSnapExcluded ? '#92400e' : 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Magnet size={12} />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.variant === nextProps.variant &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.item.plotNumber === nextProps.item.plotNumber &&
    prevProps.item.isLocked === nextProps.item.isLocked &&
    prevProps.item.isGhosted === nextProps.item.isGhosted &&
    prevProps.item.isVisible === nextProps.item.isVisible &&
    prevProps.item.isSnapExcluded === nextProps.item.isSnapExcluded
  );
});

ObjectTreeItem.displayName = 'ObjectTreeItem';
