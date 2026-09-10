import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Ikona trapezoidu dla narzędzia 'Polilinia' (zgodna ze stylem Lucide: 24x24, stroke 2, round caps)
 */
export const TrapezoidIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <polygon points="6 5 18 5 21 19 3 19" />
  </svg>
);

/**
 * Ikona nieregularnego pięciokąta dla narzędzia 'Polilinia' (zgodna ze stylem Lucide)
 */
export const IrregularPentagonIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <polygon points="9 3 20 8 21 17 12 21 3 13" />
  </svg>
);

/**
 * Ikona krzywej łamanej dla narzędzia 'Wstęga' (zgodna ze stylem Lucide)
 */
export const BrokenLineIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <polyline points="3 17 8 7 15 15 21 6" />
  </svg>
);

/**
 * Ikona strefy / bufora obszaru (zgodna ze stylem Lucide: wewnętrzny i zewnętrzny prostokąt obwiedni)
 */
export const ZoneBufferIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
);

/**
 * Ikona wykuszu (Bay Window) (zgodna ze stylem Lucide: obrys fasady z wysuniętym wykuszem trapezowym)
 */
export const BayWindowIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <path d="M3 18V6h5l3-3h6l3 3h4v12H3z" />
  </svg>
);

/**
 * Ikona modyfikatora "Taras" (uskok pojedynczej krawędzi) (zgodna ze stylem Lucide)
 */
export const TerraceIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    {/* Obrys bazowy i uskok na jednej krawędzi */}
    <path d="M3 21h18V9h-7V3H3v18z" />
    <line x1="3" y1="9" x2="14" y2="9" strokeDasharray="2 2" strokeWidth="1.5" />
  </svg>
);

/**
 * Ikona modyfikatora "Donat" (wewnętrzny otwór / patio) (zgodna ze stylem Lucide)
 */
export const DonutIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" />
  </svg>
);

/**
 * Ikona modyfikatora "Ścięcie narożnika" - tryb ukośny (Chamfer)
 */
export const ChamferIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <path d="M14 3H21V10L10 21H3V14L14 3Z" />
  </svg>
);

/**
 * Ikona modyfikatora "Ścięcie narożnika" - tryb zaokrąglony (Fillet)
 */
export const FilletIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <path d="M21 21H10C10 14.9249 14.9249 10 21 10V21Z" />
    <path d="M3 3V21" />
    <path d="M3 3H21" />
  </svg>
);

/**
 * Ikona modyfikatora "Ścięcie narożnika" - tryb karo (Notch)
 */
export const NotchIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    <path d="M14 3H21V10L15 15L10 21H3V14L14 3Z" />
  </svg>
);

/**
 * Ikona narzędzia paska "Ścięcie narożnika" (ten sam kształt co tryb Chamfer)
 */
export const CornerCutIcon: React.FC<IconProps> = ChamferIcon;

/**
 * Ikona narzędzia 'Wyrównaj': prosta odniesienia (stała) i druga prosta obracana
 * strzałką łuku, aby dopasować kierunek do prostej odniesienia.
 */
export const AlignDirectionIcon: React.FC<IconProps> = ({
  size = 14,
  color = 'currentColor',
  className,
  style,
}) => (
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
    style={style}
  >
    {/* Prosta odniesienia (pozioma, stała) */}
    <line x1="3" y1="18" x2="21" y2="18" />
    {/* Prosta obracana (ukośna) */}
    <line x1="5" y1="10" x2="16" y2="3" />
    {/* Strzałka łuku obrotu doprowadzająca kierunek do prostej odniesienia */}
    <path d="M15 3.5a8 8 0 0 1 3.5 9" />
    <polyline points="15.5 8.5 18.5 12.5 21.5 9" />
  </svg>
);
