import React from 'react';
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { Modifier } from '../../types/modifiers';
import { ModifierDescriptor, ModifierFieldContext } from './modifierDescriptorTypes';

interface ModifierCardProps {
  modifier: Modifier;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  descriptor: ModifierDescriptor;
  context: ModifierFieldContext;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<Modifier>) => void;
}

/**
 * Wspólny "chrome" karty modyfikatora: checkbox włącz/wyłącz, tytuł z akcentem koloru,
 * przyciski reorder/usuń. Ciało karty deleguje do descriptor.renderFields — patrz
 * .claude/skills/modifier-architecture-guide/SKILL.md przy dodawaniu nowego typu modyfikatora.
 */
export const ModifierCard: React.FC<ModifierCardProps> = ({
  modifier,
  index,
  isFirst,
  isLast,
  descriptor,
  context,
  onToggle,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPatch,
}) => {
  return (
    <div
      style={{
        backgroundColor: modifier.enabled ? 'rgba(30, 41, 59, 0.8)' : 'rgba(15, 23, 42, 0.6)',
        border: `1px solid ${modifier.enabled ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
        borderRadius: '10px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        opacity: modifier.enabled ? 1 : 0.6,
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={modifier.enabled}
            onChange={onToggle}
            style={{ cursor: 'pointer', accentColor: 'var(--accent-purple)' }}
            title="Włącz / wyłącz ten modyfikator"
          />
          <span style={{ fontWeight: 700, fontSize: '11.5px', color: descriptor.accentVar }}>
            #{index + 1} {descriptor.title}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            type="button"
            disabled={isFirst}
            onClick={onMoveUp}
            style={{
              background: 'transparent',
              border: 'none',
              color: isFirst ? 'var(--border-light)' : 'var(--text-primary)',
              cursor: isFirst ? 'default' : 'pointer',
              padding: '2px 4px',
            }}
            title="Przesuń wyżej w stosie"
          >
            <ArrowUp size={12} />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={onMoveDown}
            style={{
              background: 'transparent',
              border: 'none',
              color: isLast ? 'var(--border-light)' : 'var(--text-primary)',
              cursor: isLast ? 'default' : 'pointer',
              padding: '2px 4px',
            }}
            title="Przesuń niżej w stosie"
          >
            <ArrowDown size={12} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-rose)',
              cursor: 'pointer',
              padding: '2px 4px',
              marginLeft: '4px',
            }}
            title="Usuń ten modyfikator"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <descriptor.renderFields modifier={modifier} onChange={onPatch} context={context} />
    </div>
  );
};
