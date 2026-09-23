import React from 'react';
import { APP_CONFIG } from '../../config/appConfig';

interface CompassRoseProps {
  rotationDeg: number;
  savedRotationDeg?: number;
  onResetRotation?: () => void;
  ucsMode?: 'world' | 'user' | 'edge';
  edgeUcsAngleDeg?: number | null;
  onCycleUcsMode?: () => void;
}

const UCS_LABEL: Record<'world' | 'user' | 'edge', string> = {
  world: 'WORLDUCS',
  user: 'USERUCS',
  edge: 'EDGEUCS',
};

export const CompassRose: React.FC<CompassRoseProps> = React.memo(
  ({
    rotationDeg,
    savedRotationDeg = 0,
    onResetRotation,
    ucsMode = 'world',
    edgeUcsAngleDeg = null,
    onCycleUcsMode,
  }) => {
    const isRotated = Math.abs(rotationDeg) > 0.001;
    const hasSavedRotation = Math.abs(savedRotationDeg) > 0.001;
    const hasEdgeAngle = edgeUcsAngleDeg !== null && Number.isFinite(edgeUcsAngleDeg);

    const activeColor =
      ucsMode === 'user'
        ? APP_CONFIG.ucs.userGuideColor
        : ucsMode === 'edge'
          ? APP_CONFIG.ucs.edgeGuideColor
          : APP_CONFIG.ucs.worldGuideColor;

    return (
      <div
        onClick={onCycleUcsMode ?? onResetRotation}
        title={`Aktywny układ: ${UCS_LABEL[ucsMode]} (${rotationDeg.toFixed(1)}°) — Kliknij (lub X), aby przełączyć WORLDUCS → USERUCS → EDGEUCS`}
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '16px',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          backgroundColor: 'rgba(15, 23, 42, 0.90)',
          border: `1.5px solid ${activeColor}`,
          boxShadow: isRotated
            ? `0 0 12px ${activeColor}59, 0 2px 10px rgba(0, 0, 0, 0.4)`
            : '0 2px 10px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          zIndex: 15,
          transition: 'transform 0.15s ease, border-color 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg
          width="38"
          height="38"
          viewBox="-19 -19 38 38"
          style={{
            transform: `rotate(${-rotationDeg}deg)`,
            transition: 'transform 0.1s linear',
          }}
        >
          {/* Okrąg kompasu */}
          <circle r="15" fill="none" stroke="#475569" strokeWidth="1.2" />

          {/* Znacznik USERUCS (ustawiony ręcznie) */}
          {hasSavedRotation && (
            <g transform={`rotate(${savedRotationDeg})`}>
              <line
                x1="0"
                y1="-15"
                x2="0"
                y2="-10"
                stroke={APP_CONFIG.ucs.userGuideColor}
                strokeWidth={ucsMode === 'user' ? 3 : 1.8}
                strokeLinecap="round"
                opacity={ucsMode === 'user' ? 1 : 0.5}
              />
              <circle cx="0" cy="-15" r="1.8" fill={APP_CONFIG.ucs.userGuideColor} opacity={ucsMode === 'user' ? 1 : 0.5} />
            </g>
          )}

          {/* Znacznik EDGEUCS (obliczony z dominującej krawędzi) */}
          {hasEdgeAngle && (
            <g transform={`rotate(${edgeUcsAngleDeg})`}>
              <line
                x1="0"
                y1="-15"
                x2="0"
                y2="-10"
                stroke={APP_CONFIG.ucs.edgeGuideColor}
                strokeWidth={ucsMode === 'edge' ? 3 : 1.8}
                strokeLinecap="round"
                opacity={ucsMode === 'edge' ? 1 : 0.5}
              />
              <circle cx="0" cy="-15" r="1.8" fill={APP_CONFIG.ucs.edgeGuideColor} opacity={ucsMode === 'edge' ? 1 : 0.5} />
            </g>
          )}

          {/* Czerwony grot / kierunek Północy (WORLDUCS, zawsze przy 0°) */}
          <polygon points="0,-14 3.5,-3 -3.5,-3" fill="#f43f5e" opacity={ucsMode === 'world' ? 1 : 0.6} />

          {/* Szary grot Południa */}
          <polygon points="0,14 3.5,3 -3.5,3" fill="#334155" />

          {/* Litera N na czerwono */}
          <text
            x="0"
            y="-7.5"
            fill="#f43f5e"
            fontSize="6.5"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            N
          </text>

          {/* Centralna kropka w kolorze aktywnego UCS */}
          <circle r="2" fill={activeColor} />
        </svg>
      </div>
    );
  }
);
