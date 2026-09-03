import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { CadCanvas } from './components/CadCanvas';
import { PointInspectorModal } from './components/PointInspectorModal';
import { CompassRose } from './components/cad/CompassRose';
import {
  BuildingLoop,
  AnalysisPointResult,
  ProjectSettings,
  Point2D,
  DimensionItem,
  DimensionReference,
  DimensionType,
  CadLayerSettings,
  PinnedFacadePoint,
} from './types/geometry';
import {
  createSampleBuildings,
  createBuildingFromVertices,
  parseDxfWithMetadata,
  DxfUnitOption,
  DxfUnitInfo,
} from './utils/dxfParser';
import {
  runFullAnalysis,
  prefilterObstacleSegments,
  analyzeShadowingAtPoint,
  analyzeSunlightAtPoint,
  analyzeSunlightAtPointSegments,
  AnalysisAccuracyOptions,
} from './engine/analysisEngine';
import { parseGoogleMapsCoordinates } from './utils/geoParser';
import {
  offsetPolygonEdge,
  updateBuildingWithNewVertices,
  computeLinearDimension,
  computeAngularDimension,
  computePolygonArea,
  computeBuildingsUnionArea,
  booleanUnionBuildings,
  computeDistancesToBoundaries,
} from './utils/math2d';
import { rebuildBuildingSegments, analyzeSegmentsStatistics } from './utils/segmentStatistics';
import { useAnalysisWorker } from './hooks/useAnalysisWorker';
import { APP_CONFIG } from './config/appConfig';

import {
  Sun,
  MapPin,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Layers,
  Building,
  Upload,
  Download,
  RotateCcw,
  RotateCw,
  Sliders,
  Sparkles,
  ChevronLeft,
  Lock,
  Unlock,
  Ghost,
  Eye,
  EyeOff,
  FolderKanban,
  Box,
  Trash2,
  Edit3,
  Timer,
  Square,
  Activity,
  Lightbulb,
  LightbulbOff,
  X,
  Link,
  Link2,
  Unlink,
  Wrench,
  PenTool,
  Maximize2,
  Ruler,
  Copy,
  Compass,
  Magnet,
  Combine,
  Globe,
} from 'lucide-react';


export type AccuracyStage = 'live' | 'stage1' | 'stage2' | 'final';

const SCENE_STORAGE_KEY = 'usi-light.scene.v1';

type SavedScene = {
  version: 1;
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  pinnedPoints?: PinnedFacadePoint[];
  activePinnedPointId?: string | null;
  selectedPointKey?: { buildingId: string; segmentId: string; offsetRatio: number } | null;
  settings: ProjectSettings;
  layerSettings: Record<string, CadLayerSettings>;
  selectedLayerName: string | null;
  isLinkingMode: boolean;
  linkingSourceId: string | null;
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'vertexEdit' | 'rotate' | 'union';
  dimensions: DimensionItem[];
  isEditMode: boolean;
  isDimensionToolActive: boolean;
  dimensionType: DimensionType;
  showNormals: boolean;
  showShadowingLines: boolean;
  showSunlightLines: boolean;
  showShadowRange: boolean;
  sunlightMethod: 'raycasting' | 'segments';
  activePointMode: 'shadowing' | 'sunlight';
  selectedCity: string;
  mapsInput: string;
  mapsParseError: boolean;
  isDirectionSnappingActive?: boolean;
  isOsnapActive?: boolean;
  viewRotationDeg: number;
  savedViewRotationDeg: number;
  dxfUnit: DxfUnitOption;
  dxfImportInfo: DxfUnitInfo | null;
};

export const App: React.FC = () => {
  // State
  const [buildings, setBuildings] = useState<BuildingLoop[]>(createSampleBuildings());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>('bldg-1');
  const [activePointMode, setActivePointMode] = useState<'shadowing' | 'sunlight'>('shadowing');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [fitKey, setFitKey] = useState<number>(0);

  // Collapsible Sidebar Groups State (Accordion: expanding one closes the other)
  const [openSidebarGroup, setOpenSidebarGroup] = useState<'project' | 'layers' | 'tools' | null>('project');
  const isProjectGroupOpen = openSidebarGroup === 'project';
  const isLayersGroupOpen = openSidebarGroup === 'layers';
  const isToolsGroupOpen = openSidebarGroup === 'tools';
  const toggleSidebarGroup = (group: 'project' | 'layers' | 'tools') => {
    setOpenSidebarGroup((prev) => (prev === group ? null : group));
  };

  // Direction Snapping State (Polar / Ortho Tracking & Snapping)
  const [isDirectionSnappingActive, setIsDirectionSnappingActive] = useState<boolean>(
    APP_CONFIG.directionSnapping.enabledDefault
  );

  // OSNAP Geometry Snapping State (Wierzchołki, Środki, Krawędzie, OTRACK)
  const [isOsnapActive, setIsOsnapActive] = useState<boolean>(
    APP_CONFIG.osnap?.enabledDefault ?? true
  );
  const handleToggleOsnap = useCallback(() => {
    setIsOsnapActive((prev) => !prev);
  }, []);



  // CAD Layers Settings & Selection State
  const [layerSettings, setLayerSettings] = useState<Record<string, CadLayerSettings>>({});
  const [selectedLayerName, setSelectedLayerName] = useState<string | null>(null);

  // Grouping / Linking mode state
  const [isLinkingMode, setIsLinkingMode] = useState<boolean>(false);
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);

  // Drawing Tools State (Rectangle, Polyline, Vertex Edit, Rotate, Union)
  const [drawingMode, setDrawingMode] = useState<'none' | 'rectangle' | 'polyline' | 'vertexEdit' | 'rotate' | 'union'>('none');
  const [rotateInitialBuildingsSnapshot, setRotateInitialBuildingsSnapshot] = useState<BuildingLoop[] | null>(null);

  const [facadePointMode, setFacadePointMode] = useState<boolean>(false);

  const [drawingVerticesCount, setDrawingVerticesCount] = useState<number>(0);

  // Edge Parallel Editing Mode State
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [viewRotationMode, setViewRotationMode] = useState<boolean>(false);
  const [viewRotationDeg, setViewRotationDeg] = useState<number>(0);
  const [savedViewRotationDeg, setSavedViewRotationDeg] = useState<number>(0);

  // Dimension Tool State (Linear / Angular)
  const [dimensions, setDimensions] = useState<DimensionItem[]>([]);
  const [isDimensionToolActive, setIsDimensionToolActive] = useState<boolean>(false);
  const [dimensionType, setDimensionType] = useState<DimensionType>('linear');
  const [dimensionPendingRef, setDimensionPendingRef] = useState<DimensionReference | null>(null);

  // Dynamic Variable Accuracy State (Live vs Stillness Progressive Refinement)
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [accuracyStage, setAccuracyStage] = useState<AccuracyStage>('final');

  // DXF Units State
  const [dxfUnit, setDxfUnit] = useState<DxfUnitOption>('auto');
  const [lastDxfText, setLastDxfText] = useState<string | null>(null);
  const [dxfImportInfo, setDxfImportInfo] = useState<DxfUnitInfo | null>(null);
  const sceneHydratedRef = useRef(false);

  // Polish Cities list with accurate geographic coordinates
  const POLISH_CITIES = [
    { name: 'Warszawa', lat: 52.2297, lon: 21.0122 },
    { name: 'Gdańsk',   lat: 54.3520, lon: 18.6466 },
    { name: 'Wrocław',  lat: 51.1079, lon: 17.0385 },
    { name: 'Kraków',   lat: 50.0647, lon: 19.9450 },
    { name: 'Poznań',   lat: 52.4064, lon: 16.9252 },
  ];

  const [selectedCity, setSelectedCity] = useState<string>('Warszawa');
  const [mapsInput, setMapsInput] = useState<string>('');
  const [mapsParseError, setMapsParseError] = useState<boolean>(false);

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

  // Settings
  const [settings, setSettings] = useState<ProjectSettings>({
    latitude: 52.2297, // Warszawa
    longitude: 21.0122,
    isCityCentreDefault: false,
    samplingInterval: 0.25, // Target precision 0.25m
    equinoxDate: 'spring',
  });

  // Layer Visibility
  const [showNormals, setShowNormals] = useState<boolean>(false);
  const [showShadowingLines, setShowShadowingLines] = useState<boolean>(true);
  const [showSunlightLines, setShowSunlightLines] = useState<boolean>(true);
  const [showShadowRange, setShowShadowRange] = useState<boolean>(true);

  // Podkład satelitarny Google Maps
  const [showSatelliteLayer, setShowSatelliteLayer] = useState<boolean>(false);
  const [satelliteOpacity, setSatelliteOpacity] = useState<number>(0.65);

  // Metoda obliczania nasłonecznienia § 56
  const [sunlightMethod, setSunlightMethod] = useState<'raycasting' | 'segments'>('raycasting');

  // Progressive Accuracy Refinement Effect
  // When interacting/moving: use fast low-resolution mesh (1.5m).
  // When still: automatically refine directly to target 0.25m with single debounce window.
  useEffect(() => {
    if (isInteracting) {
      setAccuracyStage('live');
      return;
    }

    // Schedule final refinement when idle after 200ms
    const timer = setTimeout(() => {
      setAccuracyStage('final');
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [buildings, isInteracting]);

  // Current calculation accuracy parameters based on active refinement stage
  const currentAccuracyOptions = useMemo<AnalysisAccuracyOptions>(() => {
    switch (accuracyStage) {
      case 'live':
        return { samplingInterval: 1.5, angleStepDeg: 1.5, sunlightStepMinutes: 15 };
      case 'final':
      default:
        return { samplingInterval: 0.25, angleStepDeg: 0.5, sunlightStepMinutes: 5 };
    }
  }, [accuracyStage]);

  // Buildings filtered through layer visibility (Lightbulb override)
  // When a layer's lightbulb is off (isVisible === false), all buildings on it
  // are completely excluded from calculation as tested buildings and as obstacle buildings,
  // without modifying their persistent isIncluded/isTested flags.
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

  // Dynamic analytical layers filter (omits calculations when layers are toggled off)
  const enabledAnalyses = useMemo(() => ({
    shadowing: showShadowingLines,
    sunlight: showSunlightLines,
    shadowRange: showShadowRange,
  }), [showShadowingLines, showSunlightLines, showShadowRange]);

  // Run Calculation with Variable Precision using Web Worker in background thread
  const { analysisOutput, isCalculating } = useAnalysisWorker(
    effectiveBuildings,
    settings,
    currentAccuracyOptions,
    sunlightMethod,
    isInteracting,
    enabledAnalyses
  );

  const analysisResults = analysisOutput?.results || [];
  const avgShadowingMs = analysisOutput?.avgShadowingMs || 0;
  const avgSunlightMs = analysisOutput?.avgSunlightMs || 0;
  const avgSunlightSegMs = analysisOutput?.avgSunlightSegMs || 0;
  const totalShadowingMs = analysisOutput?.totalShadowingTimeMs ?? (avgShadowingMs * (analysisOutput?.totalPoints || 0));
  const totalSunlightMs = analysisOutput?.totalSunlightTimeMs ?? (avgSunlightMs * (analysisOutput?.totalPoints || 0));
  const shadowEnvelopeMs = analysisOutput?.shadowEnvelopeMs || 0;
  const shadowAnalysis = analysisOutput?.shadowAnalysis;
  const totalAnalysisMs = analysisOutput?.totalAnalysisMs || 0;
  const totalPoints = analysisOutput?.totalPoints ?? analysisResults.length;

  // Statistical analysis of facade segments directions & linear equations
  const [noisePercentileCutoff, setNoisePercentileCutoff] = useState<number>(
    APP_CONFIG.statistics?.defaultNoisePercentile ?? 20
  );
  const segmentStats = useMemo(
    () => analyzeSegmentsStatistics(buildings, { noisePercentileCutoff }),
    [buildings, noisePercentileCutoff]
  );


  // Multi-point facade analysis (limit max 3 points)
  const [pinnedPoints, setPinnedPoints] = useState<PinnedFacadePoint[]>([]);
  const [activePinnedPointId, setActivePinnedPointId] = useState<string | null>(null);

  const handleAddPinnedPoint = useCallback((pt: { buildingId: string; segmentId: string; offsetRatio: number }) => {
    setPinnedPoints((prev) => {
      const maxPts = APP_CONFIG.facadePoints?.maxPinnedPoints ?? 3;
      const newPtId = `pinned-${pt.buildingId}-${pt.segmentId}-${Date.now()}`;
      if (prev.length >= maxPts) {
        // Replace active point or oldest point if at limit
        const activeIdx = prev.findIndex((p) => p.id === activePinnedPointId);
        const replaceIdx = activeIdx >= 0 ? activeIdx : 0;
        const copy = [...prev];
        copy[replaceIdx] = { ...pt, id: newPtId, label: `P${replaceIdx + 1}` };
        setActivePinnedPointId(newPtId);
        return copy;
      }
      const newPoint: PinnedFacadePoint = {
        ...pt,
        id: newPtId,
        label: `P${prev.length + 1}`,
      };
      setActivePinnedPointId(newPtId);
      return [...prev, newPoint];
    });
  }, [activePinnedPointId]);

  const handleDeletePinnedPoint = useCallback((id: string) => {
    setPinnedPoints((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      const reindexed = filtered.map((p, idx) => ({ ...p, label: `P${idx + 1}` }));
      if (activePinnedPointId === id) {
        setActivePinnedPointId(reindexed.length > 0 ? reindexed[0].id : null);
      }
      return reindexed;
    });
  }, [activePinnedPointId]);

  const handleUpdatePinnedPoint = useCallback((id: string, buildingId: string, segmentId: string, offsetRatio: number) => {
    setPinnedPoints((prev) =>
      prev.map((p) => (p.id === id ? { ...p, buildingId, segmentId, offsetRatio } : p))
    );
  }, []);

  // Directly evaluate pinned points at their EXACT pinned offsetRatio on the segments
  const pinnedPointResults = useMemo<AnalysisPointResult[]>(() => {
    return pinnedPoints.map((pt, pIdx) => {
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

      const prefilteredObstacles = prefilterObstacleSegments(exactPoint, seg, effectiveBuildings, bldg.id);

      const shadowRes = analyzeShadowingAtPoint(
        exactPoint, seg, r, effectiveBuildings, bldg.id,
        currentAccuracyOptions.angleStepDeg,
        prefilteredObstacles
      );

      const sunRes =
        sunlightMethod === 'segments'
          ? analyzeSunlightAtPointSegments(
              exactPoint, seg, r, effectiveBuildings, bldg.id, settings,
              prefilteredObstacles
            )
          : analyzeSunlightAtPoint(
              exactPoint, seg, r, effectiveBuildings, bldg.id, settings,
              currentAccuracyOptions.sunlightStepMinutes,
              undefined,
              prefilteredObstacles
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
    }).filter(Boolean) as AnalysisPointResult[];
  }, [pinnedPoints, buildings, layerSettings, effectiveBuildings, settings, currentAccuracyOptions, sunlightMethod]);

  const activePointResult = useMemo<AnalysisPointResult | null>(() => {
    if (pinnedPointResults.length === 0) return null;
    if (activePinnedPointId) {
      return pinnedPointResults.find((p) => p.id === activePinnedPointId) || pinnedPointResults[0];
    }
    return pinnedPointResults[0];
  }, [pinnedPointResults, activePinnedPointId]);

  // Selected building object (respects layer visibility)
  const selectedBuilding = useMemo(() => {
    if (!selectedBuildingId) return null;
    const b = buildings.find((item) => item.id === selectedBuildingId);
    if (!b) return null;
    const lyr = b.layer || 'Domyślna (0)';
    if (layerSettings[lyr]?.isVisible === false) return null;
    return b;
  }, [buildings, selectedBuildingId, layerSettings]);

  // Area of selected building in m²
  const selectedBuildingArea = useMemo(() => {
    if (!selectedBuilding || !selectedBuilding.vertices || selectedBuilding.vertices.length < 3) return 0;
    return computePolygonArea(selectedBuilding.vertices);
  }, [selectedBuilding]);

  // All boundary objects (działki)
  const boundaryObjects = useMemo(() => {
    return buildings.filter((b) => b.category === 'boundary' && b.isIncluded !== false && b.vertices && b.vertices.length >= 3);
  }, [buildings]);

  // Total plot area (sum of all boundary parcels)
  const totalBoundaryArea = useMemo(() => {
    return boundaryObjects.reduce((sum, b) => sum + computePolygonArea(b.vertices), 0);
  }, [boundaryObjects]);

  // Distances from selected building to all boundaries
  const distancesToBoundaries = useMemo(() => {
    if (!selectedBuilding || selectedBuilding.category === 'boundary' || boundaryObjects.length === 0) return [];
    return computeDistancesToBoundaries(selectedBuilding, boundaryObjects);
  }, [selectedBuilding, boundaryObjects]);

  // Summary of tested buildings (Projektowane)
  const testedBuildingsSummary = useMemo(() => {
    const tested = buildings.filter((b) => b.isTested && b.category !== 'boundary' && b.isIncluded !== false && b.vertices?.length >= 3);
    const count = tested.length;
    let totalPz = 0;
    let totalPc = 0;
    let totalVolume = 0;

    for (const b of tested) {
      const pz = computePolygonArea(b.vertices);
      const n = b.storeysCount || (b.defaultHeight > 3.5 ? 1 + Math.max(1, Math.round((b.defaultHeight - 3.5) / 2.875)) : 1);
      const h = b.defaultHeight;
      totalPz += pz;
      totalPc += pz * n;
      totalVolume += pz * h;
    }

    const estimatedPUM = totalPc * 0.72; // ~72% współczynnik PUM
    const plotCoverageRatio = totalBoundaryArea > 0 ? (totalPz / totalBoundaryArea) * 100 : 0;
    const intensityRatio = totalBoundaryArea > 0 ? totalPc / totalBoundaryArea : 0;

    return {
      count,
      totalPz,
      totalPc,
      totalVolume,
      estimatedPUM,
      plotCoverageRatio,
      intensityRatio,
    };
  }, [buildings, totalBoundaryArea]);

  // Toast notification state for copying
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const showCopiedToast = (msg: string) => {
    setCopiedToast(msg);
    setTimeout(() => setCopiedToast(null), 2500);
  };

  // Dimensions connected to selected building only
  const selectedBuildingDimensions = useMemo(() => {
    if (!selectedBuildingId) return [];
    return dimensions.filter(
      (d) => d.ref1.buildingId === selectedBuildingId || d.ref2?.buildingId === selectedBuildingId
    );
  }, [dimensions, selectedBuildingId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCENE_STORAGE_KEY);
      if (!raw) return;
      const scene = JSON.parse(raw) as SavedScene;
      if (!scene || scene.version !== 1) return;

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
      setSettings(scene.settings ?? {
        latitude: 52.2297,
        longitude: 21.0122,
        isCityCentreDefault: false,
        samplingInterval: 0.25,
        equinoxDate: 'spring',
      });
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
      setSunlightMethod(scene.sunlightMethod ?? 'raycasting');
      setActivePointMode(scene.activePointMode ?? 'shadowing');
      setSelectedCity(scene.selectedCity ?? 'Warszawa');
      setMapsInput(scene.mapsInput ?? '');
      setMapsParseError(scene.mapsParseError ?? false);
      setViewRotationDeg(scene.viewRotationDeg ?? 0);
      setSavedViewRotationDeg(scene.savedViewRotationDeg ?? 0);
      setDxfUnit(scene.dxfUnit ?? 'auto');
      setDxfImportInfo(scene.dxfImportInfo ?? null);
      sceneHydratedRef.current = true;
    } catch (err) {
      console.warn('Nie udało się wczytać zapisanej sceny:', err);
    }
  }, []);

  useEffect(() => {
    if (!sceneHydratedRef.current) return;
    const scene: SavedScene = {
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
  ]);

  // Link two buildings together into a shared movement group
  const performLinkBuildings = (id1: string, id2: string) => {
    if (id1 === id2) return;
    setBuildings((prev) => {
      const b1 = prev.find((b) => b.id === id1);
      const b2 = prev.find((b) => b.id === id2);
      if (!b1 || !b2) return prev;

      const newGroupId = b1.groupId || b2.groupId || `group-${Date.now()}`;
      const oldGroupId1 = b1.groupId;
      const oldGroupId2 = b2.groupId;

      return prev.map((b) => {
        if (
          b.id === id1 ||
          b.id === id2 ||
          (oldGroupId1 && b.groupId === oldGroupId1) ||
          (oldGroupId2 && b.groupId === oldGroupId2)
        ) {
          return { ...b, groupId: newGroupId };
        }
        return b;
      });
    });
  };

  // Remove a building from its linked group
  const performUnlinkBuilding = (id: string) => {
    setBuildings((prev) => {
      const target = prev.find((b) => b.id === id);
      if (!target || !target.groupId) return prev;

      const remainingInGroup = prev.filter((b) => b.groupId === target.groupId && b.id !== id);
      return prev.map((b) => {
        if (b.id === id) {
          return { ...b, groupId: undefined };
        }
        // If only 1 building remains, dissolve the group
        if (remainingInGroup.length <= 1 && b.groupId === target.groupId) {
          return { ...b, groupId: undefined };
        }
        return b;
      });
    });
  };

  // Dissolve an entire linked group
  const performUnlinkAllInGroup = (groupId: string) => {
    setBuildings((prev) =>
      prev.map((b) => (b.groupId === groupId ? { ...b, groupId: undefined } : b))
    );
  };

  // Select building or perform linking if linking mode is active
  const handleSelectBuilding = (id: string | null) => {
    if (isLinkingMode && linkingSourceId && id && id !== linkingSourceId) {
      performLinkBuildings(linkingSourceId, id);
      setIsLinkingMode(false);
      setLinkingSourceId(null);
      setSelectedBuildingId(id);
      return;
    }
    setSelectedBuildingId(id);
  };

  // Move building handler (moves target building and all linked buildings in the same group)
  const handleBuildingMove = (id: string, dx: number, dy: number) => {
    if (!isInteracting) setIsInteracting(true);
    setBuildings((prev) => {
      const targetBldg = prev.find((b) => b.id === id);
      const targetGroupId = targetBldg?.groupId;

      return prev.map((bldg) => {
        const shouldMove = bldg.id === id || (!!targetGroupId && bldg.groupId === targetGroupId);
        if (!shouldMove) return bldg;

        const newVertices = bldg.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
        const newSegments = bldg.segments.map((s) => ({
          ...s,
          p1: { x: s.p1.x + dx, y: s.p1.y + dy },
          p2: { x: s.p2.x + dx, y: s.p2.y + dy },
        }));
        return {
          ...bldg,
          vertices: newVertices,
          segments: newSegments,
        };
      });
    });
  };

  // Rotate building handler (rotates target building and all linked buildings in the same group around pivot)
  const handleBuildingRotate = (id: string, pivot: Point2D, deltaAngleRad: number) => {
    if (!isInteracting) setIsInteracting(true);
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

        const rebuilt = rebuildBuildingSegments(bldg, newVertices);
        rebuilt.transform = updatedTransform;
        return rebuilt;
      });
    });
  };

  // Set absolute rotation angle for a building around its centroid
  const handleSetBuildingAbsoluteRotation = (buildingId: string, targetDeg: number) => {
    const target = buildings.find((b) => b.id === buildingId);
    if (!target || target.vertices.length < 3) return;

    const currentRot = target.transform?.rotationDeg !== undefined
      ? target.transform.rotationDeg
      : target.segments.length > 0
      ? ((target.segments[0].angleRad * 180) / Math.PI + 360) % 360
      : 0;

    let deltaDeg = targetDeg - currentRot;
    while (deltaDeg > 180) deltaDeg -= 360;
    while (deltaDeg < -180) deltaDeg += 360;

    const deltaRad = (deltaDeg * Math.PI) / 180;
    let cx = 0;
    let cy = 0;
    for (const v of target.vertices) {
      cx += v.x;
      cy += v.y;
    }
    const pivot = { x: cx / target.vertices.length, y: cy / target.vertices.length };
    handleBuildingRotate(buildingId, pivot, deltaRad);
  };

  // Duplicate building handler
  const handleDuplicateBuilding = (id: string) => {
    const source = buildings.find((b) => b.id === id);
    if (!source) return;

    const offset = 5.0; // 5 meters offset so duplicate is clearly distinct and draggable
    const newId = `bldg-${Date.now()}`;
    const newName = `${source.name} (Kopia)`;

    const newVertices = source.vertices.map((v) => ({
      x: v.x + offset,
      y: v.y - offset,
    }));

    const newSegments = source.segments.map((s, idx) => ({
      ...s,
      id: `${newId}-seg-${idx + 1}`,
      p1: { x: s.p1.x + offset, y: s.p1.y - offset },
      p2: { x: s.p2.x + offset, y: s.p2.y - offset },
    }));

    const duplicate: BuildingLoop = {
      ...source,
      id: newId,
      name: newName,
      vertices: newVertices,
      segments: newSegments,
      groupId: undefined, // New independent copy
    };

    setBuildings((prev) => [...prev, duplicate]);
    setSelectedBuildingId(newId);
  };

  // Delete building handler
  const handleDeleteBuilding = (id: string) => {
    setBuildings((prev) => {
      const target = prev.find((b) => b.id === id);
      const remaining = prev.filter((b) => b.id !== id);

      // Clean up group if only 1 building remains
      if (target?.groupId) {
        const remainingInGroup = remaining.filter((b) => b.groupId === target.groupId);
        if (remainingInGroup.length <= 1) {
          return remaining.map((b) =>
            b.groupId === target.groupId ? { ...b, groupId: undefined } : b
          );
        }
      }
      return remaining;
    });

    if (selectedBuildingId === id) {
      setSelectedBuildingId(null);
      setPinnedPoints([]);
      setActivePinnedPointId(null);
    }
  };

  // Finish drawing new building from canvas (Rectangle / Polyline / Commit Rotate)
  const handleFinishDrawing = (vertices: Point2D[], shapeType: 'rectangle' | 'polyline') => {
    if (drawingMode === 'rotate') {
      setRotateInitialBuildingsSnapshot(null);
      setDrawingMode('none');
      setDrawingVerticesCount(0);
      return;
    }
    if (vertices.length < 3) return;
    const defaultHeight = 15.0;
    const count = buildings.length + 1;
    const namePrefix = shapeType === 'rectangle' ? `Budynek (Prostokąt ${count})` : `Budynek (Polilinia ${count})`;
    const newBldg = createBuildingFromVertices(vertices, namePrefix, defaultHeight, false);

    setBuildings((prev) => [...prev, newBldg]);
    setSelectedBuildingId(newBldg.id);
    setPinnedPoints([]);
    setActivePinnedPointId(null);
    setDrawingMode('none');
    setDrawingVerticesCount(0);
  };

  const handleFacadePointMove = (buildingId: string, segmentId: string, offsetRatio: number) => {
    handleAddPinnedPoint({ buildingId, segmentId, offsetRatio });
  };

  // Cancel active drawing mode (reverting rotation if rotating)
  const handleCancelDrawing = () => {
    if (drawingMode === 'rotate' && rotateInitialBuildingsSnapshot) {
      setBuildings(rotateInitialBuildingsSnapshot);
      setRotateInitialBuildingsSnapshot(null);
    }
    setDrawingMode('none');
    setDrawingVerticesCount(0);
  };


  // Boolean Union of two buildings
  const handleBooleanUnion = useCallback(
    (bldgIdA: string, bldgIdB: string) => {
      const bA = buildings.find((b) => b.id === bldgIdA);
      const bB = buildings.find((b) => b.id === bldgIdB);
      if (!bA || !bB) return;

      const res = booleanUnionBuildings(bA, bB);
      if (res.success && res.building) {
        setBuildings((prev) => [
          ...prev.filter((b) => b.id !== bldgIdA && b.id !== bldgIdB),
          res.building!,
        ]);
        setSelectedBuildingId(res.building.id);
        setDrawingMode('none');
      } else {
        alert(res.error || 'Obiekty muszą się stykać lub przenikać, aby wykonać sumę.');
      }
    },
    [buildings]
  );


  // Update vertices for active building from vertex edit mode
  const handleUpdateBuildingVertices = (buildingId: string, newVertices: Point2D[]) => {
    if (!isInteracting) setIsInteracting(true);
    setBuildings((prev) =>
      prev.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        return rebuildBuildingSegments(bldg, newVertices);
      })
    );
  };

  // Handle edge parallel offset move
  const handleBuildingEdgeMove = (buildingId: string, edgeIndex: number, dx: number, dy: number) => {
    if (!isInteracting) setIsInteracting(true);
    setBuildings((prev) =>
      prev.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        const newVerts = offsetPolygonEdge(bldg.vertices, edgeIndex, { x: dx, y: dy });
        return updateBuildingWithNewVertices(bldg, newVerts);
      })
    );
  };

  // Handle clicking edge in Dimension Tool mode
  const handleDimensionClickEdge = (buildingId: string, segmentId: string) => {
    if (!dimensionPendingRef) {
      setDimensionPendingRef({ buildingId, segmentId });
    } else {
      if (dimensionPendingRef.buildingId === buildingId && dimensionPendingRef.segmentId === segmentId) {
        return; // Ignore clicking the exact same edge
      }
      const newDim: DimensionItem = {
        id: `dim-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: dimensionType,
        ref1: dimensionPendingRef,
        ref2: { buildingId, segmentId },
      };
      setDimensions((prev) => [...prev, newDim]);
      setDimensionPendingRef(null);
      setIsDimensionToolActive(false); // exit tool after creation
    }
  };

  // Cancel dimension tool
  const handleCancelDimension = () => {
    setDimensionPendingRef(null);
    setIsDimensionToolActive(false);
  };

  // Delete specific dimension
  const handleDeleteDimension = (id: string) => {
    setDimensions((prev) => prev.filter((d) => d.id !== id));
  };

  // Toggle type of existing dimension
  const handleToggleDimensionType = (id: string) => {
    setDimensions((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, type: d.type === 'linear' ? 'angular' : 'linear' } : d
      )
    );
  };

  // Clear all dimensions
  const handleClearAllDimensions = () => {
    setDimensions([]);
    setDimensionPendingRef(null);
  };

  // Active CAD layers from current buildings
  const activeCadLayers = useMemo(() => {
    const map = new Map<string, BuildingLoop[]>();
    buildings.forEach((b) => {
      const lyr = b.layer || 'Domyślna (0)';
      const list = map.get(lyr) || [];
      list.push(b);
      map.set(lyr, list);
    });
    return Array.from(map.entries()).map(([name, bldgs]) => ({
      name,
      count: bldgs.length,
      area: computeBuildingsUnionArea(bldgs),
    }));
  }, [buildings]);

  // Ensure selectedLayerName is valid
  useEffect(() => {
    if (activeCadLayers.length > 0) {
      if (!selectedLayerName || !activeCadLayers.some((l) => l.name === selectedLayerName)) {
        setSelectedLayerName(activeCadLayers[0].name);
      }
    } else {
      setSelectedLayerName(null);
    }
  }, [activeCadLayers, selectedLayerName]);

  // Toggle layer lock (Kłódka)
  const handleToggleLayerLock = (layerName: string) => {
    setLayerSettings((prev) => ({
      ...prev,
      [layerName]: {
        ...prev[layerName],
        isLocked: !prev[layerName]?.isLocked,
      },
    }));
  };

  // Toggle layer ghost mode (Duch)
  const handleToggleLayerGhost = (layerName: string) => {
    setLayerSettings((prev) => ({
      ...prev,
      [layerName]: {
        ...prev[layerName],
        isGhosted: !prev[layerName]?.isGhosted,
      },
    }));
  };

  // Toggle layer visibility (Żarówka)
  const handleToggleLayerVisibility = (layerName: string) => {
    setLayerSettings((prev) => {
      const willBeVisible = prev[layerName]?.isVisible === false ? true : false;
      if (!willBeVisible) {
        if (selectedBuildingId) {
          const selBldg = buildings.find((b) => b.id === selectedBuildingId);
          const bldgLayer = selBldg?.layer || 'Domyślna (0)';
          if (bldgLayer === layerName) {
            setSelectedBuildingId(null);
            setPinnedPoints([]);
            setActivePinnedPointId(null);
          }
        }
      }
      return {
        ...prev,
        [layerName]: {
          ...prev[layerName],
          isVisible: willBeVisible,
        },
      };
    });
  };

  // Batch update all buildings on a layer
  const handleUpdateLayerBuildings = (layerName: string, fields: Partial<BuildingLoop>) => {
    setBuildings((prev) =>
      prev.map((bldg) => {
        const bldgLayer = bldg.layer || 'Domyślna (0)';
        if (bldgLayer !== layerName) return bldg;
        const updated = { ...bldg, ...fields };
        if (
          fields.defaultHeight !== undefined ||
          fields.hWindowBottom !== undefined ||
          fields.isCityCentre !== undefined
        ) {
          updated.segments = updated.segments.map((seg) => ({
            ...seg,
            hTop: fields.defaultHeight !== undefined ? fields.defaultHeight : seg.hTop,
            hWindowBottom: fields.hWindowBottom !== undefined ? fields.hWindowBottom : seg.hWindowBottom,
            isCityCentre: fields.isCityCentre !== undefined ? fields.isCityCentre : seg.isCityCentre,
          }));
        }
        return updated;
      })
    );
  };

  // Update selected building property
  const updateSelectedBuilding = (fields: Partial<BuildingLoop>) => {
    if (!selectedBuildingId) return;
    setBuildings((prev) =>
      prev.map((bldg) => {
        if (bldg.id !== selectedBuildingId) return bldg;
        const updated = { ...bldg, ...fields };

        // Jeśli zmieniono kategorię na 'boundary', zerujemy wysokość
        if (fields.category === 'boundary') {
          updated.defaultHeight = 0;
          updated.isTested = false;
        }

        // Automatyczne przeliczanie kondygnacji i wysokości
        const h1 = updated.firstFloorHeight ?? 3.5;
        const ht = updated.typicalFloorHeight ?? 2.875;

        if (fields.defaultHeight !== undefined && fields.storeysCount === undefined) {
          // Wylicz liczbę kondygnacji z wysokości
          const H = fields.defaultHeight;
          updated.storeysCount = H > h1 ? 1 + Math.max(1, Math.round((H - h1) / ht)) : 1;
        } else if (fields.storeysCount !== undefined && fields.defaultHeight === undefined) {
          // Wylicz wysokość z liczby kondygnacji
          const n = Math.max(1, fields.storeysCount);
          updated.storeysCount = n;
          updated.defaultHeight = Number((h1 + (n - 1) * ht).toFixed(2));
        }

        if (
          fields.defaultHeight !== undefined ||
          fields.hWindowBottom !== undefined ||
          fields.isCityCentre !== undefined ||
          fields.category !== undefined
        ) {
          updated.segments = updated.segments.map((s) => ({
            ...s,
            hTop: updated.defaultHeight ?? s.hTop,
            hWindowBottom: fields.hWindowBottom ?? s.hWindowBottom,
            isCityCentre: fields.isCityCentre ?? s.isCityCentre,
          }));
        }
        return updated;
      })
    );
  };

  const adjustSelectedBuildingHeight = (deltaMeters: number) => {
    if (!selectedBuildingId) return;
    setBuildings((prev) =>
      prev.map((bldg) => {
        if (bldg.id !== selectedBuildingId) return bldg;
        const nextHeight = Math.max(0.5, Number((bldg.defaultHeight + deltaMeters).toFixed(2)));
        return {
          ...bldg,
          defaultHeight: nextHeight,
          segments: bldg.segments.map((seg) => ({
            ...seg,
            hTop: nextHeight,
          })),
        };
      })
    );
  };

  // Handle DXF File Upload
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
          setFitKey((prev) => prev + 1);
        } else {
          alert('Nie znaleziono zamkniętych polilinii w pliku DXF.');
        }
      } catch (err) {
        alert('Błąd podczas parsowania pliku DXF.');
      }
    };
    reader.readAsText(file);
    // Reset file input value to allow re-uploading the same file if needed
    e.target.value = '';
  };

  // Handle changing DXF Units
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
          setFitKey((prev) => prev + 1);
        }
      } catch (err) {
        console.error('Błąd przy przeliczaniu jednostek DXF:', err);
      }
    }
  };

  const applyLoadedScene = (scene: SavedScene) => {
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
    setSunlightMethod(scene.sunlightMethod ?? 'raycasting');
    setActivePointMode(scene.activePointMode ?? 'shadowing');
    setSelectedCity(scene.selectedCity ?? 'Warszawa');
    setMapsInput(scene.mapsInput ?? '');
    setMapsParseError(scene.mapsParseError ?? false);
    setViewRotationDeg(scene.viewRotationDeg ?? 0);
    setSavedViewRotationDeg(scene.savedViewRotationDeg ?? 0);
    setDxfUnit(scene.dxfUnit ?? 'auto');
    setDxfImportInfo(scene.dxfImportInfo ?? null);
    setFitKey((prev) => prev + 1);
    sceneHydratedRef.current = true;
  };

  const handleSceneFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const scene = JSON.parse(text) as SavedScene;
        applyLoadedScene(scene);
      } catch (err) {
        alert('Błąd podczas wczytywania sceny JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSceneDownload = () => {
    const scene: SavedScene = {
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

  // Global Escape key handler
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
        setIsOsnapActive((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        // Poziom 1: Anulowanie / wyłączenie aktywnego narzędzia
        let handledTool = false;
        if (isDimensionToolActive) {
          handleCancelDimension();
          handledTool = true;
        }
        if (drawingMode !== 'none') {
          handleCancelDrawing();
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

        // Poziom 2: Gdy żadne narzędzie nie jest aktywne -> odznaczenie obiektów
        setSelectedBuildingId(null);
        setSelectedLayerName(null);
        return;
      }

      if (isTypingTarget || !selectedBuildingId) return;

      const isPlusKey =
        e.key === '+' ||
        e.key === '=' ||
        e.code === 'NumpadAdd';
      const isMinusKey =
        e.key === '-' ||
        e.key === '_' ||
        e.code === 'NumpadSubtract';

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
    isLinkingMode,
    isEditMode,
    viewRotationMode,
    facadePointMode,
    selectedBuildingId,
  ]);

  return (
    <div className="app-container">
      <Analytics />
      {/* Collapsible Left Sidebar */}
      <aside className={`app-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                padding: '7px',
                borderRadius: '9px',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sun size={20} color="#38bdf8" />
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#fff', letterSpacing: '0.3px' }}>Światło</div>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            title="Schowaj panel boczny"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Scrollable Body with Collapsible Groups */}
        <div className="sidebar-body custom-scrollbar">

          {/* ========================================================================= */}
          {/* GRUPA 1: PROJEKT                                                          */}
          {/* (Lokalizacja, Jednostki DXF, Wgraj plik DXF & Załaduj scenę, Analizy)      */}
          {/* ========================================================================= */}
          <div className="sidebar-group">
            <button
              type="button"
              className="sidebar-group-header"
              onClick={() => toggleSidebarGroup('project')}
              title="Zwiń / rozwiń grupę: Projekt"
            >
              <div className="sidebar-group-title">
                <FolderKanban size={15} color="#f59e0b" />
                <span>Projekt</span>
              </div>
              {isProjectGroupOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
            </button>

            {isProjectGroupOpen && (
              <div className="sidebar-group-content">
                {/* 1.1 Lokalizacja (Kąt słońca § 56) */}
                <div className="ui-card">
                  <div className="ui-title">
                    <span>Lokalizacja (Kąt słońca § 56)</span>
                    <MapPin size={14} color="#f59e0b" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Google Maps link / Coordinates input */}
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

                    {/* Unit Selector Segmented Buttons */}
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

                    {/* Status / Active Info Banner */}
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

                {/* 1.3 Przyciski Wgraj plik DXF i Załaduj Scenę */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="btn-primary" style={{ margin: 0 }}>
                    <Upload size={16} />
                    <span>Wgraj plik DXF</span>
                    <input type="file" accept=".dxf" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>

                  <label className="btn-primary" style={{ margin: 0 }}>
                    <Upload size={16} />
                    <span>Wgraj scene</span>
                    <input type="file" accept=".json" onChange={handleSceneFileUpload} style={{ display: 'none' }} />
                  </label>

                  <button type="button" onClick={handleSceneDownload} className="btn-secondary">
                    <Download size={15} />
                    <span>Zapisz scenę JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBuildings(createSampleBuildings());
                      setSelectedBuildingId('bldg-1');
                      setPinnedPoints([]);
                      setActivePinnedPointId(null);
                      setLastDxfText(null);
                      setDxfImportInfo(null);
                      setFitKey((prev) => prev + 1);
                    }}
                    className="btn-secondary"
                  >
                    <RotateCcw size={15} />
                    <span>Załaduj scenę wzorcową</span>
                  </button>
                </div>

                {/* 1.3 Analizy */}
                <div className="ui-card">
                  <div className="ui-title">
                    <span>Analizy</span>
                    <Sliders size={14} color="#f59e0b" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowShadowingLines(!showShadowingLines)}
                      className={`btn-tile ${showShadowingLines ? 'active-emerald' : 'inactive'}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: showShadowingLines ? '#34d399' : '#64748b' }} />
                        <span>Przesłanianie § 12 (Wewnętrzny obrys)</span>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700 }}>{showShadowingLines ? 'WŁ' : 'WYŁ'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSunlightLines(!showSunlightLines)}
                      className={`btn-tile ${showSunlightLines ? 'active-amber' : 'inactive'}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: showSunlightLines ? '#fbbf24' : '#64748b' }} />
                        <span>Nasłonecznienie § 56 (Zewnętrzny pas)</span>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700 }}>{showSunlightLines ? 'WŁ' : 'WYŁ'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowNormals(!showNormals)}
                      className={`btn-tile ${showNormals ? 'active-indigo' : 'inactive'}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: showNormals ? '#818cf8' : '#64748b' }} />
                        <span>Wektory normalne fasad (Zwrot ścian)</span>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700 }}>{showNormals ? 'WŁ' : 'WYŁ'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowShadowRange(!showShadowRange)}
                      className={`btn-tile ${showShadowRange ? 'active-indigo' : 'inactive'}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: showShadowRange ? '#a5b4fc' : '#64748b' }} />
                        <span>Zakres cienia (Obwiednia obiektów badanych)</span>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700 }}>{showShadowRange ? 'WŁ' : 'WYŁ'}</span>
                    </button>

                    {/* Podkład satelitarny Google Maps */}
                    <div
                      style={{
                        marginTop: '4px',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        backgroundColor: showSatelliteLayer ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                        border: showSatelliteLayer ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #1e293b',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowSatelliteLayer(!showSatelliteLayer)}
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
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: showSatelliteLayer ? '#38bdf8' : '#64748b',
                          }}
                        >
                          {showSatelliteLayer ? 'WŁ' : 'WYŁ'}
                        </span>
                      </button>

                      {showSatelliteLayer && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px', borderTop: '1px solid rgba(51, 65, 85, 0.5)' }}>
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
            )}
          </div>

          {/* ========================================================================= */}
          {/* GRUPA 2: WARSTWY I OBIEKTY                                                */}
          {/* (Kafle: Warstwy CAD & Edycja Obiektu 2.5D)                                */}
          {/* ========================================================================= */}
          <div className="sidebar-group-divider" />
          <div className="sidebar-group">
            <button
              type="button"
              className="sidebar-group-header"
              onClick={() => toggleSidebarGroup('layers')}
              title="Zwiń / rozwiń grupę: Warstwy i obiekty"
            >
              <div className="sidebar-group-title">
                <Layers size={15} color="#38bdf8" />
                <span>Warstwy i obiekty</span>
              </div>
              {isLayersGroupOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
            </button>

            {isLayersGroupOpen && (
              <div className="sidebar-group-content">
                {/* 2.0 Warstwy CAD */}
                <div className="ui-card">
                  <div className="ui-title">
                    <span>Warstwy CAD ({activeCadLayers.length})</span>
                    <Layers size={14} color="#818cf8" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Layer selection list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {activeCadLayers.map((lyr) => {
                        const isSelected = selectedLayerName === lyr.name;
                        const setting = layerSettings[lyr.name] || {};
                        const isLocked = setting.isLocked === true;
                        const isGhosted = setting.isGhosted === true;
                        const isVisible = setting.isVisible !== false;

                        return (
                          <div
                            key={lyr.name}
                            onClick={() => setSelectedLayerName(lyr.name)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              backgroundColor: isSelected
                                ? 'rgba(99, 102, 241, 0.16)'
                                : 'rgba(15, 23, 42, 0.6)',
                              border: isSelected
                                ? '1px solid rgba(99, 102, 241, 0.45)'
                                : '1px solid var(--border-light)',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: isSelected ? 700 : 500,
                                  color: isSelected ? '#e0e7ff' : '#cbd5e1',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={lyr.name}
                              >
                                {lyr.name}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: '#cbd5e1',
                                    backgroundColor: 'rgba(30, 41, 59, 0.8)',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    fontWeight: 600,
                                  }}
                                >
                                  {lyr.count} {lyr.count === 1 ? 'ob.' : 'ob.'}
                                </span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: '#38bdf8',
                                    backgroundColor: 'rgba(14, 165, 233, 0.12)',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    fontWeight: 600,
                                  }}
                                >
                                  {lyr.area.toFixed(1)} m²
                                </span>
                              </div>
                            </div>

                            {/* 3 Action Controls: Kłódka, Duch, Żarówka */}
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Kłódka (Lock) */}
                              <button
                                type="button"
                                onClick={() => handleToggleLayerLock(lyr.name)}
                                title={isLocked ? 'Odblokuj przesuwanie i edycję (Kłódka aktywna)' : 'Zablokuj przesuwanie i edycję obiektów'}
                                style={{
                                  padding: '4px',
                                  borderRadius: '5px',
                                  border: 'none',
                                  backgroundColor: isLocked ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                                  color: isLocked ? '#fbbf24' : '#64748b',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                              </button>

                              {/* Duch (Ghost) */}
                              <button
                                type="button"
                                onClick={() => handleToggleLayerGhost(lyr.name)}
                                title={isGhosted ? 'Wyłącz tryb Ducha (Duch aktywny - obiekty niewybieralne)' : 'Włącz tryb Ducha (blokuje wybieranie obiektów, kliknięcia przechodzą pod spód)'}
                                style={{
                                  padding: '4px',
                                  borderRadius: '5px',
                                  border: 'none',
                                  backgroundColor: isGhosted ? 'rgba(192, 132, 252, 0.2)' : 'transparent',
                                  color: isGhosted ? '#c084fc' : '#64748b',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Ghost size={13} />
                              </button>

                              {/* Żarówka (Visibility) */}
                              <button
                                type="button"
                                onClick={() => handleToggleLayerVisibility(lyr.name)}
                                title={isVisible ? 'Wyłącz warstwę z widoku' : 'Włącz warstwę w widoku'}
                                style={{
                                  padding: '4px',
                                  borderRadius: '5px',
                                  border: 'none',
                                  backgroundColor: isVisible ? 'rgba(250, 204, 21, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                                  color: isVisible ? '#fde047' : '#94a3b8',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {isVisible ? <Lightbulb size={13} /> : <LightbulbOff size={13} />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Selected Layer Properties & Mass Edit */}
                    {selectedLayerName && (() => {
                      const layerBuildings = buildings.filter((b) => (b.layer || 'Domyślna (0)') === selectedLayerName);
                      if (layerBuildings.length === 0) return null;

                      const allIncluded = layerBuildings.every((b) => b.isIncluded !== false);
                      const someIncluded = layerBuildings.some((b) => b.isIncluded !== false);
                      const allTested = layerBuildings.every((b) => b.isTested);
                      const someTested = layerBuildings.some((b) => b.isTested);
                      const allCityCentre = layerBuildings.every((b) => b.isCityCentre);
                      const someCityCentre = layerBuildings.some((b) => b.isCityCentre);
                      const commonHeight = layerBuildings[0]?.defaultHeight ?? 15;

                      return (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            paddingTop: '8px',
                            marginTop: '2px',
                            borderTop: '1px dashed var(--border-light)',
                          }}
                        >
                          {/* Layer Total Surface Area (Boolean Union) */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              backgroundColor: 'rgba(15, 23, 42, 0.5)',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light)',
                              fontSize: '11px',
                            }}
                          >
                            <span style={{ color: '#94a3b8' }}>Powierzchnia warstwy:</span>
                            <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>
                              {computeBuildingsUnionArea(layerBuildings).toFixed(2)} m²
                            </span>
                          </div>

                          {/* Height H for all buildings on layer */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                              Wysokość H dla warstwy (m)
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              value={commonHeight}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                handleUpdateLayerBuildings(selectedLayerName, { defaultHeight: val });
                              }}
                              style={{
                                width: '80px',
                                backgroundColor: 'var(--bg-input)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '6px',
                                padding: '5px 8px',
                                color: '#38bdf8',
                                fontWeight: 'bold',
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                textAlign: 'right',
                              }}
                            />
                          </div>

                          {/* 3 Batch Action Buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleUpdateLayerBuildings(selectedLayerName, { isIncluded: !allIncluded })}
                              className={`btn-tile ${allIncluded ? 'active-emerald' : someIncluded ? 'active-amber' : 'inactive'}`}
                            >
                              <span>Uwzględnij w kalkulacji</span>
                              <span style={{ fontSize: '10px', fontWeight: 700 }}>
                                {allIncluded ? 'TAK (Wszystkie)' : someIncluded ? 'CZĘŚCIOWO' : 'NIE'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleUpdateLayerBuildings(selectedLayerName, { isTested: !allTested })}
                              className={`btn-tile ${allTested ? 'active-indigo' : someTested ? 'active-amber' : 'inactive'}`}
                            >
                              <span>Obiekt badany (Projektowany)</span>
                              <span style={{ fontSize: '10px', fontWeight: 700 }}>
                                {allTested ? 'TAK (Wszystkie)' : someTested ? 'CZĘŚCIOWO' : 'NIE'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleUpdateLayerBuildings(selectedLayerName, { isCityCentre: !allCityCentre })}
                              className={`btn-tile ${allCityCentre ? 'active-amber' : someCityCentre ? 'active-indigo' : 'inactive'}`}
                            >
                              <span>Zabudowa śródmiejska</span>
                              <span style={{ fontSize: '10px', fontWeight: 700 }}>
                                {allCityCentre ? 'TAK (Wszystkie)' : someCityCentre ? 'CZĘŚCIOWO' : 'NIE'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* 2.1 Edycja Obiektu 2.5D */}
                {selectedBuilding ? (
                  <div className="ui-card">
                    <div className="ui-title">
                      <span>Edycja Obiektu 2.5D</span>
                      <Building size={14} color="#818cf8" />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Wybór kategorii obiektu: Budynek / Granica / (Balkon) */}
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                          Kategoria obiektu
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => updateSelectedBuilding({ category: 'building' })}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: selectedBuilding.category !== 'boundary' && selectedBuilding.category !== 'balcony'
                                ? '1px solid #818cf8'
                                : '1px solid var(--border-light)',
                              backgroundColor: selectedBuilding.category !== 'boundary' && selectedBuilding.category !== 'balcony'
                                ? 'rgba(99, 102, 241, 0.25)'
                                : 'var(--bg-input)',
                              color: selectedBuilding.category !== 'boundary' && selectedBuilding.category !== 'balcony' ? '#e0e7ff' : '#94a3b8',
                              fontWeight: selectedBuilding.category !== 'boundary' && selectedBuilding.category !== 'balcony' ? 700 : 500,
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px',
                            }}
                          >
                            <Building size={13} />
                            <span>Budynek</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => updateSelectedBuilding({ category: 'boundary', defaultHeight: 0, isTested: false })}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: selectedBuilding.category === 'boundary'
                                ? '1px solid #ef4444'
                                : '1px solid var(--border-light)',
                              backgroundColor: selectedBuilding.category === 'boundary'
                                ? 'rgba(239, 68, 68, 0.25)'
                                : 'var(--bg-input)',
                              color: selectedBuilding.category === 'boundary' ? '#fca5a5' : '#94a3b8',
                              fontWeight: selectedBuilding.category === 'boundary' ? 700 : 500,
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px',
                            }}
                          >
                            <Square size={13} />
                            <span>Granica</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Nazwa</label>
                        <input
                          type="text"
                          value={selectedBuilding.name}
                          onChange={(e) => updateSelectedBuilding({ name: e.target.value })}
                          style={{
                            width: '100%',
                            backgroundColor: 'var(--bg-input)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '8px',
                            padding: '7px 10px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                      </div>

                      {/* Pola specyficzne dla GRANICY */}
                      {selectedBuilding.category === 'boundary' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Numer działki</label>
                            <input
                              type="text"
                              placeholder="np. 124/2"
                              value={selectedBuilding.plotNumber || ''}
                              onChange={(e) => updateSelectedBuilding({ plotNumber: e.target.value })}
                              style={{
                                width: '110px',
                                backgroundColor: 'var(--bg-input)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '8px',
                                padding: '6px 8px',
                                color: '#fca5a5',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                textAlign: 'right',
                              }}
                            />
                          </div>

                          <div
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              fontSize: '11px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#94a3b8' }}>Powierzchnia działki:</span>
                              <b style={{ color: '#fca5a5', fontFamily: 'monospace' }}>{selectedBuildingArea.toFixed(1)} m² ({(selectedBuildingArea / 100).toFixed(2)} a)</b>
                            </div>
                            <div style={{ fontSize: '10px', color: '#cbd5e1' }}>
                              • Obrys geodezyjny (nie generuje cienia i kierunków śledzenia fasad).
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Pola specyficzne dla BUDYNKU */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Wysokość H (m)</label>
                            <input
                              type="number"
                              step="0.5"
                              value={selectedBuilding.defaultHeight}
                              onChange={(e) => updateSelectedBuilding({ defaultHeight: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: '80px',
                                backgroundColor: 'var(--bg-input)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '8px',
                                padding: '6px 8px',
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                textAlign: 'right',
                              }}
                            />
                          </div>

                          {/* Kondygnacje: H1, Ht, Liczba kondygnacji */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', backgroundColor: 'var(--bg-input)', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Wys. parteru H₁</label>
                              <input
                                type="number"
                                step="0.1"
                                value={selectedBuilding.firstFloorHeight ?? 3.5}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 3.0;
                                  updateSelectedBuilding({ firstFloorHeight: val });
                                }}
                                style={{
                                  width: '100%',
                                  backgroundColor: 'transparent',
                                  border: '1px solid #475569',
                                  borderRadius: '5px',
                                  padding: '4px 6px',
                                  color: '#cbd5e1',
                                  fontSize: '11px',
                                  textAlign: 'right',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Kond. typowa Hₜ</label>
                              <input
                                type="number"
                                step="0.05"
                                value={selectedBuilding.typicalFloorHeight ?? 2.875}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 2.8;
                                  updateSelectedBuilding({ typicalFloorHeight: val });
                                }}
                                style={{
                                  width: '100%',
                                  backgroundColor: 'transparent',
                                  border: '1px solid #475569',
                                  borderRadius: '5px',
                                  padding: '4px 6px',
                                  color: '#cbd5e1',
                                  fontSize: '11px',
                                  textAlign: 'right',
                                }}
                              />
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Liczba kondygnacji (N)</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={selectedBuilding.storeysCount || (selectedBuilding.defaultHeight > (selectedBuilding.firstFloorHeight ?? 3.5) ? 1 + Math.max(1, Math.round((selectedBuilding.defaultHeight - (selectedBuilding.firstFloorHeight ?? 3.5)) / (selectedBuilding.typicalFloorHeight ?? 2.875))) : 1)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 1;
                                updateSelectedBuilding({ storeysCount: Math.max(1, val) });
                              }}
                              style={{
                                width: '80px',
                                backgroundColor: 'var(--bg-input)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '8px',
                                padding: '6px 8px',
                                color: '#38bdf8',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                textAlign: 'right',
                              }}
                            />
                          </div>

                          {/* Kąt obrotu obiektu względem głównego układu współrzędnych projektu */}
                          {(() => {
                            const currentRotDeg = selectedBuilding.transform?.rotationDeg !== undefined
                              ? selectedBuilding.transform.rotationDeg
                              : selectedBuilding.segments.length > 0
                              ? Number((((selectedBuilding.segments[0].angleRad * 180) / Math.PI + 360) % 360).toFixed(1))
                              : 0;

                            return (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }} title="Kąt obrotu obiektu względem osi X (0°) głównego układu współrzędnych projektu">
                                  Obrót (°)
                                </label>
                                <input
                                  type="number"
                                  step="1"
                                  value={currentRotDeg}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    handleSetBuildingAbsoluteRotation(selectedBuilding.id, val);
                                  }}
                                  style={{
                                    width: '80px',
                                    backgroundColor: 'var(--bg-input)',
                                    border: '1px solid var(--border-light)',
                                    borderRadius: '8px',
                                    padding: '6px 8px',
                                    color: '#818cf8',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    textAlign: 'right',
                                    fontFamily: 'monospace',
                                  }}
                                />
                              </div>
                            );
                          })()}

                          {/* Odległość od granic działki jeśli istnieją */}
                          {distancesToBoundaries.length > 0 && (
                            <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ color: '#fca5a5', fontWeight: 600 }}>Odległość od granicy działki:</div>
                              {distancesToBoundaries.map((d) => (
                                <div key={d.boundaryId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: '#cbd5e1' }}>{d.boundaryName}:</span>
                                  <b style={{ color: d.minDistance < 3.0 ? '#f43f5e' : d.minDistance < 4.0 ? '#fbbf24' : '#6ee7b7', fontFamily: 'monospace' }}>
                                    {d.minDistance.toFixed(2)} m
                                  </b>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Status Toggle Buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                            <button
                              type="button"
                              onClick={() => updateSelectedBuilding({ isIncluded: selectedBuilding.isIncluded === false ? true : false })}
                              className={`btn-tile ${selectedBuilding.isIncluded !== false ? 'active-emerald' : 'inactive'}`}
                            >
                              <span>Uwzględnij w kalkulacji</span>
                              <span style={{ fontSize: '10px', fontWeight: 700 }}>{selectedBuilding.isIncluded !== false ? 'TAK' : 'NIE'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => updateSelectedBuilding({ isTested: !selectedBuilding.isTested })}
                              className={`btn-tile ${selectedBuilding.isTested ? 'active-indigo' : 'inactive'}`}
                            >
                              <span>Obiekt badany (Projektowany)</span>
                              <span style={{ fontSize: '10px', fontWeight: 700 }}>{selectedBuilding.isTested ? 'TAK' : 'NIE'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => updateSelectedBuilding({ isCityCentre: !selectedBuilding.isCityCentre })}
                              className={`btn-tile ${selectedBuilding.isCityCentre ? 'active-amber' : 'inactive'}`}
                            >
                              <span>Zabudowa śródmiejska</span>
                              <span style={{ fontSize: '10px', fontWeight: 700 }}>{selectedBuilding.isCityCentre ? 'TAK' : 'NIE'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="ui-card" style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                    Kliknij dowolny obiekt na rzucie CAD, aby edytować jego parametry.
                  </div>
                )}

                {/* 2.2 Kafelek Informacyjny: Bilans Powierzchni & Kubatury */}
                <div className="ui-card">
                  <div className="ui-title">
                    <span>Informacje i bilans powierzchni</span>
                    <FileSpreadsheet size={14} color="#10b981" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                    {/* Sekcja Obiektu Wybranego (jeśli wybrano budynek) */}
                    {selectedBuilding && selectedBuilding.category !== 'boundary' && (() => {
                      const pz = selectedBuildingArea;
                      const n = selectedBuilding.storeysCount || (selectedBuilding.defaultHeight > (selectedBuilding.firstFloorHeight ?? 3.5) ? 1 + Math.max(1, Math.round((selectedBuilding.defaultHeight - (selectedBuilding.firstFloorHeight ?? 3.5)) / (selectedBuilding.typicalFloorHeight ?? 2.875))) : 1);
                      const pc = pz * n;
                      const vol = pz * selectedBuilding.defaultHeight;
                      const pum = pc * 0.72;

                      return (
                        <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontWeight: 700, color: '#e0e7ff', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Wybrany: {selectedBuilding.name}</span>
                            <span style={{ color: '#38bdf8' }}>{n} kond.</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>Powierzchnia zabudowy (Pz):</span>
                            <b style={{ color: '#6ee7b7', fontFamily: 'monospace' }}>{pz.toFixed(1)} m²</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>Powierzchnia całkowita (Pc):</span>
                            <b style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{pc.toFixed(1)} m²</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>Kubatura brutto (V):</span>
                            <b style={{ color: '#c084fc', fontFamily: 'monospace' }}>{vol.toFixed(1)} m³</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>Szacowany PUM (~72%):</span>
                            <b style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{pum.toFixed(1)} m²</b>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Sekcja Podsumowania Budynków Projektowanych */}
                    <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontWeight: 700, color: '#a5b4fc', marginBottom: '2px' }}>
                        Łącznie obiekty badane ({testedBuildingsSummary.count} szt.)
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Łączna pow. zabudowy (Pz):</span>
                        <b style={{ color: '#6ee7b7', fontFamily: 'monospace' }}>{testedBuildingsSummary.totalPz.toFixed(1)} m²</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Łączna pow. całkowita (Pc):</span>
                        <b style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{testedBuildingsSummary.totalPc.toFixed(1)} m²</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Łączna kubatura (V):</span>
                        <b style={{ color: '#c084fc', fontFamily: 'monospace' }}>{testedBuildingsSummary.totalVolume.toFixed(1)} m³</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Łączny szacowany PUM:</span>
                        <b style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{testedBuildingsSummary.estimatedPUM.toFixed(1)} m²</b>
                      </div>
                    </div>

                    {/* Sekcja Działek i Wskaźników Urbanistycznych */}
                    <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontWeight: 700, color: '#fca5a5', marginBottom: '2px' }}>
                        Działki ewidencyjne ({boundaryObjects.length} szt.)
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Łączna pow. działek (Pdz):</span>
                        <b style={{ color: '#fca5a5', fontFamily: 'monospace' }}>
                          {totalBoundaryArea > 0 ? `${totalBoundaryArea.toFixed(1)} m² (${(totalBoundaryArea / 100).toFixed(2)} a)` : 'Brak zdefiniowanych działek'}
                        </b>
                      </div>
                      {totalBoundaryArea > 0 && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>Wskaźnik pow. zabudowy:</span>
                            <b style={{ color: '#6ee7b7', fontFamily: 'monospace' }}>{testedBuildingsSummary.plotCoverageRatio.toFixed(1)}%</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>Wskaźnik intensywności:</span>
                            <b style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{testedBuildingsSummary.intensityRatio.toFixed(2)}</b>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Klawisz kopiowania do clipboard danych powierzchniowych */}
                    <button
                      type="button"
                      onClick={() => {
                        const lines: string[] = [
                          '=== ZESTAWIENIE POWIERZCHNI I KUBATURY ===',
                          `Projektowane budynki: ${testedBuildingsSummary.count}`,
                          `Powierzchnia zabudowy (Pz): ${testedBuildingsSummary.totalPz.toFixed(1)} m²`,
                          `Powierzchnia całkowita (Pc): ${testedBuildingsSummary.totalPc.toFixed(1)} m²`,
                          `Kubatura brutto (V): ${testedBuildingsSummary.totalVolume.toFixed(1)} m³`,
                          `Szacowany PUM (~72%): ${testedBuildingsSummary.estimatedPUM.toFixed(1)} m²`,
                        ];

                        if (totalBoundaryArea > 0) {
                          lines.push(
                            `Łączna powierzchnia działek (Pdz): ${totalBoundaryArea.toFixed(1)} m²`,
                            `Wskaźnik powierzchni zabudowy: ${testedBuildingsSummary.plotCoverageRatio.toFixed(1)}%`,
                            `Wskaźnik intensywności zabudowy: ${testedBuildingsSummary.intensityRatio.toFixed(2)}`
                          );
                        }

                        if (selectedBuilding && selectedBuilding.category !== 'boundary') {
                          lines.push(
                            '',
                            `--- Wybrany obiekt: ${selectedBuilding.name} ---`,
                            `Wysokość H: ${selectedBuilding.defaultHeight} m`,
                            `Kondygnacje: ${selectedBuilding.storeysCount || 1}`,
                            `Powierzchnia zabudowy: ${selectedBuildingArea.toFixed(1)} m²`,
                            `Powierzchnia całkowita: ${(selectedBuildingArea * (selectedBuilding.storeysCount || 1)).toFixed(1)} m²`,
                            `Kubatura: ${(selectedBuildingArea * selectedBuilding.defaultHeight).toFixed(1)} m³`
                          );
                        }

                        navigator.clipboard.writeText(lines.join('\n')).then(() => {
                          showCopiedToast('Skopiowano zestawienie do schowka!');
                        }).catch(() => {
                          showCopiedToast('Nie udało się skopiować.');
                        });
                      }}
                      className="btn-tile active-indigo"
                      style={{ justifyContent: 'center', gap: '6px', padding: '8px 10px', marginTop: '2px' }}
                      title="Skopiuj zestawienie danych powierzchniowych i kubaturowych do schowka"
                    >
                      <Copy size={13} />
                      <span style={{ fontWeight: 600 }}>Kopiuj do schowka</span>
                    </button>

                    {copiedToast && (
                      <div
                        style={{
                          textAlign: 'center',
                          color: '#6ee7b7',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          padding: '4px',
                          borderRadius: '4px',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                        }}
                      >
                        {copiedToast}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* GRUPA 3: NARZĘDZIA                                                        */}
          {/* (Kafle: Narzędzia Rysowania / Edycji & Modelowanie Obiektu 2.5D)          */}
          {/* ========================================================================= */}
          <div className="sidebar-group-divider" />
          <div className="sidebar-group">
            <button
              type="button"
              className="sidebar-group-header"
              onClick={() => toggleSidebarGroup('tools')}
              title="Zwiń / rozwiń grupę: Narzędzia"
            >
              <div className="sidebar-group-title">
                <Wrench size={15} color="#818cf8" />
                <span>Narzędzia</span>
              </div>
              {isToolsGroupOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
            </button>

            {isToolsGroupOpen && (
              <div className="sidebar-group-content">
                {/* 3.1 Narzędzia Rysowania i Edycji */}
                <div className="ui-card">
                  <div className="ui-title">
                    <span>Narzędzia</span>
                    <Wrench size={14} color="#818cf8" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {/* Rząd przełączników: Dociąganie oraz Śledzenie */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px', marginBottom: '4px' }}>
                      {/* Kontrolka Dociągania (OSNAP) */}
                      <button
                        type="button"
                        onClick={handleToggleOsnap}
                        className={`btn-tile ${isOsnapActive ? 'active-emerald' : 'inactive'}`}
                        style={{ padding: '7px 8px', justifyContent: 'space-between' }}
                        title="Włącz / wyłącz dociąganie geometryczne [F3] (wierzchołki, środki, krawędzie, przecięcia OTRACK)"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Magnet size={13} color={isOsnapActive ? '#10b981' : '#64748b'} />
                          <span style={{ fontWeight: 600, fontSize: '11px' }}>Dociąganie [F3]</span>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700 }}>
                          {isOsnapActive ? 'WŁ' : 'WYŁ'}
                        </span>
                      </button>

                      {/* Przełącznik Śledzenia */}
                      <button
                        type="button"
                        onClick={() => setIsDirectionSnappingActive(!isDirectionSnappingActive)}
                        className={`btn-tile ${isDirectionSnappingActive ? 'active-indigo' : 'inactive'}`}
                        style={{ padding: '7px 8px', justifyContent: 'space-between' }}
                        title="Włącz / wyłącz inteligentne śledzenie kątowe i kierunków (równoległe, prostopadłe 90° i osie dominujące)"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Compass size={13} color={isDirectionSnappingActive ? '#818cf8' : '#64748b'} />
                          <span style={{ fontWeight: 600, fontSize: '11px' }}>Śledzenie</span>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700 }}>
                          {isDirectionSnappingActive ? 'WŁ' : 'WYŁ'}
                        </span>
                      </button>
                    </div>

                    {/* Rząd 1: Prostokąt, Polilinia */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawingMode(drawingMode === 'rectangle' ? 'none' : 'rectangle');
                          setDrawingVerticesCount(0);
                          setIsDimensionToolActive(false);
                          setDimensionPendingRef(null);
                          setFacadePointMode(false);
                        }}
                        className={`btn-tile ${drawingMode === 'rectangle' ? 'active-indigo' : 'inactive'}`}
                        style={{ justifyContent: 'center', gap: '5px', padding: '8px 6px', fontSize: '11px' }}
                        title="Rysuj nowy prostokąt: 1. kliknięcie = start, 2. kliknięcie = koniec"
                      >
                        <Square size={13} />
                        <span style={{ fontWeight: 600 }}>Prostokąt</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDrawingMode(drawingMode === 'polyline' ? 'none' : 'polyline');
                          setDrawingVerticesCount(0);
                          setIsDimensionToolActive(false);
                          setDimensionPendingRef(null);
                          setFacadePointMode(false);
                        }}
                        className={`btn-tile ${drawingMode === 'polyline' ? 'active-indigo' : 'inactive'}`}
                        style={{ justifyContent: 'center', gap: '5px', padding: '8px 6px', fontSize: '11px' }}
                        title="Rysuj nową zamkniętą polilinię wieloboczną"
                      >
                        <PenTool size={13} />
                        <span style={{ fontWeight: 600 }}>Polilinia</span>
                      </button>
                    </div>

                    {/* Rząd 2: Obrót, Wierzchołki, Krawędzie, Suma */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (drawingMode === 'rotate') {
                            setRotateInitialBuildingsSnapshot(null);
                            setDrawingMode('none');
                          } else {
                            setRotateInitialBuildingsSnapshot(
                              buildings.map((b) => ({ ...b, vertices: [...b.vertices], segments: [...b.segments] }))
                            );
                            setDrawingMode('rotate');
                            setDrawingVerticesCount(0);
                            setIsDimensionToolActive(false);
                            setDimensionPendingRef(null);
                            setFacadePointMode(false);
                            setIsEditMode(false);
                          }
                        }}
                        className={`btn-tile ${drawingMode === 'rotate' ? 'active-indigo' : 'inactive'}`}
                        style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
                        title="Obrót obiektów: chwytaj za narożniki lub przeciągaj wokół punktu obrotu (z dociąganiem i śledzeniem). Enter = zatwierdź, Esc = anuluj."
                      >
                        <RotateCw size={13} />
                        <span style={{ fontWeight: 600 }}>Obrót</span>
                      </button>


                      <button
                        type="button"
                        onClick={() => {
                          setDrawingMode(drawingMode === 'vertexEdit' ? 'none' : 'vertexEdit');
                          setDrawingVerticesCount(0);
                          setIsDimensionToolActive(false);
                          setDimensionPendingRef(null);
                          setFacadePointMode(false);
                        }}
                        className={`btn-tile ${drawingMode === 'vertexEdit' ? 'active-indigo' : 'inactive'}`}
                        style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
                        title="Edycja wierzchołków brył: przeciągaj punkty, klikaj [+] by dodać wierzchołek, klawisz Del by usunąć"
                      >
                        <Edit3 size={13} />
                        <span style={{ fontWeight: 600 }}>Wierzchołki</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsEditMode(!isEditMode);
                          setDrawingMode('none');
                          setDrawingVerticesCount(0);
                          setIsDimensionToolActive(false);
                          setDimensionPendingRef(null);
                          setFacadePointMode(false);
                        }}
                        className={`btn-tile ${isEditMode ? 'active-amber' : 'inactive'}`}
                        style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
                        title="Równoległe przesuwanie krawędzi (offset) z zachowaniem kierunków ścian"
                      >
                        <Maximize2 size={13} />
                        <span style={{ fontWeight: 600 }}>Krawędzie</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDrawingMode(drawingMode === 'union' ? 'none' : 'union');
                          setDrawingVerticesCount(0);
                          setIsDimensionToolActive(false);
                          setDimensionPendingRef(null);
                          setFacadePointMode(false);
                          setIsEditMode(false);
                        }}
                        className={`btn-tile ${drawingMode === 'union' ? 'active-indigo' : 'inactive'}`}
                        style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
                        title="Suma (Boolean Union): połącz 2 stykające się lub przenikające obiekty w jeden"
                      >
                        <Combine size={13} />
                        <span style={{ fontWeight: 600 }}>Suma</span>
                      </button>
                    </div>


                    {/* Rząd 3: Wymiar, Punkt fasady */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDimensionToolActive(!isDimensionToolActive);
                          setDimensionPendingRef(null);
                          setDrawingMode('none');
                          setDrawingVerticesCount(0);
                          setFacadePointMode(false);
                        }}
                        className={`btn-tile ${isDimensionToolActive ? 'active-indigo' : 'inactive'}`}
                        style={{ justifyContent: 'center', gap: '5px', padding: '8px 6px', fontSize: '11px' }}
                        title="Dodaj wymiar: kliknij 1. krawędź (początek) i 2. krawędź (koniec)"
                      >
                        <Ruler size={13} />
                        <span style={{ fontWeight: 600 }}>Wymiar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFacadePointMode((prev) => !prev);
                          setDrawingMode('none');
                          setIsDimensionToolActive(false);
                          setDimensionPendingRef(null);
                        }}
                        className={`btn-tile ${facadePointMode ? 'active-indigo' : 'inactive'}`}
                        style={{ justifyContent: 'center', gap: '5px', padding: '8px 6px', fontSize: '11px' }}
                        title="Kliknij lub przeciągnij punkt wzdłuż krawędzi fasady"
                      >
                        <MapPin size={13} />
                        <span style={{ fontWeight: 600 }}>Punkt fasady</span>
                      </button>
                    </div>

                      {/* Active Dimension Tool Panel */}
                      {isDimensionToolActive && (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Ruler size={13} />
                              <span>Narzędzie Wymiar</span>
                            </span>

                            {/* Dimension Type Selector (Liniowy vs Kątowy) */}
                            <div style={{ display: 'flex', gap: '3px', backgroundColor: 'var(--bg-input)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                              <button
                                type="button"
                                onClick={() => setDimensionType('linear')}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '10px',
                                  fontWeight: dimensionType === 'linear' ? 700 : 500,
                                  borderRadius: '4px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  backgroundColor: dimensionType === 'linear' ? '#38bdf8' : 'transparent',
                                  color: dimensionType === 'linear' ? '#0f172a' : '#94a3b8',
                                }}
                              >
                                Liniowy
                              </button>
                              <button
                                type="button"
                                onClick={() => setDimensionType('angular')}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '10px',
                                  fontWeight: dimensionType === 'angular' ? 700 : 500,
                                  borderRadius: '4px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  backgroundColor: dimensionType === 'angular' ? '#c084fc' : 'transparent',
                                  color: dimensionType === 'angular' ? '#0f172a' : '#94a3b8',
                                }}
                              >
                                Kątowy
                              </button>
                            </div>
                          </div>

                          <div style={{ color: '#cbd5e1', fontSize: '10.5px' }}>
                            {!dimensionPendingRef
                              ? '1. Kliknij w 1. krawędź obiektu na rzucie CAD (początek wymiaru).'
                              : '2. Kliknij w 2. krawędź obiektu (koniec wymiaru).'}
                          </div>

                          <button
                            type="button"
                            onClick={handleCancelDimension}
                            style={{
                              marginTop: '2px',
                              padding: '4px 8px',
                              borderRadius: '5px',
                              border: '1px solid rgba(244, 63, 94, 0.4)',
                              backgroundColor: 'rgba(244, 63, 94, 0.15)',
                              color: '#fca5a5',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Anuluj wymiarowanie (Esc)
                          </button>
                        </div>
                      )}

                      {/* Active Drawing Guide Prompt */}
                      {drawingMode === 'rectangle' && (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ color: '#a5b4fc', fontWeight: 600 }}>
                            {drawingVerticesCount === 0
                              ? 'Kliknij w oknie CAD, aby wstawić 1. narożnik prostokąta.'
                              : 'Kliknij 2. punkt, aby zakończyć tworzenie prostokąta.'}
                          </div>
                          <button
                            type="button"
                            onClick={handleCancelDrawing}
                            style={{
                              marginTop: '2px',
                              padding: '4px 8px',
                              borderRadius: '5px',
                              border: '1px solid rgba(244, 63, 94, 0.4)',
                              backgroundColor: 'rgba(244, 63, 94, 0.15)',
                              color: '#fca5a5',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Anuluj rysowanie (Esc)
                          </button>
                        </div>
                      )}

                      {drawingMode === 'polyline' && (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ color: '#a5b4fc', fontWeight: 600 }}>
                            {drawingVerticesCount === 0
                              ? 'Kliknij w oknie CAD, aby wstawić 1. punkt polilinii.'
                              : `Wstawiono wierzchołków: ${drawingVerticesCount}.`}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '10px' }}>
                            Klikaj kolejne wierzchołki. <b>Kliknij w 1. zielony punkt</b> na rzucie CAD, aby zamknąć polilinię.
                          </div>
                          <button
                            type="button"
                            onClick={handleCancelDrawing}
                            style={{
                              marginTop: '2px',
                              padding: '4px 8px',
                              borderRadius: '5px',
                              border: '1px solid rgba(244, 63, 94, 0.4)',
                              backgroundColor: 'rgba(244, 63, 94, 0.15)',
                              color: '#fca5a5',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Anuluj rysowanie (Esc)
                          </button>
                        </div>
                      )}

                      {drawingMode === 'rotate' && (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(129, 140, 248, 0.12)',
                            border: '1px solid rgba(129, 140, 248, 0.35)',
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ color: '#a5b4fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <RotateCw size={13} />
                            <span>Narzędzie Obrót obiektów</span>
                          </div>
                          <div style={{ color: '#cbd5e1', fontSize: '10px', lineHeight: '1.4' }}>
                            • Przeciągaj wokół punktu obrotu, aby obrócić obiekt (lub całą połączoną grupę).<br />
                            • Przeciągnij bursztynowy celownik <b style={{ color: '#f59e0b' }}>(+)</b>, aby zmienić środek obrotu.
                          </div>
                          <button
                            type="button"
                            onClick={() => setDrawingMode('none')}
                            style={{
                              marginTop: '4px',
                              padding: '4px 8px',
                              borderRadius: '5px',
                              border: '1px solid rgba(129, 140, 248, 0.4)',
                              backgroundColor: 'rgba(129, 140, 248, 0.15)',
                              color: '#a5b4fc',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Zakończ obracanie
                          </button>
                        </div>
                      )}

                      {drawingMode === 'vertexEdit' && (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Edit3 size={13} />
                            <span>Tryb edycji wierzchołków</span>
                          </div>
                          <div style={{ color: '#cbd5e1', fontSize: '10px', lineHeight: '1.4' }}>
                            • Przeciągnij niebieski punkt, aby zmienić kształt.<br />
                            • Kliknij zielony punkt <b style={{ color: '#10b981' }}>[+]</b> na krawędzi, aby wstawić nowy wierzchołek.<br />
                            • Usuwanie: zaznacz punkt i naciśnij <b>Delete / Backspace</b>, kliknij czerwone <b>[x]</b> lub kliknij <b>PPM</b>.
                          </div>
                          <button
                            type="button"
                            onClick={() => setDrawingMode('none')}
                            style={{
                              marginTop: '4px',
                              padding: '4px 8px',
                              borderRadius: '5px',
                              border: '1px solid rgba(56, 189, 248, 0.4)',
                              backgroundColor: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Zakończ edycję wierzchołków
                          </button>
                        </div>
                      )}

                      {/* Analiza Statystyczna Kierunków Odcinków */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>Analiza kierunków fasad</span>
                          </span>
                          <span style={{ color: '#818cf8', fontSize: '10.5px' }}>{segmentStats.totalSegments} odc. ({segmentStats.totalLength.toFixed(1)}m)</span>
                        </div>

                        {/* Modyfikator percentylu odcinającego szum */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', backgroundColor: 'var(--bg-input)', padding: '5px 7px', borderRadius: '5px', border: '1px solid var(--border-light)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                            <span>Odcięcie szumu (długość):</span>
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                              {noisePercentileCutoff}% ({segmentStats.lengthCutoffMeters > 0 ? `> ${segmentStats.lengthCutoffMeters.toFixed(2)}m` : 'brak'})
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="range"
                              min="0"
                              max="60"
                              step="5"
                              value={noisePercentileCutoff}
                              onChange={(e) => setNoisePercentileCutoff(Number(e.target.value))}
                              style={{ width: '100%', height: '4px', accentColor: '#f59e0b', cursor: 'pointer' }}
                              title={`Odrzuć najkrótsze ${noisePercentileCutoff}% odcinków przy wykrywaniu siatek śledzenia`}
                            />
                          </div>
                        </div>

                        {segmentStats.dominantDirections.length > 0 && (
                          <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.35)', fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ color: '#fbbf24', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>📊 Główna siatka śledzenia:</span>
                              <span style={{ fontSize: '9px', backgroundColor: 'rgba(245, 158, 11, 0.25)', padding: '1px 5px', borderRadius: '3px', color: '#f59e0b', fontWeight: 700 }}>Aktywne OTRACK</span>
                            </div>
                            <div style={{ color: '#f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                              <span>Osie: <b>{segmentStats.dominantDirections[0].angleDeg.toFixed(1)}°</b> / <b>{segmentStats.dominantDirections[0].orthogonalDeg.toFixed(1)}°</b></span>
                              <span style={{ color: '#fbbf24', fontWeight: 600 }}>{segmentStats.dominantDirections[0].percentage.toFixed(0)}% długości</span>
                            </div>
                          </div>
                        )}

                        {/* Mini rozkład kątów z wyróżnieniem aktywnych dla śledzenia */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '2px' }}>
                          {segmentStats.angleBins.filter(b => b.count > 0).slice(0, 8).map((b) => {
                            const isTracking = b.isTrackingActive;
                            return (
                              <div
                                key={b.label}
                                style={{
                                  padding: '3px 4px',
                                  borderRadius: '4px',
                                  backgroundColor: isTracking ? 'rgba(245, 158, 11, 0.14)' : 'var(--bg-input)',
                                  border: isTracking ? '1px solid #f59e0b' : '1px solid var(--border-light)',
                                  fontSize: '9.5px',
                                  textAlign: 'center',
                                  position: 'relative',
                                }}
                                title={isTracking ? 'Ten kierunek jest aktywnie rozpoznawany i naprowadzany przez śledzenie polarne' : 'Kierunek w granicach tolerancji'}
                              >
                                <div style={{ color: isTracking ? '#fbbf24' : '#94a3b8', fontWeight: isTracking ? 600 : 400, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2px' }}>
                                  {isTracking && <span style={{ fontSize: '8px' }}>📊</span>}
                                  <span>{b.binStartDeg}°-{b.binEndDeg}°</span>
                                </div>
                                <div style={{ color: isTracking ? '#fef3c7' : '#e2e8f0', fontWeight: 600 }}>{b.totalLength.toFixed(0)}m ({b.percentage.toFixed(0)}%)</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Active Dimensions List for Selected Building */}
                      {selectedBuildingDimensions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px', paddingTop: '6px', borderTop: '1px dashed var(--border-light)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#94a3b8', fontWeight: 600 }}>
                            <span>Wymiary obiektu ({selectedBuildingDimensions.length}):</span>
                            <button
                              type="button"
                              onClick={handleClearAllDimensions}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#f43f5e',
                                fontSize: '10px',
                                cursor: 'pointer',
                                padding: '2px 4px',
                              }}
                              title="Wyczyść wszystkie wymiary"
                            >
                              Wyczyść
                            </button>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {selectedBuildingDimensions.map((dim, idx) => {
                              const b1 = buildings.find((b) => b.id === dim.ref1.buildingId);
                              const s1 = b1?.segments.find((s) => s.id === dim.ref1.segmentId);
                              const b2 = buildings.find((b) => b.id === dim.ref2.buildingId);
                              const s2 = b2?.segments.find((s) => s.id === dim.ref2.segmentId);
                              let valStr = '...';
                              if (s1 && s2) {
                                if (dim.type === 'linear') {
                                  const r = computeLinearDimension(s1.p1, s1.p2, s2.p1, s2.p2);
                                  valStr = `${r.distance.toFixed(2)} m`;
                                } else {
                                  const r = computeAngularDimension(s1.p1, s1.p2, s2.p1, s2.p2);
                                  valStr = `${r.angleDeg.toFixed(1)}°`;
                                }
                              }

                              return (
                                <div
                                  key={dim.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(15, 23, 42, 0.7)',
                                    border: '1px solid var(--border-light)',
                                    fontSize: '11px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ color: dim.type === 'linear' ? '#38bdf8' : '#c084fc', fontWeight: 700, fontFamily: 'monospace' }}>
                                      #{idx + 1} {valStr}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleDimensionType(dim.id)}
                                      style={{
                                        padding: '2px 5px',
                                        fontSize: '9.5px',
                                        borderRadius: '4px',
                                        border: '1px solid #475569',
                                        backgroundColor: 'transparent',
                                        color: '#94a3b8',
                                        cursor: 'pointer',
                                      }}
                                      title="Przełącz typ wymiaru (Liniowy / Kątowy)"
                                    >
                                      {dim.type === 'linear' ? 'm' : '°'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDimension(dim.id)}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#f43f5e',
                                        cursor: 'pointer',
                                        padding: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                      }}
                                      title="Usuń ten wymiar"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {/* 2. Operations on Selected Building */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px', borderTop: '1px solid var(--border-light)' }}>
                      {selectedBuilding ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {isEditMode && (
                            <div
                              style={{
                                padding: '7px 10px',
                                borderRadius: '7px',
                                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                fontSize: '10.5px',
                                color: '#fde68a',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <span>Chwyć dowolną krawędź na rzucie CAD i przeciągaj. Krawędzie zachowują kierunki.</span>
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleDuplicateBuilding(selectedBuilding.id)}
                              className="btn-tile active-indigo"
                              style={{ justifyContent: 'center', gap: '6px', padding: '8px 10px' }}
                              title="Utwórz natychmiast kopię tego obiektu"
                            >
                              <Copy size={13} />
                              <span style={{ fontWeight: 600 }}>Duplikuj</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteBuilding(selectedBuilding.id)}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '10px',
                                border: '1px solid rgba(244, 63, 94, 0.4)',
                                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                                color: '#fca5a5',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s',
                              }}
                              title="Usuń ten obiekt ze sceny"
                            >
                              <Trash2 size={13} />
                              <span>Usuń</span>
                            </button>
                          </div>

                          {/* Linking / Grouping Section */}
                          {isLinkingMode ? (
                            <div
                              style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                fontSize: '11px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                              }}
                            >
                              <div style={{ color: '#fbbf24', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Link2 size={14} />
                                <span>Tryb łączenia aktywny</span>
                              </div>
                              <div style={{ color: '#cbd5e1', fontSize: '10.5px' }}>
                                Kliknij teraz <b>drugi obiekt</b> na rzucie CAD, aby go połączyć z <b>{selectedBuilding.name}</b>.
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsLinkingMode(false);
                                  setLinkingSourceId(null);
                                }}
                                style={{
                                  marginTop: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '5px',
                                  border: '1px solid rgba(244, 63, 94, 0.4)',
                                  backgroundColor: 'rgba(244, 63, 94, 0.15)',
                                  color: '#fca5a5',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Anuluj łączenie
                              </button>
                            </div>
                          ) : selectedBuilding.groupId ? (
                            <div
                              style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                fontSize: '11px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                              }}
                            >
                              <div style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Link size={13} />
                                <span>Połączony w grupie</span>
                              </div>
                              <div style={{ color: '#94a3b8', fontSize: '10px' }}>
                                Obiekty w grupie przesuwają się wspólnie:
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {buildings
                                  .filter((b) => b.groupId === selectedBuilding.groupId)
                                  .map((b) => (
                                    <span
                                      key={b.id}
                                      style={{
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        backgroundColor: b.id === selectedBuilding.id ? '#38bdf8' : 'rgba(15, 23, 42, 0.8)',
                                        color: b.id === selectedBuilding.id ? '#0f172a' : '#cbd5e1',
                                        fontWeight: b.id === selectedBuilding.id ? 700 : 500,
                                        fontSize: '10px',
                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                      }}
                                    >
                                      {b.name}
                                    </span>
                                  ))}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsLinkingMode(true);
                                    setLinkingSourceId(selectedBuilding.id);
                                  }}
                                  style={{
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #38bdf8',
                                    backgroundColor: 'rgba(56, 189, 248, 0.2)',
                                    color: '#e0f2fe',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                  title="Dołącz kolejny obiekt do tej grupy"
                                >
                                  <Link2 size={12} />
                                  <span>Dołącz kolejny</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => performUnlinkBuilding(selectedBuilding.id)}
                                  style={{
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(244, 63, 94, 0.4)',
                                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                                    color: '#fca5a5',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                  title="Odłącz ten obiekt od grupy"
                                >
                                  <Unlink size={12} />
                                  <span>Rozłącz obiekt</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setIsLinkingMode(true);
                                setLinkingSourceId(selectedBuilding.id);
                              }}
                              className="btn-tile active-indigo"
                              style={{ justifyContent: 'center', gap: '8px', padding: '9px 12px' }}
                              title="Połącz ten obiekt z innym, aby przesuwać je razem"
                            >
                              <Link2 size={14} />
                              <span style={{ fontWeight: 600 }}>Połącz z innym obiektem</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '4px 0' }}>
                          Wybierz obiekt na rzucie CAD, aby móc go zduplikować, usunąć lub połączyć.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Fullscreen CAD Viewport */}
      <main className="cad-viewport" style={{ flex: 1, width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
        {/* Floating Top HUD */}
        <div className="cad-hud-top">
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              title="Pokaż panel boczny"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 8px',
                borderRadius: '8px',
                background: 'var(--accent-indigo)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <ChevronRight size={16} />
            </button>
          )}

          {/* Selected City Location Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid #334155',
              fontSize: '11px',
              color: '#f8fafc',
            }}
            title={`Lokalizacja projektu: ${selectedCity} (${settings.latitude.toFixed(2)}°N, ${settings.longitude.toFixed(2)}°E)`}
          >
            <MapPin size={13} color="#f59e0b" />
            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{selectedCity}</span>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              ({settings.latitude.toFixed(2)}°N)
            </span>
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

          <button
            onClick={() => setShowShadowingLines(!showShadowingLines)}
            style={{
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: showShadowingLines ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: showShadowingLines ? '#6ee7b7' : '#94a3b8',
            }}
          >
            § 12
          </button>
          <button
            onClick={() => setShowSunlightLines(!showSunlightLines)}
            style={{
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: showSunlightLines ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: showSunlightLines ? '#fcd34d' : '#94a3b8',
            }}
          >
            § 56
          </button>
          <button
            onClick={() => setShowNormals(!showNormals)}
            style={{
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: showNormals ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: showNormals ? '#a5b4fc' : '#94a3b8',
            }}
          >
            Wektory
          </button>
          <button
            onClick={() => setShowShadowRange(!showShadowRange)}
            style={{
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: showShadowRange ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: showShadowRange ? '#c7d2fe' : '#94a3b8',
            }}
            title="Włącz / wyłącz widoczność obwiedni maksymalnego zasięgu cienia rzucanego przez obiekty badane w równonoc"
          >
            Zakres cienia
          </button>
          <button
            onClick={() => setShowSatelliteLayer(!showSatelliteLayer)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: showSatelliteLayer ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
              color: showSatelliteLayer ? '#38bdf8' : '#94a3b8',
            }}
            title="Włącz / wyłącz podkład z mapy satelitarnej Google Maps pod sceną CAD"
          >
            <Globe size={13} />
            <span>Satelita</span>
          </button>

          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

          {/* § 56 Method Toggle */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: 'rgba(15,23,42,0.6)', borderRadius: '8px', padding: '3px', border: '1px solid #1e293b' }}
            title="Metoda obliczania czasu nasłonecznienia § 56"
          >
            <button
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
              }}
            >
              Astro
            </button>
            <button
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
              }}
            >
              Linijka
            </button>
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

          <button
            onClick={() => {
              setFitKey((prev) => prev + 1);
            }}
            title="Dopasuj widok do obiektów (Zoom Extents)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid #334155',
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              color: '#f8fafc',
            }}
          >
            <Maximize2 size={13} />
            <span>Centruj</span>
          </button>

          <button
            onClick={handleToggleOsnap}
            title="Włącz / wyłącz dociąganie geometryczne [F3] (wierzchołki, środki, krawędzie, przecięcia OTRACK)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: isOsnapActive ? '1px solid #10b981' : '1px solid #334155',
              backgroundColor: isOsnapActive ? 'rgba(16, 185, 129, 0.22)' : 'rgba(30, 41, 59, 0.8)',
              color: isOsnapActive ? '#6ee7b7' : '#94a3b8',
            }}
          >
            <Magnet size={13} color={isOsnapActive ? '#10b981' : '#94a3b8'} />
            <span>Dociąganie</span>
          </button>

          <button
            onClick={() => {
              setIsDirectionSnappingActive((prev) => !prev);
            }}
            title="Włącz / wyłącz inteligentne śledzenie kątowe i kierunków (równoległe i prostopadłe)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid #334155',
              backgroundColor: isDirectionSnappingActive ? 'rgba(99, 102, 241, 0.25)' : 'rgba(30, 41, 59, 0.8)',
              color: isDirectionSnappingActive ? '#a5b4fc' : '#94a3b8',
            }}
          >
            <Compass size={13} color={isDirectionSnappingActive ? '#818cf8' : '#94a3b8'} />
            <span>Śledzenie</span>
          </button>



          <button
            onClick={() => {
              setViewRotationMode((prev) => !prev);
            }}
            title="Ustaw obrót widoku względem odcinka"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid #334155',
              backgroundColor: viewRotationMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(30, 41, 59, 0.8)',
              color: viewRotationMode ? '#bfdbfe' : '#f8fafc',
            }}
          >
            <RotateCw size={13} />
            <span>Obrót widoku</span>
          </button>

          <button
            onClick={() => {
              setViewRotationDeg((prev) => {
                if (Math.abs(prev) < 0.001) {
                  return savedViewRotationDeg;
                }
                setSavedViewRotationDeg(prev);
                return 0;
              });
            }}
            title={
              Math.abs(viewRotationDeg) < 0.001
                ? 'Przełącz na zapisaną orientację układu'
                : 'Wróć do domyślnej orientacji układu (0°)'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: Math.abs(viewRotationDeg) > 0.001 ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid #334155',
              backgroundColor: Math.abs(viewRotationDeg) > 0.001 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.8)',
              color: Math.abs(viewRotationDeg) > 0.001 ? '#38bdf8' : '#f8fafc',
            }}
          >
            <RotateCcw size={13} />
            <span>{Math.abs(viewRotationDeg) < 0.001 ? 'Orientacja ustawiona' : 'Orientacja domyślna'}</span>
          </button>
        </div>

        {/* Legend & Stats Overlay at Bottom-Left */}
        <div className="cad-legend-bottom" style={{ gap: '12px', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '11px' }}>LEGENDA:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>§ 12:</span>
            <span style={{ color: '#10b981', fontWeight: 800, fontSize: '12px' }} title="§ 12 Zgodne">✓</span>
            <span style={{ color: '#f43f5e', fontWeight: 800, fontSize: '12px' }} title="§ 12 Niezgodne">✗</span>
          </div>
          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>§ 56:</span>
            <div style={{ display: 'flex', height: '6px', width: '70px', borderRadius: '3px', overflow: 'hidden' }}>
              <span style={{ flex: 1, backgroundColor: '#3b0764' }} title="0h" />
              <span style={{ flex: 1, backgroundColor: '#7e22ce' }} title="1.0h" />
              <span style={{ flex: 1, backgroundColor: '#c026d3' }} title="2.0h" />
              <span style={{ flex: 1, backgroundColor: '#ea580c' }} title="3.0h (Zgodne)" />
              <span style={{ flex: 1, backgroundColor: '#fb923c' }} title="4.0h+" />
            </div>
            <span style={{ fontSize: '10px', color: '#cbd5e1' }}>0h &rarr; 4h+</span>
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

          {/* Dynamic Accuracy Refinement Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 7px',
              borderRadius: '5px',
              backgroundColor:
                accuracyStage === 'final'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : accuracyStage === 'live'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(99, 102, 241, 0.15)',
              border: `1px solid ${
                accuracyStage === 'final'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : accuracyStage === 'live'
                  ? 'rgba(245, 158, 11, 0.3)'
                  : 'rgba(99, 102, 241, 0.3)'
              }`,
              color:
                accuracyStage === 'final'
                  ? '#6ee7b7'
                  : accuracyStage === 'live'
                  ? '#fcd34d'
                  : '#a5b4fc',
              fontSize: '10px',
              fontWeight: 600,
            }}
            title={
              accuracyStage === 'final'
                ? 'Osiągnięto docelową dokładność obliczeń (krok 0.25m)'
                : 'Trwa adaptacyjne przeliczanie i zagęszczanie siatki (docelowo 0.25m)'
            }
          >
            <Activity size={12} />
            <span>
              {accuracyStage === 'live'
                ? 'Live: 2.0m'
                : accuracyStage === 'stage1'
                ? 'Siatka: 1.0m'
                : accuracyStage === 'stage2'
                ? 'Siatka: 0.5m'
                : 'Dokładność: 0.25m'}
            </span>
          </div>

          {/* Performance & points count badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '5px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid #334155',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}
            title={`Czas pełnego przeliczenia metod analitycznych w bieżącym cyklu:\n• Liczba zbadanych punktów: ${totalPoints.toLocaleString()} (${(totalPoints / 1000).toFixed(2)}k pkt)\n• § 12 (Przesłanianie) łącznie: ${totalShadowingMs.toFixed(2)} ms (śr. ${avgShadowingMs.toFixed(3)} ms/pkt)\n• § 56 (Nasłonecznienie) łącznie: ${totalSunlightMs.toFixed(2)} ms (śr. ${avgSunlightMs.toFixed(3)} ms/pkt)\n• Obrys i koperta cienia (§ 56): ${shadowEnvelopeMs.toFixed(2)} ms\n• Całkowity czas cyklu: ${totalAnalysisMs.toFixed(2)} ms`}
          >
            <Timer size={11} color="#94a3b8" />
            <span style={{ color: '#93c5fd', fontWeight: 600 }}>
              {totalPoints >= 1000
                ? `${(totalPoints / 1000).toFixed(1)}k pkt`
                : `${totalPoints} pkt`}
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: '#34d399', fontWeight: 600 }}>
              §12: {totalShadowingMs < 0.1 && totalShadowingMs > 0 ? '<0.1' : totalShadowingMs.toFixed(1)}ms
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: '#fbbf24', fontWeight: 600 }}>
              §56: {totalSunlightMs < 0.1 && totalSunlightMs > 0 ? '<0.1' : totalSunlightMs.toFixed(1)}ms
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
              Cykl: {totalAnalysisMs < 0.1 && totalAnalysisMs > 0 ? '<0.1' : totalAnalysisMs.toFixed(1)}ms
            </span>
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

          {/* Warstadt Website Link */}
          <a
            href="https://www.warstadt.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: '10.5px',
              fontWeight: 600,
              color: '#94a3b8',
              textDecoration: 'none',
              padding: '2px 4px',
              borderRadius: '4px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            title="www.warstadt.com"
          >
            <span>www.warstadt.com</span>
          </a>
        </div>

        {/* The CAD Canvas Element */}
        <div className="cad-canvas-wrapper" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
          <CadCanvas
            buildings={buildings}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={handleSelectBuilding}
            onBuildingMove={handleBuildingMove}
            analysisResults={analysisResults}
            pinnedPoints={pinnedPoints}
            pinnedPointResults={pinnedPointResults}
            activePinnedPointId={activePinnedPointId}
            activePointMode={activePointMode}
            onSelectPinnedPoint={(id) => setActivePinnedPointId(id)}
            onAddPinnedPoint={handleAddPinnedPoint}
            onDeletePinnedPoint={handleDeletePinnedPoint}
            onUpdatePinnedPoint={handleUpdatePinnedPoint}
            selectedPointResult={activePointResult}
            onSelectPointResult={(res) => {
              if (!res) {
                setActivePinnedPointId(null);
              } else {
                setActivePinnedPointId(res.id);
              }
            }}
            showNormals={showNormals}
            showShadowingLines={showShadowingLines}
            showSunlightLines={showSunlightLines}
            showShadowRange={showShadowRange}
            shadowAnalysis={shadowAnalysis}
            sunlightMethod={sunlightMethod}

            latitude={settings.latitude}
            longitude={settings.longitude}
            equinoxDate={settings.equinoxDate}
            fitTrigger={fitKey}
            onInteractionChange={setIsInteracting}
            isLinkingMode={isLinkingMode}
            linkingSourceId={linkingSourceId}
            drawingMode={drawingMode}
            onFinishDrawing={handleFinishDrawing}
            onCancelDrawing={handleCancelDrawing}
            onDrawingVerticesCountChange={setDrawingVerticesCount}
            onUpdateBuildingVertices={handleUpdateBuildingVertices}
            onBuildingRotate={handleBuildingRotate}
            onBooleanUnion={handleBooleanUnion}
            facadePointMode={facadePointMode}

            onFacadePointMove={handleFacadePointMove}
            isEditMode={isEditMode}
            onBuildingEdgeMove={handleBuildingEdgeMove}
            dimensions={dimensions}
            isDimensionMode={isDimensionToolActive}
            dimensionType={dimensionType}
            dimensionPendingRef={dimensionPendingRef}
            onDimensionClickEdge={handleDimensionClickEdge}
            onDeleteDimension={handleDeleteDimension}
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
            onToggleOsnap={handleToggleOsnap}
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
          onDeletePointId={handleDeletePinnedPoint}
          activeMode={activePointMode}
          sunlightMethod={sunlightMethod}
          onModeChange={setActivePointMode}
          onClose={() => {
            setPinnedPoints([]);
            setActivePinnedPointId(null);
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
