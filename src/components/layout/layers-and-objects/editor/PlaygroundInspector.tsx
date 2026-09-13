import React from 'react';
import { BuildingLoop } from '@/types/geometry';
import { computePlaygroundApartmentCapacity } from '@/utils/playgroundUtils';

interface PlaygroundAnalysisResult {
  isCompliant: boolean;
  requiredDurationHours: number;
  sunlitPercentage: number;
  compliantSamplePoints: number;
  totalSamplePoints: number;
}

interface PlaygroundInspectorProps {
  building: BuildingLoop;
  buildingArea: number;
  playgroundAnalysis: PlaygroundAnalysisResult | null;
  sunlightMethod: string;
  onUpdate: (updates: Partial<BuildingLoop>) => void;
}

export const PlaygroundInspector: React.FC<PlaygroundInspectorProps> = ({
  building,
  buildingArea,
  playgroundAnalysis,
  sunlightMethod,
  onUpdate,
}) => {
  const capacity = computePlaygroundApartmentCapacity(buildingArea);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Powierzchnia placu zabaw */}
      <div
        style={{
          padding: '8px 10px',
          borderRadius: '8px',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          fontSize: '11px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Powierzchnia placu zabaw:</span>
          <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>
            {buildingArea.toFixed(1)} m²
          </b>
        </div>
      </div>

      {/* Przelicznik pojemności mieszkań wg § 33 ust. 8 WT */}
      <div
        style={{
          padding: '8px 10px',
          borderRadius: '8px',
          backgroundColor: 'var(--bg-input)',
          border: '1px solid var(--border-color)',
          fontSize: '11px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Chłonność (§ 33.8 WT):</span>
          <b style={{ color: 'var(--accent-cyan)', fontFamily: 'monospace', fontWeight: 700 }}>
            {capacity.displayText}
          </b>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {capacity.tierDescription}
        </div>
        <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '1px' }}>
          {capacity.details}
        </div>
      </div>

      {/* Wynik analizy nasłonecznienia placu zabaw wg § 33.3 */}
      {building.isTested && playgroundAnalysis && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: playgroundAnalysis.isCompliant
              ? 'rgba(16, 185, 129, 0.12)'
              : 'rgba(244, 63, 94, 0.12)',
            border: playgroundAnalysis.isCompliant
              ? '1px solid rgba(16, 185, 129, 0.4)'
              : '1px solid rgba(244, 63, 94, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              § 33 ust. 3 WT (Plac zabaw)
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: playgroundAnalysis.isCompliant ? 'var(--accent-emerald)' : 'var(--accent-rose)',
              }}
            >
              {playgroundAnalysis.isCompliant ? 'SPEŁNIONY' : 'NIESPEŁNIONY'}
            </span>
          </div>

          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            Silnik:{' '}
            <b style={{ color: 'var(--text-primary)' }}>
              {sunlightMethod === 'segments' ? 'Linijka Słońca (Geometryczny)' : 'Astronomiczny (Astro)'}
            </b>
          </div>

          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            Wymóg:{' '}
            <b style={{ color: 'var(--text-primary)' }}>
              min. {playgroundAnalysis.requiredDurationHours}h na ≥ 50% pow. (okno 8h równonocy)
            </b>
          </div>

          {/* Pasek postępu procentowego */}
          <div style={{ marginTop: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
              <span style={{ color: 'var(--text-primary)' }}>Nasłonecznienie:</span>
              <b
                style={{
                  color: playgroundAnalysis.isCompliant ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                  fontFamily: 'monospace',
                }}
              >
                {playgroundAnalysis.sunlitPercentage}% ({playgroundAnalysis.compliantSamplePoints}/{playgroundAnalysis.totalSamplePoints} pkt)
              </b>
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'var(--bg-main)',
                borderRadius: '3px',
                overflow: 'hidden',
                border: '1px solid var(--border-light)',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, playgroundAnalysis.sunlitPercentage)}%`,
                  height: '100%',
                  backgroundColor: playgroundAnalysis.isCompliant ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Przełącznik: Diagram Voronoi vs Siatka regularna */}
      <button
        type="button"
        onClick={() =>
          onUpdate({
            playgroundVoronoi: building.playgroundVoronoi === false ? true : false,
          })
        }
        className={`btn-tile ${building.playgroundVoronoi !== false ? 'active-indigo' : 'inactive'}`}
        style={{ justifyContent: 'space-between', padding: '6px 8px', fontSize: '11px' }}
        title="Włącz diagram komórek Voronoi lub siatkę ortogonalną"
      >
        <span style={{ fontWeight: 600 }}>Diagram Voronoi</span>
        <span style={{ fontSize: '10px', fontWeight: 700 }}>
          {building.playgroundVoronoi !== false ? 'WŁ (Voronoi)' : 'WYŁ (Siatka)'}
        </span>
      </button>

      {/* Sekcja testowa parametrów gęstości siatki Voronoi */}
      {building.playgroundVoronoi !== false && (
        <div
          style={{
            marginTop: '4px',
            padding: '8px 10px',
            borderRadius: '8px',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-indigo)' }}>
              Gęstość Voronoi (faza testowa)
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  playgroundParams: undefined,
                })
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '10px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
              title="Przywróć domyślne parametry gęstości"
            >
              Domyślne
            </button>
          </div>

          {/* Krok makro (bazowy) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}>
              <span>Krok bazowy (makro):</span>
              <b style={{ color: 'var(--accent-indigo)', fontFamily: 'monospace' }}>
                {(building.playgroundParams?.baseStep ?? 4.5).toFixed(1)} m
              </b>
            </div>
            <input
              type="range"
              min="1.0"
              max="15.0"
              step="0.5"
              value={building.playgroundParams?.baseStep ?? 4.5}
              onChange={(e) =>
                onUpdate({
                  playgroundParams: {
                    ...building.playgroundParams,
                    baseStep: parseFloat(e.target.value),
                  },
                })
              }
              style={{ width: '100%', accentColor: 'var(--accent-indigo)' }}
            />
          </div>

          {/* Zagęszczenie stref granicznych (maks punktów) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}>
              <span>Maks. punktów zagęszczających:</span>
              <b style={{ color: 'var(--accent-indigo)', fontFamily: 'monospace' }}>
                {building.playgroundParams?.maxExtraPoints ?? 15}
              </b>
            </div>
            <input
              type="range"
              min="0"
              max="120"
              step="5"
              value={building.playgroundParams?.maxExtraPoints ?? 15}
              onChange={(e) =>
                onUpdate({
                  playgroundParams: {
                    ...building.playgroundParams,
                    maxExtraPoints: parseInt(e.target.value, 10),
                  },
                })
              }
              style={{ width: '100%', accentColor: 'var(--accent-indigo)' }}
            />
          </div>

          {/* Minimalna odległość podziału */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}>
              <span>Min. rozmiar komórki:</span>
              <b style={{ color: 'var(--accent-indigo)', fontFamily: 'monospace' }}>
                {(building.playgroundParams?.minSubdivDist ?? 1.5).toFixed(1)} m
              </b>
            </div>
            <input
              type="range"
              min="0.3"
              max="4.0"
              step="0.2"
              value={building.playgroundParams?.minSubdivDist ?? 1.5}
              onChange={(e) =>
                onUpdate({
                  playgroundParams: {
                    ...building.playgroundParams,
                    minSubdivDist: parseFloat(e.target.value),
                  },
                })
              }
              style={{ width: '100%', accentColor: 'var(--accent-indigo)' }}
            />
          </div>

          {/* Próg podziału przejścia słońce/cień */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-primary)' }}>
              <span>Czułość przejścia (próg Δh):</span>
              <b style={{ color: 'var(--accent-indigo)', fontFamily: 'monospace' }}>
                {(building.playgroundParams?.hoursDeltaThreshold ?? 0.75).toFixed(2)} h
              </b>
            </div>
            <input
              type="range"
              min="0.10"
              max="2.00"
              step="0.10"
              value={building.playgroundParams?.hoursDeltaThreshold ?? 0.75}
              onChange={(e) =>
                onUpdate({
                  playgroundParams: {
                    ...building.playgroundParams,
                    hoursDeltaThreshold: parseFloat(e.target.value),
                  },
                })
              }
              style={{ width: '100%', accentColor: 'var(--accent-indigo)' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
