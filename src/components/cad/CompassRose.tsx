import React from 'react';

interface CompassRoseProps {
  rotationDeg: number;
  onResetRotation?: () => void;
}

export const CompassRose: React.FC<CompassRoseProps> = React.memo(({ rotationDeg, onResetRotation }) => {
  return (
    <div
      onClick={onResetRotation}
      title="Północ (Kliknij, aby zresetować orientację widoku do 0°)"
      style={{
        position: 'absolute',
        bottom: '12px',
        right: '16px',
        width: '42px',
        height: '42px',
        borderRadius: '50%',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        border: '1.5px solid #334155',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        zIndex: 15,
        transition: 'transform 0.15s ease, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#f43f5e';
        e.currentTarget.style.transform = 'scale(1.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#334155';
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <svg
        width="36"
        height="36"
        viewBox="-18 -18 36 36"
        style={{
          transform: `rotate(${-rotationDeg}deg)`,
          transition: 'transform 0.1s linear',
        }}
      >
        {/* Okrąg kompasu */}
        <circle r="15" fill="none" stroke="#475569" strokeWidth="1.2" />

        {/* Czerwony grot / kierunek Północy */}
        <polygon points="0,-14 3.5,-3 -3.5,-3" fill="#f43f5e" />
        
        {/* Szary grot Południa */}
        <polygon points="0,14 3.5,3 -3.5,3" fill="#334155" />

        {/* Litera N na czerwono */}
        <text
          x="0"
          y="-7.5"
          fill="#f43f5e"
          fontSize="6"
          fontWeight="bold"
          fontFamily="system-ui, sans-serif"
          textAnchor="middle"
          dominantBaseline="central"
        >
          N
        </text>

        {/* Centralna kropka */}
        <circle r="1.8" fill="#f8fafc" />
      </svg>
    </div>
  );
});
