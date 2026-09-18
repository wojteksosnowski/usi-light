import React, { memo } from 'react';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { OsmLanduseLayerConfig } from '@/modules/wfs-import/store/useOsmLanduseStore';

interface OsmLanduseLayerRowProps {
  layer: OsmLanduseLayerConfig;
  count: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
}

export const OsmLanduseLayerRow = memo<OsmLanduseLayerRowProps>(({
  layer,
  count,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
}) => {
  return (
    <div
      onClick={() => onSelect(layer.id)}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
        {/* Próbnik koloru */}
        <span
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '3px',
            backgroundColor: layer.color,
            border: `1px solid ${layer.strokeColor}`,
            flexShrink: 0,
            display: 'inline-block',
          }}
        />

        <span
          style={{
            fontSize: '11px',
            fontWeight: isSelected ? 700 : 500,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={layer.name}
        >
          {layer.name}
        </span>

        {count > 0 && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--border-color)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {count}
          </span>
        )}
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onToggleLock(layer.id)}
          title={layer.isLocked ? 'Odblokuj warstwę' : 'Zablokuj warstwę'}
          style={{
            padding: '4px',
            borderRadius: '5px',
            border: 'none',
            backgroundColor: layer.isLocked ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
            color: layer.isLocked ? 'var(--accent-lock)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {layer.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>

        <button
          type="button"
          onClick={() => onToggleVisibility(layer.id)}
          title={layer.isVisible ? 'Ukryj warstwę' : 'Pokaż warstwę'}
          style={{
            padding: '4px',
            borderRadius: '5px',
            border: 'none',
            backgroundColor: layer.isVisible ? 'rgba(99, 102, 241, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            color: layer.isVisible ? 'var(--accent-blue)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {layer.isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      </div>
    </div>
  );
});

OsmLanduseLayerRow.displayName = 'OsmLanduseLayerRow';
