import React from 'react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useCadToolStore,
  useUiStore,
} from '../../../../store';
import { parseDxfWithMetadata, DxfUnitOption, createSampleBuildings } from '../../../../utils/dxfParser';
import { computePointsGeoContext, validateGeoCompatibility } from '../../../../utils/geoTransform';
import { PinnedFacadePoint } from '../../../../types/geometry';

export const useProjectIO = () => {
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
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);
  const setSunlightMethod = useSolarAnalysisStore((s) => s.setSunlightMethod);
  const pinnedPoints = useSolarAnalysisStore((s) => s.pinnedPoints);
  const setPinnedPoints = useSolarAnalysisStore((s) => s.setPinnedPoints);
  const activePinnedPointId = useSolarAnalysisStore((s) => s.activePinnedPointId);
  const setActivePinnedPointId = useSolarAnalysisStore((s) => s.setActivePinnedPointId);
  const activePointMode = useSolarAnalysisStore((s) => s.activePointMode);
  const setActivePointMode = useSolarAnalysisStore((s) => s.setActivePointMode);

  // UI Store
  const openModal = useUiStore((s) => s.openModal);
  const setProjectName = useSolarAnalysisStore((s) => s.setProjectName);

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

  const isSceneInitialOrEmpty = (currentBuildings: typeof buildings) => {
    if (!currentBuildings || currentBuildings.length === 0) return true;
    if (
      currentBuildings.length === 3 &&
      currentBuildings[0]?.id === 'bldg-1' &&
      currentBuildings[1]?.id === 'bldg-2' &&
      currentBuildings[2]?.id === 'bldg-3' &&
      pinnedPoints.length === 0
    ) {
      return true;
    }
    return false;
  };

  const applyDxfDirectly = (result: ReturnType<typeof parseDxfWithMetadata>, fileName?: string) => {
    setBuildings(result.buildings);
    setSelectedBuildingId(result.buildings[0]?.id ?? null);
    setPinnedPoints([]);
    setActivePinnedPointId(null);
    setDxfImportInfo(result.unitInfo);

    if (result.report.geoContext.isGeodetic) {
      const { lat, lon } = result.report.geoContext.centerWgs84;
      setSettings({
        ...settings,
        latitude: lat,
        longitude: lon,
      });
      if (result.report.geoContext.nearestCity) {
        setSelectedCity(result.report.geoContext.nearestCity);
        const nameCandidate = fileName ? fileName.replace(/\.[^/.]+$/, '') : result.report.geoContext.nearestCity;
        setProjectName(nameCandidate);
      }
    }
    triggerFit();
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

        if (result.buildings.length === 0) {
          alert('Nie znaleziono zamkniętych polilinii ani obiektów w pliku DXF.');
          return;
        }

        // Jeśli scena jest pusta lub zawiera tylko domyślne budynki startowe -> wczytaj bezpośrednio
        if (isSceneInitialOrEmpty(buildings)) {
          applyDxfDirectly(result, file.name);
          return;
        }

        // Jeśli scena zawiera już obiekty -> przeprowadź analizę zgodności geograficznej i otwórz modal
        const allScenePts = buildings.flatMap((b) => b.vertices || []);
        const sceneContext = computePointsGeoContext(allScenePts, {
          lat: settings.latitude,
          lon: settings.longitude,
        });
        const geoCompatibility = validateGeoCompatibility(sceneContext, result.report.geoContext);

        openModal('dxfImport', {
          fileName: file.name,
          parsedResult: result,
          geoCompatibility,
          onMerge: () => {
            const timestamp = Date.now();
            const mergedBuildings = result.buildings.map((b, idx) => ({
              ...b,
              id: `dxf-${timestamp}-${idx + 1}-${b.id}`,
              name: b.name || `Budynek DXF ${idx + 1}`,
            }));
            setBuildings([...buildings, ...mergedBuildings]);
            setDxfImportInfo(result.unitInfo);
            triggerFit();
          },
          onReplace: () => {
            applyDxfDirectly(result, file.name);
          },
        });
      } catch (err) {
        console.error('Błąd podczas parsowania pliku DXF:', err);
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
      } catch {
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

  return {
    dxfUnit,
    dxfImportInfo,
    handleFileUpload,
    handleDxfUnitChange,
    handleSceneFileUpload,
    handleSceneDownload,
    applyLoadedScene,
  };
};
