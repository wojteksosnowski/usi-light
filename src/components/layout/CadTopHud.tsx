import React from 'react';
import {
  ChevronRight,
  MapPin,
  Maximize2,
  RotateCw,
  Move,
  Magnet,
  Globe,
  Share2,
  FileSpreadsheet,
} from 'lucide-react';
import { useUiStore, useSolarAnalysisStore, useCadToolStore } from '../../store';

export const CadTopHud: React.FC = () => {
  const isSidebarOpen = useUiStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setShareModalOpen = useUiStore((s) => s.setShareModalOpen);

  const selectedCity = useSolarAnalysisStore((s) => s.selectedCity);
  const settings = useSolarAnalysisStore((s) => s.settings);

  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const setShowShadowingLines = useSolarAnalysisStore((s) => s.setShowShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const setShowSunlightLines = useSolarAnalysisStore((s) => s.setShowSunlightLines);
  const showAnalysisPoints = useSolarAnalysisStore((s) => s.showAnalysisPoints);
  const setShowAnalysisPoints = useSolarAnalysisStore((s) => s.setShowAnalysisPoints);
  const showShadowRange = useSolarAnalysisStore((s) => s.showShadowRange);
  const setShowShadowRange = useSolarAnalysisStore((s) => s.setShowShadowRange);
  const showSatelliteLayer = useSolarAnalysisStore((s) => s.showSatelliteLayer);
  const setShowSatelliteLayer = useSolarAnalysisStore((s) => s.setShowSatelliteLayer);
  const showProjectParameters = useSolarAnalysisStore((s) => s.showProjectParameters);
  const setShowProjectParameters = useSolarAnalysisStore((s) => s.setShowProjectParameters);

  const triggerFit = useCadToolStore((s) => s.triggerFit);
  const viewRotationMode = useCadToolStore((s) => s.viewRotationMode);
  const setViewRotationMode = useCadToolStore((s) => s.setViewRotationMode);
  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const toggleUcsRotation = useCadToolStore((s) => s.toggleUcsRotation);
  const isOsnapActive = useCadToolStore((s) => s.isOsnapActive);
  const toggleOsnap = useCadToolStore((s) => s.toggleOsnap);

  // Timer bezczynności: 30s bezczynności -> 1. błyśnięcie (1s), kolejne 15s bezczynności -> 2. błyśnięcie (1s), potem stop
  const [isShareGlinting, setIsShareGlinting] = React.useState(false);

  React.useEffect(() => {
    let timer1: NodeJS.Timeout | null = null;
    let timer2: NodeJS.Timeout | null = null;
    let glintOffTimer: NodeJS.Timeout | null = null;

    const triggerGlint = () => {
      setIsShareGlinting(true);
      if (glintOffTimer) clearTimeout(glintOffTimer);
      glintOffTimer = setTimeout(() => {
        setIsShareGlinting(false);
      }, 1000);
    };

    const resetIdleTimers = () => {
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
      setIsShareGlinting(false);

      // 1. błysk po 30 sekundach bezczynności
      timer1 = setTimeout(() => {
        triggerGlint();
      }, 30000);

      // 2. błysk po kolejnych 15 sekundach bezczynności (łącznie 45s)
      timer2 = setTimeout(() => {
        triggerGlint();
      }, 45000);

      // Po 45s już nie błyska
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'pointermove'];
    const handleActivity = () => {
      resetIdleTimers();
    };

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleActivity, { passive: true });
    });

    // Inicjalne wystartowanie timerów
    resetIdleTimers();

    return () => {
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
      if (glintOffTimer) clearTimeout(glintOffTimer);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleActivity);
      });
    };
  }, []);


  return (
    <div className="cad-hud-top">
      {!isSidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          title="Pokaż panel boczny"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 8px',
            borderRadius: '8px',
            background: 'var(--accent-indigo)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* Selected City Location Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 8px',
          borderRadius: '6px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid #334155',
          fontSize: '11px',
          color: '#f8fafc',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        title={`Lokalizacja projektu: ${selectedCity} (${settings.latitude.toFixed(2)}°N, ${settings.longitude.toFixed(2)}°E)`}
      >
        <MapPin size={13} color="#f59e0b" />
        <span style={{ fontWeight: 600, color: '#f8fafc' }}>{selectedCity}</span>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155', flexShrink: 0 }} />

      <button
        onClick={() => setShowShadowingLines((prev) => !prev)}
        style={{
          height: '28px',
          padding: '0 7px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: showShadowingLines ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
          color: showShadowingLines ? '#6ee7b7' : '#94a3b8',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        § 12
      </button>
      <button
        onClick={() => setShowSunlightLines((prev) => !prev)}
        style={{
          height: '28px',
          padding: '0 7px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: showSunlightLines ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
          color: showSunlightLines ? '#fcd34d' : '#94a3b8',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        § 56
      </button>
      <button
        onClick={() => setShowAnalysisPoints((prev) => !prev)}
        style={{
          height: '28px',
          padding: '0 7px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: showAnalysisPoints ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
          color: showAnalysisPoints ? '#38bdf8' : '#94a3b8',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
        title="Włącz / wyłącz punkty kontrolne na fasadzie oraz nasłonecznienie placu zabaw"
      >
        Punkty
      </button>
      <button
        onClick={() => setShowShadowRange((prev) => !prev)}
        style={{
          height: '28px',
          padding: '0 7px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: showShadowRange ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
          color: showShadowRange ? '#c7d2fe' : '#94a3b8',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
        title="Włącz / wyłącz widoczność obwiedni maksymalnego zasięgu cienia rzucanego przez obiekty badane w równonoc"
      >
        Cień
      </button>
      <button
        onClick={() => setShowSatelliteLayer((prev) => !prev)}
        style={{
          height: '28px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          padding: '0 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          backgroundColor: showSatelliteLayer ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
          color: showSatelliteLayer ? '#38bdf8' : '#94a3b8',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
        title="Włącz / wyłącz podkład z mapy satelitarnej Google Maps pod sceną CAD"
      >
        <Globe size={13} />
        <span className="hud-btn-label">Satelita</span>
      </button>
      <button
        onClick={() => setShowProjectParameters((prev) => !prev)}
        style={{
          height: '28px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          padding: '0 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          backgroundColor: showProjectParameters ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
          color: showProjectParameters ? 'var(--accent-emerald, #34d399)' : '#94a3b8',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
        title="Włącz / wyłącz panel analityczny: Parametry projektu i bilans powierzchni"
      >
        <FileSpreadsheet size={13} />
        <span className="hud-btn-label">Parametry</span>
      </button>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155', flexShrink: 0 }} />

      {/* Grupa Widok: centruj, obrót, przełącz */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={triggerFit}
          title="Dopasuj widok do obiektów (Zoom Extents)"
          style={{
            height: '28px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '0 8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid #334155',
            backgroundColor: 'rgba(30, 41, 59, 0.8)',
            color: '#f8fafc',
            transition: 'all 0.15s ease',
          }}
        >
          <Maximize2 size={13} />
          <span className="hud-btn-label">Centruj</span>
        </button>

        <button
          onClick={() => setViewRotationMode((prev) => !prev)}
          title="Ustaw obrót widoku względem odcinka"
          style={{
            height: '28px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '0 8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            border: viewRotationMode ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid #334155',
            backgroundColor: viewRotationMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(30, 41, 59, 0.8)',
            color: viewRotationMode ? '#bfdbfe' : '#f8fafc',
            transition: 'all 0.15s ease',
          }}
        >
          <RotateCw size={13} />
          <span className="hud-btn-label">Obrót</span>
        </button>

        <button
          onClick={toggleUcsRotation}
          title={
            Math.abs(viewRotationDeg) < 0.001
              ? 'Przełącz na zapisaną orientację układu (krzyż obrócony o 45° = główny UCS)'
              : 'Wróć do domyślnej orientacji układu (0°)'
          }
          style={{
            height: '28px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '0 8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            border: Math.abs(viewRotationDeg) > 0.001 ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid #334155',
            backgroundColor: Math.abs(viewRotationDeg) > 0.001 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.8)',
            color: Math.abs(viewRotationDeg) > 0.001 ? '#38bdf8' : '#f8fafc',
            transition: 'all 0.15s ease',
          }}
        >
          <Move
            size={13}
            style={{
              transform: Math.abs(viewRotationDeg) < 0.001 ? 'rotate(45deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          />
          <span className="hud-btn-label">Przełącz</span>
        </button>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155', flexShrink: 0 }} />

      <button
        onClick={toggleOsnap}
        title="Włącz / wyłącz przyciąganie geometryczne [S / F3] (przytrzymaj SHIFT podczas rysowania aby wymusić kąty kardynalne i dominujące)"
        style={{
          height: '28px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          padding: '0 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: isOsnapActive ? '1px solid #10b981' : '1px solid #334155',
          backgroundColor: isOsnapActive ? 'rgba(16, 185, 129, 0.22)' : 'rgba(30, 41, 59, 0.8)',
          color: isOsnapActive ? '#6ee7b7' : '#94a3b8',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        <Magnet size={13} color={isOsnapActive ? '#10b981' : '#94a3b8'} />
        <span className="hud-btn-label">Przyciąganie</span>
      </button>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155', flexShrink: 0 }} />

      <button
        onClick={() => setShareModalOpen(true)}
        title="Udostępnij projekt online za pomocą linku (Upstash Redis, 14 dni)"
        className={`btn-share ${isShareGlinting ? 'glinting' : ''}`}
        style={{
          height: '28px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          padding: '0 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          border: '1px solid rgba(168, 85, 247, 0.7)',
          background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.45), rgba(99, 102, 241, 0.5))',
          color: '#ffffff',
          boxShadow: '0 2px 10px rgba(147, 51, 234, 0.25)',
          transition: 'all 0.2s ease',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <Share2 size={13} />
        <span>Udostępnij</span>
      </button>

    </div>
  );
};

