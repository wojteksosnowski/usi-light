import React from 'react';
import { Trees, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useOsmLanduseStore } from '../../../modules/wfs-import/store/useOsmLanduseStore';
import { useLicenseStore } from '../../../store';
import { useProjectGeoSync } from './hooks/useProjectGeoSync';
import { OsmLanduseLayerRow } from '../layers-and-objects/layers/OsmLanduseLayerRow';
import { OsmLanduseProperties } from '../layers-and-objects/layers/OsmLanduseProperties';

/**
 * Kafel 'Teren' w grupie Analizy.
 * Dedykowany kontroler danych przestrzennych OpenStreetMap (OSM):
 * zagospodarowanie terenu, zieleń, zbiorniki wodne, drogi, kolej, ścieżki oraz drzewa.
 * Posiada w pełni zautomatyzowane buforowanie w pamięci RAM.
 */
export const ProjectTerrainCard: React.FC = () => {
  const isPro = useLicenseStore((s) => s.isPro);

  const layers = useOsmLanduseStore((s) => s.layers);
  const features = useOsmLanduseStore((s) => s.features);
  const trees = useOsmLanduseStore((s) => s.trees);
  const selectedLayerId = useOsmLanduseStore((s) => s.selectedLayerId);
  const showOsmLanduseGroup = useOsmLanduseStore((s) => s.showOsmLanduseGroup);
  const setSelectedLayerId = useOsmLanduseStore((s) => s.setSelectedLayerId);
  const toggleLayerVisibility = useOsmLanduseStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useOsmLanduseStore((s) => s.toggleLayerLock);
  const updateLayerConfig = useOsmLanduseStore((s) => s.updateLayerConfig);

  const {
    osmLanduseLoading,
    toggleOsmLanduseLayer,
    ensureOsmLanduseLoaded,
    projectRadius,
  } = useProjectGeoSync();

  if (!isPro) {
    return null;
  }

  const totalItemsCount = features.length + trees.length;
  const hasFeatures = totalItemsCount > 0;
  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const selectedFeatures = features.filter((f) => f.layerId === selectedLayerId);
  const isTreesLayerSelected = selectedLayerId === 'osm_trees';
  const selectedTotalArea = selectedFeatures.reduce((acc, f) => acc + (f.areaM2 || 0), 0);
  const selectedTotalLength = selectedFeatures.reduce((acc, f) => acc + (f.lengthM || 0), 0);
  const treesMonumentsCount = trees.filter((t) => t.isMonument).length;

  return (
    <div className={`project-toggle-card ${showOsmLanduseGroup ? 'active-emerald' : ''}`}>
      {/* Nagłówek i przełącznik główny (Master Switch) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trees size={14} color="var(--accent-emerald)" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Teren (OSM)
          </span>
          {hasFeatures && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--accent-emerald)',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              {totalItemsCount}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleOsmLanduseLayer}
          title={
            showOsmLanduseGroup
              ? 'Wyłącz widoczność danych terenu OSM'
              : 'Włącz i pobierz dane terenu OSM'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <div className={`project-toggle-switch ${showOsmLanduseGroup ? 'active active-emerald' : ''}`}>
            <div className="project-toggle-dot" />
          </div>
        </button>
      </div>

      {/* Stan ładowania w tle */}
      {osmLanduseLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10.5px',
            color: 'var(--accent-emerald)',
            padding: '4px 0',
          }}
        >
          <RefreshCw size={12} className="spin" />
          <span>Wczytywanie danych terenu OSM (promień {projectRadius}m)…</span>
        </div>
      )}

      {/* Zawartość kafla po włączeniu */}
      {showOsmLanduseGroup && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingTop: '6px',
            borderTop: '1px solid rgba(51, 65, 85, 0.4)',
          }}
        >
          {!hasFeatures && !osmLanduseLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 0' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Brak danych w buforze dla tego rejonu.
              </div>
              <button
                type="button"
                onClick={ensureOsmLanduseLoaded}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--accent-emerald)',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={11} />
                <span>Załaduj ponownie z OSM</span>
              </button>
            </div>
          )}

          {hasFeatures && (
            <>
              {/* Lista podwarstw */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {layers.map((layer) => {
                  const count =
                    layer.id === 'osm_trees'
                      ? trees.length
                      : features.filter((f) => f.layerId === layer.id).length;
                  if (count === 0) return null; // Ukryj puste kategorie w tym rejonie

                  return (
                    <OsmLanduseLayerRow
                      key={layer.id}
                      layer={layer}
                      count={count}
                      isSelected={selectedLayerId === layer.id}
                      onSelect={setSelectedLayerId}
                      onToggleVisibility={toggleLayerVisibility}
                      onToggleLock={toggleLayerLock}
                    />
                  );
                })}
              </div>

              {/* Inspektor właściwości wybranej podwarstwy */}
              {selectedLayer && (selectedFeatures.length > 0 || isTreesLayerSelected) && (
                <OsmLanduseProperties
                  layer={selectedLayer}
                  featuresCount={isTreesLayerSelected ? trees.length : selectedFeatures.length}
                  totalAreaM2={selectedTotalArea}
                  totalLengthM={selectedTotalLength}
                  monumentsCount={isTreesLayerSelected ? treesMonumentsCount : 0}
                  onUpdateConfig={updateLayerConfig}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
