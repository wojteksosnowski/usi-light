import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { CadCanvas } from './components/CadCanvas';
import { PointInspectorModal } from './components/PointInspectorModal';
import { CompassRose } from './components/cad/CompassRose';
import { AppSidebar } from './components/layout/AppSidebar';
import { CadTopHud } from './components/layout/CadTopHud';
import { CadToolBar } from './components/layout/CadToolBar';
import { CadLegendBottom } from './components/layout/CadLegendBottom';
import {
  useSceneStore,
  useCadToolStore,
  useSolarAnalysisStore,
  SavedSceneData,
} from './store';
import { useAnalysisWorker } from './hooks/useAnalysisWorker';
import {
  AnalysisAccuracyOptions,
  analyzeShadowingAtPoint,
  analyzeSunlightAtPoint,
  analyzeSunlightAtPointSegments,
  prefilterShadowingObstacles,
  prefilterSunlightObstacles,
} from './engine/analysisEngine';
import { Point2D, AnalysisPointResult } from './types/geometry';
import { createBuildingFromVertices } from './utils/dxfParser';
import { analyzeSegmentsStatistics } from './utils/segmentStatistics';

const SCENE_STORAGE_KEY = 'usi-light.scene.v1';

export const App: React.FC = () => {
  // Scene Store
  const buildings = useSceneStore((s) => s.buildings);
  const setBuildings = useSceneStore((s) => s.setBuildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const setSelectedBuildingId = useSceneStore((s) => s.setSelectedBuildingId);
  const selectBuilding = useSceneStore((s) => s.selectBuilding);
  const addBuilding = useSceneStore((s) => s.addBuilding);
  const deleteBuildings = useSceneStore((s) => s.deleteBuildings);
  const moveBuilding = useSceneStore((s) => s.moveBuilding);
  const moveBuildings = useSceneStore((s) => s.moveBuildings);
  const moveBuildingEdge = useSceneStore((s) => s.moveBuildingEdge);
  const updateBuildingVertices = useSceneStore((s) => s.updateBuildingVertices);
  const booleanUnion = useSceneStore((s) => s.booleanUnion);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const setSelectedLayerName = useSceneStore((s) => s.setSelectedLayerName);
  const isLinkingMode = useSceneStore((s) => s.isLinkingMode);
  const setIsLinkingMode = useSceneStore((s) => s.setIsLinkingMode);
  const linkingSourceId = useSceneStore((s) => s.linkingSourceId);
  const setLinkingSourceId = useSceneStore((s) => s.setLinkingSourceId);
  const dxfUnit = useSceneStore((s) => s.dxfUnit);
  const dxfImportInfo = useSceneStore((s) => s.dxfImportInfo);
  const adjustSelectedBuildingHeight = useSceneStore((s) => s.adjustSelectedBuildingHeight);
  const loadSceneData = useSceneStore((s) => s.loadSceneData);

  // CAD Tool Store
  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const setDrawingVerticesCount = useCadToolStore((s) => s.setDrawingVerticesCount);
  const rotateInitialBuildingsSnapshot = useCadToolStore((s) => s.rotateInitialBuildingsSnapshot);
  const setRotateInitialBuildingsSnapshot = useCadToolStore((s) => s.setRotateInitialBuildingsSnapshot);
  const isEditMode = useCadToolStore((s) => s.isEditMode);
  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);
  const facadePointMode = useCadToolStore((s) => s.facadePointMode);
  const setFacadePointMode = useCadToolStore((s) => s.setFacadePointMode);
  const isOsnapActive = useCadToolStore((s) => s.isOsnapActive);
  const setIsOsnapActive = useCadToolStore((s) => s.setIsOsnapActive);
  const toggleOsnap = useCadToolStore((s) => s.toggleOsnap);
  const isDirectionSnappingActive = useCadToolStore((s) => s.isDirectionSnappingActive);
  const dimensions = useCadToolStore((s) => s.dimensions);
  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const setIsDimensionToolActive = useCadToolStore((s) => s.setIsDimensionToolActive);
  const dimensionType = useCadToolStore((s) => s.dimensionType);
  const dimensionPendingRef = useCadToolStore((s) => s.dimensionPendingRef);
  const handleDimensionClickEdge = useCadToolStore((s) => s.handleDimensionClickEdge);
  const cancelDimension = useCadToolStore((s) => s.cancelDimension);
  const deleteDimension = useCadToolStore((s) => s.deleteDimension);
  const viewRotationMode = useCadToolStore((s) => s.viewRotationMode);
  const setViewRotationMode = useCadToolStore((s) => s.setViewRotationMode);
  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const setViewRotationDeg = useCadToolStore((s) => s.setViewRotationDeg);
  const savedViewRotationDeg = useCadToolStore((s) => s.savedViewRotationDeg);
  const setSavedViewRotationDeg = useCadToolStore((s) => s.setSavedViewRotationDeg);
  const fitTrigger = useCadToolStore((s) => s.fitTrigger);
  const isInteracting = useCadToolStore((s) => s.isInteracting);
  const setIsInteracting = useCadToolStore((s) => s.setIsInteracting);

  // Solar Analysis Store
  const settings = useSolarAnalysisStore((s) => s.settings);
  const setSettings = useSolarAnalysisStore((s) => s.setSettings);
  const selectedCity = useSolarAnalysisStore((s) => s.selectedCity);
  const mapsInput = useSolarAnalysisStore((s) => s.mapsInput);
  const mapsParseError = useSolarAnalysisStore((s) => s.mapsParseError);
  const showNormals = useSolarAnalysisStore((s) => s.showNormals);
  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
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
  const setActivePointMode = useSolarAnalysisStore((s) => s.setActivePointMode);
  const selectedPointResult = useSolarAnalysisStore((s) => s.selectedPointResult);
  const setSelectedPointResult = useSolarAnalysisStore((s) => s.setSelectedPointResult);
  const addPinnedPoint = useSolarAnalysisStore((s) => s.addPinnedPoint);
  const deletePinnedPoint = useSolarAnalysisStore((s) => s.deletePinnedPoint);
  const updatePinnedPoint = useSolarAnalysisStore((s) => s.updatePinnedPoint);
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
  }, [buildings, isInteracting, setAccuracyStage]);

  const currentAccuracyOptions = useMemo<AnalysisAccuracyOptions>(() => {
    switch (accuracyStage) {
      case 'live':
        return { samplingInterval: 1.5, angleStepDeg: 1.5, sunlightStepMinutes: 15 };
      case 'final':
      default:
        return { samplingInterval: 0.25, angleStepDeg: 0.5, sunlightStepMinutes: 5 };
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

  const enabledAnalyses = useMemo(() => ({
    shadowing: showShadowingLines,
    sunlight: showSunlightLines,
    shadowRange: showShadowRange,
  }), [showShadowingLines, showSunlightLines, showShadowRange]);

  // Web Worker calculation
  const { analysisOutput } = useAnalysisWorker(
    effectiveBuildings,
    settings,
    currentAccuracyOptions,
    sunlightMethod,
    isInteracting,
    enabledAnalyses
  );

  const analysisResults = analysisOutput?.results || [];
  const shadowAnalysis = analysisOutput?.shadowAnalysis;

  // Synchronizacja wyników analiz z globalnym storem dla legendy i wskaźników
  useEffect(() => {
    if (analysisOutput) {
      setAnalysisOutput(analysisOutput);
    }
  }, [analysisOutput, setAnalysisOutput]);

  // Segment statistics
  const segmentStats = useMemo(
    () => analyzeSegmentsStatistics(buildings, { noisePercentileCutoff: 20 }),
    [buildings]
  );

  // Evaluate pinned points
  const pinnedPointResults = useMemo<AnalysisPointResult[]>(() => {
    return pinnedPoints
      .map((pt, pIdx) => {
        const bldg = buildings.find((b) => b.id === pt.buildingId);
        if (!bldg) return null;
        const lyr = bldg.layer || 'Domyślna (0)';
        if (layerSettings[lyr]?.isVisible === false) return null;
        const seg = bldg.segments.find((s) => s.id === pt.segmentId);
        if (!seg) return null;

        const r = pt.offsetRatio;
        const exactPoint = {
          x: seg.p1.x + r * (seg.p2.x - seg.p1.x),
          y: seg.p1.y + r * (seg.p2.y - seg.p1.y),
        };

        const prefilteredShadowing = prefilterShadowingObstacles(exactPoint, seg, effectiveBuildings, bldg.id);
        const prefilteredSunlight = prefilterSunlightObstacles(exactPoint, seg, effectiveBuildings, bldg.id);

        const shadowRes = analyzeShadowingAtPoint(
          exactPoint,
          seg,
          r,
          effectiveBuildings,
          bldg.id,
          currentAccuracyOptions.angleStepDeg,
          prefilteredShadowing
        );

        const sunRes =
          sunlightMethod === 'segments'
            ? analyzeSunlightAtPointSegments(
                exactPoint,
                seg,
                r,
                effectiveBuildings,
                bldg.id,
                settings,
                prefilteredSunlight
              )
            : analyzeSunlightAtPoint(
                exactPoint,
                seg,
                r,
                effectiveBuildings,
                bldg.id,
                settings,
                currentAccuracyOptions.sunlightStepMinutes,
                undefined,
                prefilteredSunlight
              );

        return {
          id: pt.id,
          point: exactPoint,
          normal: seg.normal,
          buildingId: bldg.id,
          segmentId: seg.id,
          label: pt.label || `P${pIdx + 1}`,
          shadowing: shadowRes,
          sunlight: sunRes,
        };
      })
      .filter(Boolean) as AnalysisPointResult[];
  }, [pinnedPoints, buildings, layerSettings, effectiveBuildings, settings, currentAccuracyOptions, sunlightMethod]);

  const activePointResult = useMemo<AnalysisPointResult | null>(() => {
    if (pinnedPointResults.length === 0) return null;
    if (activePinnedPointId) {
      const found = pinnedPointResults.find((p) => p.id === activePinnedPointId);
      if (found) return found;
    }
    return pinnedPointResults[0] ?? null;
  }, [pinnedPointResults, activePinnedPointId]);

  // LocalStorage Persistence (Load on mount)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCENE_STORAGE_KEY);
      if (!raw) return;
      const scene = JSON.parse(raw) as SavedSceneData;
      if (!scene || scene.version !== 1) return;

      loadSceneData(scene);
      if (scene.settings) setSettings(scene.settings);
      if (scene.pinnedPoints) setPinnedPoints(scene.pinnedPoints);
      if (scene.activePinnedPointId) setActivePinnedPointId(scene.activePinnedPointId);
      sceneHydratedRef.current = true;
    } catch (err) {
      console.warn('Nie udało się wczytać zapisanej sceny:', err);
    }
  }, [loadSceneData, setSettings, setPinnedPoints, setActivePinnedPointId]);

  // LocalStorage Persistence (Save on update)
  useEffect(() => {
    if (!sceneHydratedRef.current) return;
    const scene: SavedSceneData = {
      version: 1,
      buildings,
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
      console.warn('Nie udało się zapisać sceny:', err);
    }
  }, [
    buildings,
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
  ]);

  // Keyboard Shortcuts (F3 Osnap, Esc tool cancel, +/- height)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'F3' || (e.shiftKey && (e.key === 'S' || e.key === 's') && !isTypingTarget)) {
        e.preventDefault();
        toggleOsnap();
        return;
      }

      if (e.key === 'Escape') {
        let handledTool = false;
        if (isDimensionToolActive) {
          cancelDimension();
          handledTool = true;
        }
        if (drawingMode !== 'none') {
          if (drawingMode === 'rotate' && rotateInitialBuildingsSnapshot) {
            setBuildings(rotateInitialBuildingsSnapshot);
            setRotateInitialBuildingsSnapshot(null);
          }
          setDrawingMode('none');
          setDrawingVerticesCount(0);
          handledTool = true;
        }
        if (isLinkingMode) {
          setIsLinkingMode(false);
          setLinkingSourceId(null);
          handledTool = true;
        }
        if (isEditMode) {
          setIsEditMode(false);
          handledTool = true;
        }
        if (viewRotationMode) {
          setViewRotationMode(false);
          handledTool = true;
        }
        if (facadePointMode) {
          setFacadePointMode(false);
          handledTool = true;
        }

        if (handledTool) return;

        setSelectedBuildingId(null);
        setSelectedLayerName(null);
        return;
      }

      if (isTypingTarget) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (drawingMode === 'vertexEdit') {
          // Pozwól useCadHotkeys obsłużyć usuwanie zaznaczonego wierzchołka bryły
          return;
        }
        const targetIds = selectedBuildingIds.length > 0 ? selectedBuildingIds : (selectedBuildingId ? [selectedBuildingId] : []);
        if (targetIds.length > 0) {
          e.preventDefault();
          deleteBuildings(targetIds);
          return;
        }
      }

      if (!selectedBuildingId) return;

      const isPlusKey = e.key === '+' || e.key === '=' || e.code === 'NumpadAdd';
      const isMinusKey = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract';

      if (isPlusKey || isMinusKey) {
        e.preventDefault();
        adjustSelectedBuildingHeight(isPlusKey ? 0.5 : -0.5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isDimensionToolActive,
    drawingMode,
    rotateInitialBuildingsSnapshot,
    isLinkingMode,
    isEditMode,
    viewRotationMode,
    facadePointMode,
    selectedBuildingId,
    selectedBuildingIds,
    deleteBuildings,
    cancelDimension,
    setDrawingMode,
    setDrawingVerticesCount,
    setRotateInitialBuildingsSnapshot,
    setBuildings,
    setIsLinkingMode,
    setLinkingSourceId,
    setIsEditMode,
    setViewRotationMode,
    setFacadePointMode,
    setSelectedBuildingId,
    setSelectedLayerName,
    adjustSelectedBuildingHeight,
    toggleOsnap,
  ]);

  // Handlers for CadCanvas
  const handleFinishDrawing = useCallback(
    (vertices: Point2D[], shapeType: 'rectangle' | 'polyline') => {
      if (drawingMode === 'rotate') {
        setRotateInitialBuildingsSnapshot(null);
        setDrawingMode('none');
        setDrawingVerticesCount(0);
        return;
      }
      if (vertices.length < 3) return;
      const defaultHeight = 15.0;
      const count = buildings.length + 1;
      const namePrefix =
        shapeType === 'rectangle' ? `Budynek (Prostokąt ${count})` : `Budynek (Polilinia ${count})`;
      const newBldg = createBuildingFromVertices(vertices, namePrefix, defaultHeight, false);

      addBuilding(newBldg);
      setDrawingMode('none');
      setDrawingVerticesCount(0);
    },
    [drawingMode, buildings.length, addBuilding, setDrawingMode, setDrawingVerticesCount, setRotateInitialBuildingsSnapshot]
  );

  const handleCancelDrawing = useCallback(() => {
    if (drawingMode === 'rotate' && rotateInitialBuildingsSnapshot) {
      setBuildings(rotateInitialBuildingsSnapshot);
      setRotateInitialBuildingsSnapshot(null);
    }
    setDrawingMode('none');
    setDrawingVerticesCount(0);
  }, [drawingMode, rotateInitialBuildingsSnapshot, setBuildings, setDrawingMode, setDrawingVerticesCount, setRotateInitialBuildingsSnapshot]);

  const handleBuildingRotate = useCallback(
    (id: string, pivot: Point2D, deltaAngleRad: number) => {
      setIsInteracting(true);
      const cosA = Math.cos(deltaAngleRad);
      const sinA = Math.sin(deltaAngleRad);
      const deltaDeg = (deltaAngleRad * 180) / Math.PI;

      setBuildings((prev) => {
        const targetBldg = prev.find((b) => b.id === id);
        const targetGroupId = targetBldg?.groupId;

        return prev.map((bldg) => {
          const shouldRotate = bldg.id === id || (!!targetGroupId && bldg.groupId === targetGroupId);
          if (!shouldRotate) return bldg;

          const newVertices = bldg.vertices.map((v) => {
            const rx = v.x - pivot.x;
            const ry = v.y - pivot.y;
            return {
              x: pivot.x + rx * cosA - ry * sinA,
              y: pivot.y + rx * sinA + ry * cosA,
            };
          });

          const updatedTransform = {
            ...(bldg.transform || { tx: 0, ty: 0, rotationDeg: 0 }),
            rotationDeg: Number(((((bldg.transform?.rotationDeg || 0) + deltaDeg) % 360 + 360) % 360).toFixed(2)),
          };

          return {
            ...bldg,
            vertices: newVertices,
            transform: updatedTransform,
          };
        });
      });
    },
    [setIsInteracting, setBuildings]
  );

  const handleBooleanUnion = useCallback(
    (bldgIdA: string, bldgIdB: string) => {
      const res = booleanUnion(bldgIdA, bldgIdB);
      if (res.success) {
        setDrawingMode('none');
      } else {
        alert(res.error || 'Obiekty muszą się stykać lub przenikać, aby wykonać sumę.');
      }
    },
    [booleanUnion, setDrawingMode]
  );

  return (
    <div className="app-container">
      <Analytics />

      {/* Collapsible Left Sidebar */}
      <AppSidebar />

      {/* Main Fullscreen CAD Viewport */}
      <main className="cad-viewport" style={{ flex: 1, width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
        {/* Floating Top HUD */}
        <CadTopHud />

        {/* Floating Tool Bar under Top HUD */}
        <CadToolBar />

        {/* Legend & Stats Overlay at Bottom-Left */}
        <CadLegendBottom />

        {/* CAD Canvas Engine */}
        <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
          <CadCanvas
            buildings={buildings}
            selectedBuildingId={selectedBuildingId}
            selectedBuildingIds={selectedBuildingIds}
            onSelectBuilding={selectBuilding}
            onBuildingMove={moveBuilding}
            onBuildingsMove={moveBuildings}
            analysisResults={analysisResults}
            pinnedPoints={pinnedPoints}
            pinnedPointResults={pinnedPointResults}
            activePinnedPointId={activePinnedPointId}
            onSelectPinnedPoint={(id) => setActivePinnedPointId(id)}
            onAddPinnedPoint={addPinnedPoint}
            onDeletePinnedPoint={deletePinnedPoint}
            onUpdatePinnedPoint={updatePinnedPoint}
            selectedPointResult={activePointResult}
            onSelectPointResult={(res) => {
              if (!res) {
                setActivePinnedPointId(null);
                setSelectedPointResult(null);
              } else {
                setActivePinnedPointId(res.id);
                setSelectedPointResult(res);
              }
            }}
            activePointMode={activePointMode}
            showNormals={showNormals}
            showShadowingLines={showShadowingLines}
            showSunlightLines={showSunlightLines}
            showShadowRange={showShadowRange}
            showShadowFill={showShadowFill}
            isInteracting={isInteracting}
            shadowAnalysis={shadowAnalysis}
            sunlightMethod={sunlightMethod}
            latitude={settings.latitude}
            longitude={settings.longitude}
            equinoxDate={settings.equinoxDate}
            fitTrigger={fitTrigger}
            onInteractionChange={setIsInteracting}
            isLinkingMode={isLinkingMode}
            linkingSourceId={linkingSourceId}
            drawingMode={drawingMode}
            onFinishDrawing={handleFinishDrawing}
            onCancelDrawing={handleCancelDrawing}
            onDrawingVerticesCountChange={setDrawingVerticesCount}
            onUpdateBuildingVertices={updateBuildingVertices}
            onBuildingRotate={handleBuildingRotate}
            onBooleanUnion={handleBooleanUnion}
            facadePointMode={facadePointMode}
            onFacadePointMove={(buildingId, segmentId, offsetRatio) => {
              addPinnedPoint({ buildingId, segmentId, offsetRatio });
            }}
            isEditMode={isEditMode}
            onBuildingEdgeMove={moveBuildingEdge}
            dimensions={dimensions}
            isDimensionMode={isDimensionToolActive}
            dimensionType={dimensionType}
            dimensionPendingRef={dimensionPendingRef}
            onDimensionClickEdge={handleDimensionClickEdge}
            onDeleteDimension={deleteDimension}
            layerSettings={layerSettings}
            viewRotationMode={viewRotationMode}
            viewRotationDeg={viewRotationDeg}
            onViewRotationChange={(deg) => {
              setViewRotationDeg(deg);
              if (Math.abs(deg) > 0.001) setSavedViewRotationDeg(deg);
            }}
            onEndViewRotationMode={() => setViewRotationMode(false)}
            isDirectionSnappingActive={isDirectionSnappingActive}
            isOsnapActive={isOsnapActive}
            onToggleOsnap={toggleOsnap}
            dominantDirections={segmentStats.dominantDirections}
            showSatelliteLayer={showSatelliteLayer}
            satelliteOpacity={satelliteOpacity}
          />
        </div>

        {/* Floating Point Inspector Modal */}
        <PointInspectorModal
          pointResult={activePointResult}
          allPoints={pinnedPointResults}
          activePointId={activePinnedPointId}
          onSelectPointId={setActivePinnedPointId}
          onDeletePointId={deletePinnedPoint}
          activeMode={activePointMode}
          sunlightMethod={sunlightMethod}
          onModeChange={setActivePointMode}
          onClose={() => {
            useSolarAnalysisStore.getState().clearPinnedPoints();
          }}
        />

        {/* Rotatable Compass Rose (Bottom-Right) */}
        <CompassRose
          rotationDeg={viewRotationDeg}
          savedRotationDeg={savedViewRotationDeg}
          onResetRotation={() => {
            setViewRotationDeg((prev) => {
              if (Math.abs(prev) > 0.001) {
                setSavedViewRotationDeg(prev);
                return 0;
              } else if (Math.abs(savedViewRotationDeg) > 0.001) {
                return savedViewRotationDeg;
              }
              return 0;
            });
          }}
        />
      </main>
    </div>
  );
};

export default App;
