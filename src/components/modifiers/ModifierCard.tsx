import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { Modifier } from '../../types/modifiers';
import { ModifierDescriptor, ModifierFieldContext } from './modifierDescriptorTypes';

interface ModifierCardProps {
  modifier: Modifier;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  descriptor: ModifierDescriptor;
  context: ModifierFieldContext;
  isExpanded: boolean;
  onToggleExpand: () => void;
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
  isExpanded,
  onToggleExpand,
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
        gap: isExpanded ? '8px' : 0,
        opacity: modifier.enabled ? 1 : 0.6,
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          onClick={onToggleExpand}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1, minWidth: 0 }}
          title={isExpanded ? 'Zwiń modyfikator' : 'Rozwiń modyfikator'}
        >
          <ChevronDown
            size={12}
            color="var(--text-muted)"
            style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}
          />
          <descriptor.Icon size={13} color={descriptor.accentVar} />
          <span style={{ fontWeight: 700, fontSize: '11.5px', color: descriptor.accentVar }}>
            {descriptor.title}
          </span>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onToggle}
            className="modifier-card-icon-btn"
            style={{
              color: modifier.enabled ? 'var(--accent-purple)' : 'var(--text-muted)',
              borderColor: modifier.enabled ? 'var(--accent-purple)' : 'var(--border-light)',
            }}
            title={modifier.enabled ? 'Wyłącz ten modyfikator' : 'Włącz ten modyfikator'}
          >
            {modifier.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button
            type="button"
            disabled={isFirst}
            onClick={onMoveUp}
            className="modifier-card-icon-btn"
            title="Przesuń wyżej w stosie"
          >
            <ArrowUp size={12} />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={onMoveDown}
            className="modifier-card-icon-btn"
            title="Przesuń niżej w stosie"
          >
            <ArrowDown size={12} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="modifier-card-icon-btn"
            style={{ color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.4)', marginLeft: '4px' }}
            title="Usuń ten modyfikator"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {isExpanded && <descriptor.renderFields modifier={modifier} onChange={onPatch} context={context} />}
    </div>
  );
};
