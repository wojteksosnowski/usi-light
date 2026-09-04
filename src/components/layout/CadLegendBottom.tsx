import React from 'react';
import { Activity, Timer } from 'lucide-react';
import { useSolarAnalysisStore } from '../../store';

export const CadLegendBottom: React.FC = () => {
  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const accuracyStage = useSolarAnalysisStore((s) => s.accuracyStage);
  const analysisOutput = useSolarAnalysisStore((s) => s.analysisOutput);

  const avgShadowingMs = analysisOutput?.avgShadowingMs || 0;
  const avgSunlightMs = analysisOutput?.avgSunlightMs || 0;
  const totalShadowingMs = analysisOutput?.totalShadowingTimeMs ?? (avgShadowingMs * (analysisOutput?.totalPoints || 0));
  const totalSunlightMs = analysisOutput?.totalSunlightTimeMs ?? (avgSunlightMs * (analysisOutput?.totalPoints || 0));
  const shadowEnvelopeMs = analysisOutput?.shadowEnvelopeMs || 0;
  const totalAnalysisMs = analysisOutput?.totalAnalysisMs || 0;
  const totalPoints = analysisOutput?.totalPoints ?? 0;

  return (
    <div className="cad-legend-bottom" style={{ gap: '12px', alignItems: 'center' }}>
      <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '11px' }}>LEGENDA:</span>

      {/* § 12 — tylko gdy włączone */}
      {showShadowingLines && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>§ 12:</span>
            <span style={{ color: '#10b981', fontWeight: 800, fontSize: '12px' }} title="§ 12 Zgodne">✓</span>
            <span style={{ color: '#f43f5e', fontWeight: 800, fontSize: '12px' }} title="§ 12 Niezgodne">✗</span>
          </div>
          {showSunlightLines && <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />}
        </>
      )}

      {/* § 56 — tylko gdy włączone */}
      {showSunlightLines && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>§ 56:</span>
          <div style={{ display: 'flex', height: '6px', width: '70px', borderRadius: '3px', overflow: 'hidden' }}>
            <span style={{ flex: 1, backgroundColor: '#3b0764' }} title="0h" />
            <span style={{ flex: 1, backgroundColor: '#7e22ce' }} title="1.0h" />
            <span style={{ flex: 1, backgroundColor: '#c026d3' }} title="2.0h" />
            <span style={{ flex: 1, backgroundColor: '#ea580c' }} title="3.0h (Zgodne)" />
            <span style={{ flex: 1, backgroundColor: '#fb923c' }} title="4.0h+" />
          </div>
          <span style={{ fontSize: '10px', color: '#cbd5e1' }}>0h &rarr; 4h+</span>
        </div>
      )}

      {/* Gdy żadna analiza nie jest włączona */}
      {!showShadowingLines && !showSunlightLines && (
        <span style={{ fontSize: '10px', color: '#475569', fontStyle: 'italic' }}>Brak aktywnych analiz</span>
      )}

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      {/* Dynamic Accuracy Refinement Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 7px',
          borderRadius: '5px',
          backgroundColor:
            accuracyStage === 'final'
              ? 'rgba(16, 185, 129, 0.15)'
              : accuracyStage === 'live'
              ? 'rgba(245, 158, 11, 0.15)'
              : 'rgba(99, 102, 241, 0.15)',
          border: `1px solid ${
            accuracyStage === 'final'
              ? 'rgba(16, 185, 129, 0.3)'
              : accuracyStage === 'live'
              ? 'rgba(245, 158, 11, 0.3)'
              : 'rgba(99, 102, 241, 0.3)'
          }`,
          color:
            accuracyStage === 'final'
              ? '#6ee7b7'
              : accuracyStage === 'live'
              ? '#fcd34d'
              : '#a5b4fc',
          fontSize: '10px',
          fontWeight: 600,
        }}
        title={
          accuracyStage === 'final'
            ? 'Osiągnięto docelową dokładność obliczeń (krok 0.25m)'
            : 'Trwa adaptacyjne przeliczanie i zagęszczanie siatki (docelowo 0.25m)'
        }
      >
        <Activity size={12} />
        <span>
          {accuracyStage === 'live'
            ? 'Live: 2.0m'
            : accuracyStage === 'stage1'
            ? 'Siatka: 1.0m'
            : accuracyStage === 'stage2'
            ? 'Siatka: 0.5m'
            : 'Dokładność: 0.25m'}
        </span>
      </div>

      {/* Performance & points count badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          borderRadius: '5px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid #334155',
          fontSize: '10px',
          fontFamily: 'monospace',
        }}
        title={`Czas pełnego przeliczenia metod analitycznych w bieżącym cyklu:\n• Liczba zbadanych punktów: ${totalPoints.toLocaleString()} (${(totalPoints / 1000).toFixed(2)}k pkt)\n• § 12 (Przesłanianie) łącznie: ${totalShadowingMs.toFixed(2)} ms (śr. ${avgShadowingMs.toFixed(3)} ms/pkt)\n• § 56 (Nasłonecznienie) łącznie: ${totalSunlightMs.toFixed(2)} ms (śr. ${avgSunlightMs.toFixed(3)} ms/pkt)\n• Obrys i koperta cienia (§ 56): ${shadowEnvelopeMs.toFixed(2)} ms\n• Całkowity czas cyklu: ${totalAnalysisMs.toFixed(2)} ms`}
      >
        <Timer size={11} color="#94a3b8" />
        <span style={{ color: '#93c5fd', fontWeight: 600 }}>
          {totalPoints >= 1000
            ? `${(totalPoints / 1000).toFixed(1)}k pkt`
            : `${totalPoints} pkt`}
        </span>
        <span style={{ color: '#475569' }}>|</span>
        <span style={{ color: '#34d399', fontWeight: 600 }}>
          §12: {totalShadowingMs < 0.1 && totalShadowingMs > 0 ? '<0.1' : totalShadowingMs.toFixed(1)}ms
        </span>
        <span style={{ color: '#475569' }}>|</span>
        <span style={{ color: '#fbbf24', fontWeight: 600 }}>
          §56: {totalSunlightMs < 0.1 && totalSunlightMs > 0 ? '<0.1' : totalSunlightMs.toFixed(1)}ms
        </span>
        <span style={{ color: '#475569' }}>|</span>
        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
          Cykl: {totalAnalysisMs < 0.1 && totalAnalysisMs > 0 ? '<0.1' : totalAnalysisMs.toFixed(1)}ms
        </span>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      {/* Warstadt Website Link */}
      <a
        href="https://www.warstadt.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: '10.5px',
          fontWeight: 600,
          color: '#94a3b8',
          textDecoration: 'none',
          padding: '2px 4px',
          borderRadius: '4px',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
        title="www.warstadt.com"
      >
        <span>www.warstadt.com</span>
      </a>
    </div>
  );
};
