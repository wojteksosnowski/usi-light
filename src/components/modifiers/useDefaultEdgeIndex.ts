import React from 'react';
import { LabeledSelectOption } from './controls/LabeledSelect';

/**
 * Eliminuje niejawne "auto" dla wyboru krawędzi — jeśli `edgeIndex` nie jest jawnie ustawiony,
 * przyjmuje pierwszą dostępną krawędź. Współdzielone przez wszystkie panele modyfikatorów
 * z wyborem krawędzi (Gate/Terrace/BayWindow/CornerCut).
 */
export function useDefaultEdgeIndex(
  edgeIndex: number | undefined,
  availableEdges: LabeledSelectOption<number>[],
  onChange: (edgeIndex: number) => void,
  enabled: boolean = true
): void {
  React.useEffect(() => {
    if (enabled && (edgeIndex === undefined || edgeIndex === -1) && availableEdges.length > 0) {
      onChange(availableEdges[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, availableEdges]);
}
