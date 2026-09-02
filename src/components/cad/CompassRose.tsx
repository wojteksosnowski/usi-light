import React from 'react';

interface CompassRoseProps {
  rotationDeg: number;
  savedRotationDeg?: number;
  onResetRotation?: () => void;
}

export const CompassRose: React.FC<CompassRoseProps> = React.memo(({ rotationDeg, savedRotationDeg = 0, onResetRotation }) => {
  const isRotated = Math.abs(rotationDeg) > 0.001;
  const hasSavedRotation = Math.abs(savedRotationDeg) > 0.001;

  return (
    <div
      onClick={onResetRotation}
      title={
        isRotated
          ? `Obrót widoku: ${rotationDeg.toFixed(1)}° (Kliknij, aby zresetować do 0°)`
          : hasSavedRotation
          ? `Północ (Kliknij, aby przywrócić obrót ${savedRotationDeg.toFixed(1)}°)`
          : 'Północ (0°)'
      }
      style={{
        position: 'absolute',
        bottom: '12px',
        right: '16px',
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        backgroundColor: 'rgba(15, 23, 42, 0.90)',
        border: isRotated ? '1.5px solid #38bdf8' : '1.5px solid #334155',
        boxShadow: isRotated
          ? '0 0 12px rgba(56, 189, 248, 0.35), 0 2px 10px rgba(0, 0, 0, 0.4)'
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
        e.currentTarget.style.borderColor = '#38bdf8';
        e.currentTarget.style.transform = 'scale(1.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isRotated ? '#38bdf8' : '#334155';
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

        {/* Znacznik kierunku zapisanego / ustawionego układu współrzędnych */}
        {hasSavedRotation && (
          <g transform={`rotate(${savedRotationDeg})`}>
            <line x1="0" y1="-15" x2="0" y2="-10" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="0" cy="-15" r="1.8" fill="#38bdf8" />
          </g>
        )}

        {/* Czerwony grot / kierunek Północy */}
        <polygon points="0,-14 3.5,-3 -3.5,-3" fill="#f43f5e" />

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

        {/* Centralna kropka */}
        <circle r="2" fill={isRotated ? '#38bdf8' : '#f8fafc'} />
      </svg>
    </div>
  );
});
