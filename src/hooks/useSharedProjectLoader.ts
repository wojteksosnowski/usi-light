import { useState, useEffect, useRef } from 'react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useCadToolStore,
} from '../store';
import { decompressProjectData, gunzipAndDeserializePayload, tuplesToPoints } from '../utils/shareSerializer';
import { decryptPayload } from '../utils/shareCrypto';
import { ShareApiGetResponse, SharedBuildingV2, SharedProjectPayload } from '../types/sharing';
import { BuildingLoop } from '../types/geometry';
import { SHARE_V2_BUILDING_DEFAULTS } from '../utils/shareDefaults';
import { applyBuildingModifiers } from '../engine/modifiers/modifierPipeline';

function reifyV2Building(sb: SharedBuildingV2): BuildingLoop {
  const building: BuildingLoop = {
    id: sb.id,
    name: sb.name,
    layer: sb.layer,
    isTested: sb.isTested,
    category: sb.category ?? SHARE_V2_BUILDING_DEFAULTS.category,
    areaType: sb.areaType,
    plotNumber: sb.plotNumber,
    elevation: sb.elevation ?? SHARE_V2_BUILDING_DEFAULTS.elevation,
    firstFloorHeight: sb.firstFloorHeight ?? SHARE_V2_BUILDING_DEFAULTS.firstFloorHeight,
    typicalFloorHeight: sb.typicalFloorHeight ?? SHARE_V2_BUILDING_DEFAULTS.typicalFloorHeight,
    storeysCount: sb.storeysCount,
    modifiers: sb.modifiers ?? [],
    storyPolygons: [],
    zonePolygons: [],
    isIncluded: sb.isIncluded ?? SHARE_V2_BUILDING_DEFAULTS.isIncluded,
    isLocked: sb.isLocked,
    isGhosted: sb.isGhosted,
    isCityCentre: sb.isCityCentre ?? SHARE_V2_BUILDING_DEFAULTS.isCityCentre,
    buildingType: sb.buildingType ?? SHARE_V2_BUILDING_DEFAULTS.buildingType,
    defaultHeight: sb.defaultHeight,
    hWindowBottom: sb.hWindowBottom ?? SHARE_V2_BUILDING_DEFAULTS.hWindowBottom,
    vertices: tuplesToPoints(sb.vertices),
    segments: [],
    sweepPath: sb.sweepPath ? tuplesToPoints(sb.sweepPath) : undefined,
    sweepWidth: sb.sweepWidth,
    sweepAlignment: sb.sweepAlignment,
    playgroundVoronoi: sb.playgroundVoronoi,
    playgroundParams: sb.playgroundParams,
    groupId: sb.groupId,
    transform: sb.transform ?? SHARE_V2_BUILDING_DEFAULTS.transform,
  };
  const { segments, storyPolygons, zonePolygons } = applyBuildingModifiers(building);
  return { ...building, segments, storyPolygons, zonePolygons };
}

export interface SharedProjectLoadStatus {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  projectName?: string;
}

export function useSharedProjectLoader() {
  const [loadStatus, setLoadStatus] = useState<SharedProjectLoadStatus>({ status: 'idle' });
  const hasAttemptedRef = useRef(false);

  // Store actions
  const loadSceneData = useSceneStore((s) => s.loadSceneData);
  const setBuildings = useSceneStore((s) => s.setBuildings);
  const setSelectedBuildingId = useSceneStore((s) => s.setSelectedBuildingId);
  const setLayerSettings = useSceneStore((s) => s.setLayerSettings);
  const setSelectedLayerName = useSceneStore((s) => s.setSelectedLayerName);
  const setDxfUnit = useSceneStore((s) => s.setDxfUnit);
  const setDxfImportInfo = useSceneStore((s) => s.setDxfImportInfo);

  const setSettings = useSolarAnalysisStore((s) => s.setSettings);
  const setSelectedCity = useSolarAnalysisStore((s) => s.setSelectedCity);
  const setMapsInput = useSolarAnalysisStore((s) => s.setMapsInput);
  const setShowNormals = useSolarAnalysisStore((s) => s.setShowNormals);
  const setShowShadowingLines = useSolarAnalysisStore((s) => s.setShowShadowingLines);
  const setShowSunlightLines = useSolarAnalysisStore((s) => s.setShowSunlightLines);
  const setShowAnalysisPoints = useSolarAnalysisStore((s) => s.setShowAnalysisPoints);
  const setShowShadowRange = useSolarAnalysisStore((s) => s.setShowShadowRange);
  const setShowShadowFill = useSolarAnalysisStore((s) => s.setShowShadowFill);
  const setShowSatelliteLayer = useSolarAnalysisStore((s) => s.setShowSatelliteLayer);
  const setSatelliteOpacity = useSolarAnalysisStore((s) => s.setSatelliteOpacity);
  const setSunlightMethod = useSolarAnalysisStore((s) => s.setSunlightMethod);
  const setActivePointMode = useSolarAnalysisStore((s) => s.setActivePointMode);
  const setPinnedPoints = useSolarAnalysisStore((s) => s.setPinnedPoints);
  const setActivePinnedPointId = useSolarAnalysisStore((s) => s.setActivePinnedPointId);

  const setViewRotationDeg = useCadToolStore((s) => s.setViewRotationDeg);
  const setSavedViewRotationDeg = useCadToolStore((s) => s.setSavedViewRotationDeg);
  const setDimensions = useCadToolStore((s) => s.setDimensions);
  const triggerFit = useCadToolStore((s) => s.triggerFit);

  useEffect(() => {
    if (hasAttemptedRef.current) return;

    // 1. Ekstrakcja shareId ze ścieżki (/p/:id) lub parametru URL (?share=:id / ?p=:id)
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    let shareId: string | null = null;
    const pathMatch = pathname.match(/\/p\/([a-zA-Z0-9_-]+)/);
    if (pathMatch && pathMatch[1]) {
      shareId = pathMatch[1];
    } else if (searchParams.get('share')) {
      shareId = searchParams.get('share');
    } else if (searchParams.get('p')) {
      shareId = searchParams.get('p');
    }

    if (!shareId) return;
    hasAttemptedRef.current = true;

    // Klucz deszyfrujący E2EE żyje wyłącznie w fragmencie URL (nigdy wysyłany do serwera)
    const fragmentKey = window.location.hash.slice(1) || null;

    // 2. Pobieranie danych z endpointu API
    const loadProject = async () => {
      setLoadStatus({ status: 'loading', message: 'Wczytywanie udostępnionego projektu...' });

      try {
        const response = await fetch(`/api/share?id=${encodeURIComponent(shareId)}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Nie udało się pobrać projektu (kod ${response.status})`);
        }

        const data = (await response.json()) as ShareApiGetResponse;
        if (!data.compressedData) {
          throw new Error('Otrzymano puste dane projektu.');
        }

        // 3. Deszyfrowanie (E2EE) lub dekompresja formatu legacy w przeglądarce
        let payload: SharedProjectPayload;
        if (data.version === 1 && data.iv && data.ciphertext) {
          if (!fragmentKey) {
            throw new Error(
              'Brak klucza deszyfrującego w adresie URL. Użyj pełnego linku zawierającego fragment po znaku "#".'
            );
          }
          try {
            const gzippedBytes = await decryptPayload(
              { version: 1, iv: data.iv, ciphertext: data.ciphertext },
              fragmentKey
            );
            payload = gunzipAndDeserializePayload(gzippedBytes);
          } catch {
            throw new Error('Nie udało się odszyfrować projektu — link jest nieprawidłowy lub uszkodzony.');
          }
        } else if (data.compressedData) {
          payload = decompressProjectData(data.compressedData);
        } else {
          throw new Error('Otrzymano puste lub nieprawidłowe dane projektu.');
        }

        // 4. Hydratacja stanu do store'ów aplikacji (Pełny edytor bez trybu prezentacji)
        if (payload.scene) {
          const buildings =
            payload.v === 2
              ? payload.scene.buildings.map(reifyV2Building)
              : payload.scene.buildings; // v1: geometria wyliczona jest już zapisana w payloadzie

          setBuildings(buildings);

          if (payload.v === 1 && payload.scene.selectedBuildingId) {
            setSelectedBuildingId(payload.scene.selectedBuildingId);
          } else if (buildings.length > 0) {
            setSelectedBuildingId(buildings[0].id);
          }
          if (payload.scene.layerSettings) {
            setLayerSettings(payload.scene.layerSettings);
          }
          if (payload.v === 1 && payload.scene.selectedLayerName !== undefined) {
            setSelectedLayerName(payload.scene.selectedLayerName);
          }
          if (payload.scene.pinnedPoints) {
            setPinnedPoints(payload.scene.pinnedPoints);
            const activeId = payload.v === 1 ? payload.scene.activePinnedPointId : undefined;
            setActivePinnedPointId(
              activeId || (payload.scene.pinnedPoints.length > 0 ? payload.scene.pinnedPoints[0].id : null)
            );
          }
          if (payload.scene.dimensions) {
            setDimensions(payload.scene.dimensions);
          }
          if (payload.scene.dxfUnit) {
            setDxfUnit(payload.scene.dxfUnit);
          }
          if (payload.scene.dxfImportInfo) {
            setDxfImportInfo(payload.scene.dxfImportInfo);
          }
        }

        if (payload.solar) {
          setSettings((prev) => ({
            ...prev,
            latitude: payload.solar.latitude ?? prev.latitude,
            longitude: payload.solar.longitude ?? prev.longitude,
            equinoxDate: payload.solar.equinoxDate ?? prev.equinoxDate,
          }));
          if (payload.solar.selectedCity) setSelectedCity(payload.solar.selectedCity);
          if (payload.solar.mapsInput !== undefined) setMapsInput(payload.solar.mapsInput);
          if (payload.solar.sunlightMethod) setSunlightMethod(payload.solar.sunlightMethod);

          if (payload.v === 1) {
            if (payload.solar.showNormals !== undefined) setShowNormals(payload.solar.showNormals);
            if (payload.solar.showShadowingLines !== undefined) setShowShadowingLines(payload.solar.showShadowingLines);
            if (payload.solar.showSunlightLines !== undefined) setShowSunlightLines(payload.solar.showSunlightLines);
            if (payload.solar.showAnalysisPoints !== undefined) setShowAnalysisPoints(payload.solar.showAnalysisPoints);
            if (payload.solar.activePointMode) setActivePointMode(payload.solar.activePointMode);
            if (payload.solar.showShadowFill !== undefined) setShowShadowFill(payload.solar.showShadowFill);
            if (payload.solar.showSatelliteLayer !== undefined) setShowSatelliteLayer(payload.solar.showSatelliteLayer);
            if (payload.solar.satelliteOpacity !== undefined) setSatelliteOpacity(payload.solar.satelliteOpacity);
          }
        }

        if (payload.v === 1 && payload.viewport) {
          if (payload.viewport.rotation !== undefined) {
            setViewRotationDeg(payload.viewport.rotation);
          }
          if (payload.viewport.savedRotation !== undefined) {
            setSavedViewRotationDeg(payload.viewport.savedRotation);
          }
        }
        // v2: brak zapisanego viewportu — kamera dopasowywana automatycznie (triggerFit poniżej).

        // Zoom extents do wczytanych obiektów
        setTimeout(() => {
          triggerFit();
        }, 100);

        setLoadStatus({
          status: 'success',
          message: 'Projekt został pomyślnie wczytany!',
          projectName: payload.metadata?.name,
        });

        // Ukryj komunikat sukcesu po 5 sekundach
        setTimeout(() => {
          setLoadStatus((prev) => (prev.status === 'success' ? { status: 'idle' } : prev));
        }, 5000);
      } catch (err: any) {
        console.error('Błąd podczas ładowania udostępnionego projektu:', err);
        setLoadStatus({
          status: 'error',
          message: err.message || 'Wystąpił błąd podczas wczytywania projektu.',
        });
      }
    };

    loadProject();
  }, [
    loadSceneData,
    setBuildings,
    setSelectedBuildingId,
    setLayerSettings,
    setSelectedLayerName,
    setDxfUnit,
    setDxfImportInfo,
    setSettings,
    setSelectedCity,
    setMapsInput,
    setShowNormals,
    setShowShadowingLines,
    setShowSunlightLines,
    setShowShadowRange,
    setShowShadowFill,
    setShowSatelliteLayer,
    setSatelliteOpacity,
    setSunlightMethod,
    setActivePointMode,
    setPinnedPoints,
    setActivePinnedPointId,
    setViewRotationDeg,
    setSavedViewRotationDeg,
    setDimensions,
    triggerFit,
  ]);

  return {
    loadStatus,
    dismissStatus: () => setLoadStatus({ status: 'idle' }),
  };
}
