import React from 'react';
import { Sliders, Globe, FileSpreadsheet } from 'lucide-react';
import { useSolarAnalysisStore, useUiStore, useLicenseStore } from '../../../store';
import { ProjectOverlaysCard } from './ProjectOverlaysCard';
import { useWmsStatusStore } from '../../../modules/wfs-import/store/useWmsStatusStore';
import { WmsStatusIcon } from '../../../modules/wfs-import/ui/WmsStatusIcon';

const SATELLITE_PROVIDERS: { key: 'google' | 'here' | 'orthophoto'; label: string; title: string; pro?: boolean }[] = [
  { key: 'google', label: 'Google', title: 'Google Maps Satellite' },
  { key: 'here', label: 'HERE', title: 'HERE Satellite' },
  { key: 'orthophoto', label: 'Ortofotomapa', title: 'Ortofotomapa HR GUGiK (≤10 cm) — PRO', pro: true },
];

export const ProjectAnalysisTogglesCard: React.FC = () => {
  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const setShowShadowingLines = useSolarAnalysisStore((s) => s.setShowShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const setShowSunlightLines = useSolarAnalysisStore((s) => s.setShowSunlightLines);
  const showAnalysisPoints = useSolarAnalysisStore((s) => s.showAnalysisPoints);
  const setShowAnalysisPoints = useSolarAnalysisStore((s) => s.setShowAnalysisPoints);
  const showNormals = useSolarAnalysisStore((s) => s.showNormals);
  const setShowNormals = useSolarAnalysisStore((s) => s.setShowNormals);
  const showShadowRange = useSolarAnalysisStore((s) => s.showShadowRange);
  const setShowShadowRange = useSolarAnalysisStore((s) => s.setShowShadowRange);
  const showShadowFill = useSolarAnalysisStore((s) => s.showShadowFill);
  const setShowShadowFill = useSolarAnalysisStore((s) => s.setShowShadowFill);
  const showSatelliteLayer = useSolarAnalysisStore((s) => s.showSatelliteLayer);
  const setShowSatelliteLayer = useSolarAnalysisStore((s) => s.setShowSatelliteLayer);
  const satelliteOpacity = useSolarAnalysisStore((s) => s.satelliteOpacity);
  const setSatelliteOpacity = useSolarAnalysisStore((s) => s.setSatelliteOpacity);
  const satelliteProvider = useSolarAnalysisStore((s) => s.satelliteProvider);
  const setSatelliteProvider = useSolarAnalysisStore((s) => s.setSatelliteProvider);
  const showProjectParameters = useSolarAnalysisStore((s) => s.showProjectParameters);
  const setShowProjectParameters = useSolarAnalysisStore((s) => s.setShowProjectParameters);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);
  const setSunlightMethod = useSolarAnalysisStore((s) => s.setSunlightMethod);

  const openModal = useUiStore((s) => s.openModal);
  const isPro = useLicenseStore((s) => s.isPro);
  const orthophotoStatus = useWmsStatusStore((s) => s.statuses.orthophoto);

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Analizy</span>
        <Sliders size={14} color="var(--accent-amber)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* 1. Przesłanianie § 12 */}
        <div className={`project-toggle-card ${showShadowingLines ? 'active-emerald' : ''}`}>
          <button
            type="button"
            onClick={() => setShowShadowingLines((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: showShadowingLines ? 'var(--accent-emerald)' : 'var(--text-muted)',
                  boxShadow: showShadowingLines ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Przesłanianie § 12 (Wewnętrzny pas)</span>
            </div>
            <div className={`project-toggle-switch ${showShadowingLines ? 'active active-emerald' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>
        </div>

        {/* 2. Nasłonecznienie § 56 */}
        <div className={`project-toggle-card ${showSunlightLines ? 'active-amber' : ''}`}>
          <button
            type="button"
            onClick={() => setShowSunlightLines((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: showSunlightLines ? 'var(--accent-lock)' : 'var(--text-muted)',
                  boxShadow: showSunlightLines ? '0 0 8px rgba(251, 191, 36, 0.6)' : 'none',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Nasłonecznienie § 56 (Zewnętrzny pas)</span>
            </div>
            <div className={`project-toggle-switch ${showSunlightLines ? 'active active-amber' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>

          {showSunlightLines && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '6px',
                borderTop: '1px solid rgba(51, 65, 85, 0.5)',
              }}
            >
              <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Metoda obliczeń § 56:</span>
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
                  onClick={() => setSunlightMethod('raycasting')}
                  title="Metoda Astronomiczna — rzucanie promieni i astronomiczna pozycja słońca"
                  style={{
                    padding: '3px 8px',
                    borderRadius: '5px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: sunlightMethod === 'raycasting' ? 'rgba(245,158,11,0.25)' : 'transparent',
                    color: sunlightMethod === 'raycasting' ? 'var(--accent-lock)' : 'var(--text-muted)',
                    letterSpacing: '0.02em',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Astro
                </button>
                <button
                  type="button"
                  onClick={() => setSunlightMethod('segments')}
                  title="Metoda Linijki Słońca — uproszczona metoda wykreślna Twarowskiego"
                  style={{
                    padding: '3px 8px',
                    borderRadius: '5px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: sunlightMethod === 'segments' ? 'rgba(99,102,241,0.25)' : 'transparent',
                    color: sunlightMethod === 'segments' ? 'var(--accent-indigo)' : 'var(--text-muted)',
                    letterSpacing: '0.02em',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Linijka
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. Punkty (Fasada & Plac zabaw) */}
        <div className={`project-toggle-card ${showAnalysisPoints ? 'active-cyan' : ''}`}>
          <button
            type="button"
            onClick={() => setShowAnalysisPoints((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: showAnalysisPoints ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  boxShadow: showAnalysisPoints ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Punkty (Fasada & Plac zabaw)</span>
            </div>
            <div className={`project-toggle-switch ${showAnalysisPoints ? 'active active-cyan' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>
        </div>

        {/* 4. Wektory normalne fasad */}
        <div className={`project-toggle-card ${showNormals ? 'active-indigo' : ''}`}>
          <button
            type="button"
            onClick={() => setShowNormals((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: showNormals ? 'var(--accent-indigo)' : 'var(--text-muted)',
                  boxShadow: showNormals ? '0 0 8px rgba(129, 140, 248, 0.6)' : 'none',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Wektory normalne fasad (Zwrot ścian)</span>
            </div>
            <div className={`project-toggle-switch ${showNormals ? 'active active-indigo' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>
        </div>

        {/* 5. Zakres cienia */}
        <div className={`project-toggle-card ${showShadowRange ? 'active-indigo' : ''}`}>
          <button
            type="button"
            onClick={() => setShowShadowRange((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: showShadowRange ? 'var(--accent-indigo)' : 'var(--text-muted)',
                  boxShadow: showShadowRange ? '0 0 8px rgba(165, 180, 252, 0.6)' : 'none',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Zakres cienia (Obwiednia badanych)</span>
            </div>
            <div className={`project-toggle-switch ${showShadowRange ? 'active active-indigo' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>

          {showShadowRange && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '6px',
                borderTop: '1px solid rgba(51, 65, 85, 0.5)',
              }}
            >
              <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Wypełnienie cienia (godziny ±5h):</span>
              <button
                type="button"
                onClick={() => setShowShadowFill((prev) => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Rysuj wypełnienie cienia dla każdej pełnej godziny (±5h od górowania słońca)"
              >
                <span style={{ fontSize: '10px', fontWeight: 700, color: showShadowFill ? 'var(--accent-indigo)' : 'var(--text-muted)' }}>
                  {showShadowFill ? 'WŁ' : 'WYŁ'}
                </span>
                <div className={`project-toggle-switch ${showShadowFill ? 'active active-indigo' : ''}`}>
                  <div className="project-toggle-dot" />
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 6. Podkład satelitarny */}
        <div className={`project-toggle-card ${showSatelliteLayer ? 'active-cyan' : ''}`}>
          <button
            type="button"
            onClick={() => setShowSatelliteLayer((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={14} color={showSatelliteLayer ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Podkład satelitarny</span>
            </div>
            <div className={`project-toggle-switch ${showSatelliteLayer ? 'active active-cyan' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>

          {showSatelliteLayer && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Dostawca mapy:</span>
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
                  {SATELLITE_PROVIDERS.map((provider) => (
                    <button
                      key={provider.key}
                      type="button"
                      onClick={() => {
                        if (provider.pro && !isPro) {
                          openModal('pricing');
                          return;
                        }
                        setSatelliteProvider(provider.key);
                      }}
                      title={provider.title}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: satelliteProvider === provider.key ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                        color: satelliteProvider === provider.key ? 'var(--accent-cyan)' : 'var(--text-muted)',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      {provider.label}
                      {provider.key === 'orthophoto' && <WmsStatusIcon status={orthophotoStatus} />}
                      {provider.pro && !isPro && <span style={{ fontSize: '8px', fontWeight: 800, opacity: 0.8 }}>PRO</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)' }}>
                <span>Krycie podkładu:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(satelliteOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={satelliteOpacity}
                onChange={(e) => setSatelliteOpacity(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
              />
            </div>
          )}
        </div>

        {/* 7. Parametry projektu (Bilans powierzchni i kubatury) */}
        <div className={`project-toggle-card ${showProjectParameters ? 'active-emerald' : ''}`}>
          <button
            type="button"
            onClick={() => setShowProjectParameters((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileSpreadsheet size={14} color={showProjectParameters ? 'var(--accent-emerald)' : 'var(--text-muted)'} />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Parametry projektu (Bilans i wskaźniki)</span>
            </div>
            <div className={`project-toggle-switch ${showProjectParameters ? 'active active-emerald' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>
        </div>

        {/* 8. Podkłady i Plany (PRO) */}
        <ProjectOverlaysCard />
      </div>
    </div>
  );
};
