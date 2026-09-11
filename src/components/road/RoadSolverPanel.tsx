import React from 'react';
import { Route } from 'lucide-react';
import { useSceneStore } from '../../store';
import { FloatingInspectorCard } from '../common/FloatingInspectorCard';
import { SegmentedControl } from '../modifiers/controls/SegmentedControl';
import { LabeledNumberField } from '../modifiers/controls/LabeledNumberField';
import { isLiveRoad } from '../../engine/road/gatherObstacles';

interface RoadSolverPanelProps {
  onClose?: () => void;
  isEmbedded?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

/** Floating panel z ustawieniami solvera Drogi - odpowiednik BuildingModifiersPanel/PointInspectorModal,
 * pokazywany w tym samym FloatingInspectorAccordion po prawej stronie widoku CAD. */
export const RoadSolverPanel: React.FC<RoadSolverPanelProps> = React.memo(({
  onClose,
  isEmbedded = false,
  isCollapsed,
  onToggleCollapse,
}) => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const updateSelectedBuilding = useSceneStore((s) => s.updateSelectedBuilding);
  const bakeRoad = useSceneStore((s) => s.bakeRoad);

  const selectedBuilding = React.useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!selectedBuilding || !isLiveRoad(selectedBuilding)) return null;

  const status = selectedBuilding.roadSolveStatus ?? 'solved';

  return (
    <FloatingInspectorCard
      title="Droga (Solver)"
      icon={<Route size={18} color="#94a3b8" />}
      accentColor="slate"
      onClose={onClose}
      isEmbedded={isEmbedded}
      width={isEmbedded ? '100%' : 360}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Nazwa</label>
          <input
            type="text"
            value={selectedBuilding.name}
            onChange={(e) => updateSelectedBuilding({ name: e.target.value })}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              padding: '7px 10px',
              color: '#fff',
              fontSize: '12px',
            }}
          />
        </div>

        <div
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            textAlign: 'center',
            backgroundColor:
              status === 'pending'
                ? 'rgba(234, 179, 8, 0.2)'
                : status === 'no_path'
                ? 'rgba(239, 68, 68, 0.2)'
                : status === 'partial_radius'
                ? 'rgba(234, 179, 8, 0.2)'
                : 'rgba(16, 185, 129, 0.2)',
            color:
              status === 'pending'
                ? '#facc15'
                : status === 'no_path'
                ? '#f87171'
                : status === 'partial_radius'
                ? '#facc15'
                : '#34d399',
          }}
        >
          {status === 'pending'
            ? 'Liczy trasę...'
            : status === 'no_path'
            ? 'Brak trasy - przeszkody blokują połączenie'
            : status === 'partial_radius'
            ? 'Trasa OK - promień skrętu lokalnie zmniejszony (przeszkody)'
            : 'Trasa OK'}
        </div>



        <LabeledNumberField
          label="Szerokość (m)"
          value={selectedBuilding.sweepWidth ?? 5.0}
          step={0.5}
          min={0.5}
          onChange={(sweepWidth) => updateSelectedBuilding({ sweepWidth })}
        />

        <LabeledNumberField
          label="Min. promień skrętu (m)"
          value={selectedBuilding.roadMinTurnRadius ?? 6.0}
          step={0.5}
          min={0}
          onChange={(roadMinTurnRadius) => updateSelectedBuilding({ roadMinTurnRadius })}
        />

        <button
          type="button"
          disabled={status !== 'solved' && status !== 'partial_radius'}
          onClick={() => bakeRoad(selectedBuilding.id)}
          title={
            status === 'no_path' || status === 'pending'
              ? 'Dostępne tylko gdy trasa jest rozwiązana'
              : 'Zamienia obiekt Drogi na zwykły, statyczny obrys (koniec zarządzania przez solver)'
          }
          style={{
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            backgroundColor: status === 'solved' || status === 'partial_radius' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-input)',
            color: status === 'solved' || status === 'partial_radius' ? '#34d399' : '#64748b',
            fontWeight: 700,
            fontSize: '11px',
            cursor: status === 'solved' || status === 'partial_radius' ? 'pointer' : 'not-allowed',
          }}
        >
          Zapisz jako obrys (Bake)
        </button>
      </div>
    </FloatingInspectorCard>
  );
});
