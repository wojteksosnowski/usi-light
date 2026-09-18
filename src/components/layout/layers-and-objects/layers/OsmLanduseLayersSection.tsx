import React from 'react';
import { MapPin, Eye, EyeOff, Download, RefreshCw } from 'lucide-react';
import { useOsmLanduseStore } from '@/modules/wfs-import/store/useOsmLanduseStore';
import { useProjectGeoSync } from '@/components/layout/project/hooks/useProjectGeoSync';
import { OsmLanduseLayerRow } from './OsmLanduseLayerRow';
import { OsmLanduseProperties } from './OsmLanduseProperties';

export const OsmLanduseLayersSection: React.FC = () => {
  const layers = useOsmLanduseStore((s) => s.layers);
  const features = useOsmLanduseStore((s) => s.features);
  const trees = useOsmLanduseStore((s) => s.trees);
  const selectedLayerId = useOsmLanduseStore((s) => s.selectedLayerId);
  const showOsmLanduseGroup = useOsmLanduseStore((s) => s.showOsmLanduseGroup);
  const setShowOsmLanduseGroup = useOsmLanduseStore((s) => s.setShowOsmLanduseGroup);
  const setSelectedLayerId = useOsmLanduseStore((s) => s.setSelectedLayerId);
  const toggleLayerVisibility = useOsmLanduseStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useOsmLanduseStore((s) => s.toggleLayerLock);
  const updateLayerConfig = useOsmLanduseStore((s) => s.updateLayerConfig);

  const { ensureOsmLanduseLoaded, osmLanduseLoading, projectRadius } = useProjectGeoSync();

  const totalItemsCount = features.length + trees.length;
  const hasFeatures = totalItemsCount > 0;
  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const selectedFeatures = features.filter((f) => f.layerId === selectedLayerId);
  const isTreesLayerSelected = selectedLayerId === 'osm_trees';
  const selectedTotalArea = selectedFeatures.reduce((acc, f) => acc + (f.areaM2 || 0), 0);
  const selectedTotalLength = selectedFeatures.reduce((acc, f) => acc + (f.lengthM || 0), 0);
  const treesMonumentsCount = trees.filter((t) => t.isMonument).length;

  return (
    <div className="ui-card">
      <div className="ui-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Zagospodarowanie, drogi i zieleń OSM {hasFeatures ? `(${totalItemsCount})` : ''}</span>
          <MapPin size={14} color="var(--accent-emerald)" />
        </div>
        {hasFeatures && (
          <button
            type="button"
            onClick={() => setShowOsmLanduseGroup(!showOsmLanduseGroup)}
            title={showOsmLanduseGroup ? 'Ukryj wszystkie warstwy OSM' : 'Pokaż warstwy OSM'}
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: showOsmLanduseGroup ? 'rgba(99, 102, 241, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: showOsmLanduseGroup ? 'var(--accent-blue)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
            }}
          >
            {showOsmLanduseGroup ? <Eye size={12} /> : <EyeOff size={12} />}
            {showOsmLanduseGroup ? 'Włączone' : 'Ukryte'}
          </button>
        )}
      </div>

      {!hasFeatures ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            Pobierz dane zagospodarowania (woda, zieleń, usługi), sieć dróg, ścieżek, kolei, parkingów oraz drzewa z OpenStreetMap dla promienia {projectRadius} m.
          </div>
          <button
            type="button"
            onClick={ensureOsmLanduseLoaded}
            disabled={osmLanduseLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: 'rgba(16, 185, 129, 0.12)',
              color: 'var(--accent-emerald)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: osmLanduseLoading ? 'wait' : 'pointer',
            }}
          >
            {osmLanduseLoading ? <RefreshCw size={12} className="spin" /> : <Download size={12} />}
            <span>{osmLanduseLoading ? 'Wczytywanie z OSM…' : 'Pobierz dane OSM'}</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {layers.map((layer) => {
            const count =
              layer.id === 'osm_trees'
                ? trees.length
                : features.filter((f) => f.layerId === layer.id).length;
            if (count === 0) return null; // Ukryj puste kategorie w danym rejonie

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
        </div>
      )}
    </div>
  );
};
