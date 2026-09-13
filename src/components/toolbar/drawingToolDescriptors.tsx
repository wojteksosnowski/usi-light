import React from 'react';
import { Square, Combine } from 'lucide-react';
import type { DrawingMode } from '../../store/useCadToolStore';
import { IrregularPentagonIcon, BrokenLineIcon, AlignDirectionIcon } from '../common/CustomCadIcons';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export interface DrawingToolDescriptor {
  mode: DrawingMode;
  label: string;
  Icon: React.FC<IconProps>;
  title: string;
  /** Narzędzie wymaga zaznaczonego obiektu (np. Wyrównaj). */
  requiresSelection?: boolean;
}

/** Narzędzia tworzenia geometrii (Grupa 1 w toolbarze) */
export const DRAWING_CREATION_TOOLS: DrawingToolDescriptor[] = [
  { mode: 'rectangle', label: 'Prostokąt', Icon: Square, title: 'Rysuj nowy prostokąt' },
  { mode: 'polyline', label: 'Polilinia', Icon: IrregularPentagonIcon, title: 'Rysuj nową polilinię' },
  { mode: 'sweep', label: 'Wstęga', Icon: BrokenLineIcon, title: 'Rysuj wstęgę z odsunięciem (sweep)' },
];

/** Narzędzie Wyrównaj (operacja w Grupie 5 w toolbarze) */
export const ALIGN_DRAWING_TOOL: DrawingToolDescriptor = {
  mode: 'align',
  label: 'Wyrównaj',
  Icon: AlignDirectionIcon,
  title: 'Wyrównaj krawędzie: kliknij krawędź obiektu, potem krawędź obiektu odniesienia',
  requiresSelection: true,
};

/** Narzędzia operacji na obiektach */
export const DRAWING_OPERATION_TOOLS: DrawingToolDescriptor[] = [
  ALIGN_DRAWING_TOOL,
  { mode: 'union', label: 'Suma', Icon: Combine, title: 'Suma (Boolean Union)' },
];

/**
 * Rejestr wszystkich narzędzi rysowania sterowanych pojedynczym `drawingMode` — jedno źródło prawdy
 * (ikona + etykieta + tryb) dla górnego toolbara (`CadToolBar.tsx`) i sidebara (`ToolsGroup.tsx`).
 */
export const DRAWING_TOOLS: DrawingToolDescriptor[] = [
  ...DRAWING_CREATION_TOOLS,
  ...DRAWING_OPERATION_TOOLS,
];
