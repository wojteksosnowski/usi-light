import React from 'react';
import { Layers, Map } from 'lucide-react';
import { useWfsStore } from '../../../modules/wfs-import/store/useWfsStore';
import { useWmsStatusStore } from '../../../modules/wfs-import/store/useWmsStatusStore';
import { WmsStatusIcon } from '../../../modules/wfs-import/ui/WmsStatusIcon';
import { APP_CONFIG } from '../../../config/appConfig';
import { useLicenseStore } from '../../../store';
import { useProjectGeoSync } from './hooks/useProjectGeoSync';
import { SimpleLayerToggle } from './SimpleLayerToggle';

export const ProjectOverlaysCard: React.FC = () => {
  const isPro = useLicenseStore((s) => s.isPro);
  const kiutStatus = useWmsStatusStore((s) => s.statuses.kiut);
  const bdotStatus = useWmsStatusStore((s) => s.statuses.bdot);
  const mpzpStatus = useWmsStatusStore((s) => s.statuses.mpzp);
  const showKiutLayer = useWfsStore((s) => s.showKiutLayer);
  const setShowKiutLayer = useWfsStore((s) => s.setShowKiutLayer);
  const showMpzpLayer = useWfsStore((s) => s.showMpzpLayer);
  const setShowMpzpLayer = useWfsStore((s) => s.setShowMpzpLayer);
  const mpzpOpacity = useWfsStore((s) => s.mpzpOpacity);
  const setMpzpOpacity = useWfsStore((s) => s.setMpzpOpacity);
  const showBdotLayer = useWfsStore((s) => s.showBdotLayer);
  const setShowBdotLayer = useWfsStore((s) => s.setShowBdotLayer);
  const geoOverlayOpacity = useWfsStore((s) => s.geoOverlayOpacity);
  const setGeoOverlayOpacity = useWfsStore((s) => s.setGeoOverlayOpacity);
  const showTerrainLayer = useWfsStore((s) => s.showTerrainLayer);
  const setShowTerrainLayer = useWfsStore((s) => s.setShowTerrainLayer);
  const showGeoOverlayGroup = useWfsStore((s) => s.showGeoOverlayGroup);
  const setShowGeoOverlayGroup = useWfsStore((s) => s.setShowGeoOverlayGroup);
  const showPlansOverlayGroup = useWfsStore((s) => s.showPlansOverlayGroup);
  const setShowPlansOverlayGroup = useWfsStore((s) => s.setShowPlansOverlayGroup);

  const {
    mpzpZonesLoading,
    showMpzpZonesLayer,
    isMpzpZonesAvailableHere,
    mpzpCityName,
    toggleMpzpZonesLayer,
  } = useProjectGeoSync();

  if (!APP_CONFIG.geoOverlays.showTogglesPanel || !isPro) {
    return null;
  }

  return (
    <>
      {/* 7. Podkład (PRO) — GESUT + BDOT10k */}
      <div className={`project-toggle-card ${showGeoOverlayGroup ? 'active-indigo' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={14} color="var(--accent-indigo)" />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Podkład
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowGeoOverlayGroup(!showGeoOverlayGroup)}
            title="Włącz / wyłącz podkłady geodezyjne naraz (GESUT, BDOT10k)"
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div className={`project-toggle-switch ${showGeoOverlayGroup ? 'active active-indigo' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>
        </div>

        {showGeoOverlayGroup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
            {/* A. Sieci uzbrojenia terenu GESUT (KIUT) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setShowKiutLayer(!showKiutLayer)}
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
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: showKiutLayer ? 'var(--accent-lock)' : 'var(--text-muted)',
                      boxShadow: showKiutLayer ? '0 0 6px rgba(251, 191, 36, 0.6)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Uzbrojenie GESUT (KIUT)</span>
                  <WmsStatusIcon status={kiutStatus} />
                </div>
                <div className={`project-toggle-switch ${showKiutLayer ? 'active active-amber' : ''}`}>
                  <div className="project-toggle-dot" />
                </div>
              </button>
            </div>

            {/* B. Obiekty topograficzne BDOT10k */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <button
                type="button"
                onClick={() => setShowBdotLayer(!showBdotLayer)}
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
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: showBdotLayer ? 'var(--accent-emerald)' : 'var(--text-muted)',
                      boxShadow: showBdotLayer ? '0 0 6px rgba(52, 211, 153, 0.6)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Topografia BDOT10k</span>
                  <WmsStatusIcon status={bdotStatus} />
                </div>
                <div className={`project-toggle-switch ${showBdotLayer ? 'active active-emerald' : ''}`}>
                  <div className="project-toggle-dot" />
                </div>
              </button>
            </div>

            {/* Wspólna kontrolka: Krycie dla grupy Podkład */}
            {(showKiutLayer || showBdotLayer) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                  <span>Krycie podkładu:</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(geoOverlayOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={geoOverlayOpacity}
                  onChange={(e) => setGeoOverlayOpacity(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-indigo)', cursor: 'pointer' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 8. Plany (PRO) — MPZP, Strefy MPZP, NMT, Overture, Pokrycie terenu */}
      <div className={`project-toggle-card ${showPlansOverlayGroup ? 'active-cyan' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Map size={14} color="var(--accent-cyan)" />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Plany
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowPlansOverlayGroup(!showPlansOverlayGroup)}
            title="Włącz / wyłącz wszystkie warstwy planistyczne i przestrzenne"
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div className={`project-toggle-switch ${showPlansOverlayGroup ? 'active active-cyan' : ''}`}>
              <div className="project-toggle-dot" />
            </div>
          </button>
        </div>

        {showPlansOverlayGroup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
            {/* A. Miejscowe plany MPZP (KIMPZP) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setShowMpzpLayer(!showMpzpLayer)}
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
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: showMpzpLayer ? 'var(--accent-indigo)' : 'var(--text-muted)',
                      boxShadow: showMpzpLayer ? '0 0 6px rgba(129, 140, 248, 0.6)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Plany miejscowe (MPZP)</span>
                  <WmsStatusIcon status={mpzpStatus} />
                </div>
                <div className={`project-toggle-switch ${showMpzpLayer ? 'active active-indigo' : ''}`}>
                  <div className="project-toggle-dot" />
                </div>
              </button>
              {showMpzpLayer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                    <span>Krycie:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(mpzpOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={mpzpOpacity}
                    onChange={(e) => setMpzpOpacity(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-indigo)', cursor: 'pointer' }}
                  />
                </div>
              )}
            </div>

            {/* B. Strefy i linie MPZP (wektor) */}
            <div
              style={{ opacity: isMpzpZonesAvailableHere ? 1 : 0.45 }}
              title={isMpzpZonesAvailableHere ? undefined : 'Dostępne dla wybranych miast (Warszawa, Kraków, Wrocław, Poznań, Gdynia)'}
            >
              <SimpleLayerToggle
                label={
                  mpzpZonesLoading
                    ? 'Plany MPZP — wektor (wczytywanie…)'
                    : `Plany MPZP — wektor (${mpzpCityName})`
                }
                active={showMpzpZonesLayer}
                dotColorVar="var(--accent-blue)"
                onToggle={isMpzpZonesAvailableHere ? toggleMpzpZonesLayer : () => {}}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
