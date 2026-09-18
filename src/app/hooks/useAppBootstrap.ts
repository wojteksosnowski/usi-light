import { useEffect, useRef, useMemo } from 'react';
import {
  useSceneStore,
  useCadToolStore,
  useSolarAnalysisStore,
  useLicenseStore,
  useUiStore,
  SavedSceneData,
} from '@/store';
import { useAnalysisWorker } from '@/hooks/useAnalysisWorker';
import { useSharedProjectLoader } from '@/hooks/useSharedProjectLoader';
import { registerGeoLayers, useGeoTileWarmup } from '@/modules/wfs-import';
import { normalizeLegacyBuildingTypes } from '@/utils/legacyBuildingType';
import { AnalysisAccuracyOptions } from '@/engine/analysisEngine';
import { saveProjectToStorage, sanitizeBuildingForStorage } from '@/utils/projectStorage';
import { extractLicenseKeyFromUrl, stripLicenseFromUrl } from '@/utils/licenseUrl';

const SCENE_STORAGE_KEY = 'usi-light.scene.v1';

export function useAppBootstrap() {
  // License & Stripe Checkout
  const initializeLicense = useLicenseStore((s) => s.initializeLicense);
  const activateLicense = useLicenseStore((s) => s.activateLicense);
  const showCopiedToast = useUiStore((s) => s.showCopiedToast);
  const setPaymentSuccessModalOpen = useUiStore((s) => s.setPaymentSuccessModalOpen);
  const setPaymentSuccessSessionId = useUiStore((s) => s.setPaymentSuccessSessionId);

  useEffect(() => {
    // 1. Sprawdzenie czy w linku URL przekazano klucz aktywacyjny (?key=... / ?license=... / #key=...)
    const keyFromUrl = extractLicenseKeyFromUrl();

    if (keyFromUrl) {
      (async () => {
        const res = await activateLicense(keyFromUrl);
        stripLicenseFromUrl();
        if (res.success) {
          showCopiedToast(`Aktywowano wersję PRO (${res.message || 'Dostęp aktywny'})`);
        } else {
          showCopiedToast(`Błąd klucza z linku: ${res.error || 'Nieprawidłowy kod'}`);
        }
      })();
    } else {
      initializeLicense();
    }

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isPaymentSuccess = urlParams.get('payment_success') === 'true';
      const sessionId = urlParams.get('session_id');

      if (isPaymentSuccess && sessionId) {
        setPaymentSuccessSessionId(sessionId);
        setPaymentSuccessModalOpen(true);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {
      console.warn('Błąd odczytu parametrów URL:', e);
    }
  }, [initializeLicense, activateLicense, showCopiedToast, setPaymentSuccessModalOpen, setPaymentSuccessSessionId]);

  // Shared project hydration
  const { loadStatus, dismissStatus } = useSharedProjectLoader();

  // Geo module: register WMS/WFS layers in render pipeline
  useEffect(() => {
    registerGeoLayers();
  }, []);

  // Cichy warm-up bufora kafli WMS dla wszystkich serwisów (Z16-Z18)
  useGeoTileWarmup();

  // Scene Store
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const dxfUnit = useSceneStore((s) => s.dxfUnit);
  const dxfImportInfo = useSceneStore((s) => s.dxfImportInfo);
  const loadSceneData = useSceneStore((s) => s.loadSceneData);

  // CAD Tool Store
  const isInteracting = useCadToolStore((s) => s.isInteracting);
  const dimensions = useCadToolStore((s) => s.dimensions);
  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const savedViewRotationDeg = useCadToolStore((s) => s.savedViewRotationDeg);
  const setShowModifiersPanel = useCadToolStore((s) => s.setShowModifiersPanel);
  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);

  // Solar Analysis Store
  const projectName = useSolarAnalysisStore((s) => s.projectName);
  const currentProjectId = useSolarAnalysisStore((s) => s.currentProjectId);
  const settings = useSolarAnalysisStore((s) => s.settings);
  const setSettings = useSolarAnalysisStore((s) => s.setSettings);
  const selectedCity = useSolarAnalysisStore((s) => s.selectedCity);
  const mapsInput = useSolarAnalysisStore((s) => s.mapsInput);
  const mapsParseError = useSolarAnalysisStore((s) => s.mapsParseError);
  const showNormals = useSolarAnalysisStore((s) => s.showNormals);
  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const showAnalysisPoints = useSolarAnalysisStore((s) => s.showAnalysisPoints);
  const showShadowRange = useSolarAnalysisStore((s) => s.showShadowRange);
  const showShadowFill = useSolarAnalysisStore((s) => s.showShadowFill);
  const showSatelliteLayer = useSolarAnalysisStore((s) => s.showSatelliteLayer);
  const satelliteOpacity = useSolarAnalysisStore((s) => s.satelliteOpacity);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);
  const accuracyStage = useSolarAnalysisStore((s) => s.accuracyStage);
  const setAccuracyStage = useSolarAnalysisStore((s) => s.setAccuracyStage);
  const pinnedPoints = useSolarAnalysisStore((s) => s.pinnedPoints);
  const setPinnedPoints = useSolarAnalysisStore((s) => s.setPinnedPoints);
  const activePinnedPointId = useSolarAnalysisStore((s) => s.activePinnedPointId);
  const setActivePinnedPointId = useSolarAnalysisStore((s) => s.setActivePinnedPointId);
  const activePointMode = useSolarAnalysisStore((s) => s.activePointMode);
  const setAnalysisOutput = useSolarAnalysisStore((s) => s.setAnalysisOutput);

  const sceneHydratedRef = useRef(false);

  // Progressive Accuracy Refinement Effect
  useEffect(() => {
    if (isInteracting) {
      setAccuracyStage('live');
      return;
    }
    const timer = setTimeout(() => {
      setAccuracyStage('final');
    }, 200);
    return () => clearTimeout(timer);
  }, [isInteracting, setAccuracyStage]);

  // Automatyczne otwieranie panelu Modyfikatory 2.5D gdy zaznaczony obiekt posiada modyfikatory
  useEffect(() => {
    if (!selectedBuildingId) {
      setShowModifiersPanel(false);
      return;
    }
    const bldg = buildings.find((b) => b.id === selectedBuildingId);
    if (bldg && Array.isArray(bldg.modifiers) && bldg.modifiers.length > 0) {
      setShowModifiersPanel(true);
    } else {
      setShowModifiersPanel(false);
    }
  }, [selectedBuildingId, buildings, setShowModifiersPanel]);

  // Wyjście z edycji wierzchołków, gdy edytowany obiekt przestaje być zaznaczony
  useEffect(() => {
    if (!selectedBuildingId && drawingMode === 'vertexEdit') {
      setDrawingMode('none');
    }
  }, [selectedBuildingId, drawingMode, setDrawingMode]);

  // Dev-only: ładowanie sceny testowej z URL (?perfScene=/perf-scene.json)
  useEffect(() => {
    const perfSceneUrl = new URLSearchParams(window.location.search).get('perfScene');
    if (!perfSceneUrl) return;
    (async () => {
      try {
        const res = await fetch(perfSceneUrl);
        const scene = (await res.json()) as SavedSceneData;
        loadSceneData(scene);
        sceneHydratedRef.current = true;
        console.log(`[perfScene] Załadowano ${scene.buildings?.length ?? 0} obiektów z ${perfSceneUrl}`);
      } catch (err) {
        console.error('[perfScene] Błąd ładowania sceny testowej:', err);
      }
    })();
  }, [loadSceneData]);

  // LocalStorage Persistence (Load on mount)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('perfScene')) return;
    try {
      const raw = localStorage.getItem(SCENE_STORAGE_KEY);
      if (!raw) return;
      const scene = JSON.parse(raw) as SavedSceneData;
      if (!scene || scene.version !== 1) return;
      normalizeLegacyBuildingTypes(scene.buildings);

      loadSceneData(scene);
      if (scene.settings) setSettings(scene.settings);
      if (scene.pinnedPoints) setPinnedPoints(scene.pinnedPoints);
      if (scene.activePinnedPointId) setActivePinnedPointId(scene.activePinnedPointId);
      sceneHydratedRef.current = true;
    } catch (err) {
      console.warn('Nie udało się wczytać zapisanej sceny:', err);
    }
  }, [loadSceneData, setSettings, setPinnedPoints, setActivePinnedPointId]);

  // LocalStorage Persistence (Debounced Save on update, skipping when isInteracting)
  useEffect(() => {
    if (!sceneHydratedRef.current) return;
    if (new URLSearchParams(window.location.search).get('perfScene')) return;
    if (isInteracting) return; // Nie zapisujemy podczas przeciągania myszą / animacji

    const timer = setTimeout(() => {
      const scene: SavedSceneData = {
        version: 1,
        buildings: buildings.map(sanitizeBuildingForStorage),
        selectedBuildingId,
        pinnedPoints,
        activePinnedPointId,
        settings,
        layerSettings,
        dxfUnit,
        dxfImportInfo,
        viewRotationDeg,
        savedViewRotationDeg,
        sunlightMethod,
        activePointMode,
        selectedCity,
        mapsInput,
        mapsParseError,
      };

      try {
        localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scene));
      } catch (err) {
        console.warn('Nie udało się zapisać bieżącego stanu sceny (localStorage):', err);
      }

      if (currentProjectId) {
        try {
          saveProjectToStorage(
            {
              name: projectName.trim() || `Projekt ${selectedCity || 'Światło'}`,
              version: 1,
              scene: {
                buildings,
                selectedBuildingId,
                layerSettings,
                pinnedPoints,
                activePinnedPointId,
                dimensions,
                dxfUnit,
                dxfImportInfo,
              },
              solar: {
                settings,
                selectedCity,
                mapsInput,
                mapsParseError,
                sunlightMethod,
                showNormals,
                showShadowingLines,
                showSunlightLines,
                showShadowRange,
                showShadowFill,
                showSatelliteLayer,
                satelliteOpacity,
                activePointMode,
              },
              viewport: {
                viewRotationDeg,
                savedViewRotationDeg,
              },
            },
            currentProjectId
          );
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('usi-projects-updated'));
          }
        } catch (err) {
          console.warn('Nie udało się zaktualizować projektu w tle:', err);
        }
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [
    isInteracting,
    currentProjectId,
    projectName,
    buildings,
    selectedBuildingId,
    pinnedPoints,
    activePinnedPointId,
    dimensions,
    settings,
    layerSettings,
    dxfUnit,
    dxfImportInfo,
    viewRotationDeg,
    savedViewRotationDeg,
    sunlightMethod,
    activePointMode,
    selectedCity,
    mapsInput,
    mapsParseError,
    showNormals,
    showShadowingLines,
    showSunlightLines,
    showShadowRange,
    showShadowFill,
    showSatelliteLayer,
    satelliteOpacity,
  ]);

  const currentAccuracyOptions = useMemo<AnalysisAccuracyOptions>(() => {
    switch (accuracyStage) {
      case 'live':
        return { samplingInterval: 1.5, angleStepDeg: 1.5, sunlightStepMinutes: 15, shadowStepHours: 1.0 };
      case 'final':
      default:
        return { samplingInterval: 0.25, angleStepDeg: 0.5, sunlightStepMinutes: 5, shadowStepHours: 0.25 };
    }
  }, [accuracyStage]);

  // Buildings filtered through layer visibility
  const effectiveBuildings = useMemo(() => {
    return buildings.map((b) => {
      const lyr = b.layer || 'Domyślna (0)';
      const setting = layerSettings[lyr] || {};
      const isVisible = setting.isVisible !== false;
      if (!isVisible) {
        return {
          ...b,
          isIncluded: false,
          isTested: false,
        };
      }
      return b;
    });
  }, [buildings, layerSettings]);

  const enabledAnalyses = useMemo(
    () => ({
      shadowing: showShadowingLines,
      sunlight: showSunlightLines,
      shadowRange: showShadowRange,
    }),
    [showShadowingLines, showSunlightLines, showShadowRange]
  );

  // Web Worker calculation
  const { analysisOutput } = useAnalysisWorker(
    effectiveBuildings,
    settings,
    currentAccuracyOptions,
    sunlightMethod,
    isInteracting,
    enabledAnalyses
  );

  // Synchronizacja wyników analiz z globalnym storem dla legendy i wskaźników
  useEffect(() => {
    if (analysisOutput) {
      setAnalysisOutput(analysisOutput);
    }
  }, [analysisOutput, setAnalysisOutput]);

  return {
    loadStatus,
    dismissStatus,
    currentAccuracyOptions,
    effectiveBuildings,
    analysisOutput,
  };
}
