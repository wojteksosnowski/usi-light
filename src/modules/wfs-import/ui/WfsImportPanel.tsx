import React, { useState, useCallback } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import { useSolarAnalysisStore } from '../../../store';
import { useSceneStore } from '../../../store';
import { useWfsStore } from '../store/useWfsStore';
import { AddressSearch } from './AddressSearch';
import { ImportStatus } from './ImportStatus';
import { GeocodingResult, latLonToBbox } from '../services/geocoding';
import {
  fetchWarsawBuildings,
  fetchWarsawParcels,
  fetchWarsawTrees,
} from '../services/wfsWarsawClient';
import {
  importBuildingsFromGeoJson,
  importParcelsFromGeoJson,
  importTrees,
} from '../services/geoJsonImporter';
import { detectCoordinateSystem } from '../../../utils/geoTransform';

const RADIUS_OPTIONS = [100, 200, 500];
const WARSAW_BBOX = [20.85, 52.09, 21.27, 52.37];

function isInWarsaw(lat: number, lon: number): boolean {
  return lon >= WARSAW_BBOX[0] && lon <= WARSAW_BBOX[2]
    && lat >= WARSAW_BBOX[1] && lat <= WARSAW_BBOX[3];
}

export const WfsImportPanel: React.FC = () => {
  const settings = useSolarAnalysisStore((s) => s.settings);
  const addBuilding = useSceneStore((s) => s.addBuilding);

  const status = useWfsStore((s) => s.status);
  const setStatus = useWfsStore((s) => s.setStatus);
  const setTrees = useWfsStore((s) => s.setTrees);
  const setShowTreesLayer = useWfsStore((s) => s.setShowTreesLayer);
  const setShowTerrainLayer = useWfsStore((s) => s.setShowTerrainLayer);
  const setShowEgibLayer = useWfsStore((s) => s.setShowEgibLayer);
  const showTerrainLayer = useWfsStore((s) => s.showTerrainLayer);
  const showTreesLayer = useWfsStore((s) => s.showTreesLayer);
  const showEgibLayer = useWfsStore((s) => s.showEgibLayer);
  const options = useWfsStore((s) => s.options);
  const setOptions = useWfsStore((s) => s.setOptions);
  const setLastImportBbox = useWfsStore((s) => s.setLastImportBbox);

  const [radius, setRadius] = useState(200);
  const [selectedLocation, setSelectedLocation] = useState<GeocodingResult | null>(null);

  const handleLocationSelect = useCallback((result: GeocodingResult) => {
    setSelectedLocation(result);
  }, []);

  const handleFetch = useCallback(async () => {
    if (!selectedLocation) return;

    setStatus({ isFetching: true, error: null, buildingsCount: 0, parcelsCount: 0, treesCount: 0 });

    try {
      const { lat, lon } = selectedLocation;
      const bbox = latLonToBbox(lat, lon, radius);
      const isWarsaw = isInWarsaw(lat, lon);

      const projectCenter = { lat: settings.latitude, lon: settings.longitude };
      const projectCrs = detectCoordinateSystem([]);
      const sourceCrs = { crs: 'EPSG:2178' as const, description: 'PL-2000 strefa 7', isGeodetic: true, zone: 7 };

      let buildingsCount = 0;
      let parcelsCount = 0;
      let treesCount = 0;

      if (options.buildings && isWarsaw) {
        const buildingsGeoJson = await fetchWarsawBuildings(bbox);
        const result = importBuildingsFromGeoJson(buildingsGeoJson, sourceCrs, projectCrs, projectCenter);
        for (const bld of result.buildings) {
          addBuilding(bld);
        }
        buildingsCount = result.buildings.length;
      }

      if (options.parcels && isWarsaw) {
        const parcelsGeoJson = await fetchWarsawParcels(bbox);
        const result = importParcelsFromGeoJson(parcelsGeoJson, sourceCrs, projectCrs, projectCenter);
        for (const parcel of result.parcels) {
          addBuilding(parcel);
        }
        parcelsCount = result.parcels.length;
      }

      if (options.trees && isWarsaw) {
        const rawTrees = await fetchWarsawTrees(bbox);
        const trees = importTrees(rawTrees, sourceCrs, projectCrs, projectCenter);
        setTrees(trees);
        setShowTreesLayer(true);
        treesCount = trees.length;
      }

      setLastImportBbox(bbox);
      setStatus({ isFetching: false, error: null, buildingsCount, parcelsCount, treesCount });
    } catch (err) {
      setStatus({
        isFetching: false,
        error: err instanceof Error ? err.message : 'Błąd pobierania danych',
        buildingsCount: 0,
        parcelsCount: 0,
        treesCount: 0,
      });
    }
  }, [selectedLocation, radius, options, settings, addBuilding, setStatus, setTrees, setShowTreesLayer, setLastImportBbox]);

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
        Dane z map
      </div>

      <AddressSearch onSelect={handleLocationSelect} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Promień:</span>
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          style={{
            flex: 1,
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '6px',
            padding: '6px 8px',
            fontSize: '12px',
            color: '#e2e8f0',
          }}
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>{r} m</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Checkbox label="Budynki (WFS)" checked={options.buildings}
          onChange={(v) => setOptions({ buildings: v })} />
        <Checkbox label="Działki (WFS)" checked={options.parcels}
          onChange={(v) => setOptions({ parcels: v })} />
        <Checkbox label="Drzewa (WFS)" checked={options.trees}
          onChange={(v) => setOptions({ trees: v })} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(148,163,184,0.15)', paddingTop: '8px' }}>
        <span style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>Podkłady mapowe:</span>
        <ToggleRow label="Cieniowanie terenu (NMT)" active={showTerrainLayer}
          onToggle={() => setShowTerrainLayer(!showTerrainLayer)} />
        <ToggleRow label="EGiB — działki i budynki" active={showEgibLayer}
          onToggle={() => setShowEgibLayer(!showEgibLayer)} />
        <ToggleRow label="Drzewa (wizualizacja)" active={showTreesLayer}
          onToggle={() => setShowTreesLayer(!showTreesLayer)} />
      </div>

      <button
        onClick={handleFetch}
        disabled={!selectedLocation || status.isFetching}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '8px 12px',
          borderRadius: '6px',
          border: 'none',
          background: selectedLocation && !status.isFetching
            ? 'linear-gradient(135deg, #0ea5e9, #38bdf8)'
            : 'rgba(51, 65, 85, 0.5)',
          color: selectedLocation ? '#fff' : '#64748b',
          fontSize: '12px',
          fontWeight: 600,
          cursor: selectedLocation && !status.isFetching ? 'pointer' : 'not-allowed',
        }}
      >
        <Download size={14} />
        Pobierz dane
      </button>

      <ImportStatus status={status} />
    </div>
  );
};

const Checkbox: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '12px',
      color: '#cbd5e1',
      cursor: 'pointer',
    }}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ accentColor: '#38bdf8' }}
    />
    {label}
  </label>
);

const ToggleRow: React.FC<{
  label: string;
  active: boolean;
  onToggle: () => void;
}> = ({ label, active, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 0',
      background: 'transparent',
      border: 'none',
      color: active ? '#38bdf8' : '#64748b',
      fontSize: '11px',
      cursor: 'pointer',
      textAlign: 'left',
    }}
  >
    {active ? <Eye size={12} /> : <EyeOff size={12} />}
    {label}
  </button>
);
