import React, { useMemo } from 'react';
import { Activity, Timer, Globe, ZoomIn, Crown, Sparkles } from 'lucide-react';
import { useSolarAnalysisStore, useSceneStore, useUiStore, useLicenseStore } from '../../store';
import { detectCoordinateSystem } from '../../utils/geoTransform';
import { Point2D } from '../../types/geometry';

const ACCURACY_STAGE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  final: { bg: 'var(--status-emerald-bg)', border: 'var(--status-emerald-border)', text: 'var(--status-emerald-text)' },
  live: { bg: 'var(--status-amber-bg)', border: 'var(--status-amber-border)', text: 'var(--status-amber-text)' },
};
const ACCURACY_STAGE_DEFAULT = { bg: 'var(--status-indigo-bg)', border: 'var(--status-indigo-border)', text: 'var(--status-indigo-text)' };

export const CadLegendBottom: React.FC = () => {
  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const accuracyStage = useSolarAnalysisStore((s) => s.accuracyStage);
  const analysisOutput = useSolarAnalysisStore((s) => s.analysisOutput);
  const buildings = useSceneStore((s) => s.buildings);
  const settings = useSolarAnalysisStore((s) => s.settings);
  const viewportScale = useUiStore((s) => s.viewportScale);
  const isPro = useLicenseStore((s) => s.isPro);
  const activateLicense = useLicenseStore((s) => s.activateLicense);
  const clearLicense = useLicenseStore((s) => s.clearLicense);
  const showCopiedToast = useUiStore((s) => s.showCopiedToast);

  const handleToggleDevPro = async () => {
    if (isPro) {
      clearLicense();
      showCopiedToast('🛠️ DEV: Przełączono na wersję FREE (Darmową)');
    } else {
      await activateLicense('USI-DEV-MASTER-PRO');
      showCopiedToast('👑 DEV: Aktywowano Master PRO (Nielimitowany)');
    }
  };

  const crsInfo = useMemo(() => {
    const allPts: Point2D[] = [];
    for (const b of buildings) {
      if (b.vertices) allPts.push(...b.vertices);
    }
    return detectCoordinateSystem(allPts, { lat: settings.latitude, lon: settings.longitude });
  }, [buildings, settings.latitude, settings.longitude]);

  const zoomInfo = useMemo(() => {
    const lat = settings.latitude || 52.23;
    const metersPerPixel = 1 / Math.max(0.0001, viewportScale);
    const metersPerTileAtLat = 40075016.686 * Math.cos((lat * Math.PI) / 180);
    const exactZoom = Math.log2(metersPerTileAtLat / (256 * metersPerPixel));
    const targetZoom = Math.round(exactZoom);
    return {
      scale: viewportScale,
      metersPerPixel,
      exactZoom,
      targetZoom,
    };
  }, [viewportScale, settings.latitude]);

  const totalAnalysisMs = analysisOutput?.totalAnalysisMs || 0;

  return (
    <div className="cad-legend-bottom" style={{ gap: '12px', alignItems: 'center' }}>
      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '11px' }}>LEGENDA:</span>

      {/* § 12 — tylko gdy włączone */}
      {showShadowingLines && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>§ 12:</span>
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 800, fontSize: '12px' }} title="§ 12 Zgodne">✓</span>
            <span style={{ color: 'var(--accent-rose)', fontWeight: 800, fontSize: '12px' }} title="§ 12 Niezgodne">✗</span>
          </div>
          {showSunlightLines && <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)' }} />}
        </>
      )}

      {/* § 56 — tylko gdy włączone */}
      {showSunlightLines && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>§ 56:</span>
          <div style={{ display: 'flex', height: '6px', width: '70px', borderRadius: '3px', overflow: 'hidden' }}>
            <span style={{ flex: 1, backgroundColor: '#3b0764' }} title="0h" />
            <span style={{ flex: 1, backgroundColor: '#7e22ce' }} title="1.0h" />
            <span style={{ flex: 1, backgroundColor: '#c026d3' }} title="2.0h" />
            <span style={{ flex: 1, backgroundColor: '#ea580c' }} title="3.0h (Zgodne)" />
            <span style={{ flex: 1, backgroundColor: '#fb923c' }} title="4.0h+" />
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>0h &rarr; 4h+</span>
        </div>
      )}

      {/* Gdy żadna analiza nie jest włączona */}
      {!showShadowingLines && !showSunlightLines && (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Brak aktywnych analiz</span>
      )}

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)' }} />

      {/* Geodetic Coordinate System Badge (ETRF2000-PL / CS2000) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 7px',
          borderRadius: '6px',
          backgroundColor: 'var(--status-cyan-bg)',
          border: '1px solid var(--status-cyan-border)',
          color: 'var(--status-cyan-text)',
          fontSize: '10px',
          fontWeight: 600,
          fontFamily: 'monospace',
        }}
        title={`Państwowy układ współrzędnych sceny CAD: ${crsInfo.description}`}
      >
        <Globe size={11} color="var(--accent-cyan)" />
        <span>{crsInfo.geodeticLabel}</span>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)' }} />

      {/* Zoom / Scale Debug Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 7px',
          borderRadius: '6px',
          backgroundColor: 'var(--status-purple-bg)',
          border: '1px solid var(--status-purple-border)',
          color: 'var(--status-purple-text)',
          fontSize: '10px',
          fontWeight: 600,
          fontFamily: 'monospace',
        }}
        title={`Poziom zoomu Web Mercator dla kafli WMS/Satelitarnych:\n• Dokładny zoom (exact): ${zoomInfo.exactZoom.toFixed(3)}\n• Kafelki (target): Z${zoomInfo.targetZoom}\n• Rozdzielczość: ${zoomInfo.metersPerPixel.toFixed(3)} m/px\n• Skala widoku: ${zoomInfo.scale.toFixed(2)} px/m`}
      >
        <ZoomIn size={11} color="var(--accent-purple)" />
        <span>Z{zoomInfo.targetZoom} ({zoomInfo.exactZoom.toFixed(2)})</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span style={{ color: 'var(--text-secondary)' }}>{zoomInfo.scale.toFixed(1)}px/m</span>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)' }} />

      {/* Dynamic Accuracy Refinement Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 7px',
          borderRadius: '6px',
          backgroundColor: (ACCURACY_STAGE_STYLES[accuracyStage] ?? ACCURACY_STAGE_DEFAULT).bg,
          border: `1px solid ${(ACCURACY_STAGE_STYLES[accuracyStage] ?? ACCURACY_STAGE_DEFAULT).border}`,
          color: (ACCURACY_STAGE_STYLES[accuracyStage] ?? ACCURACY_STAGE_DEFAULT).text,
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

      {/* Dev-only: full analysis loop timer + PRO/FREE toggle */}
      {import.meta.env.DEV && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-badge)',
              border: '1px solid var(--border-light)',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}
            title="Czas pełnej pętli obliczeń (§ 12 + § 56) w bieżącym cyklu"
          >
            <Timer size={11} color="var(--text-secondary)" />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              Cykl: {totalAnalysisMs < 0.1 && totalAnalysisMs > 0 ? '<0.1' : totalAnalysisMs.toFixed(1)}ms
            </span>
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)' }} />

          <div
            className={`bottombar-dev-pro-toggle ${isPro ? 'is-pro' : 'is-free'}`}
            title={
              isPro
                ? 'DEV: Przełącz na wersję FREE (aby przetestować blokady i modale zakupu)'
                : 'DEV: Przełącz na wersję PRO (rozszerz o import geo i eksport DXF)'
            }
          >
            <button
              type="button"
              onClick={handleToggleDevPro}
              className={`bottombar-dev-pro-btn ${!isPro ? 'active-free' : ''}`}
            >
              <Sparkles size={10} />
              <span>FREE</span>
            </button>
            <button
              type="button"
              onClick={handleToggleDevPro}
              className={`bottombar-dev-pro-btn ${isPro ? 'active-pro' : ''}`}
            >
              <Crown size={10} />
              <span>PRO</span>
            </button>
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)' }} />
        </>
      )}

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
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          padding: '2px 4px',
          borderRadius: '4px',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-cyan)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
        title="www.warstadt.com"
      >
        <span>www.warstadt.com</span>
      </a>
    </div>
  );
};
