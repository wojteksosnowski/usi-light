import React from 'react';
import { PilaAlignment, PilaAngle, PilaModifier } from '../../../types/modifiers';
import { ModifierFieldsProps } from '../modifierDescriptorTypes';
import { LabeledNumberField } from '../controls/LabeledNumberField';
import { SegmentedControl } from '../controls/SegmentedControl';
import { IndexPillSelector } from '../controls/IndexPillSelector';
import { StoryRangeSelector } from '../StoryRangeSelector';
import { calculatePilaMetrics } from '../../../engine/modifiers/modifierPipeline';

const ANGLE_OPTIONS: { value: PilaAngle; label: string }[] = [
  { value: 90, label: '90°' },
  { value: 120, label: '120°' },
  { value: 135, label: '135°' },
  { value: 150, label: '150°' },
];

const ALIGNMENT_OPTIONS: { value: PilaAlignment; label: string }[] = [
  { value: 'prev_edge', label: 'Wierzchołek P1 (przedłużenie)' },
  { value: 'next_edge', label: 'Wierzchołek P2 (przedłużenie)' },
  { value: 'perpendicular', label: 'Symetrycznie' },
];

export const PilaFields: React.FC<ModifierFieldsProps<PilaModifier>> = ({
  modifier,
  onChange,
  context,
}) => {
  const currentAngle = modifier.toothAngle ?? 90;
  const currentAlignment = modifier.alignment ?? 'prev_edge';
  const kSteps = Math.max(1, modifier.teethCount ?? 1);
  const totalSubsegments = 2 * kSteps;
  const { availableEdges, building } = context;

  // Analityczne wyliczenie długości odcinka a i b oraz głębokości z geometrii
  const metrics = React.useMemo(() => {
    const vertices = building?.vertices;
    if (!vertices || vertices.length < 3) return null;
    return calculatePilaMetrics(
      vertices,
      kSteps,
      modifier.edgeIndex,
      currentAngle,
      currentAlignment
    );
  }, [building?.vertices, modifier.edgeIndex, kSteps, currentAlignment, currentAngle]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
      <SegmentedControl
        label="Kąt schodkowania (między a i b):"
        value={currentAngle}
        options={ANGLE_OPTIONS}
        onChange={(toothAngle) => onChange({ toothAngle })}
        accentVar="var(--accent-orange)"
      />

      <SegmentedControl
        label="Kierunek pierwszego odcinka b:"
        value={currentAlignment}
        options={ALIGNMENT_OPTIONS}
        onChange={(alignment) => onChange({ alignment })}
        accentVar="var(--accent-orange)"
      />

      <LabeledNumberField
        label="Liczba uskoków k:"
        value={modifier.teethCount}
        min={1}
        max={50}
        step={1}
        onChange={(teethCount) => onChange({ teethCount: Math.max(1, Math.round(teethCount)) })}
        hint={`${totalSubsegments} podsegmentów (${kSteps === 1 ? 'b-a' : 'b-a-...-b-a'})`}
        hintColor="var(--accent-orange)"
      />

      <StoryRangeSelector
        value={modifier.storiesCount}
        allowWholeBuilding={true}
        onChange={(storiesCount) => onChange({ storiesCount })}
      />

      {availableEdges.length > 1 && (
        <IndexPillSelector
          label="Modyfikowana krawędź:"
          value={modifier.edgeIndex ?? -1}
          placeholderValue={-1}
          placeholderLabel="Domyślna (najdłuższa krawędź)"
          options={availableEdges}
          onChange={(edgeIndex) => onChange({ edgeIndex })}
          accentVar="var(--accent-orange)"
        />
      )}

      {metrics && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            padding: '6px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(254, 215, 170, 0.08)',
            border: '1px solid rgba(254, 215, 170, 0.2)',
            fontSize: '11px',
            color: 'var(--accent-orange)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><b>b</b> = {metrics.lenB} m (×{kSteps})</span>
            <span><b>a</b> = {metrics.lenA} m (×{kSteps})</span>
            <span><b>d</b> = {metrics.depth} m</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '10px' }}>
            <span>Kąt a-b: {metrics.angle}° ({totalSubsegments} seg)</span>
            <span>Długość krawędzi: {metrics.edgeLen} m</span>
          </div>
        </div>
      )}
    </div>
  );
};

