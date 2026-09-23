import React, { useState, useCallback } from 'react';
import { Download, Eye, EyeOff } from 'lucide-react';
import { useSolarAnalysisStore } from '../../../store';
import { useSceneStore } from '../../../store';
import { useWfsStore } from '../store/useWfsStore';
import { AddressSearch } from './AddressSearch';
import { ImportStatus } from './ImportStatus';
import { GeocodingResult, latLonToBbox } from '../services/shared/geocoding';
import { fetchWarsawTrees, EPSG_2178 } from '../services/city/wfsWarsawClient';
import { findCitySource, fetchBuildingsWithFallback } from '../services/city/citySources';
import {
  importBuildingsFromGeoJson,
  importParcelsFromGeoJson,
  importTrees,
} from '../services/shared/geoJsonImporter';
import { fetchOsmBuildings } from '../services/osm/osmBuildingsClient';
import { detectCoordinateSystem } from '../../../utils/geoTransform';
import { BuildingLoop } from '../../../types/geometry';

import { useOsmLanduseStore } from '../store/useOsmLanduseStore';

const RADIUS_OPTIONS = [100, 200, 300, 500];

export const WfsImportPanel: React.FC = () => {
  const settings = useSolarAnalysisStore((s) => s.settings);
  const addBuilding = useSceneStore((s) => s.addBuilding);

  const status = useWfsStore((s) => s.status);
  const setStatus = useWfsStore((s) => s.setStatus);
  const setTrees = useWfsStore((s) => s.setTrees);
  const setShowTreesLayer = useWfsStore((s) => s.setShowTreesLayer);
  const showTreesLayer = useWfsStore((s) => s.showTreesLayer);
  const options = useWfsStore((s) => s.options);
  const setOptions = useWfsStore((s) => s.setOptions);
  const setLastImportBbox = useWfsStore((s) => s.setLastImportBbox);
  const buildingSource = useWfsStore((s) => s.buildingSource);
  const setBuildingSource = useWfsStore((s) => s.setBuildingSource);
  const isParcelsFetchCovered = useWfsStore((s) => s.isParcelsFetchCovered);
  const isBuildingsFetchCovered = useWfsStore((s) => s.isBuildingsFetchCovered);
  const setParcelsFetchCoverage = useWfsStore((s) => s.setParcelsFetchCoverage);
  const setBuildingsFetchCoverage = useWfsStore((s) => s.setBuildingsFetchCoverage);

  const fetchOsmLanduseAction = useOsmLanduseStore((s) => s.fetchLanduse);
  const osmFeatures = useOsmLanduseStore((s) => s.features);
  const showOsmLanduseGroup = useOsmLanduseStore((s) => s.showOsmLanduseGroup);
  const setShowOsmLanduseGroup = useOsmLanduseStore((s) => s.setShowOsmLanduseGroup);

  const [radius, setRadius] = useState(200);
  const [selectedLocation, setSelectedLocation] = useState<GeocodingResult | null>(null);
  const [fetchOsmLanduseOption, setFetchOsmLanduseOption] = useState(true);

  const handleLocationSelect = useCallback((result: GeocodingResult) => {
    setSelectedLocation(result);
  }, []);

  const handleFetch = useCallback(async () => {
    if (!selectedLocation) return;

    setStatus({ isFetching: true, stage: 'idle', progressDone: 0, progressTotal: 0, error: null, info: null, buildingsCount: 0, parcelsCount: 0, treesCount: 0 });

    try {
      const { lat, lon } = selectedLocation;
      const bbox = latLonToBbox(lat, lon, radius);
      const citySource = findCitySource(lat, lon);

      const projectCenter = { lat: settings.latitude, lon: settings.longitude };
      const projectCrs = detectCoordinateSystem([]);

      let buildingsCount = 0;
      let parcelsCount = 0;
      let treesCount = 0;

      const buildingsSourceKeyGuess = buildingSource === 'geoportal' ? `wfs:${citySource?.name || 'egib'}` : 'osm';
      if (options.buildings) {
        if (isBuildingsFetchCovered(projectCenter, radius, buildingsSourceKeyGuess)) {
          // Ten sam obszar i źródło zostały już pobrane — budynki są już w scenie, pomijamy zapytanie.
          buildingsCount = 0;
        } else {
          setStatus({ stage: 'buildings' });
          let finalBuildings: BuildingLoop[] = [];
          let buildingsSourceKey = buildingsSourceKeyGuess;

          if (buildingSource === 'geoportal') {
            try {
              const fetched = await fetchBuildingsWithFallback(citySource, bbox);
              if (fetched) {
                const res = importBuildingsFromGeoJson(fetched.geojson, fetched.source.sourceCrs, projectCrs, projectCenter);
                finalBuildings = res.buildings;
                buildingsSourceKey = `wfs:${fetched.source.name}`;
              }
            } catch (err) {
              console.warn('[WFS Import] Nie udało się pobrać budynków z Geoportalu (w tym z fallbacku krajowego):', err);
            }
          } else {
            try {
              finalBuildings = await fetchOsmBuildings(bbox, projectCenter, projectCrs, radius, (p) => {
                setStatus((s) => ({ ...s, info: p.message }));
              });
            } catch (osmErr) {
              console.warn('[WFS Import] Nie udało się pobrać budynków z OSM:', osmErr);
            }
          }

          // Odrzuć obiekty, które już są w scenie (ten sam stabilny `id` z WFS/OSM) — bez tego
          // dwie zachodzące się przestrzennie synchronizacje (przesunięty środek) dublowałyby
          // te same realne budynki, bo `addBuilding` tylko dokleja do tablicy bez deduplikacji.
          const existingBuildingIds = new Set(useSceneStore.getState().buildings.map((b) => b.id));
          const newBuildings = finalBuildings.filter((b) => !existingBuildingIds.has(b.id));
          for (const bld of newBuildings) {
            addBuilding(bld);
          }
          buildingsCount = newBuildings.length;
          setBuildingsFetchCoverage({ center: projectCenter, radius, sourceKey: buildingsSourceKey });
        }
      }

      const parcelsSourceKey = citySource ? `wfs:${citySource.name}` : 'uldk';
      if (options.parcels && citySource?.fetchParcels) {
        if (isParcelsFetchCovered(projectCenter, radius, parcelsSourceKey)) {
          parcelsCount = 0;
        } else {
          setStatus({ stage: 'parcels' });
          try {
            const parcelsGeoJson = await citySource.fetchParcels(bbox);
            const result = importParcelsFromGeoJson(parcelsGeoJson, citySource.sourceCrs, projectCrs, projectCenter);
            const existingParcelIds = new Set(useSceneStore.getState().buildings.map((b) => b.id));
            const newParcels = result.parcels.filter((p) => !existingParcelIds.has(p.id));
            for (const parcel of newParcels) {
              addBuilding(parcel);
            }
            parcelsCount = newParcels.length;
            setParcelsFetchCoverage({ center: projectCenter, radius, sourceKey: parcelsSourceKey });
          } catch (err) {
            console.warn(`[WFS Import] Nie udało się pobrać działek z ${citySource.name}:`, err);
          }
        }
      }

      if (options.trees && citySource?.name === 'Warszawa') {
        setStatus({ stage: 'trees' });
        const rawTrees = await fetchWarsawTrees(bbox);
        const trees = importTrees(rawTrees, EPSG_2178, projectCrs, projectCenter);
        setTrees(trees);
        setShowTreesLayer(true);
        treesCount = trees.length;
      }

      if (fetchOsmLanduseOption) {
        try {
          await fetchOsmLanduseAction(bbox, projectCenter, projectCrs);
          setShowOsmLanduseGroup(true);
        } catch (osmErr) {
          console.warn('[WFS Import] Błąd pobierania OSM Landuse:', osmErr);
        }
      }

      setLastImportBbox(bbox);

      setStatus({ isFetching: false, stage: 'done', error: null, info: null, buildingsCount, parcelsCount, treesCount });
    } catch (err) {
      setStatus({
        isFetching: false,
        stage: 'idle',
        error: err instanceof Error ? err.message : 'Błąd pobierania danych',
        info: null,
        buildingsCount: 0,
        parcelsCount: 0,
        treesCount: 0,
      });
    }
  }, [selectedLocation, radius, options, settings, buildingSource, addBuilding, setStatus, setTrees, setShowTreesLayer, setLastImportBbox, fetchOsmLanduseOption, fetchOsmLanduseAction, setShowOsmLanduseGroup, isParcelsFetchCovered, isBuildingsFetchCovered, setParcelsFetchCoverage, setBuildingsFetchCoverage]);

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
        Dane z map
      </div>

      <AddressSearch onSelect={handleLocationSelect} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Promień:</span>
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '6px 8px',
            fontSize: '12px',
            color: 'var(--text-primary)',
          }}
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>{r} m</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Źródło budynków:</span>
        <select
          value={buildingSource}
          onChange={(e) => setBuildingSource(e.target.value as 'geoportal' | 'osm')}
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '6px 8px',
            fontSize: '12px',
            color: 'var(--text-primary)',
          }}
        >
          <option value="geoportal">Geoportal</option>
          <option value="osm">OSM</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Checkbox label="Budynki (WFS)" checked={options.buildings}
          onChange={(v) => setOptions({ buildings: v })} />
        <Checkbox label="Działki (WFS)" checked={options.parcels}
          onChange={(v) => setOptions({ parcels: v })} />
        <Checkbox label="Drzewa (WFS)" checked={options.trees}
          onChange={(v) => setOptions({ trees: v })} />
        <Checkbox label="Zagospodarowanie (OSM Landuse)" checked={fetchOsmLanduseOption}
          onChange={(v) => setFetchOsmLanduseOption(v)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Podkłady mapowe:</span>
        <ToggleRow label="Drzewa (wizualizacja)" active={showTreesLayer}
          onToggle={() => setShowTreesLayer(!showTreesLayer)} />
        {osmFeatures.length > 0 && (
          <ToggleRow label={`Zagospodarowanie OSM (${osmFeatures.length})`} active={showOsmLanduseGroup}
            onToggle={() => setShowOsmLanduseGroup(!showOsmLanduseGroup)} />
        )}
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
          borderRadius: '8px',
          border: 'none',
          background: selectedLocation && !status.isFetching
            ? 'linear-gradient(135deg, var(--accent-indigo), var(--accent-blue))'
            : 'var(--bg-input)',
          color: selectedLocation ? 'var(--text-primary)' : 'var(--text-muted)',
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
      color: 'var(--text-primary)',
      cursor: 'pointer',
    }}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ accentColor: 'var(--accent-blue)' }}
    />
    {label}
  </label>
);

const ToggleRow: React.FC<{
  label: string;
  active: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}> = ({ label, active, onToggle, icon }) => (
  <button
    onClick={onToggle}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 0',
      background: 'transparent',
      border: 'none',
      color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
      fontSize: '11px',
      cursor: 'pointer',
      textAlign: 'left',
    }}
  >
    {active ? <Eye size={12} /> : <EyeOff size={12} />}
    {label}
    {icon}
  </button>
);
