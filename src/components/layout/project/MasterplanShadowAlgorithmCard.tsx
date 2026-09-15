import React from 'react';
import { Layers } from 'lucide-react';
import { useSolarAnalysisStore, useUiStore } from '../../../store';

/**
 * Kafelek widoku Masterplan White: przełącznik algorytmu renderowania cieni.
 * 'legacy' — dotychczasowe 3 próbki penumbry (union poligonów).
 * 'soft' — jeden hard-shadow + napompowany kontur zależny od odległości od krawędzi (patrz masterplanShadowCache.ts).
 */
export const MasterplanShadowAlgorithmCard: React.FC = () => {
  const viewMode2D = useUiStore((s) => s.viewMode2D);
  const algorithm = useSolarAnalysisStore((s) => s.masterplanShadowAlgorithm);
  const setAlgorithm = useSolarAnalysisStore((s) => s.setMasterplanShadowAlgorithm);

  if (viewMode2D !== 'masterplan_white') return null;

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Widok biały (Masterplan)</span>
        <Layers size={14} color="var(--accent-amber)" />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Algorytm cienia:</span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            borderRadius: '7px',
            padding: '2px',
            border: '1px solid var(--border-light)',
          }}
        >
          <button
            type="button"
            onClick={() => setAlgorithm('legacy')}
            title="Obecny algorytm — 3 próbki penumbry (union poligonów)"
            style={{
              padding: '3px 8px',
              borderRadius: '5px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: algorithm === 'legacy' ? 'rgba(245,158,11,0.25)' : 'transparent',
              color: algorithm === 'legacy' ? 'var(--accent-lock)' : 'var(--text-muted)',
              letterSpacing: '0.02em',
              transition: 'all 0.15s ease',
            }}
          >
            Obecny
          </button>
          <button
            type="button"
            onClick={() => setAlgorithm('soft')}
            title="Nowy algorytm — pojedynczy cień z napompowanym konturem penumbry zależnym od odległości"
            style={{
              padding: '3px 8px',
              borderRadius: '5px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: algorithm === 'soft' ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: algorithm === 'soft' ? 'var(--accent-indigo)' : 'var(--text-muted)',
              letterSpacing: '0.02em',
              transition: 'all 0.15s ease',
            }}
          >
            Nowy
          </button>
        </div>
      </div>
    </div>
  );
};
