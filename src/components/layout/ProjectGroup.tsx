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
import { useWfsStore, ProjectRadius } from '../../modules/wfs-import/store/useWfsStore';
import { fetchParcelsInRadius } from '../../modules/wfs-import/services/uldkClient';
import { fetchWarsawBuildings } from '../../modules/wfs-import/services/wfsWarsawClient';
import { importBuildingsFromGeoJson } from '../../modules/wfs-import/services/geoJsonImporter';
import { latLonToBbox } from '../../modules/wfs-import/services/geocoding';
import { detectCoordinateSystem } from '../../utils/geoTransform';
import { parseGoogleMapsCoordinates } from '../../utils/geoParser';
import { parseDxfWithMetadata, DxfUnitOption, createSampleBuildings } from '../../utils/dxfParser';
import { exportSceneToDxf } from '../../utils/dxfExport';
import { PinnedFacadePoint, BuildingLoop } from '../../types/geometry';
import { APP_CONFIG } from '../../config/appConfig';

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

  const handleExportDxf = () => {
    if (!isPro) {
      setPricingModalOpen(true);
      return;
    }
    exportSceneToDxf({
      buildings,
      pinnedPoints,
    });
  };

  // WFS Store & Geo Data
  const projectRadius = useWfsStore((s) => s.projectRadius);
  const setProjectRadius = useWfsStore((s) => s.setProjectRadius);
  const isProjectCenterLocked = useWfsStore((s) => s.isProjectCenterLocked);
  const setIsProjectCenterLocked = useWfsStore((s) => s.setIsProjectCenterLocked);
  const showOrthophotoLayer = useWfsStore((s) => s.showOrthophotoLayer);
  const setShowOrthophotoLayer = useWfsStore((s) => s.setShowOrthophotoLayer);
  const orthophotoOpacity = useWfsStore((s) => s.orthophotoOpacity);
  const setOrthophotoOpacity = useWfsStore((s) => s.setOrthophotoOpacity);
  const showKiutLayer = useWfsStore((s) => s.showKiutLayer);
  const setShowKiutLayer = useWfsStore((s) => s.setShowKiutLayer);
  const kiutOpacity = useWfsStore((s) => s.kiutOpacity);
  const setKiutOpacity = useWfsStore((s) => s.setKiutOpacity);
  const showMpzpLayer = useWfsStore((s) => s.showMpzpLayer);
  const setShowMpzpLayer = useWfsStore((s) => s.setShowMpzpLayer);
  const mpzpOpacity = useWfsStore((s) => s.mpzpOpacity);
  const setMpzpOpacity = useWfsStore((s) => s.setMpzpOpacity);
  const showBdotLayer = useWfsStore((s) => s.showBdotLayer);
  const setShowBdotLayer = useWfsStore((s) => s.setShowBdotLayer);
  const bdotOpacity = useWfsStore((s) => s.bdotOpacity);
  const setBdotOpacity = useWfsStore((s) => s.setBdotOpacity);
  const showTerrainLayer = useWfsStore((s) => s.showTerrainLayer);
  const setShowTerrainLayer = useWfsStore((s) => s.setShowTerrainLayer);
  const showEgibLayer = useWfsStore((s) => s.showEgibLayer);
  const setShowEgibLayer = useWfsStore((s) => s.setShowEgibLayer);
  const status = useWfsStore((s) => s.status);
  const setStatus = useWfsStore((s) => s.setStatus);

  const [syncFeedback, setSyncFeedback] = React.useState<string | null>(null);

  const handleSyncGeoData = async () => {
    if (!isPro) {
      setPricingModalOpen(true);
      return;
    }
    setStatus({ isFetching: true, error: null, info: null });
    setSyncFeedback(null);
    try {
      const centerLat = settings.latitude;
      const centerLon = settings.longitude;
      const radius = projectRadius;
      const projectCenter = { lat: centerLat, lon: centerLon };
      const projectCrs = detectCoordinateSystem(buildings.flatMap((b) => b.vertices || []));

      // 1. Działki ewidencyjne z ULDK (ogólnopolskie wektory)
      const parcels = await fetchParcelsInRadius(centerLat, centerLon, radius, projectCrs, projectCenter);

      // 2. Budynki wektorowe (dla Warszawy WFS, dla innych miast serwisy lokalne)
      const bbox = latLonToBbox(centerLat, centerLon, radius);
      let importedBuildings: BuildingLoop[] = [];
      const WARSAW_BBOX = [20.85, 52.09, 21.27, 52.37];
      const isWarsaw = centerLon >= WARSAW_BBOX[0] && centerLon <= WARSAW_BBOX[2] && centerLat >= WARSAW_BBOX[1] && centerLat <= WARSAW_BBOX[3];

      if (isWarsaw) {
        try {
          const bldGeoJson = await fetchWarsawBuildings(bbox);
          const sourceCrs = { crs: 'EPSG:2178' as const, description: 'PL-2000 strefa 7', geodeticLabel: 'ETRF2000-PL / CS2000 / 21', isGeodetic: true, zone: 7 };
          const res = importBuildingsFromGeoJson(bldGeoJson, sourceCrs, projectCrs, projectCenter, radius);
          importedBuildings = res.buildings;
        } catch {
          // kontynuuj z działkami
        }
      }

      // 3. Synchronizacja do sceny
      const existingUserBuildings = buildings.filter((b) => !b.id.startsWith('uldk-') && !b.id.startsWith('wfs-'));
      const combined = [...existingUserBuildings, ...parcels, ...importedBuildings];
      setBuildings(combined);

      setStatus({
        isFetching: false,
        error: null,
        info: null,
        parcelsCount: parcels.length,
        buildingsCount: importedBuildings.length,
      });
      setSyncFeedback(`Zsynchronizowano: ${parcels.length} działek, ${importedBuildings.length} budynków`);

      // 5. Prefetch kafelków satelitarnych w obszarze zasięgu projektu
      window.dispatchEvent(new CustomEvent('geo-prefetch-satellite', {
        detail: { lat: centerLat, lon: centerLon, radius },
      }));

      triggerFit();
    } catch (err) {
      setStatus({
        isFetching: false,
        error: err instanceof Error ? err.message : 'Błąd synchronizacji',
        info: null,
      });
    }
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
                <span>{status.isFetching ? 'Synchronizacja danych...' : 'Pobierz działki i budynki'}</span>
              </button>

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
                className="btn-tile active-cyan"
                style={{
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 6px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
                title="Eksportuj geometrię i punkty pomiarowe do formatu CAD DXF"
              >
                <FileCode size={13} />
                <span>Eksport DXF</span>
              </button>
            )}
          </div>

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
                    <button
                      type="button"
                      onClick={() => setSatelliteProvider('google')}
                      title="Google Maps Satellite (Aktywny)"
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: satelliteProvider === 'google' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                        color: satelliteProvider === 'google' ? '#38bdf8' : '#64748b',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Google
                    </button>
                    <button
                      type="button"
                      disabled
                      title="HERE Satellite (Zablokowane — integracja wkrótce)"
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'not-allowed',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#475569',
                        opacity: 0.6,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      HERE
                    </button>
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
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  backgroundColor: 'var(--accent-indigo)',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: '4px',
                }}
              >
                PRO
              </span>
            </div>

            {/* A. Ortofotomapa HR GUGiK */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <button
                type="button"
                onClick={() => setShowOrthophotoLayer(!showOrthophotoLayer)}
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
                      backgroundColor: showOrthophotoLayer ? '#38bdf8' : '#64748b',
                      boxShadow: showOrthophotoLayer ? '0 0 6px rgba(56, 189, 248, 0.6)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Ortofotomapa HR (&le;10 cm)</span>
                </div>
                <div
                  style={{
                    width: '28px',
                    height: '16px',
                    borderRadius: '999px',
                    backgroundColor: showOrthophotoLayer ? '#38bdf8' : '#334155',
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
                      left: showOrthophotoLayer ? '14px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              </button>
              {showOrthophotoLayer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#94a3b8' }}>
                    <span>Krycie:</span>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{Math.round(orthophotoOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={orthophotoOpacity}
                    onChange={(e) => setOrthophotoOpacity(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </div>
              )}
            </div>

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

            {/* F. Ewidencja gruntów i budynków (KIEG) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: showEgibLayer ? '#f43f5e' : '#64748b',
                    boxShadow: showEgibLayer ? '0 0 6px rgba(244, 63, 94, 0.6)' : 'none',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#f8fafc' }}>Ewidencja gruntów (KIEG)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEgibLayer(!showEgibLayer)}
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
                    backgroundColor: showEgibLayer ? '#f43f5e' : '#334155',
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
                      left: showEgibLayer ? '14px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              </button>
            </div>
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
