import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

export type InspectorAccentColor = 'indigo' | 'purple' | 'amber' | 'emerald' | 'sky' | 'slate';

export interface FloatingInspectorCardProps {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  accentColor?: InspectorAccentColor;
  onClose?: () => void;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  width?: string | number;
  maxHeight?: string | number;
  className?: string;
  style?: React.CSSProperties;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  isEmbedded?: boolean; // Jeśli jest elementem pionowego akordeonu, nie pozycjonuje się absolutnie
}

const ACCENT_STYLES: Record<
  InspectorAccentColor,
  {
    border: string;
    iconBg: string;
    iconColor: string;
    glow: string;
  }
> = {
  indigo: {
    border: '1px solid rgba(99, 102, 241, 0.35)',
    iconBg: 'rgba(99, 102, 241, 0.15)',
    iconColor: '#818cf8',
    glow: '0 8px 32px 0 rgba(99, 102, 241, 0.15)',
  },
  purple: {
    border: '1px solid rgba(168, 85, 247, 0.35)',
    iconBg: 'rgba(168, 85, 247, 0.15)',
    iconColor: '#c084fc',
    glow: '0 8px 32px 0 rgba(168, 85, 247, 0.15)',
  },
  amber: {
    border: '1px solid rgba(245, 158, 11, 0.35)',
    iconBg: 'rgba(245, 158, 11, 0.15)',
    iconColor: '#fbbf24',
    glow: '0 8px 32px 0 rgba(245, 158, 11, 0.15)',
  },
  emerald: {
    border: '1px solid rgba(16, 185, 129, 0.35)',
    iconBg: 'rgba(16, 185, 129, 0.15)',
    iconColor: '#34d399',
    glow: '0 8px 32px 0 rgba(16, 185, 129, 0.15)',
  },
  sky: {
    border: '1px solid rgba(56, 189, 248, 0.35)',
    iconBg: 'rgba(56, 189, 248, 0.15)',
    iconColor: '#38bdf8',
    glow: '0 8px 32px 0 rgba(56, 189, 248, 0.15)',
  },
  slate: {
    border: '1px solid rgba(148, 163, 184, 0.25)',
    iconBg: 'rgba(148, 163, 184, 0.12)',
    iconColor: '#94a3b8',
    glow: '0 8px 32px 0 rgba(15, 23, 42, 0.4)',
  },
};

export const FloatingInspectorCard: React.FC<FloatingInspectorCardProps> = React.memo(({
  title,
  subtitle,
  badge,
  icon,
  accentColor = 'indigo',
  onClose,
  headerRight,
  children,
  width = 360,
  maxHeight = 'calc(100vh - 120px)',
  className = '',
  style = {},
  collapsible = true,
  defaultCollapsed = false,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
  isEmbedded = false,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    const nextState = !isCollapsed;
    setInternalCollapsed(nextState);
    onToggleCollapse?.(nextState);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEmbedded) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEmbedded]);

  const accent = ACCENT_STYLES[accentColor] || ACCENT_STYLES.indigo;

  return (
    <div
      className={`inspector-card ${className}`}
      style={{
        position: isEmbedded ? 'relative' : 'absolute',
        top: isEmbedded ? undefined : '70px',
        right: isEmbedded ? undefined : '20px',
        width: typeof width === 'number' ? `${width}px` : width,
        maxHeight: isCollapsed ? 'auto' : typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
        overflowY: isCollapsed ? 'hidden' : 'auto',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)',
        border: accent.border,
        boxShadow: accent.glow,
        borderRadius: '12px',
        padding: '14px 16px',
        zIndex: 50,
        color: '#f8fafc',
        transition: 'all 0.2s ease',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: isCollapsed ? 'none' : '1px solid #1e293b',
          paddingBottom: isCollapsed ? '0px' : '10px',
          marginBottom: isCollapsed ? '0px' : '12px',
          cursor: collapsible ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={collapsible ? handleToggle : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {icon && (
            <div
              style={{
                padding: '7px',
                borderRadius: '9px',
                backgroundColor: accent.iconBg,
                color: accent.iconColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {icon}
            </div>
          )}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{title}</span>
              {badge !== undefined && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px',
                    backgroundColor: accent.iconBg,
                    color: accent.iconColor,
                    border: accent.border,
                    lineHeight: '1.2',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
          {headerRight}

          {collapsible && (
            <button
              onClick={handleToggle}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="hover:text-white transition-colors"
              title={isCollapsed ? 'Rozwiń' : 'Zwiń'}
            >
              {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="hover:text-white transition-colors"
              title="Zamknij"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Body Content */}
      {!isCollapsed && <div>{children}</div>}
    </div>
  );
});
