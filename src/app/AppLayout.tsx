import React, { useMemo, useCallback, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { CadTopHud } from '@/components/layout/CadTopHud';
import { ControlPointButton } from '@/components/layout/ControlPointButton';
import { CadToolBar } from '@/components/layout/CadToolBar';
import { CadLegendBottom } from '@/components/layout/CadLegendBottom';
import { CadCanvas } from '@/components/CadCanvas';
import { FloatingPanelsHost } from './FloatingPanelsHost';
import {
  useSceneStore,
  useCadToolStore,
  useSolarAnalysisStore,
} from '@/store';
import { Point2D, AnalysisPointResult, BuildingLoop } from '@/types/geometry';
import { createBuildingFromVertices } from '@/utils/dxfParser';
import { generateSweepPolygon } from '@/utils/math2d';
import { analyzeSegmentsStatistics } from '@/utils/segmentStatistics';
import {
  AnalysisAccuracyOptions,
  AnalysisBatchOutput,
  analyzeShadowingAtPoint,
  analyzeSunlightAtPoint,
  analyzeSunlightAtPointSegments,
  prefilterShadowingObstacles,
  prefilterSunlightObstacles,
} from '@/engine/analysisEngine';
import { computeStoryHeightIntervals } from '@/engine/modifiers/modifierPipeline';
import { SharedProjectLoadStatus } from '@/hooks/useSharedProjectLoader';
import { useStableWhileInteracting } from '@/hooks/useStableWhileInteracting';

interface AppLayoutProps {
  currentAccuracyOptions: AnalysisAccuracyOptions;
  effectiveBuildings: BuildingLoop[];
  analysisOutput: AnalysisBatchOutput | null;
  loadStatus: SharedProjectLoadStatus;
  onDismissStatus: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentAccuracyOptions,
  effectiveBuildings,
  analysisOutput,
  loadStatus,
  onDismissStatus,
}) => {
  // Scene Store
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const setSelectedBuildingId = useSceneStore((s) => s.setSelectedBuildingId);
  const selectBuilding = useSceneStore((s) => s.selectBuilding);
  const addBuilding = useSceneStore((s) => s.addBuilding);
  const moveBuilding = useSceneStore((s) => s.moveBuilding);
  const moveBuildings = useSceneStore((s) => s.moveBuildings);
  const moveBuildingEdge = useSceneStore((s) => s.moveBuildingEdge);
  const rotateBuilding = useSceneStore((s) => s.rotateBuilding);
  const updateBuilding = useSceneStore((s) => s.updateBuilding);
  const updateBuildingVertices = useSceneStore((s) => s.updateBuildingVertices);
  const updateBuildingSweepPath = useSceneStore((s) => s.updateBuildingSweepPath);
  const booleanUnion = useSceneStore((s) => s.booleanUnion);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const isLinkingMode = useSceneStore((s) => s.isLinkingMode);
  const linkingSourceId = useSceneStore((s) => s.linkingSourceId);

  // CAD Tool Store
  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const setDrawingVerticesCount = useCadToolStore((s) => s.setDrawingVerticesCount);
  const sweepWidth = useCadToolStore((s) => s.sweepWidth);
  const sweepAlignment = useCadToolStore((s) => s.sweepAlignment);
  const isEditMode = useCadToolStore((s) => s.isEditMode);
  const facadePointMode = useCadToolStore((s) => s.facadePointMode);
  const isOsnapActive = useCadToolStore((s) => s.isOsnapActive);
  const toggleOsnap = useCadToolStore((s) => s.toggleOsnap);
  const isDirectionSnappingActive = useCadToolStore((s) => s.isDirectionSnappingActive);
  const dimensions = useCadToolStore((s) => s.dimensions);
  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const isProjectBrushActive = useCadToolStore((s) => s.isProjectBrushActive);
  const dimensionType = useCadToolStore((s) => s.dimensionType);
  const dimensionPendingRef = useCadToolStore((s) => s.dimensionPendingRef);
  const handleDimensionClickEdge = useCadToolStore((s) => s.handleDimensionClickEdge);
  const deleteDimension = useCadToolStore((s) => s.deleteDimension);
  const alignPendingRef = useCadToolStore((s) => s.alignPendingRef);
  const handleAlignClickEdge = useCadToolStore((s) => s.handleAlignClickEdge);
  const viewRotationMode = useCadToolStore((s) => s.viewRotationMode);
  const setViewRotationMode = useCadToolStore((s) => s.setViewRotationMode);
  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const setViewRotationDeg = useCadToolStore((s) => s.setViewRotationDeg);
  const savedViewRotationDeg = useCadToolStore((s) => s.savedViewRotationDeg);
  const setSavedViewRotationDeg = useCadToolStore((s) => s.setSavedViewRotationDeg);
  const ucsMode = useCadToolStore((s) => s.ucsMode);
  const computedEdgeUcsAngleDeg = useCadToolStore((s) => s.computedEdgeUcsAngleDeg);
  const setComputedEdgeUcsAngleDeg = useCadToolStore((s) => s.setComputedEdgeUcsAngleDeg);
  const fitRequest = useCadToolStore((s) => s.fitRequest);
  const isInteracting = useCadToolStore((s) => s.isInteracting);
  const setIsInteracting = useCadToolStore((s) => s.setIsInteracting);

  // Solar Analysis Store
  const settings = useSolarAnalysisStore((s) => s.settings);
  const showNormals = useSolarAnalysisStore((s) => s.showNormals);
  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const showAnalysisPoints = useSolarAnalysisStore((s) => s.showAnalysisPoints);
  const showShadowRange = useSolarAnalysisStore((s) => s.showShadowRange);
  const showShadowFill = useSolarAnalysisStore((s) => s.showShadowFill);
  const showSatelliteLayer = useSolarAnalysisStore((s) => s.showSatelliteLayer);
  const satelliteOpacity = useSolarAnalysisStore((s) => s.satelliteOpacity);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);
  const masterplanHourFraction = useSolarAnalysisStore((s) => s.masterplanHourFraction);
  const pinnedPoints = useSolarAnalysisStore((s) => s.pinnedPoints);
  const activePinnedPointId = useSolarAnalysisStore((s) => s.activePinnedPointId);
  const setActivePinnedPointId = useSolarAnalysisStore((s) => s.setActivePinnedPointId);
  const activePointMode = useSolarAnalysisStore((s) => s.activePointMode);
  const setSelectedPointResult = useSolarAnalysisStore((s) => s.setSelectedPointResult);
  const addPinnedPoint = useSolarAnalysisStore((s) => s.addPinnedPoint);
  const deletePinnedPoint = useSolarAnalysisStore((s) => s.deletePinnedPoint);
  const updatePinnedPoint = useSolarAnalysisStore((s) => s.updatePinnedPoint);

  const analysisResults = analysisOutput?.results || [];
  const shadowAnalysis = analysisOutput?.shadowAnalysis;

  // Segment statistics with the default High Pass Filter (HPF) cutoff.
  // Referencyjny kąt separacji EDGE_UCS/OTRACK musi być niezależny od widoku ustawionego przez
  // sam tryb EDGEUCS (inaczej dominanta byłaby porównywana samą ze sobą i deadband tłumiłby ją
  // w nieskończoność) — dlatego w trybie 'edge' porównujemy zawsze względem WORLDUCS (0°).
  const statsReferenceAngleDeg = ucsMode === 'edge' ? 0 : viewRotationDeg;
  const rawSegmentStats = useMemo(
    () => analyzeSegmentsStatistics(buildings, { viewAngleDeg: statsReferenceAngleDeg }),
    [buildings, statsReferenceAngleDeg]
  );
  const segmentStats = useStableWhileInteracting(rawSegmentStats, isInteracting);

  // Zasil kąt EDGEUCS (dominująca krawędź geometrii) do useCadToolStore, żeby kompas/siatka/
  // HUD mogły go odczytać bez ponownego liczenia analyzeSegmentsStatistics.
  useEffect(() => {
    const dominant = segmentStats.dominantDirections[0];
    setComputedEdgeUcsAngleDeg(dominant && dominant.isTrackingActive !== false ? dominant.angleDeg : null);
  }, [segmentStats, setComputedEdgeUcsAngleDeg]);

  // Gdy tryb EDGEUCS jest aktywny, trzymaj kąt widoku zsynchronizowany z aktualną dominantą
  // (geometria może się zmieniać bez opuszczania trybu — np. dodanie/edycja budynku).
  useEffect(() => {
    if (ucsMode === 'edge') {
      setViewRotationDeg(computedEdgeUcsAngleDeg ?? 0);
    }
  }, [ucsMode, computedEdgeUcsAngleDeg, setViewRotationDeg]);

  // Evaluate pinned points
  const rawPinnedPointResults = useMemo<AnalysisPointResult[]>(() => {
    return pinnedPoints
      .map((pt, pIdx) => {
        const bldg = buildings.find((b) => b.id === pt.buildingId);
        if (!bldg) return null;
        const lyr = bldg.layer || 'Domyślna (0)';
        if (layerSettings[lyr]?.isVisible === false) return null;
        const seg = bldg.segments.find((s) => s.id === pt.segmentId);
        if (!seg) return null;

        const bType = bldg.buildingType || 'residential';
        if (bType === 'garage') return null;

        const r = pt.offsetRatio;
        const exactPoint = {
          x: seg.p1.x + r * (seg.p2.x - seg.p1.x),
          y: seg.p1.y + r * (seg.p2.y - seg.p1.y),
        };

        const prefilteredShadowing = prefilterShadowingObstacles(exactPoint, seg, effectiveBuildings, bldg.id);
        const prefilteredSunlight = bType === 'residential' ? prefilterSunlightObstacles(exactPoint, seg, effectiveBuildings, bldg.id) : null;

        let baseHeightOverride: number | undefined;
        if (pt.storeyIndex !== undefined) {
          const intervals = computeStoryHeightIntervals(bldg);
          baseHeightOverride = intervals[pt.storeyIndex]?.hBottom;
        }

        const shadowRes = analyzeShadowingAtPoint(
          exactPoint,
          seg,
          r,
          effectiveBuildings,
          bldg.id,
          currentAccuracyOptions.angleStepDeg,
          prefilteredShadowing,
          undefined,
          baseHeightOverride
        );

        const sunRes =
          bType === 'residential'
            ? (sunlightMethod === 'segments'
                ? analyzeSunlightAtPointSegments(
                    exactPoint,
                    seg,
                    r,
                    effectiveBuildings,
                    bldg.id,
                    settings,
                    prefilteredSunlight!,
                    undefined,
                    undefined,
                    baseHeightOverride
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
                    prefilteredSunlight!,
                    undefined,
                    undefined,
                    baseHeightOverride
                  ))
            : {
                point: exactPoint,
                segmentId: seg.id,
                offsetRatio: r,
                totalMinutes: 0,
                totalHours: 0,
                isCompliant: true,
                timeSlots: [],
                sectors: [],
              };

        return {
          id: pt.id,
          point: exactPoint,
          normal: seg.normal,
          buildingId: bldg.id,
          segmentId: seg.id,
          label: pt.label || `P${pIdx + 1}`,
          storeyIndex: pt.storeyIndex,
          shadowing: shadowRes,
          sunlight: sunRes,
        };
      })
      .filter(Boolean) as AnalysisPointResult[];
  }, [pinnedPoints, buildings, layerSettings, effectiveBuildings, settings, currentAccuracyOptions, sunlightMethod]);

  // Wynik analizy (shadowing/sunlight) przy przypiętych punktach liczy się na żywo co klatkę,
  // tak samo jak pozycja (point/normal) — użytkownik oczekuje, że wartość przy P1/P2/P3
  // aktualizuje się w trakcie przeciągania/obrotu, nie dopiero po puszczeniu myszy.
  const pinnedPointResults = rawPinnedPointResults;

  const setPinnedPointResults = useSolarAnalysisStore((s) => s.setPinnedPointResults);
  useEffect(() => {
    setPinnedPointResults(pinnedPointResults);
  }, [pinnedPointResults, setPinnedPointResults]);

  const selectedBuildingPinnedPoints = useMemo<AnalysisPointResult[]>(() => {
    if (!selectedBuildingId) return [];
    return pinnedPointResults.filter((p) => p.buildingId === selectedBuildingId);
  }, [pinnedPointResults, selectedBuildingId]);

  const activePointResult = useMemo<AnalysisPointResult | null>(() => {
    if (selectedBuildingPinnedPoints.length === 0) return null;
    if (activePinnedPointId) {
      const found = selectedBuildingPinnedPoints.find((p) => p.id === activePinnedPointId);
      if (found) return found;
    }
    return selectedBuildingPinnedPoints[0] ?? null;
  }, [selectedBuildingPinnedPoints, activePinnedPointId]);

  // Handlers for CadCanvas
  const handleFinishDrawing = useCallback(
    (vertices: Point2D[], shapeType: 'rectangle' | 'polyline' | 'sweep') => {
      let effectiveVertices = vertices;
      if (shapeType === 'sweep') {
        if (vertices.length < 2) return;
        effectiveVertices = generateSweepPolygon(vertices, sweepWidth, sweepAlignment);
      }
      if (effectiveVertices.length < 3) return;
      const defaultHeight = 15.0;
      const count = buildings.length + 1;
      const namePrefix =
        shapeType === 'rectangle'
          ? `Budynek (Prostokąt ${count})`
          : shapeType === 'sweep'
          ? `Budynek (Wstęga ${count})`
          : `Budynek (Polilinia ${count})`;
      const newBldg = createBuildingFromVertices(effectiveVertices, namePrefix, defaultHeight, false);
      if (shapeType === 'sweep') {
        newBldg.sweepPath = vertices.map((v) => ({ ...v }));
        newBldg.sweepWidth = sweepWidth;
        newBldg.sweepAlignment = sweepAlignment;
      }

      addBuilding(newBldg);
      setDrawingMode('none');
      setDrawingVerticesCount(0);
    },
    [buildings.length, addBuilding, setDrawingMode, setDrawingVerticesCount, sweepWidth, sweepAlignment]
  );

  const handleCancelDrawing = useCallback(() => {
    setDrawingMode('none');
    setDrawingVerticesCount(0);
  }, [setDrawingMode, setDrawingVerticesCount]);

  const handleBuildingRotate = useCallback(
    (id: string, pivot: Point2D, deltaAngleRad: number) => {
      rotateBuilding(id, pivot, deltaAngleRad);
    },
    [rotateBuilding]
  );

  return (
    <div className="app-container">
      <Analytics />

      {/* Collapsible Left Sidebar */}
      <AppSidebar />

      {/* Main Fullscreen CAD Viewport */}
      <main
        className="cad-viewport"
        style={{
          flex: 1,
          width: '100%',
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-main)',
        }}
      >
        {/* Floating Top HUD */}
        <CadTopHud />

        {/* Floating Tool Bar under Top HUD */}
        <div className="cad-toolbar-row">
          <ControlPointButton />
          <CadToolBar />
        </div>

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
            onSelectPinnedPoint={(id) => {
              setActivePinnedPointId(id);
              const found = pinnedPoints.find((p) => p.id === id);
              if (found?.buildingId) {
                setSelectedBuildingId(found.buildingId);
              }
            }}
            onAddPinnedPoint={(pt) => {
              addPinnedPoint(pt);
              if (pt.buildingId) {
                setSelectedBuildingId(pt.buildingId);
              }
            }}
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
                if (res.buildingId) {
                  setSelectedBuildingId(res.buildingId);
                }
              }
            }}
            activePointMode={activePointMode}
            showNormals={showNormals}
            showShadowingLines={showShadowingLines}
            showSunlightLines={showSunlightLines}
            showAnalysisPoints={showAnalysisPoints}
            showShadowRange={showShadowRange}
            showShadowFill={showShadowFill}
            isInteracting={isInteracting}
            shadowAnalysis={shadowAnalysis}
            sunlightMethod={sunlightMethod}
            latitude={settings.latitude}
            longitude={settings.longitude}
            equinoxDate={settings.equinoxDate}
            masterplanHourFraction={masterplanHourFraction}
            fitRequest={fitRequest}
            onInteractionChange={setIsInteracting}
            isLinkingMode={isLinkingMode}
            linkingSourceId={linkingSourceId}
            drawingMode={drawingMode}
            onDrawingModeChange={setDrawingMode}
            sweepWidth={sweepWidth}
            sweepAlignment={sweepAlignment}
            onFinishDrawing={handleFinishDrawing}
            onCancelDrawing={handleCancelDrawing}
            onDrawingVerticesCountChange={setDrawingVerticesCount}
            onUpdateBuildingVertices={updateBuildingVertices}
            onUpdateBuildingSweepPath={updateBuildingSweepPath}
            onBuildingRotate={handleBuildingRotate}
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
            isProjectBrushActive={isProjectBrushActive}
            onUpdateBuilding={updateBuilding}
            alignPendingRef={alignPendingRef}
            onAlignClickEdge={handleAlignClickEdge}
            layerSettings={layerSettings}
            viewRotationMode={viewRotationMode}
            viewRotationDeg={viewRotationDeg}
            onViewRotationChange={(deg) => {
              setViewRotationDeg(deg);
              if (Math.abs(deg) > 0.001) {
                setSavedViewRotationDeg(deg);
                useCadToolStore.getState().setUcsMode('user');
              }
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

        {/* Floating Inspector Accordion, Compass Rose & Shared Project Toast */}
        <FloatingPanelsHost
          activePointResult={activePointResult}
          selectedBuildingPinnedPoints={selectedBuildingPinnedPoints}
          loadStatus={loadStatus}
          onDismissStatus={onDismissStatus}
        />
      </main>
    </div>
  );
};
