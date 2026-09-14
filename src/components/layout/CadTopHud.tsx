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
  Layers,
  Map,
} from 'lucide-react';
import { useUiStore, useSolarAnalysisStore, useCadToolStore } from '../../store';
import { useLicenseStore } from '../../store/useLicenseStore';
import { useWfsStore } from '../../modules/wfs-import/store/useWfsStore';
import { useIdleGlint } from '../../hooks/useIdleGlint';
import { APP_CONFIG } from '../../config/appConfig';

interface GeoOverlayToggleButtonProps {
  active: boolean;
  onToggle: () => void;
  activeBg: string;
  activeColor: string;
  title: string;
  icon: React.ReactNode;
  label: string;
}

const GeoOverlayToggleButton: React.FC<GeoOverlayToggleButtonProps> = ({
  active,
  onToggle,
  activeBg,
  activeColor,
  title,
  icon,
  label,
}) => (
  <button
    onClick={onToggle}
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
      backgroundColor: active ? activeBg : 'transparent',
      color: active ? activeColor : 'var(--text-secondary)',
      transition: 'all 0.15s ease',
      flexShrink: 0,
    }}
    title={title}
  >
    {icon}
    <span className="hud-btn-label">{label}</span>
  </button>
);

export const CadTopHud: React.FC = () => {
  const isPro = useLicenseStore((s) => s.isPro);
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

  const showGeoOverlayGroup = useWfsStore((s) => s.showGeoOverlayGroup);
  const showPlansOverlayGroup = useWfsStore((s) => s.showPlansOverlayGroup);

  // Idle-glint: 1. błysk po 30s bezczynności, 2. błysk po kolejnych 15s (łącznie 45s), potem stop
  const isShareGlinting = useIdleGlint([30000, 45000]);

  React.useEffect(() => {
    // Czyszczenie ewentualnych starych kluczy licencyjnych z wersji eksperymentalnych
    try {
      if (localStorage.getItem('usi_license_key')) {
        localStorage.removeItem('usi_license_key');
      }
    } catch {
      // Ignoruj błędy dostępu do localStorage
    }
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
            color: 'var(--text-primary)',
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
          backgroundColor: 'var(--bg-badge)',
          border: '1px solid var(--border-light)',
          fontSize: '11px',
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        title={`Lokalizacja projektu: ${selectedCity} (${settings.latitude.toFixed(2)}°N, ${settings.longitude.toFixed(2)}°E)`}
      >
        <MapPin size={13} color="var(--accent-amber)" />
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedCity}</span>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)', flexShrink: 0 }} />

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
          backgroundColor: showShadowingLines ? 'var(--status-emerald-bg)' : 'transparent',
          color: showShadowingLines ? 'var(--status-emerald-text)' : 'var(--text-secondary)',
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
          backgroundColor: showSunlightLines ? 'var(--status-amber-bg)' : 'transparent',
          color: showSunlightLines ? 'var(--status-amber-text)' : 'var(--text-secondary)',
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
          backgroundColor: showAnalysisPoints ? 'var(--status-cyan-bg)' : 'transparent',
          color: showAnalysisPoints ? 'var(--accent-cyan)' : 'var(--text-secondary)',
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
          backgroundColor: showShadowRange ? 'var(--status-indigo-bg)' : 'transparent',
          color: showShadowRange ? 'var(--status-indigo-text)' : 'var(--text-secondary)',
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
          backgroundColor: showSatelliteLayer ? 'var(--status-cyan-bg)' : 'transparent',
          color: showSatelliteLayer ? 'var(--accent-cyan)' : 'var(--text-secondary)',
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
          backgroundColor: showProjectParameters ? 'var(--status-emerald-bg)' : 'transparent',
          color: showProjectParameters ? 'var(--status-emerald-text)' : 'var(--text-secondary)',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
        title="Włącz / wyłącz panel analityczny: Parametry projektu i bilans powierzchni"
      >
        <FileSpreadsheet size={13} />
        <span className="hud-btn-label">Parametry</span>
      </button>

      {/* Podkłady GEO (PRO) i Plany buttons */}
      {APP_CONFIG.geoOverlays.showTogglesPanel && isPro && (
        <>
          <GeoOverlayToggleButton
            active={showGeoOverlayGroup}
            onToggle={() => {
              const s = useWfsStore.getState();
              s.setShowGeoOverlayGroup(!s.showGeoOverlayGroup);
            }}
            activeBg="var(--status-indigo-bg)"
            activeColor="var(--status-indigo-text)"
            title="Włącz / wyłącz podkłady geodezyjne (Uzbrojenie GESUT / BDOT10k) [Wersja PRO]"
            icon={<Layers size={13} />}
            label="Podkład"
          />

          <GeoOverlayToggleButton
            active={showPlansOverlayGroup}
            onToggle={() => {
              const s = useWfsStore.getState();
              s.setShowPlansOverlayGroup(!s.showPlansOverlayGroup);
            }}
            activeBg="var(--status-cyan-bg)"
            activeColor="var(--status-cyan-text)"
            title="Włącz / wyłącz warstwy planistyczne i ukształtowania terenu (MPZP / NMT / Overture / Pokrycie terenu) [Wersja PRO]"
            icon={<Map size={13} />}
            label="Plany"
          />
        </>
      )}

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)', flexShrink: 0 }} />

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
          onClick={() => triggerFit()}
          title="Dopasuj widok do zaznaczonego obiektu (jeśli zaznaczony) lub do całego projektu (Zoom Extents)"
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
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
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
            border: viewRotationMode ? '1px solid var(--status-blue-border)' : '1px solid var(--border-light)',
            backgroundColor: viewRotationMode ? 'var(--status-blue-bg)' : 'var(--bg-card)',
            color: viewRotationMode ? 'var(--status-blue-text)' : 'var(--text-primary)',
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
            border: Math.abs(viewRotationDeg) > 0.001 ? '1px solid var(--status-cyan-border)' : '1px solid var(--border-light)',
            backgroundColor: Math.abs(viewRotationDeg) > 0.001 ? 'var(--status-cyan-bg)' : 'var(--bg-card)',
            color: Math.abs(viewRotationDeg) > 0.001 ? 'var(--accent-cyan)' : 'var(--text-primary)',
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

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)', flexShrink: 0 }} />

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
          border: isOsnapActive ? '1px solid var(--accent-emerald)' : '1px solid var(--border-light)',
          backgroundColor: isOsnapActive ? 'var(--status-emerald-bg)' : 'var(--bg-card)',
          color: isOsnapActive ? 'var(--status-emerald-text)' : 'var(--text-secondary)',
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        <Magnet size={13} color={isOsnapActive ? 'var(--accent-emerald)' : 'var(--text-secondary)'} />
        <span className="hud-btn-label">Przyciąganie</span>
      </button>

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)', flexShrink: 0 }} />

      <button
        onClick={() => setShareModalOpen(true)}
        title="Udostępnij projekt online za pomocą linku (Upstash Redis, 14 dni)"
        className={`cad-publish-btn ${isShareGlinting ? 'glinting' : ''}`}
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

