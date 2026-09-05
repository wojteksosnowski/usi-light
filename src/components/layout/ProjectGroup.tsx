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
} from 'lucide-react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useCadToolStore,
  useUiStore,
  POLISH_CITIES,
} from '../../store';
import { parseGoogleMapsCoordinates } from '../../utils/geoParser';
import { parseDxfWithMetadata, DxfUnitOption, createSampleBuildings } from '../../utils/dxfParser';
import { PinnedFacadePoint } from '../../types/geometry';

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

  return (
    <div className="sidebar-group-content">
      {/* 1.1 Lokalizacja (Kąt słońca § 56) */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Lokalizacja (Kąt słońca § 56)</span>
          <MapPin size={14} color="#f59e0b" />
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
            }}
          >
            <Link size={13} color={mapsParseError ? '#f43f5e' : '#f59e0b'} style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={mapsInput}
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
              }}
              title="Wklej link z Google Maps lub współrzędne (np. 52.23, 21.01)"
            />
            {mapsInput && (
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
              Nie rozpoznano współrzędnych. Wklej link lub np. 52.23, 21.01
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

          {/* Coordinates info pill */}
          <div
            style={{
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
            <span>Współrzędne:</span>
            <span style={{ color: '#fbbf24', fontWeight: 600, fontFamily: 'monospace' }}>
              {settings.latitude.toFixed(4)}° N, {settings.longitude.toFixed(4)}° E
            </span>
          </div>
        </div>
      </div>

      {/* Główny przycisk udostępniania projektu */}
      <button
        type="button"
        onClick={() => setShareModalOpen(true)}
        className="btn-primary"
        style={{
          padding: '9px 12px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          cursor: 'pointer',
        }}
        title="Udostępnij projekt online za pomocą linku (Upstash Redis, 14 dni)"
      >
        <Share2 size={15} />
        <span>Udostępnij projekt</span>
      </button>

      {/* Przyciski importu i eksportu sceny/DXF - leżą obok siebie (Grid 3-kolumnowy) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
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
          title="Wgraj plik DXF"
        >
          <Upload size={14} />
          <span>Wgraj DXF</span>
          <input type="file" accept=".dxf" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>

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

      {/* 1.2 Jednostki DXF / Skala */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Jednostki DXF / Skala</span>
          <Sliders size={14} color="#818cf8" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

          {/* 3. Wektory normalne fasad (w sidebarze) */}
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

          {/* 5. Podkład satelitarny Google Maps */}
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
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Podkład satelitarny Google</span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid rgba(51, 65, 85, 0.5)' }}>
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
        </div>
      </div>
    </div>
  );
};
