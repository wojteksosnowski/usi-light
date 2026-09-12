import React from 'react';
import {
  MapPin,
  Link,
  X,
  Upload,
  Download,
  Sliders,
  Globe,
  Share2,
  FileCode,
  FileSpreadsheet,
  Lock,
  Unlock,
  Crosshair,
  RefreshCw,
  Eye,
  EyeOff,
  Layers,
  Map,
  Wrench,
} from 'lucide-react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useCadToolStore,
  useUiStore,
  useLicenseStore,
  POLISH_CITIES,
} from '../../store';
import { useWfsStore, ProjectRadius, formatWfsProgress, WFS_IMPORT_CONTINUE_HINT } from '../../modules/wfs-import/store/useWfsStore';
import { fetchParcelsInRadius } from '../../modules/wfs-import/services/uldkClient';
import { findCitySource } from '../../modules/wfs-import/services/citySources';
import {
  importBuildingsFromGeoJson,
  importParcelsFromGeoJson,
  importOverturePolygons,
  importMpzpZonesFromGeoJson,
  importLandCoverFromGeoJson,
} from '../../modules/wfs-import/services/geoJsonImporter';
import { fetchOvertureBase } from '../../modules/wfs-import/services/overtureMapsApiClient';
import { fetchMpzpZonesInRadius } from '../../modules/wfs-import/services/wfsMpzpWarsawClient';
import { fetchLandCoverUnits } from '../../modules/wfs-import/services/wfsLcvClient';
import { EPSG_2180 } from '../../modules/wfs-import/services/wfsEgibClient';
import { analyzeBuildingHeights } from '../../modules/wfs-import/utils/terrainAnalyzer';
import { latLonToBbox } from '../../modules/wfs-import/services/geocoding';
import { detectCoordinateSystem, CrsDetectionResult, LatLon } from '../../utils/geoTransform';
import { parseGoogleMapsCoordinates } from '../../utils/geoParser';
import { parseDxfWithMetadata, DxfUnitOption, createSampleBuildings } from '../../utils/dxfParser';
import { exportSceneToDxf } from '../../utils/dxfExport';
import { PinnedFacadePoint, BuildingLoop } from '../../types/geometry';
import { APP_CONFIG } from '../../config/appConfig';

/** Dostawcy podkładu satelitarnego dostępni w przełączniku "Dostawca mapy". */
const SATELLITE_PROVIDERS: { key: 'google' | 'here' | 'orthophoto'; label: string; title: string; pro?: boolean }[] = [
  { key: 'google', label: 'Google', title: 'Google Maps Satellite' },
  { key: 'here', label: 'HERE', title: 'HERE Satellite' },
  { key: 'orthophoto', label: 'Ortofotomapa', title: 'Ortofotomapa HR GUGiK (≤10 cm) — PRO', pro: true },
];

/** Prosty przełącznik widoczności warstwy (bez opacity) — wzorem "Cieniowanie rzeźby"/"Overture: zieleń". */
const SimpleLayerToggle: React.FC<{ label: string; active: boolean; dotColor: string; onToggle: () => void }> = ({
  label, active, dotColor, onToggle,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: active ? dotColor : '#64748b',
          boxShadow: active ? `0 0 6px ${dotColor}99` : 'none',
        }}
      />
      <span style={{ fontSize: '11px', fontWeight: 500, color: '#f8fafc' }}>{label}</span>
    </div>
    <button
      type="button"
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <div
        style={{
          width: '28px',
          height: '16px',
          borderRadius: '999px',
          backgroundColor: active ? dotColor : '#334155',
          position: 'relative',
          transition: 'background-color 0.2s ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            position: 'absolute',
            top: '2px',
            left: active ? '14px' : '2px',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    </button>
  </div>
);

export const ProjectGroup: React.FC = () => {
  // Scene Store
  const buildings = useSceneStore((s) => s.buildings);
  const setBuildings = useSceneStore((s) => s.setBuildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const setSelectedBuildingId = useSceneStore((s) => s.setSelectedBuildingId);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const setLayerSettings = useSceneStore((s) => s.setLayerSettings);
  const selectedLayerName = useSceneStore((s) => s.selectedLayerName);
  const setSelectedLayerName = useSceneStore((s) => s.setSelectedLayerName);
  const isLinkingMode = useSceneStore((s) => s.isLinkingMode);
  const setIsLinkingMode = useSceneStore((s) => s.setIsLinkingMode);
  const linkingSourceId = useSceneStore((s) => s.linkingSourceId);
  const setLinkingSourceId = useSceneStore((s) => s.setLinkingSourceId);
  const dxfUnit = useSceneStore((s) => s.dxfUnit);
  const setDxfUnit = useSceneStore((s) => s.setDxfUnit);
  const dxfImportInfo = useSceneStore((s) => s.dxfImportInfo);
  const setDxfImportInfo = useSceneStore((s) => s.setDxfImportInfo);
  const lastDxfText = useSceneStore((s) => s.lastDxfText);
  const setLastDxfText = useSceneStore((s) => s.setLastDxfText);

  // Solar Analysis Store
  const settings = useSolarAnalysisStore((s) => s.settings);
  const setSettings = useSolarAnalysisStore((s) => s.setSettings);
  const selectedCity = useSolarAnalysisStore((s) => s.selectedCity);
  const setSelectedCity = useSolarAnalysisStore((s) => s.setSelectedCity);
  const mapsInput = useSolarAnalysisStore((s) => s.mapsInput);
  const setMapsInput = useSolarAnalysisStore((s) => s.setMapsInput);
  const mapsParseError = useSolarAnalysisStore((s) => s.mapsParseError);
  const setMapsParseError = useSolarAnalysisStore((s) => s.setMapsParseError);
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
  const pinnedPoints = useSolarAnalysisStore((s) => s.pinnedPoints);
  const setPinnedPoints = useSolarAnalysisStore((s) => s.setPinnedPoints);
  const activePinnedPointId = useSolarAnalysisStore((s) => s.activePinnedPointId);
  const setActivePinnedPointId = useSolarAnalysisStore((s) => s.setActivePinnedPointId);
  const activePointMode = useSolarAnalysisStore((s) => s.activePointMode);
  const setActivePointMode = useSolarAnalysisStore((s) => s.setActivePointMode);

  // CAD Tool Store
  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const dimensions = useCadToolStore((s) => s.dimensions);
  const setDimensions = useCadToolStore((s) => s.setDimensions);
  const isEditMode = useCadToolStore((s) => s.isEditMode);
  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);
  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const setIsDimensionToolActive = useCadToolStore((s) => s.setIsDimensionToolActive);
  const dimensionType = useCadToolStore((s) => s.dimensionType);
  const setDimensionType = useCadToolStore((s) => s.setDimensionType);
  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const setViewRotationDeg = useCadToolStore((s) => s.setViewRotationDeg);
  const savedViewRotationDeg = useCadToolStore((s) => s.savedViewRotationDeg);
  const setSavedViewRotationDeg = useCadToolStore((s) => s.setSavedViewRotationDeg);
  const triggerFit = useCadToolStore((s) => s.triggerFit);
  const setShareModalOpen = useUiStore((s) => s.setShareModalOpen);
  const setPricingModalOpen = useUiStore((s) => s.setPricingModalOpen);
  const isPro = useLicenseStore((s) => s.isPro);

  const [includeTerrainMesh, setIncludeTerrainMesh] = React.useState(false);
  const [terrainExportBusy, setTerrainExportBusy] = React.useState(false);

  const handleExportDxf = async () => {
    if (!isPro) {
      setPricingModalOpen(true);
      return;
    }
    const terrain = includeTerrainMesh
      ? {
          projectCenter: { lat: settings.latitude, lon: settings.longitude },
          radiusMeters: useWfsStore.getState().projectRadius,
          projectCrs: detectCoordinateSystem(buildings.flatMap((b) => b.vertices || [])),
        }
      : undefined;

    setTerrainExportBusy(true);
    try {
      const { terrainWarning } = await exportSceneToDxf({ buildings, pinnedPoints, terrain });
      if (terrainWarning) {
        setSyncFeedback(`⚠️ Eksport DXF: ${terrainWarning}`);
      }
    } finally {
      setTerrainExportBusy(false);
    }
  };

  // WFS Store & Geo Data
  const projectRadius = useWfsStore((s) => s.projectRadius);
  const setProjectRadius = useWfsStore((s) => s.setProjectRadius);
  const isProjectCenterLocked = useWfsStore((s) => s.isProjectCenterLocked);
  const setIsProjectCenterLocked = useWfsStore((s) => s.setIsProjectCenterLocked);
  const showKiutLayer = useWfsStore((s) => s.showKiutLayer);
  const setShowKiutLayer = useWfsStore((s) => s.setShowKiutLayer);
  const kiutOpacity = useWfsStore((s) => s.kiutOpacity);
  const setKiutOpacity = useWfsStore((s) => s.setKiutOpacity);
  const kiutInvertColors = useWfsStore((s) => s.kiutInvertColors);
  const setKiutInvertColors = useWfsStore((s) => s.setKiutInvertColors);
  const showMpzpLayer = useWfsStore((s) => s.showMpzpLayer);
  const setShowMpzpLayer = useWfsStore((s) => s.setShowMpzpLayer);
  const mpzpOpacity = useWfsStore((s) => s.mpzpOpacity);
  const setMpzpOpacity = useWfsStore((s) => s.setMpzpOpacity);
  const showBdotLayer = useWfsStore((s) => s.showBdotLayer);
  const setShowBdotLayer = useWfsStore((s) => s.setShowBdotLayer);
  const bdotOpacity = useWfsStore((s) => s.bdotOpacity);
  const setBdotOpacity = useWfsStore((s) => s.setBdotOpacity);
  const bdotInvertColors = useWfsStore((s) => s.bdotInvertColors);
  const setBdotInvertColors = useWfsStore((s) => s.setBdotInvertColors);
  const showTerrainLayer = useWfsStore((s) => s.showTerrainLayer);
  const setShowTerrainLayer = useWfsStore((s) => s.setShowTerrainLayer);
  const showGeoOverlayGroup = useWfsStore((s) => s.showGeoOverlayGroup);
  const setShowGeoOverlayGroup = useWfsStore((s) => s.setShowGeoOverlayGroup);
  const showOvertureGreenAreas = useWfsStore((s) => s.showOvertureGreenAreas);
  const setShowOvertureGreenAreas = useWfsStore((s) => s.setShowOvertureGreenAreas);
  const showMpzpZonesLayer = useWfsStore((s) => s.showMpzpZonesLayer);
  const setShowMpzpZonesLayer = useWfsStore((s) => s.setShowMpzpZonesLayer);
  const showLandCoverLayer = useWfsStore((s) => s.showLandCoverLayer);
  const setShowLandCoverLayer = useWfsStore((s) => s.setShowLandCoverLayer);
  const status = useWfsStore((s) => s.status);
  const setStatus = useWfsStore((s) => s.setStatus);
  const [overtureLoading, setOvertureLoading] = React.useState(false);
  const [mpzpZonesLoading, setMpzpZonesLoading] = React.useState(false);
  const [landCoverLoading, setLandCoverLoading] = React.useState(false);

  const [syncFeedback, setSyncFeedback] = React.useState<string | null>(null);

  const handleSyncGeoData = async () => {
    if (!isPro) {
      setPricingModalOpen(true);
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

      // 1. Działki: lokalne źródło miasta (jeśli dostępne) zastępuje ogólnopolski ULDK
      let parcels: BuildingLoop[];
      if (citySource?.fetchParcels) {
        const parcelsGeoJson = await citySource.fetchParcels(bbox);
        parcels = importParcelsFromGeoJson(parcelsGeoJson, citySource.sourceCrs, projectCrs, projectCenter).parcels;
      } else {
        parcels = await fetchParcelsInRadius(
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
      }

      // 2. Budynki wektorowe (serwisy lokalne dla obsługiwanych miast)
      let importedBuildings: BuildingLoop[] = [];
      let buildingsFetchError: string | null = null;

      setStatus({ stage: 'buildings', progressDone: 0, progressTotal: 0 });
      if (citySource) {
        try {
          const bldGeoJson = await citySource.fetchBuildings(bbox);
          const res = importBuildingsFromGeoJson(bldGeoJson, citySource.sourceCrs, projectCrs, projectCenter, radius);
          importedBuildings = res.buildings;

          // Serwis nie podaje liczby kondygnacji (np. ogólnopolski fallback EGiB dla Gdańska,
          // Wrocławia, Poznania...) — wszystkie budynki dostały tę samą wysokość domyślną
          // (estimateHeight(null) w geoJsonImporter.ts). Dobieramy realną wysokość z różnicy
          // LiDAR NMPT (DSM) − NMT (DTM), zamiast zostawić płaską zabudowę.
          if (citySource.hasStoreyHeights === false && importedBuildings.length > 0) {
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
              console.warn('Nie udało się dobrać wysokości budynków z NMT/NMPT — pozostawiono wartość domyślną:', terrainErr);
            }
          }
        } catch (err) {
          buildingsFetchError = err instanceof Error ? err.message : 'Nieznany błąd pobierania budynków';
          console.error(`Nie udało się pobrać budynków (${citySource.name}):`, err);
          // kontynuuj z działkami — nie przerywamy całej synchronizacji przez błąd budynków
        }
      }

      // 3. Synchronizacja do sceny
      const existingUserBuildings = buildings.filter((b) => !b.id.startsWith('uldk-') && !b.id.startsWith('wfs-'));
      const combined = [...existingUserBuildings, ...parcels, ...importedBuildings];
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
        `Zsynchronizowano: ${parcels.length} działek, ${importedBuildings.length} budynków` +
        (buildingsFetchError ? ` (⚠️ nie udało się pobrać budynków: ${buildingsFetchError})` : '')
      );

      // 5. Prefetch kafelków satelitarnych w obszarze zasięgu projektu
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

  /**
   * Wzorzec współdzielony przez warstwy kontekstowe pobierane leniwie przy pierwszym włączeniu
   * przełącznika widoczności (Overture, strefy MPZP, ...): pobierz dla środka+promienia projektu
   * jeśli jeszcze nie wczytano, zapisz do store'u, odśwież render. `skip` pozwala każdej warstwie
   * dopisać własny warunek pominięcia (np. dane już wczytane, lub warstwa niedostępna w tej lokalizacji).
   */
  const ensureGeoContextLoaded = async <T,>(
    skip: boolean,
    setLoading: (loading: boolean) => void,
    fetchAndImport: (projectCrs: CrsDetectionResult, projectCenter: LatLon) => Promise<T>,
    setData: (data: T) => void,
    errorLabel: string
  ) => {
    if (skip) return;
    setLoading(true);
    try {
      const projectCenter: LatLon = { lat: settings.latitude, lon: settings.longitude };
      const projectCrs = detectCoordinateSystem(buildings.flatMap((b) => b.vertices || []));
      const data = await fetchAndImport(projectCrs, projectCenter);
      setData(data);
      window.dispatchEvent(new Event('geo-render-needed'));
    } catch (err) {
      console.error(errorLabel, err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Pobiera warstwę zieleni Overture Maps (`/base`) dla środka i promienia projektu, jeśli
   * jeszcze nie jest wczytana — wywoływane leniwie przy pierwszym włączeniu przełącznika
   * widoczności (analogicznie do WMS: włączenie = pobranie).
   *
   * Uwaga: drogi/koleje/wody przez surowe partycje Overture (`overtureDuckDb.ts`,
   * DuckDB-WASM) świadomie wycofane z UI — mimo poprawionego kodu (naprawiony bug z globem
   * `*` na HTTPS) w praktyce zacinały aplikację: paczki `mvp`/`eh` DuckDB-WASM są
   * jednowątkowe, więc otwieranie ~32–128 plików Parquet (odpowiednio wody/transport)
   * sekwencyjnie, każdy z round-tripem do `us-west-2`, zajmuje dziesiątki sekund bez
   * żadnego wskaźnika postępu. `overtureDuckDb.ts` zostaje w repo nieużywany (z tym samym
   * komentarzem) na wypadek podjęcia tego później, np. z wielowątkową paczką `coi`.
   */
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

  /** Strefy MPZP (wektor) — pilot ograniczony do Warszawy, patrz `wfsMpzpWarsawClient.ts`. */
  const isMpzpZonesAvailableHere = findCitySource(settings.latitude, settings.longitude)?.name === 'Warszawa';

  const ensureMpzpZonesLoaded = () => ensureGeoContextLoaded(
    useWfsStore.getState().mpzpZones.length > 0 || !isMpzpZonesAvailableHere,
    setMpzpZonesLoading,
    (projectCrs, projectCenter) =>
      fetchMpzpZonesInRadius(settings.latitude, settings.longitude, projectRadius)
        .then((rawZones) => importMpzpZonesFromGeoJson(rawZones, projectCrs, projectCenter)),
    useWfsStore.getState().setMpzpZones,
    'Nie udało się pobrać stref MPZP:'
  );

  const toggleMpzpZonesLayer = () => {
    if (!showMpzpZonesLayer) ensureMpzpZonesLoaded();
    setShowMpzpZonesLayer(!showMpzpZonesLayer);
  };

  /** Pokrycie terenu (wektor) — ogólnopolskie, patrz `wfsLcvClient.ts`. Bez bramkowania miejskiego. */
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
      setSettings((prev) => ({
        ...prev,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      }));
    } else {
      setMapsParseError(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setLastDxfText(text);
        const result = parseDxfWithMetadata(text, dxfUnit);
        if (result.buildings.length > 0) {
          setBuildings(result.buildings);
          setSelectedBuildingId(result.buildings[0].id);
          setPinnedPoints([]);
          setActivePinnedPointId(null);
          setDxfImportInfo(result.unitInfo);
          triggerFit();
        } else {
          alert('Nie znaleziono zamkniętych polilinii w pliku DXF.');
        }
      } catch (err) {
        alert('Błąd podczas parsowania pliku DXF.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDxfUnitChange = (newUnit: DxfUnitOption) => {
    setDxfUnit(newUnit);
    if (lastDxfText) {
      try {
        const result = parseDxfWithMetadata(lastDxfText, newUnit);
        if (result.buildings.length > 0) {
          setBuildings(result.buildings);
          setSelectedBuildingId(result.buildings[0].id);
          setPinnedPoints([]);
          setActivePinnedPointId(null);
          setDxfImportInfo(result.unitInfo);
          triggerFit();
        }
      } catch (err) {
        console.error('Błąd przy przeliczaniu jednostek DXF:', err);
      }
    }
  };

  const applyLoadedScene = (scene: any) => {
    if (!scene || scene.version !== 1) {
      alert('Nieprawidłowy plik sceny.');
      return;
    }

    setBuildings(scene.buildings ?? createSampleBuildings());
    setSelectedBuildingId(scene.selectedBuildingId ?? null);
    if (scene.pinnedPoints) {
      setPinnedPoints(scene.pinnedPoints);
      setActivePinnedPointId(scene.activePinnedPointId ?? (scene.pinnedPoints.length > 0 ? scene.pinnedPoints[0].id : null));
    } else if (scene.selectedPointKey) {
      const legacyPt: PinnedFacadePoint = {
        id: 'pinned-legacy',
        buildingId: scene.selectedPointKey.buildingId,
        segmentId: scene.selectedPointKey.segmentId,
        offsetRatio: scene.selectedPointKey.offsetRatio,
        label: 'P1',
      };
      setPinnedPoints([legacyPt]);
      setActivePinnedPointId('pinned-legacy');
    } else {
      setPinnedPoints([]);
      setActivePinnedPointId(null);
    }
    setSettings(scene.settings ?? settings);
    setLayerSettings(scene.layerSettings ?? {});
    setSelectedLayerName(scene.selectedLayerName ?? null);
    setIsLinkingMode(scene.isLinkingMode ?? false);
    setLinkingSourceId(scene.linkingSourceId ?? null);
    setDrawingMode(scene.drawingMode ?? 'none');
    setDimensions(scene.dimensions ?? []);
    setIsEditMode(scene.isEditMode ?? false);
    setIsDimensionToolActive(scene.isDimensionToolActive ?? false);
    setDimensionType(scene.dimensionType ?? 'linear');
    setShowNormals(scene.showNormals ?? false);
    setShowShadowingLines(scene.showShadowingLines ?? true);
    setShowSunlightLines(scene.showSunlightLines ?? true);
    setShowShadowRange(scene.showShadowRange ?? true);
    setSunlightMethod(scene.sunlightMethod ?? 'segments');
    setActivePointMode(scene.activePointMode ?? 'shadowing');
    setSelectedCity(scene.selectedCity ?? 'Warszawa');
    setMapsInput(scene.mapsInput ?? '');
    setMapsParseError(scene.mapsParseError ?? false);
    setViewRotationDeg(scene.viewRotationDeg ?? 0);
    setSavedViewRotationDeg(scene.savedViewRotationDeg ?? 0);
    setDxfUnit(scene.dxfUnit ?? 'auto');
    setDxfImportInfo(scene.dxfImportInfo ?? null);
    triggerFit();
  };

  const handleSceneFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const scene = JSON.parse(text);
        applyLoadedScene(scene);
      } catch (err) {
        alert('Błąd podczas wczytywania sceny JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSceneDownload = () => {
    const scene = {
      version: 1,
      buildings,
      selectedBuildingId,
      pinnedPoints,
      activePinnedPointId,
      settings,
      layerSettings,
      selectedLayerName,
      isLinkingMode,
      linkingSourceId,
      drawingMode,
      dimensions,
      isEditMode,
      isDimensionToolActive,
      dimensionType,
      showNormals,
      showShadowingLines,
      showSunlightLines,
      showShadowRange,
      sunlightMethod,
      activePointMode,
      selectedCity,
      mapsInput,
      mapsParseError,
      viewRotationDeg,
      savedViewRotationDeg,
      dxfUnit,
      dxfImportInfo,
    };
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usi-light-scene-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isLocalhost = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.host;
    const hostname = window.location.hostname;
    return (
      host === 'localhost:3000' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      Boolean((import.meta as any).env?.DEV)
    );
  }, []);

  return (
    <div className="sidebar-group-content">
      {/* 1.1 Środek projektu (Punkt bazowy & Kąt słońca § 56) */}
      <div className="ui-card">
        <div className="ui-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={14} color="#f59e0b" />
            <span>Środek projektu</span>
          </div>
          <button
            type="button"
            onClick={() => setIsProjectCenterLocked(!isProjectCenterLocked)}
            style={{
              background: isProjectCenterLocked ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${isProjectCenterLocked ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              borderRadius: '6px',
              padding: '2px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: isProjectCenterLocked ? 'var(--accent-rose)' : '#fcd34d',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title={isProjectCenterLocked ? 'Środek projektu zablokowany (kliknij, aby odblokować edycję)' : 'Środek projektu odblokowany (kliknij, aby zablokować)'}
          >
            {isProjectCenterLocked ? <Lock size={11} /> : <Unlock size={11} />}
            <span>{isProjectCenterLocked ? 'Zablokowany' : 'Odblokowany'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-input)',
              padding: '6px 8px',
              borderRadius: '8px',
              border: `1px solid ${mapsParseError ? 'rgba(244, 63, 94, 0.5)' : 'var(--border-light)'}`,
              opacity: isProjectCenterLocked ? 0.75 : 1,
            }}
          >
            <Link size={13} color={mapsParseError ? '#f43f5e' : '#f59e0b'} style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={mapsInput}
              disabled={isProjectCenterLocked}
              onChange={(e) => handleMapsInputChange(e.target.value)}
              placeholder="Wklej link Google Maps / współrzędne..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '11px',
                color: '#f8fafc',
                minWidth: 0,
                cursor: isProjectCenterLocked ? 'not-allowed' : 'text',
              }}
              title={isProjectCenterLocked ? 'Odblokuj kłódkę, aby zmienić środek projektu' : 'Wklej link z Google Maps lub współrzędne (np. 52.23, 21.01)'}
            />
            {mapsInput && !isProjectCenterLocked && (
              <button
                type="button"
                onClick={() => handleMapsInputChange('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
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
            <div style={{ fontSize: '10px', color: '#f43f5e', paddingLeft: '4px' }}>
              Nie rozpoznano współrzędnych. Wklej link Google Maps lub np. 52.23, 21.01
            </div>
          )}

          {/* Quick City Presets */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '4px',
              backgroundColor: 'var(--bg-input)',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
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
                    setMapsInput('');
                    setMapsParseError(false);
                    setSettings((prev) => ({
                      ...prev,
                      latitude: city.lat,
                      longitude: city.lon,
                    }));
                  }}
                  style={{
                    padding: '6px 2px',
                    fontSize: '11px',
                    fontWeight: isActive ? 700 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    backgroundColor: isActive ? '#f59e0b' : 'transparent',
                    color: isActive ? '#000000' : 'var(--text-secondary)',
                  }}
                  title={`${city.name} (${city.lat}° N, ${city.lon}° E)`}
                >
                  {city.name}
                </button>
              );
            })}
          </div>

          {/* Coordinates info pill & Center Action Button */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11px',
                color: '#94a3b8',
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
              }}
            >
              <span>Punkt bazowy:</span>
              <span style={{ color: '#fbbf24', fontWeight: 600, fontFamily: 'monospace' }}>
                {settings.latitude.toFixed(4)}° N, {settings.longitude.toFixed(4)}° E
              </span>
            </div>
            <button
              type="button"
              onClick={() => triggerFit({ ignoreSelection: true })}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                color: 'var(--accent-cyan)',
                cursor: 'pointer',
              }}
              title="Centruj i dopasuj widok na środku projektu (niezależnie od zaznaczenia)"
            >
              <Crosshair size={13} />
            </button>
          </div>

          {/* Promień zasięgu projektu */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '2px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Zasięg projektu:</span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '4px',
                backgroundColor: 'var(--bg-input)',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
              }}
            >
              {([50, 100, 200, 300] as const).map((r) => {
                const isActive = projectRadius === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setProjectRadius(r)}
                    style={{
                      padding: '3px 6px',
                      fontSize: '10px',
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: '5px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      backgroundColor: isActive ? 'var(--accent-cyan)' : 'transparent',
                      color: isActive ? 'var(--bg-main)' : 'var(--text-secondary)',
                    }}
                    title={`Obszar analizy i synchronizacji: okrąg o promieniu ${r} m`}
                  >
                    {r} m
                  </button>
                );
              })}
            </div>
          </div>

          {isPro && (
            <>
              {/* Przycisk Pobierz działki i budynki (PRO) */}
              <button
                type="button"
                onClick={handleSyncGeoData}
                disabled={status.isFetching}
                style={{
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--accent-amber)',
                  background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: status.isFetching ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
                }}
                title="Pobierz i zsynchronizuj wektorowe działki ewidencyjne (ULDK) oraz budynki wewnątrz okręgu projektu"
              >
                {status.isFetching && <RefreshCw size={13} className="spin" />}
                <span>{status.isFetching ? formatWfsProgress(status) : 'Pobierz działki i budynki'}</span>
              </button>

              {status.isFetching && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  {WFS_IMPORT_CONTINUE_HINT}
                </div>
              )}

              {syncFeedback && (
                <div style={{ fontSize: '10.5px', color: '#34d399', textAlign: 'center', fontWeight: 600 }}>
                  {syncFeedback}
                </div>
              )}
              {status.error && (
                <div style={{ fontSize: '10.5px', color: '#f43f5e', textAlign: 'center' }}>
                  {status.error}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Główny przycisk udostępniania projektu */}
      <button
        type="button"
        onClick={() => setShareModalOpen(true)}
        className="btn-share"
        title="Udostępnij projekt online za pomocą linku (Upstash Redis, 14 dni)"
      >
        <Share2 size={14} />
        <span>Udostępnij projekt</span>
      </button>

      {/* 1.2 Pliki CAD */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Pliki CAD</span>
          <Sliders size={14} color="#818cf8" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isPro ? 'repeat(2, 1fr)' : '1fr',
              gap: '6px',
            }}
          >
            <label
              className="btn-tile active-indigo"
              style={{
                margin: 0,
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Wgraj plik DXF"
            >
              <Upload size={13} />
              <span>Wgraj DXF</span>
              <input type="file" accept=".dxf" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            {isPro && (
              <button
                type="button"
                onClick={handleExportDxf}
                disabled={terrainExportBusy}
                className="btn-tile active-cyan"
                style={{
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  opacity: terrainExportBusy ? 0.6 : 1,
                  cursor: terrainExportBusy ? 'not-allowed' : 'pointer',
                }}
                title="Eksportuj geometrię i punkty pomiarowe do formatu CAD DXF"
              >
                <FileCode size={13} />
                <span>{terrainExportBusy ? 'Eksportowanie…' : 'Eksport DXF'}</span>
              </button>
            )}
          </div>

          {isPro && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '10.5px',
                color: '#94a3b8',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              title="Dołącz do eksportu DXF siatkę rzeźby terenu (NMT, GUGiK) — wymaga dodatkowego zapytania sieciowego"
            >
              <input
                type="checkbox"
                checked={includeTerrainMesh}
                onChange={(e) => setIncludeTerrainMesh(e.target.checked)}
                style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
              />
              <span>Dołącz rzeźbę terenu (NMT) do eksportu DXF</span>
            </label>
          )}

          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            Jednostka rysunku DXF:
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '4px',
              backgroundColor: 'var(--bg-input)',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
            }}
          >
            {(
              [
                { id: 'auto', label: 'Auto' },
                { id: 'm', label: 'm' },
                { id: 'dm', label: 'dm' },
                { id: 'cm', label: 'cm' },
                { id: 'mm', label: 'mm' },
              ] as const
            ).map((tab) => {
              const isActive = dxfUnit === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleDxfUnitChange(tab.id)}
                  style={{
                    padding: '6px 2px',
                    fontSize: '11px',
                    fontWeight: isActive ? 700 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    backgroundColor: isActive ? 'var(--accent-indigo)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  }}
                  title={
                    tab.id === 'auto'
                      ? 'Automatyczne wykrywanie jednostki z nagłówka $INSUNITS lub skali geometrii'
                      : `Wymuś skalę: 1 jednostka DXF = 1 ${tab.id}`
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {dxfImportInfo ? (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                fontSize: '11px',
                color: '#cbd5e1',
                lineHeight: '1.4',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: 600,
                  color: '#e0e7ff',
                  marginBottom: '2px',
                }}
              >
                <span>Skala importu:</span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                  {dxfImportInfo.unitName}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                {dxfImportInfo.source}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.3' }}>
              {dxfUnit === 'auto'
                ? 'Automatycznie odczytuje $INSUNITS z pliku DXF lub dopasowuje skalę (mm/cm/m).'
                : `Wymuszenie: 1 jednostka = ${
                    dxfUnit === 'm'
                      ? '1 metr (1.0)'
                      : dxfUnit === 'cm'
                      ? '1 centymetr (0.01 m)'
                      : '1 milimetr (0.001 m)'
                  }.`}
            </div>
          )}
        </div>
      </div>

      {/* 1.3 Analizy */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Analizy</span>
          <Sliders size={14} color="#f59e0b" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 1. Przesłanianie § 12 */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: showShadowingLines ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              border: showShadowingLines ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <button
              type="button"
              onClick={() => setShowShadowingLines((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#f8fafc',
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
                    backgroundColor: showShadowingLines ? '#10b981' : '#64748b',
                    boxShadow: showShadowingLines ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Przesłanianie § 12 (Wewnętrzny pas)</span>
              </div>
              <div
                style={{
                  width: '28px',
                  height: '16px',
                  borderRadius: '999px',
                  backgroundColor: showShadowingLines ? '#10b981' : '#334155',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: showShadowingLines ? '14px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                />
              </div>
            </button>
          </div>

          {/* 2. Nasłonecznienie § 56 */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: showSunlightLines ? 'rgba(245, 158, 11, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              border: showSunlightLines ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <button
              type="button"
              onClick={() => setShowSunlightLines((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#f8fafc',
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
                    backgroundColor: showSunlightLines ? '#fbbf24' : '#64748b',
                    boxShadow: showSunlightLines ? '0 0 8px rgba(251, 191, 36, 0.6)' : 'none',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Nasłonecznienie § 56 (Zewnętrzny pas)</span>
              </div>
              <div
                style={{
                  width: '28px',
                  height: '16px',
                  borderRadius: '999px',
                  backgroundColor: showSunlightLines ? '#f59e0b' : '#334155',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: showSunlightLines ? '14px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                />
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
                <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Metoda obliczeń § 56:</span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    borderRadius: '7px',
                    padding: '2px',
                    border: '1px solid #334155',
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
                      color: sunlightMethod === 'raycasting' ? '#fcd34d' : '#64748b',
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
                      color: sunlightMethod === 'segments' ? '#a5b4fc' : '#64748b',
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
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: showAnalysisPoints ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              border: showAnalysisPoints ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <button
              type="button"
              onClick={() => setShowAnalysisPoints((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#f8fafc',
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
                    backgroundColor: showAnalysisPoints ? '#38bdf8' : '#64748b',
                    boxShadow: showAnalysisPoints ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Punkty (Fasada & Plac zabaw)</span>
              </div>
              <div
                style={{
                  width: '28px',
                  height: '16px',
                  borderRadius: '999px',
                  backgroundColor: showAnalysisPoints ? '#0284c7' : '#334155',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: showAnalysisPoints ? '14px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                />
              </div>
            </button>
          </div>

          {/* 4. Wektory normalne fasad (w sidebarze) */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: showNormals ? 'rgba(99, 102, 241, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              border: showNormals ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <button
              type="button"
              onClick={() => setShowNormals((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#f8fafc',
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
                    backgroundColor: showNormals ? '#818cf8' : '#64748b',
                    boxShadow: showNormals ? '0 0 8px rgba(129, 140, 248, 0.6)' : 'none',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Wektory normalne fasad (Zwrot ścian)</span>
              </div>
              <div
                style={{
                  width: '28px',
                  height: '16px',
                  borderRadius: '999px',
                  backgroundColor: showNormals ? '#6366f1' : '#334155',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: showNormals ? '14px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                />
              </div>
            </button>
          </div>

          {/* 4. Zakres cienia */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: showShadowRange ? 'rgba(129, 140, 248, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              border: showShadowRange ? '1px solid rgba(129, 140, 248, 0.35)' : '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <button
              type="button"
              onClick={() => setShowShadowRange((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#f8fafc',
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
                    backgroundColor: showShadowRange ? '#a5b4fc' : '#64748b',
                    boxShadow: showShadowRange ? '0 0 8px rgba(165, 180, 252, 0.6)' : 'none',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Zakres cienia (Obwiednia badanych)</span>
              </div>
              <div
                style={{
                  width: '28px',
                  height: '16px',
                  borderRadius: '999px',
                  backgroundColor: showShadowRange ? '#818cf8' : '#334155',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: showShadowRange ? '14px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                />
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
                <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Wypełnienie cienia (godziny ±5h):</span>
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
                  <span style={{ fontSize: '10px', fontWeight: 700, color: showShadowFill ? '#a5b4fc' : '#64748b' }}>
                    {showShadowFill ? 'WŁ' : 'WYŁ'}
                  </span>
                  <div
                    style={{
                      width: '28px',
                      height: '16px',
                      borderRadius: '999px',
                      backgroundColor: showShadowFill ? '#818cf8' : '#334155',
                      position: 'relative',
                      transition: 'background-color 0.2s ease',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: '#ffffff',
                        position: 'absolute',
                        top: '2px',
                        left: showShadowFill ? '14px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                      }}
                    />
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 5. Podkład satelitarny */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: showSatelliteLayer ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              border: showSatelliteLayer ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <button
              type="button"
              onClick={() => setShowSatelliteLayer((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#f8fafc',
                cursor: 'pointer',
                padding: 0,
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={14} color={showSatelliteLayer ? '#38bdf8' : '#64748b'} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Podkład satelitarny</span>
              </div>
              <div
                style={{
                  width: '28px',
                  height: '16px',
                  borderRadius: '999px',
                  backgroundColor: showSatelliteLayer ? '#38bdf8' : '#334155',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: showSatelliteLayer ? '14px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                />
              </div>
            </button>

            {showSatelliteLayer && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.5)' }}>
                {/* Dostawca map satelitarnych: Google vs HERE */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>Dostawca mapy:</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      borderRadius: '7px',
                      padding: '2px',
                      border: '1px solid #334155',
                    }}
                  >
                    {SATELLITE_PROVIDERS.map((provider) => (
                      <button
                        key={provider.key}
                        type="button"
                        onClick={() => {
                          if (provider.pro && !isPro) {
                            setPricingModalOpen(true);
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
                          color: satelliteProvider === provider.key ? '#38bdf8' : '#64748b',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        {provider.label}
                        {provider.pro && !isPro && <span style={{ fontSize: '8px', fontWeight: 800, opacity: 0.8 }}>PRO</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                  <span>Krycie podkładu:</span>
                  <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{Math.round(satelliteOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={satelliteOpacity}
                  onChange={(e) => setSatelliteOpacity(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </div>
            )}
          </div>

          {/* 6. Parametry projektu (Bilans powierzchni i kubatury) */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: showProjectParameters ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              border: showProjectParameters ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <button
              type="button"
              onClick={() => setShowProjectParameters((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#f8fafc',
                cursor: 'pointer',
                padding: 0,
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={14} color={showProjectParameters ? 'var(--accent-emerald, #34d399)' : '#64748b'} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Parametry projektu (Bilans i wskaźniki)</span>
              </div>
              <div
                style={{
                  width: '28px',
                  height: '16px',
                  borderRadius: '999px',
                  backgroundColor: showProjectParameters ? '#10b981' : '#334155',
                  position: 'relative',
                  transition: 'background-color 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: showProjectParameters ? '14px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                />
              </div>
            </button>
          </div>

          {/* 7. Podkłady geodezyjne i branżowe (PRO) — ukryte do czasu publikacji, patrz APP_CONFIG.geoOverlays */}
          {APP_CONFIG.geoOverlays.showTogglesPanel && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: 'rgba(99, 102, 241, 0.05)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={14} color="#818cf8" />
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#e0e7ff' }}>
                  Podkłady geodezyjne i branżowe
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowGeoOverlayGroup(!showGeoOverlayGroup)}
                title="Włącz / wyłącz wszystkie podkłady geodezyjne naraz (KIUT, MPZP, BDOT, NMT)"
                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '16px',
                    borderRadius: '999px',
                    backgroundColor: showGeoOverlayGroup ? 'var(--accent-indigo)' : '#334155',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '2px',
                      left: showGeoOverlayGroup ? '14px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              </button>
            </div>

            {/* Ortofotomapa HR GUGiK — dostępna teraz z poziomu przełącznika "Dostawca mapy" w sekcji "Podkład satelitarny" */}

            {/* B. Sieci uzbrojenia terenu GESUT (KIUT) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <button
                type="button"
                onClick={() => setShowKiutLayer(!showKiutLayer)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  color: '#f8fafc',
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
                      backgroundColor: showKiutLayer ? '#fbbf24' : '#64748b',
                      boxShadow: showKiutLayer ? '0 0 6px rgba(251, 191, 36, 0.6)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Uzbrojenie GESUT (KIUT)</span>
                </div>
                <div
                  style={{
                    width: '28px',
                    height: '16px',
                    borderRadius: '999px',
                    backgroundColor: showKiutLayer ? '#f59e0b' : '#334155',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '2px',
                      left: showKiutLayer ? '14px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              </button>
              {showKiutLayer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#94a3b8' }}>
                    <span>Krycie:</span>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{Math.round(kiutOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={kiutOpacity}
                    onChange={(e) => setKiutOpacity(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9.5px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none', paddingTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={kiutInvertColors}
                      onChange={(e) => setKiutInvertColors(e.target.checked)}
                      style={{ accentColor: '#fbbf24', cursor: 'pointer' }}
                    />
                    <span>Odwróć kolory (czytelność na ciemnym tle)</span>
                  </label>
                </div>
              )}
            </div>

            {/* C. Miejscowe plany MPZP (KIMPZP) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <button
                type="button"
                onClick={() => setShowMpzpLayer(!showMpzpLayer)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  color: '#f8fafc',
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
                      backgroundColor: showMpzpLayer ? '#818cf8' : '#64748b',
                      boxShadow: showMpzpLayer ? '0 0 6px rgba(129, 140, 248, 0.6)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Plany miejscowe (MPZP)</span>
                </div>
                <div
                  style={{
                    width: '28px',
                    height: '16px',
                    borderRadius: '999px',
                    backgroundColor: showMpzpLayer ? '#818cf8' : '#334155',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '2px',
                      left: showMpzpLayer ? '14px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              </button>
              {showMpzpLayer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#94a3b8' }}>
                    <span>Krycie:</span>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{Math.round(mpzpOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={mpzpOpacity}
                    onChange={(e) => setMpzpOpacity(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#818cf8', cursor: 'pointer' }}
                  />
                </div>
              )}
            </div>

            {/* D. Obiekty topograficzne BDOT10k */}
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
                  color: '#f8fafc',
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
                      backgroundColor: showBdotLayer ? '#34d399' : '#64748b',
                      boxShadow: showBdotLayer ? '0 0 6px rgba(52, 211, 153, 0.6)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Topografia BDOT10k</span>
                </div>
                <div
                  style={{
                    width: '28px',
                    height: '16px',
                    borderRadius: '999px',
                    backgroundColor: showBdotLayer ? '#10b981' : '#334155',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '2px',
                      left: showBdotLayer ? '14px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              </button>
              {showBdotLayer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#94a3b8' }}>
                    <span>Krycie:</span>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{Math.round(bdotOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={bdotOpacity}
                    onChange={(e) => setBdotOpacity(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#34d399', cursor: 'pointer' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9.5px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none', paddingTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={bdotInvertColors}
                      onChange={(e) => setBdotInvertColors(e.target.checked)}
                      style={{ accentColor: '#34d399', cursor: 'pointer' }}
                    />
                    <span>Odwróć kolory (czytelność na ciemnym tle)</span>
                  </label>
                </div>
              )}
            </div>

            {/* E. Cieniowanie rzeźby terenu (NMT) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: showTerrainLayer ? '#34d399' : '#64748b',
                    boxShadow: showTerrainLayer ? '0 0 6px rgba(52, 211, 153, 0.6)' : 'none',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#f8fafc' }}>Cieniowanie rzeźby (NMT)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTerrainLayer(!showTerrainLayer)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '16px',
                    borderRadius: '999px',
                    backgroundColor: showTerrainLayer ? '#10b981' : '#334155',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '2px',
                      left: showTerrainLayer ? '14px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              </button>
            </div>

            {/* F. Warstwa kontekstowa Overture Maps (zieleń — land_use/land_cover, wrapper REST).
                Drogi/koleje/wody przez surowe partycje Overture świadomie wycofane — patrz
                komentarz przy ensureOvertureContextLoaded(). */}
            <SimpleLayerToggle
              label={overtureLoading ? 'Overture: zieleń (wczytywanie…)' : 'Overture: zieleń'}
              active={showOvertureGreenAreas}
              dotColor="#4ade80"
              onToggle={toggleOvertureGreenAreas}
            />

            {/* G. Strefy MPZP (wektor, pilot Warszawa) — geometria + atrybuty przeznaczenia terenu
                z usługi REST BGiK "PrzeznaczenieTerenow", patrz ensureMpzpZonesLoaded(). */}
            <div
              style={{ opacity: isMpzpZonesAvailableHere ? 1 : 0.45 }}
              title={isMpzpZonesAvailableHere ? undefined : 'Dostępne tylko dla Warszawy (pilot)'}
            >
              <SimpleLayerToggle
                label={mpzpZonesLoading ? 'Strefy MPZP — wektor (wczytywanie…)' : 'Strefy MPZP — wektor (Warszawa)'}
                active={showMpzpZonesLayer}
                dotColor="#60a5fa"
                onToggle={isMpzpZonesAvailableHere ? toggleMpzpZonesLayer : () => {}}
              />
            </div>

            {/* H. Pokrycie terenu (wektor, ogólnopolskie) — geometria + klasyfikacja z usługi
                WFS GUGiK "wfsLCV" (INSPIRE Land Cover, źródło BDOT10k), patrz ensureLandCoverLoaded(). */}
            <SimpleLayerToggle
              label={landCoverLoading ? 'Pokrycie terenu (wczytywanie…)' : 'Pokrycie terenu'}
              active={showLandCoverLayer}
              dotColor="#84cc16"
              onToggle={toggleLandCoverLayer}
            />
          </div>
          )}

          {/* Narzędzia deweloperskie: zapis/wczytanie sceny JSON — widoczne tylko na localhost */}
          {isLocalhost && (
            <div className="ui-card">
              <div className="ui-title">
                <span>Narzędzia deweloperskie</span>
                <Wrench size={14} color="#94a3b8" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                <label
                  className="btn-primary"
                  style={{
                    margin: 0,
                    padding: '8px 4px',
                    fontSize: '10.5px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                  title="Wgraj scenę JSON"
                >
                  <Upload size={14} />
                  <span>Wgraj scenę</span>
                  <input type="file" accept=".json" onChange={handleSceneFileUpload} style={{ display: 'none' }} />
                </label>

                <button
                  type="button"
                  onClick={handleSceneDownload}
                  className="btn-secondary"
                  style={{
                    padding: '8px 4px',
                    fontSize: '10.5px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    textAlign: 'center',
                  }}
                  title="Zapisz scenę JSON"
                >
                  <Download size={14} />
                  <span>Zapisz JSON</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
