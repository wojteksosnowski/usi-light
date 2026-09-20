import React from 'react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useCadToolStore,
  useUiStore,
  useLicenseStore,
  POLISH_CITIES,
} from '../../../../store';
import {
  useWfsStore,
  ProjectRadius,
  formatWfsProgress,
  WFS_IMPORT_CONTINUE_HINT,
} from '../../../../modules/wfs-import/store/useWfsStore';
import { fetchParcelsInRadius } from '../../../../modules/wfs-import/services/uldkClient';
import { findCitySource, fetchBuildingsWithFallback } from '../../../../modules/wfs-import/services/citySources';
import {
  importBuildingsFromGeoJson,
  importParcelsFromGeoJson,
  importOverturePolygons,
  importMpzpZonesFromGeoJson,
  importMpzpLinesFromGeoJson,
  importLandCoverFromGeoJson,
} from '../../../../modules/wfs-import/services/geoJsonImporter';
import { fetchOvertureBase } from '../../../../modules/wfs-import/services/overtureMapsApiClient';
import { findMpzpSource } from '../../../../modules/wfs-import/services/mpzpSources';
import { fetchLandCoverUnits } from '../../../../modules/wfs-import/services/wfsLcvClient';
import { EPSG_2180 } from '../../../../modules/wfs-import/services/wfsEgibClient';
import { analyzeBuildingHeights } from '../../../../modules/wfs-import/utils/terrainAnalyzer';
import { latLonToBbox } from '../../../../modules/wfs-import/services/geocoding';
import { detectCoordinateSystem, CrsDetectionResult, LatLon, wgs84ToCadPoint } from '../../../../utils/geoTransform';
import { translateBuildingGeometry } from '../../../../store/useSceneStore';
import { parseGoogleMapsCoordinates } from '../../../../utils/geoParser';
import { BuildingLoop } from '../../../../types/geometry';
import { fetchOsmBuildings } from '../../../../modules/wfs-import/services/osmBuildingsClient';

import { useOsmLanduseStore } from '../../../../modules/wfs-import/store/useOsmLanduseStore';

export const useProjectGeoSync = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const setBuildings = useSceneStore((s) => s.setBuildings);

  const settings = useSolarAnalysisStore((s) => s.settings);
  const setSettings = useSolarAnalysisStore((s) => s.setSettings);
  const selectedCity = useSolarAnalysisStore((s) => s.selectedCity);
  const setSelectedCity = useSolarAnalysisStore((s) => s.setSelectedCity);
  const mapsInput = useSolarAnalysisStore((s) => s.mapsInput);
  const setMapsInput = useSolarAnalysisStore((s) => s.setMapsInput);
  const mapsParseError = useSolarAnalysisStore((s) => s.mapsParseError);
  const setMapsParseError = useSolarAnalysisStore((s) => s.setMapsParseError);

  const triggerFit = useCadToolStore((s) => s.triggerFit);
  const isPro = useLicenseStore((s) => s.isPro);
  const openModal = useUiStore((s) => s.openModal);

  const projectRadius = useWfsStore((s) => s.projectRadius);
  const setProjectRadius = useWfsStore((s) => s.setProjectRadius);
  const isProjectCenterLocked = useWfsStore((s) => s.isProjectCenterLocked);
  const setIsProjectCenterLocked = useWfsStore((s) => s.setIsProjectCenterLocked);
  const buildingSource = useWfsStore((s) => s.buildingSource);
  const setBuildingSource = useWfsStore((s) => s.setBuildingSource);
  const showOvertureGreenAreas = useWfsStore((s) => s.showOvertureGreenAreas);
  const setShowOvertureGreenAreas = useWfsStore((s) => s.setShowOvertureGreenAreas);
  const showMpzpZonesLayer = useWfsStore((s) => s.showMpzpZonesLayer);
  const setShowMpzpZonesLayer = useWfsStore((s) => s.setShowMpzpZonesLayer);
  const showLandCoverLayer = useWfsStore((s) => s.showLandCoverLayer);
  const setShowLandCoverLayer = useWfsStore((s) => s.setShowLandCoverLayer);
  const status = useWfsStore((s) => s.status);
  const setStatus = useWfsStore((s) => s.setStatus);

  const showOsmLanduseGroup = useOsmLanduseStore((s) => s.showOsmLanduseGroup);
  const setShowOsmLanduseGroup = useOsmLanduseStore((s) => s.setShowOsmLanduseGroup);
  const osmFeatures = useOsmLanduseStore((s) => s.features);
  const fetchOsmLanduseAction = useOsmLanduseStore((s) => s.fetchLanduse);

  const [overtureLoading, setOvertureLoading] = React.useState(false);
  const [mpzpZonesLoading, setMpzpZonesLoading] = React.useState(false);
  const [landCoverLoading, setLandCoverLoading] = React.useState(false);
  const [osmLanduseLoading, setOsmLanduseLoading] = React.useState(false);
  const [syncFeedback, setSyncFeedback] = React.useState<string | null>(null);

  /**
   * Zmienia środek projektu (lat, lon) i jednocześnie przesuwa wszystkie wcześniej pobrane
   * warstwy wektorowe (Overture, strefy MPZP, pokrycie terenu, drzewa) o wektor delta-CAD.
   */
  const updateProjectCenter = (newLat: number, newLon: number) => {
    const oldLat = settings.latitude;
    const oldLon = settings.longitude;
    if (oldLat === newLat && oldLon === newLon) return;

    const projectCrs = detectCoordinateSystem(buildings.flatMap((b) => b.vertices || []));
    const delta = wgs84ToCadPoint({ lat: oldLat, lon: oldLon }, projectCrs, { lat: newLat, lon: newLon });
    setBuildings(buildings.map((b) => translateBuildingGeometry(b, delta.x, delta.y)));
    useWfsStore.getState().shiftVectorLayers(delta);
    useOsmLanduseStore.getState().shiftFeatures(delta);

    setSettings((prev) => ({
      ...prev,
      latitude: newLat,
      longitude: newLon,
    }));
  };

  const handleMapsInputChange = (val: string) => {
    setMapsInput(val);
    if (!val.trim()) {
      setMapsParseError(false);
      return;
    }
    const parsed = parseGoogleMapsCoordinates(val);
    if (parsed) {
      setMapsParseError(false);
      const matchingCity = POLISH_CITIES.find(
        (c) => Math.abs(c.lat - parsed.latitude) < 0.05 && Math.abs(c.lon - parsed.longitude) < 0.05
      );
      const cityName = parsed.label || matchingCity?.name || `Lokalizacja (${parsed.latitude.toFixed(2)}°N)`;
      setSelectedCity(cityName);
      updateProjectCenter(parsed.latitude, parsed.longitude);
    } else {
      setMapsParseError(true);
    }
  };

  const handleSyncGeoData = async () => {
    if (!isPro) {
      openModal('pricing');
      return;
    }
    setStatus({ isFetching: true, stage: 'parcels', progressDone: 0, progressTotal: 0, error: null, info: null });
    setSyncFeedback(null);
    try {
      const centerLat = settings.latitude;
      const centerLon = settings.longitude;
      const radius = projectRadius;
      const projectCenter = { lat: centerLat, lon: centerLon };
      const projectCrs = detectCoordinateSystem(buildings.flatMap((b) => b.vertices || []));
      const bbox = latLonToBbox(centerLat, centerLon, radius);
      const citySource = findCitySource(centerLat, centerLon);
      const wfsStoreState = useWfsStore.getState();

      // 1. Działki — pomiń ponowne pobranie, jeśli ten sam obszar i źródło były już zsynchronizowane
      // (unika powtarzania kosztownego sondowania ULDK / zapytań WFS przy wielokrotnym kliknięciu "Synchronizuj").
      let parcelsSourceKey = citySource?.fetchParcels ? `wfs:${citySource.name}` : 'uldk';
      let parcels: BuildingLoop[];
      const existingParcels = buildings.filter((b) => b.category === 'boundary' || b.id.startsWith('uldk-') || b.id.startsWith('wfs-'));
      const fetchUldkParcels = () =>
        fetchParcelsInRadius(
          centerLat,
          centerLon,
          radius,
          projectCrs,
          projectCenter,
          undefined,
          (done, total) => setStatus({ progressDone: done, progressTotal: total }),
          (loops) => {
            useWfsStore.getState().addLoadingParcels(loops);
            window.dispatchEvent(new Event('geo-render-needed'));
          }
        );

      if (wfsStoreState.isParcelsFetchCovered(projectCenter, radius, parcelsSourceKey) && existingParcels.length > 0) {
        parcels = existingParcels;
      } else if (citySource?.fetchParcels) {
        try {
          const parcelsGeoJson = await citySource.fetchParcels(bbox);
          parcels = importParcelsFromGeoJson(parcelsGeoJson, citySource.sourceCrs, projectCrs, projectCenter).parcels;
          // Pusty wynik bez wyjątku traktujemy jako niepewny, nie autorytatywny — niektóre
          // miejskie WFS (np. Poznań, patrz komentarz w wfsPoznanClient.ts) potrafią "cicho"
          // zwrócić HTTP 200 z zerem dopasowań dla małych promieni zamiast rzucić błąd, więc
          // brak wyjątku nie gwarantuje, że w promieniu naprawdę nie ma działek.
          if (parcels.length === 0) {
            console.warn(`WFS ${citySource.name} zwrócił 0 działek, fallback krajowy (ULDK) na wszelki wypadek`);
            parcelsSourceKey = 'uldk';
            parcels = await fetchUldkParcels();
          }
        } catch (err) {
          console.warn(`Nie udało się pobrać działek z ${citySource.name}, fallback krajowy (ULDK):`, err);
          parcelsSourceKey = 'uldk';
          parcels = await fetchUldkParcels();
        }
        wfsStoreState.setParcelsFetchCoverage({ center: projectCenter, radius, sourceKey: parcelsSourceKey });
      } else {
        parcels = await fetchUldkParcels();
        wfsStoreState.setParcelsFetchCoverage({ center: projectCenter, radius, sourceKey: parcelsSourceKey });
      }

      // 2. Budynki wektorowe — z jednego, wybranego przez użytkownika źródła (Geoportal lub OSM)
      let importedBuildings: BuildingLoop[] = [];
      let buildingsFetchError: string | null = null;
      let buildingsSourceLabel = citySource?.name || 'WFS';
      // Faktyczne źródło po ewentualnym fallbacku krajowym (patrz fetchBuildingsWithFallback) —
      // używane m.in. do decyzji o dogrzaniu wysokości z LiDAR (`hasStoreyHeights`).
      let effectiveBuildingsSource = citySource;

      setStatus({ stage: 'buildings', progressDone: 0, progressTotal: 0 });

      const buildingsSourceKeyGuess = buildingSource === 'geoportal' ? `wfs:${citySource?.name || 'egib'}` : 'osm';
      const existingImportedBuildings = buildings.filter((b) => b.category !== 'boundary' && (b.id.startsWith('wfs-') || b.id.startsWith('osm-')));
      if (wfsStoreState.isBuildingsFetchCovered(projectCenter, radius, buildingsSourceKeyGuess) && existingImportedBuildings.length > 0) {
        importedBuildings = existingImportedBuildings;
        buildingsSourceLabel = buildingSource === 'geoportal' ? (citySource?.name || 'Geoportal') : 'OpenStreetMap';
      } else if (buildingSource === 'geoportal') {
        try {
          const fetched = await fetchBuildingsWithFallback(citySource, bbox);
          if (fetched) {
            const res = importBuildingsFromGeoJson(fetched.geojson, fetched.source.sourceCrs, projectCrs, projectCenter, radius);
            importedBuildings = res.buildings;
            buildingsSourceLabel = fetched.source.name;
            effectiveBuildingsSource = fetched.source;
            wfsStoreState.setBuildingsFetchCoverage({ center: projectCenter, radius, sourceKey: `wfs:${fetched.source.name}` });
          }
        } catch (err) {
          console.warn(`Nie udało się pobrać budynków z Geoportalu (${citySource?.name}), w tym z fallbacku krajowego:`, err);
        }
        if (importedBuildings.length === 0) {
          buildingsFetchError = 'Brak danych budynków dla zadanego obszaru';
        }
      } else {
        try {
          importedBuildings = await fetchOsmBuildings(bbox, projectCenter, projectCrs, radius);
          buildingsSourceLabel = 'OpenStreetMap';
          wfsStoreState.setBuildingsFetchCoverage({ center: projectCenter, radius, sourceKey: buildingsSourceKeyGuess });
        } catch (osmErr) {
          console.warn('Nie udało się pobrać budynków z OSM:', osmErr);
          // Komunikat zawiera treść błędu (np. timeout wszystkich mirrorów Overpass), zamiast
          // generycznego "brak danych" — to rozróżnia realną awarię sieci od faktycznie pustego
          // obszaru, co wcześniej było nie do odróżnienia dla użytkownika.
          buildingsFetchError = `Nie udało się pobrać budynków z OpenStreetMap: ${osmErr instanceof Error ? osmErr.message : String(osmErr)}`;
        }
        if (importedBuildings.length === 0 && !buildingsFetchError) {
          buildingsFetchError = 'Brak danych budynków dla zadanego obszaru';
        }
      }

      // 2c. Wzbogacenie o wysokości LiDAR NMT/NMPT dla budynków bez precyzyjnych kondygnacji
      if (importedBuildings.length > 0) {
        const needsLidarHeights = importedBuildings.some((b) => b.heightSource === 'default');
        if (needsLidarHeights || effectiveBuildingsSource?.hasStoreyHeights === false) {
          try {
            const terrainResults = await analyzeBuildingHeights(importedBuildings, projectCrs, undefined, projectCenter);
            const resultById: Record<string, typeof terrainResults[number]> = {};
            terrainResults.forEach((r) => { resultById[r.buildingId] = r; });
            importedBuildings = importedBuildings.map((b) => {
              const result = resultById[b.id];
              if (result == null) return b;
              const realHeight = result.estimatedHeight;
              const groundElevation = result.relativeElevation ?? 0;
              return {
                ...b,
                defaultHeight: realHeight,
                heightSource: 'lidar-nmt',
                elevation: groundElevation,
                segments: b.segments.map((s) => ({ ...s, hTop: realHeight, hBase: groundElevation })),
              };
            });
          } catch (terrainErr) {
            console.warn('Nie udało się dobrać wysokości budynków z NMT/NMPT — pozostawiono wartości domyślne/OSM:', terrainErr);
          }
        }
      }

      // 3. Inteligentna synchronizacja do sceny (Smart Updater)
      // Zachowujemy:
      // - Wszystkie obiekty oznaczone jako projektowane (isTested: true)
      // - Wszystkie obiekty stworzone / zmodyfikowane przez użytkownika (niebędące starymi uldk-*, wfs-*, osm-bld-*)
      const existingUserAndTestedBuildings = buildings.filter(
        (b) => b.isTested || (!b.id.startsWith('uldk-') && !b.id.startsWith('wfs-') && !b.id.startsWith('osm-'))
      );
      const combined = [...existingUserAndTestedBuildings, ...parcels, ...importedBuildings];
      setBuildings(combined);

      setStatus({
        isFetching: false,
        stage: 'done',
        error: null,
        info: buildingsFetchError ? `Budynki: ${buildingsFetchError}` : null,
        parcelsCount: parcels.length,
        buildingsCount: importedBuildings.length,
      });
      setSyncFeedback(
        `Zsynchronizowano: ${parcels.length} działek, ${importedBuildings.length} budynków (${buildingsSourceLabel})` +
        (buildingsFetchError ? ` (⚠️ nie udało się pobrać budynków: ${buildingsFetchError})` : '')
      );

      // 4. Prefetch kafelków satelitarnych oraz automatyczne wczytanie kontekstu drogowego/zagospodarowania OSM
      if (showOsmLanduseGroup) {
        ensureOsmLanduseLoaded().catch(() => {});
      }

      window.dispatchEvent(new CustomEvent('geo-prefetch-satellite', {
        detail: { lat: centerLat, lon: centerLon, radius },
      }));

      triggerFit();
    } catch (err) {
      setStatus({
        isFetching: false,
        stage: 'idle',
        error: err instanceof Error ? err.message : 'Błąd synchronizacji',
        info: null,
      });
    } finally {
      useWfsStore.getState().clearLoadingParcels();
      window.dispatchEvent(new Event('geo-render-needed'));
    }
  };

  const ensureGeoContextLoaded = async <T,>(
    skip: boolean,
    setLoading: (loading: boolean) => void,
    fetchAndImport: (projectCrs: CrsDetectionResult, projectCenter: LatLon) => Promise<T>,
    setData: (data: T) => void,
    errorLabel: string
  ) => {
    if (!isPro || skip) return;
    setLoading(true);
    try {
      const projectCenter: LatLon = { lat: settings.latitude, lon: settings.longitude };
      const projectCrs = detectCoordinateSystem(buildings.flatMap((b) => b.vertices || []));
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Przekroczono limit czasu żądania danych (timeout 15s)')), 15000)
      );
      
      const data = await Promise.race([fetchAndImport(projectCrs, projectCenter), timeoutPromise]);
      setData(data);
      window.dispatchEvent(new Event('geo-render-needed'));
    } catch (err) {
      console.warn(errorLabel, err);
    } finally {
      setLoading(false);
    }
  };

  const ensureOvertureContextLoaded = () => ensureGeoContextLoaded(
    useWfsStore.getState().overtureGreenAreas.length > 0,
    setOvertureLoading,
    (projectCrs, projectCenter) =>
      fetchOvertureBase(settings.latitude, settings.longitude, projectRadius)
        .then((base) => importOverturePolygons(base, projectCrs, projectCenter)),
    useWfsStore.getState().setOvertureGreenAreas,
    'Nie udało się pobrać warstwy zieleni Overture Maps:'
  );

  const toggleOvertureGreenAreas = () => {
    if (!showOvertureGreenAreas) ensureOvertureContextLoaded();
    setShowOvertureGreenAreas(!showOvertureGreenAreas);
  };

  const mpzpSource = findMpzpSource(settings.latitude, settings.longitude);
  const isMpzpZonesAvailableHere = mpzpSource !== null;
  const mpzpCityName = mpzpSource?.name || 'Polska';

  const ensureMpzpZonesLoaded = () => ensureGeoContextLoaded(
    (useWfsStore.getState().mpzpZones.length > 0 || useWfsStore.getState().mpzpLines.length > 0) || !isMpzpZonesAvailableHere,
    setMpzpZonesLoading,
    async (projectCrs, projectCenter) => {
      if (!mpzpSource) return { zones: [], lines: [] };
      const bbox = latLonToBbox(settings.latitude, settings.longitude, projectRadius);
      const res = await mpzpSource.fetchMpzp(bbox, projectRadius, settings.latitude, settings.longitude);
      const zones = importMpzpZonesFromGeoJson(res.zones, projectCrs, projectCenter, mpzpSource.sourceCrs);
      const lines = importMpzpLinesFromGeoJson(res.lines, projectCrs, projectCenter, mpzpSource.sourceCrs);
      return { zones, lines };
    },
    ({ zones, lines }) => {
      useWfsStore.getState().setMpzpData(zones, lines);
    },
    'Nie udało się pobrać danych MPZP:'
  );

  const toggleMpzpZonesLayer = () => {
    if (!showMpzpZonesLayer) ensureMpzpZonesLoaded();
    setShowMpzpZonesLayer(!showMpzpZonesLayer);
  };

  const ensureLandCoverLoaded = () => ensureGeoContextLoaded(
    useWfsStore.getState().landCoverUnits.length > 0,
    setLandCoverLoading,
    (projectCrs, projectCenter) => {
      const bbox = latLonToBbox(settings.latitude, settings.longitude, projectRadius);
      return fetchLandCoverUnits(bbox)
        .then((collection) => importLandCoverFromGeoJson(collection, EPSG_2180, projectCrs, projectCenter));
    },
    useWfsStore.getState().setLandCoverUnits,
    'Nie udało się pobrać pokrycia terenu:'
  );

  const toggleLandCoverLayer = () => {
    if (!showLandCoverLayer) ensureLandCoverLoaded();
    setShowLandCoverLayer(!showLandCoverLayer);
  };

  const ensureOsmLanduseLoaded = () => {
    const isBuffered = useOsmLanduseStore.getState().isBufferValid(
      { lat: settings.latitude, lon: settings.longitude },
      projectRadius
    );
    return ensureGeoContextLoaded(
      isBuffered,
      setOsmLanduseLoading,
      async (projectCrs, projectCenter) => {
        const bbox = latLonToBbox(settings.latitude, settings.longitude, projectRadius);
        await fetchOsmLanduseAction(bbox, projectCenter, projectCrs, projectRadius);
        return {
          features: useOsmLanduseStore.getState().features,
          trees: useOsmLanduseStore.getState().trees,
        };
      },
      ({ features, trees }) => {
        useOsmLanduseStore.getState().setFeatures(features);
        useOsmLanduseStore.getState().setTrees(trees);
      },
      'Nie udało się pobrać danych OSM:'
    );
  };

  const toggleOsmLanduseLayer = () => {
    const isBuffered = useOsmLanduseStore.getState().isBufferValid(
      { lat: settings.latitude, lon: settings.longitude },
      projectRadius
    );
    if (!showOsmLanduseGroup || !isBuffered) {
      ensureOsmLanduseLoaded();
      setShowOsmLanduseGroup(true);
    } else {
      setShowOsmLanduseGroup(false);
    }
  };

  return {
    settings,
    selectedCity,
    setSelectedCity,
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
    openModal,
    overtureLoading,
    mpzpZonesLoading,
    landCoverLoading,
    osmLanduseLoading,
    showOvertureGreenAreas,
    showMpzpZonesLayer,
    showLandCoverLayer,
    showOsmLanduseGroup,
    osmFeaturesCount: osmFeatures.length,
    isMpzpZonesAvailableHere,
    mpzpCityName,
    formatWfsProgress,
    WFS_IMPORT_CONTINUE_HINT,
    updateProjectCenter,
    handleMapsInputChange,
    handleSyncGeoData,
    toggleOvertureGreenAreas,
    toggleMpzpZonesLayer,
    toggleLandCoverLayer,
    toggleOsmLanduseLayer,
    ensureOsmLanduseLoaded,
    triggerFit,
  };
};
