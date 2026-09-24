import React from 'react';
import {
  MapPin,
  Link,
  X,
  Lock,
  Unlock,
  Crosshair,
  ExternalLink,
  RefreshCw,
  Download,
} from 'lucide-react';
import { POLISH_CITIES } from '../../../store';
import { useProjectGeoSync } from './hooks/useProjectGeoSync';

export const ProjectLocationCard: React.FC = () => {
  const {
    settings,
    selectedCity,
    setSelectedCity,
    setProjectName,
    mapsInput,
    mapsParseError,
    projectRadius,
    setProjectRadius,
    isProjectCenterLocked,
    setIsProjectCenterLocked,
    buildingSource,
    setBuildingSource,
    status,
    syncFeedback,
    isPro,
    formatWfsProgress,
    WFS_IMPORT_CONTINUE_HINT,
    updateProjectCenter,
    handleMapsInputChange,
    handleSyncParcels,
    handleSyncBuildings,
    triggerFit,
  } = useProjectGeoSync();

  const isFetchingParcels = status.isFetching && status.stage === 'parcels';
  const isFetchingBuildings = status.isFetching && status.stage === 'buildings';

  return (
    <div className="ui-card">
      <div className="ui-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={14} color="var(--accent-amber)" />
          <span>Środek projektu</span>
        </div>
        <button
          type="button"
          onClick={() => setIsProjectCenterLocked(!isProjectCenterLocked)}
          className={`project-lock-btn ${isProjectCenterLocked ? 'locked' : 'unlocked'}`}
          title={isProjectCenterLocked ? 'Środek projektu zablokowany (kliknij, aby odblokować edycję)' : 'Środek projektu odblokowany (kliknij, aby zablokować)'}
        >
          {isProjectCenterLocked ? <Lock size={11} /> : <Unlock size={11} />}
          <span>{isProjectCenterLocked ? 'Zablokowany' : 'Odblokowany'}</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div
          className={`project-location-bar ${mapsParseError ? 'error' : ''} ${isProjectCenterLocked ? 'locked' : ''}`}
        >
          <Link
            size={13}
            color={mapsParseError ? 'var(--accent-rose)' : 'var(--accent-amber)'}
            style={{ flexShrink: 0 }}
          />
          <input
            type="text"
            value={mapsInput}
            disabled={isProjectCenterLocked}
            onChange={(e) => handleMapsInputChange(e.target.value)}
            placeholder="Wklej link Google Maps / współrzędne..."
            className="project-location-input"
            title={isProjectCenterLocked ? 'Odblokuj kłódkę, aby zmienić środek projektu' : 'Wklej link z Google Maps lub współrzędne (np. 52.23, 21.01)'}
          />
          {mapsInput && !isProjectCenterLocked && (
            <button
              type="button"
              onClick={() => handleMapsInputChange('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Wyczyść"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {mapsParseError && (
          <div style={{ fontSize: '10px', color: 'var(--accent-rose)', paddingLeft: '4px' }}>
            Nie rozpoznano współrzędnych. Wklej link Google Maps lub np. 52.23, 21.01
          </div>
        )}

        {/* Quick City Presets */}
        <div
          className="project-grid-presets"
          style={{
            gridTemplateColumns: 'repeat(5, 1fr)',
            opacity: isProjectCenterLocked ? 0.7 : 1,
            pointerEvents: isProjectCenterLocked ? 'none' : 'auto',
          }}
        >
          {POLISH_CITIES.map((city) => {
            const isActive = selectedCity === city.name;
            return (
              <button
                key={city.name}
                type="button"
                onClick={() => {
                  setSelectedCity(city.name);
                  setProjectName(city.name);
                  handleMapsInputChange('');
                  updateProjectCenter(city.lat, city.lon);
                }}
                className={`project-preset-btn ${isActive ? 'active-amber' : ''}`}
                title={`${city.name} (${city.lat}° N, ${city.lon}° E)`}
              >
                {city.name}
              </button>
            );
          })}
        </div>

        {/* Coordinates info pill, Center Action Button & Google Maps External Link */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <div className="project-coords-pill">
            <span>Punkt bazowy:</span>
            <span style={{ color: 'var(--accent-lock)', fontWeight: 600, fontFamily: 'monospace' }}>
              {settings.latitude.toFixed(4)}° N, {settings.longitude.toFixed(4)}° E
            </span>
          </div>
          <button
            type="button"
            onClick={() => triggerFit({ ignoreSelection: true })}
            className="project-fit-btn"
            title="Centruj i dopasuj widok na środku projektu (niezależnie od zaznaczenia)"
          >
            <Crosshair size={13} />
          </button>
          <a
            href={`https://www.google.com/maps?q=${settings.latitude},${settings.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="project-map-link-btn"
            title="Otwórz lokalizację projektu w Google Maps (nowa zakładka)"
          >
            <ExternalLink size={13} />
          </a>
        </div>

        {/* Promień zasięgu projektu */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '2px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Zasięg projektu:</span>
          <div
            className="project-grid-presets"
            style={{
              gridTemplateColumns: 'repeat(4, 1fr)',
              padding: '3px',
              borderRadius: '8px',
            }}
          >
            {([100, 200, 300, 500] as const).map((r) => {
              const isActive = projectRadius === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setProjectRadius(r)}
                  className={`project-preset-btn ${isActive ? 'active-cyan' : ''}`}
                  style={{ padding: '3px 6px', fontSize: '10px' }}
                  title={`Obszar analizy i synchronizacji: okrąg o promieniu ${r} m`}
                >
                  {r} m
                </button>
              );
            })}
          </div>
        </div>

        {/* Źródło budynków: Geoportal / OSM */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Źródło budynków:
          </span>
          <div
            className="project-grid-presets"
            style={{
              gridTemplateColumns: 'repeat(2, 1fr)',
              padding: '3px',
              borderRadius: '8px',
            }}
          >
            {([
              { id: 'geoportal' as const, label: 'Geoportal' },
              { id: 'osm' as const, label: 'OSM' },
            ]).map((opt) => {
              const isActive = buildingSource === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBuildingSource(opt.id)}
                  className={`project-preset-btn ${isActive ? 'active-cyan' : ''}`}
                  style={{ padding: '3px 6px', fontSize: '10px' }}
                  title={
                    opt.id === 'geoportal'
                      ? 'Pobierz budynki z geoportalu miejskiego (WFS/EGiB)'
                      : 'Pobierz budynki z OpenStreetMap'
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Przyciski Pobierz Działki i Pobierz Budynki (Dostępne w PRO, wyszarzone we Free) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '2px' }}>
          <button
            type="button"
            onClick={handleSyncParcels}
            disabled={status.isFetching}
            className={`project-sync-btn ${!isPro ? 'is-free' : ''}`}
            title={
              isPro
                ? 'Pobierz i zsynchronizuj wektorowe działki ewidencyjne (ULDK / Geoportal miejski)'
                : 'Pobieranie działek ewidencyjnych (wymagana licencja PRO — kliknij, aby odblokować)'
            }
          >
            {isFetchingParcels ? (
              <RefreshCw size={13} className="spin" />
            ) : (
              <Download size={13} />
            )}
            <span>{isFetchingParcels ? formatWfsProgress(status) : 'Działki'}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncBuildings}
            disabled={status.isFetching}
            className={`project-sync-btn ${!isPro ? 'is-free' : ''}`}
            title={
              isPro
                ? `Pobierz i zsynchronizuj budynki (${buildingSource === 'geoportal' ? 'Geoportal WFS/EGiB' : 'OpenStreetMap'})`
                : 'Pobieranie budynków (wymagana licencja PRO — kliknij, aby odblokować)'
            }
          >
            {isFetchingBuildings ? (
              <RefreshCw size={13} className="spin" />
            ) : (
              <Download size={13} />
            )}
            <span>{isFetchingBuildings ? formatWfsProgress(status) : 'Budynki'}</span>
          </button>
        </div>

        {status.isFetching && (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
            {WFS_IMPORT_CONTINUE_HINT}
          </div>
        )}

        {syncFeedback && (
          <div style={{ fontSize: '10.5px', color: 'var(--accent-emerald-light)', textAlign: 'center', fontWeight: 600 }}>
            {syncFeedback}
          </div>
        )}
        {status.error && (
          <div style={{ fontSize: '10.5px', color: 'var(--accent-rose)', textAlign: 'center' }}>
            {status.error}
          </div>
        )}
      </div>
    </div>
  );
};
