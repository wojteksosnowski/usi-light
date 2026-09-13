import React from 'react';
import { Ruler } from 'lucide-react';
import { GateModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { LabeledSlider } from '../controls/LabeledSlider';
import { IndexPillSelector } from '../controls/IndexPillSelector';
import { StoryRangeSelector } from '../StoryRangeSelector';
import { computeGateSpan } from '../../../utils/math2d/gateGeometry';

export const GateFields: React.FC<ModifierFieldsProps<GateModifier>> = ({
  modifier,
  onChange,
  context,
}) => {
  const isAuto = modifier.autoWidth ?? false;
  const currentPos = modifier.positionRatio ?? 0.5;
  const { availableEdges } = context;

  const spanResult = React.useMemo(() => {
    const building = context.building;
    if (!building || !building.vertices || building.vertices.length < 3) return null;

    const sampleStoryWithHoles = building.storyPolygons?.find((sp) => sp.holes && sp.holes.length > 0);
    const vertices = sampleStoryWithHoles?.polygon || building.vertices;
    const holes = sampleStoryWithHoles?.holes;

    return computeGateSpan(vertices, holes, modifier.edgeIndex);
  }, [context.building, modifier.edgeIndex]);

  const maxAllowedWidth = spanResult ? spanResult.maxWidth : null;

  // Synchronizacja na żywo gdy włączony jest tryb auto
  React.useEffect(() => {
    if (isAuto && maxAllowedWidth !== null && maxAllowedWidth > 0) {
      if (Math.abs(modifier.width - maxAllowedWidth) > 1e-4) {
        onChange({ width: maxAllowedWidth });
      }
    }
  }, [isAuto, maxAllowedWidth, modifier.width, onChange]);

  const handleToggleAuto = () => {
    const nextAuto = !isAuto;
    if (nextAuto && maxAllowedWidth !== null && maxAllowedWidth > 0) {
      onChange({ autoWidth: true, width: maxAllowedWidth });
    } else {
      onChange({ autoWidth: false });
    }
  };

  const handleManualWidthChange = (w: number) => {
    const nextW = Math.max(0.5, w);
    const clampedW = maxAllowedWidth !== null ? Math.min(nextW, maxAllowedWidth) : nextW;
    onChange({ width: clampedW, autoWidth: false });
  };

  const isFullWidth = maxAllowedWidth !== null && modifier.width >= maxAllowedWidth - 1e-3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              Szerokość bramy a (m):
            </span>
            {maxAllowedWidth !== null && (
              <button
                type="button"
                onClick={handleToggleAuto}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  background: isAuto ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.08)',
                  border: isAuto ? '1px solid var(--accent-emerald)' : '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '4px',
                  color: isAuto ? 'var(--text-primary)' : 'var(--accent-emerald)',
                  fontSize: '9px',
                  fontWeight: isAuto ? 700 : 500,
                  padding: '1px 5px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title={
                  isAuto
                    ? 'Tryb Auto aktywny (dopasowany do wierzchołków). Kliknij aby przejść w tryb ręczny.'
                    : `Włącz pełną dozwoloną szerokość (${maxAllowedWidth}m)`
                }
              >
                <Ruler size={10} />
                <span>Auto: {maxAllowedWidth}m {isAuto ? '●' : ''}</span>
              </button>
            )}
          </div>
          <LabeledNumberField
            label=""
            value={modifier.width}
            min={0.5}
            max={maxAllowedWidth !== null ? maxAllowedWidth : 100}
            step={0.5}
            onChange={handleManualWidthChange}
            hint={
              isAuto
                ? `Pełna szerokość korytarza: ${modifier.width}m`
                : maxAllowedWidth !== null
                ? `Maks. dopuszczalna: ${maxAllowedWidth}m`
                : undefined
            }
            hintColor="var(--accent-emerald)"
          />
        </div>

        <StoryRangeSelector
          value={modifier.storiesCount}
          label="Kondygnacja:"
          allowWholeBuilding={true}
          onChange={(storiesCount) => onChange({ storiesCount })}
        />
      </div>

      {!isFullWidth && (
        <LabeledSlider
          label="Pozycja wzdłuż dopuszczalnego odcinka:"
          value={currentPos}
          min={0}
          max={1}
          step={0.05}
          onChange={(positionRatio) => onChange({ positionRatio })}
          formatValue={(v) => (v === 0.5 ? 'Środek (50%)' : v === 0 ? 'Lewo (0%)' : v === 1 ? 'Prawo (100%)' : `${Math.round(v * 100)}%`)}
          accentVar="var(--accent-emerald)"
        />
      )}

      {availableEdges.length > 1 && (
        <IndexPillSelector
          label="Krawędź wejściowa:"
          value={modifier.edgeIndex ?? -1}
          placeholderValue={-1}
          placeholderLabel="Domyślna (najdłuższa ściana)"
          options={availableEdges}
          onChange={(edgeIndex) => onChange({ edgeIndex })}
          accentVar="var(--accent-emerald)"
        />
      )}

      <span style={{ fontSize: '9px', color: 'var(--accent-emerald)' }}>
        {`Szerokość: ${modifier.width}m`}
        {isFullWidth ? ' (pełna dopuszczalna)' : ` (pozycja: ${Math.round(currentPos * 100)}%)`}
        {' • '}
        {modifier.storiesCount === 0
          ? 'Przebicie przez całą bryłę'
          : modifier.storiesCount === 1
          ? 'Przejazd w parterze (+1)'
          : modifier.storiesCount > 0
          ? `${modifier.storiesCount} kondygnacje od dołu`
          : `${Math.abs(modifier.storiesCount)} kondygnacji od góry`}
      </span>
    </div>
  );
};
