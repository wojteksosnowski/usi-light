import React from 'react';

interface SetbackPenthouseIconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Ikona modyfikatora "uskok kondygnacji" (2.5D Setback / Penthouse).
 * Prezentuje bryłę parteru/pięter bazowych oraz cofniętą bryłę najwyższej kondygnacji (uskok).
 */
export const SetbackPenthouseIcon: React.FC<SetbackPenthouseIconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    >
      {/* Bryła dolna / kondygnacje bazowe */}
      <rect x="3" y="10" width="18" height="11" rx="1.5" />
      
      {/* Bryła górna cofnięta (penthouse / uskok z widocznym tarasem z prawej/lewej) */}
      <path d="M7 10V4.5C7 3.67 7.67 3 8.5 3h7c.83 0 1.5.67 1.5 1.5V10" />
      
      {/* Linia podziału / uskok stropu */}
      <line x1="3" y1="10" x2="21" y2="10" />
      
      {/* Strzałka lub wskaźnik cofnięcia / uskoku */}
      <path d="M14 6.5h-4" strokeWidth="1.5" />
    </svg>
  );
};
