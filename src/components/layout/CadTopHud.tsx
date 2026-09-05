import React from 'react';
import {
  ChevronRight,
  MapPin,
  Maximize2,
  RotateCw,
  Move,
  Magnet,
  Compass,
  Globe,
  Share2,
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

  const triggerFit = useCadToolStore((s) => s.triggerFit);
  const viewRotationMode = useCadToolStore((s) => s.viewRotationMode);
  const setViewRotationMode = useCadToolStore((s) => s.setViewRotationMode);
  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const toggleUcsRotation = useCadToolStore((s) => s.toggleUcsRotation);
  const isOsnapActive = useCadToolStore((s) => s.isOsnapActive);
  const toggleOsnap = useCadToolStore((s) => s.toggleOsnap);
  const isDirectionSnappingActive = useCadToolStore((s) => s.isDirectionSnappingActive);
  const toggleDirectionSnapping = useCadToolStore((s) => s.toggleDirectionSnapping);

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
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '6px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid #334155',
          fontSize: '11px',
          color: '#f8fafc',
        }}
        title={`Lokalizacja projektu: ${selectedCity} (${settings.latitude.toFixed(2)}°N, ${settings.longitude.toFixed(2)}°E)`}
      >
        <MapPin size={13} color="#f59e0b" />
        <span style={{ fontWeight: 600, color: '#f8fafc' }}>{selectedCity}</span>
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
          ({settings.latitude.toFixed(2)}°N)
        </span>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      <button
        onClick={() => setShowShadowingLines((prev) => !prev)}
        style={{
          height: '28px',
          padding: '0 9px',
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
        }}
      >
        § 12
      </button>
      <button
        onClick={() => setShowSunlightLines((prev) => !prev)}
        style={{
          height: '28px',
          padding: '0 9px',
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
        }}
      >
        § 56
      </button>
      <button
        onClick={() => setShowAnalysisPoints((prev) => !prev)}
        style={{
          height: '28px',
          padding: '0 9px',
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
        }}
        title="Włącz / wyłącz punkty kontrolne na fasadzie oraz nasłonecznienie placu zabaw"
      >
        Punkty
      </button>
      <button
        onClick={() => setShowShadowRange((prev) => !prev)}
        style={{
          height: '28px',
          padding: '0 9px',
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
          gap: '5px',
          padding: '0 9px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          backgroundColor: showSatelliteLayer ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
          color: showSatelliteLayer ? '#38bdf8' : '#94a3b8',
          transition: 'all 0.15s ease',
        }}
        title="Włącz / wyłącz podkład z mapy satelitarnej Google Maps pod sceną CAD"
      >
        <Globe size={13} />
        <span>Satelita</span>
      </button>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      {/* Grupa Widok: centruj, obrót, przełącz */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', paddingRight: '2px' }}>
          Widok:
        </span>

        <button
          onClick={triggerFit}
          title="Dopasuj widok do obiektów (Zoom Extents)"
          style={{
            height: '28px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            padding: '0 10px',
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
          <span>Centruj</span>
        </button>

        <button
          onClick={() => setViewRotationMode((prev) => !prev)}
          title="Ustaw obrót widoku względem odcinka"
          style={{
            height: '28px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            padding: '0 10px',
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
          <span>Obrót</span>
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
            gap: '5px',
            padding: '0 10px',
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
          <span>Przełącz</span>
        </button>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      <button
        onClick={toggleOsnap}
        title="Włącz / wyłącz dociąganie geometryczne [F3] (wierzchołki, środki, krawędzie, przecięcia OTRACK)"
        style={{
          height: '28px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          padding: '0 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: isOsnapActive ? '1px solid #10b981' : '1px solid #334155',
          backgroundColor: isOsnapActive ? 'rgba(16, 185, 129, 0.22)' : 'rgba(30, 41, 59, 0.8)',
          color: isOsnapActive ? '#6ee7b7' : '#94a3b8',
          transition: 'all 0.15s ease',
        }}
      >
        <Magnet size={13} color={isOsnapActive ? '#10b981' : '#94a3b8'} />
        <span>Dociąganie</span>
      </button>

      <button
        onClick={toggleDirectionSnapping}
        title="Włącz / wyłącz inteligentne śledzenie kątowe i kierunków (równoległe i prostopadłe)"
        style={{
          height: '28px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          padding: '0 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: isDirectionSnappingActive ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid #334155',
          backgroundColor: isDirectionSnappingActive ? 'rgba(99, 102, 241, 0.25)' : 'rgba(30, 41, 59, 0.8)',
          color: isDirectionSnappingActive ? '#a5b4fc' : '#94a3b8',
          transition: 'all 0.15s ease',
        }}
      >
        <Compass size={13} color={isDirectionSnappingActive ? '#818cf8' : '#94a3b8'} />
        <span>Śledzenie</span>
      </button>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      <button
        onClick={() => setShareModalOpen(true)}
        title="Udostępnij projekt online za pomocą linku (Upstash Redis, 14 dni)"
        style={{
          height: '28px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          padding: '0 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          backgroundColor: 'rgba(99, 102, 241, 0.2)',
          color: '#c7d2fe',
          transition: 'all 0.15s ease',
        }}
      >
        <Share2 size={13} color="#a5b4fc" />
        <span>Udostępnij</span>
      </button>
    </div>
  );
};
