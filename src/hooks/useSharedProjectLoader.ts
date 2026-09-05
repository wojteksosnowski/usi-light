import { useState, useEffect, useRef } from 'react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useCadToolStore,
} from '../store';
import { decompressProjectData } from '../utils/shareSerializer';
import { ShareApiGetResponse } from '../types/sharing';

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
  const setShowShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const setShowSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const setShowShadowRange = useSolarAnalysisStore((s) => s.showShadowRange);
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

        // 3. Dekompresja w przeglądarce
        const payload = decompressProjectData(data.compressedData);

        // 4. Hydratacja stanu do store'ów aplikacji (Pełny edytor bez trybu prezentacji)
        if (payload.scene) {
          setBuildings(payload.scene.buildings || []);
          if (payload.scene.selectedBuildingId) {
            setSelectedBuildingId(payload.scene.selectedBuildingId);
          } else if (payload.scene.buildings && payload.scene.buildings.length > 0) {
            setSelectedBuildingId(payload.scene.buildings[0].id);
          }
          if (payload.scene.layerSettings) {
            setLayerSettings(payload.scene.layerSettings);
          }
          if (payload.scene.selectedLayerName !== undefined) {
            setSelectedLayerName(payload.scene.selectedLayerName);
          }
          if (payload.scene.pinnedPoints) {
            setPinnedPoints(payload.scene.pinnedPoints);
            setActivePinnedPointId(
              payload.scene.activePinnedPointId || (payload.scene.pinnedPoints.length > 0 ? payload.scene.pinnedPoints[0].id : null)
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
          if (payload.solar.showNormals !== undefined) setShowNormals(payload.solar.showNormals);
          if (payload.solar.sunlightMethod) setSunlightMethod(payload.solar.sunlightMethod);
          if (payload.solar.activePointMode) setActivePointMode(payload.solar.activePointMode);
          if (payload.solar.showShadowFill !== undefined) setShowShadowFill(payload.solar.showShadowFill);
          if (payload.solar.showSatelliteLayer !== undefined) setShowSatelliteLayer(payload.solar.showSatelliteLayer);
          if (payload.solar.satelliteOpacity !== undefined) setSatelliteOpacity(payload.solar.satelliteOpacity);
        }

        if (payload.viewport) {
          if (payload.viewport.rotation !== undefined) {
            setViewRotationDeg(payload.viewport.rotation);
          }
          if (payload.viewport.savedRotation !== undefined) {
            setSavedViewRotationDeg(payload.viewport.savedRotation);
          }
        }

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
