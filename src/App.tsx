import React, { useState, useMemo, useEffect, useRef } from 'react';
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
} from './utils/math2d';

import {
  Sun,
  Shield,
  Layers,
  Upload,
  Download,
  RotateCw,
  RotateCcw,
  Sparkles,
  Building,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FolderKanban,
  Box,
  Maximize2,
  Sliders,
  Activity,
  MapPin,
  Timer,
  Zap,
  Link,
  Link2,
  Unlink,
  Wrench,
  Copy,
  Trash2,
  Square,
  PenTool,
  Edit3,
  Ruler,
  Lock,
  Unlock,
  Ghost,
  Lightbulb,
  LightbulbOff,
  X,
} from 'lucide-react';

export type AccuracyStage = 'live' | 'stage1' | 'stage2' | 'final';

const SCENE_STORAGE_KEY = 'usi-light.scene.v1';

type SavedScene = {
  version: 1;
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  selectedPointKey: { buildingId: string; segmentId: string; offsetRatio: number } | null;
  settings: ProjectSettings;
  layerSettings: Record<string, CadLayerSettings>;
  selectedLayerName: string | null;
  isLinkingMode: boolean;
  linkingSourceId: string | null;
  drawingMode: 'none' | 'rectangle' | 'polyline';
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
  const [openSidebarGroup, setOpenSidebarGroup] = useState<'project' | 'modeling' | null>('project');
  const isProjectGroupOpen = openSidebarGroup === 'project';
  const isModelingGroupOpen = openSidebarGroup === 'modeling';
  const toggleSidebarGroup = (group: 'project' | 'modeling') => {
    setOpenSidebarGroup((prev) => (prev === group ? null : group));
  };

  // CAD Layers Settings & Selection State
  const [layerSettings, setLayerSettings] = useState<Record<string, CadLayerSettings>>({});
  const [selectedLayerName, setSelectedLayerName] = useState<string | null>(null);

  // Grouping / Linking mode state
  const [isLinkingMode, setIsLinkingMode] = useState<boolean>(false);
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);

  // Drawing Tools State (Rectangle & Polyline)
  const [drawingMode, setDrawingMode] = useState<'none' | 'rectangle' | 'polyline'>('none');
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

  // Metoda obliczania nasłonecznienia § 56
  const [sunlightMethod, setSunlightMethod] = useState<'raycasting' | 'segments'>('raycasting');

  // Progressive Accuracy Refinement Effect
  // When interacting/moving: use fast low-resolution mesh (1.5m).
  // When still: automatically refine in stages stopping at target 0.25m.
  useEffect(() => {
    if (isInteracting) {
      setAccuracyStage('live');
      return;
    }

    // Schedule progressive refinement when idle
    const t1 = setTimeout(() => {
      setAccuracyStage((prev) => (prev === 'live' ? 'stage1' : prev));
    }, 100);

    const t2 = setTimeout(() => {
      setAccuracyStage((prev) => (prev === 'live' || prev === 'stage1' ? 'stage2' : prev));
    }, 250);

    const t3 = setTimeout(() => {
      setAccuracyStage('final'); // Stop at target 0.25m
    }, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [buildings, isInteracting]);

  // Current calculation accuracy parameters based on active refinement stage
  const currentAccuracyOptions = useMemo<AnalysisAccuracyOptions>(() => {
    switch (accuracyStage) {
      case 'live':
        return { samplingInterval: 2.0, angleStepDeg: 2.0, sunlightStepMinutes: 15 };
      case 'stage1':
        return { samplingInterval: 1.0, angleStepDeg: 1.0, sunlightStepMinutes: 10 };
      case 'stage2':
        return { samplingInterval: 0.5, angleStepDeg: 0.5, sunlightStepMinutes: 5 };
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

  // Run Calculation with Variable Precision using effective buildings
  const analysisOutput = useMemo(() => {
    return runFullAnalysis(effectiveBuildings, settings, currentAccuracyOptions, sunlightMethod);
  }, [effectiveBuildings, settings, currentAccuracyOptions, sunlightMethod]);

  const analysisResults = analysisOutput.results;
  const avgShadowingMs = analysisOutput.avgShadowingMs;
  const avgSunlightMs = analysisOutput.avgSunlightMs;
  const avgSunlightSegMs = analysisOutput.avgSunlightSegMs;
  const totalAnalysisMs = analysisOutput.totalAnalysisMs;

  const [selectedPointKey, setSelectedPointKey] = useState<{
    buildingId: string;
    segmentId: string;
    offsetRatio: number;
  } | null>(null);

  // Directly evaluate selected point at its EXACT pinned offsetRatio on the segment
  // (so its position on the wall is 100% fixed and never moves when background mesh precision changes)
  const selectedPointResult = useMemo<AnalysisPointResult | null>(() => {
    if (!selectedPointKey) return null;
    const bldg = buildings.find((b) => b.id === selectedPointKey.buildingId);
    if (!bldg) return null;
    const lyr = bldg.layer || 'Domyślna (0)';
    if (layerSettings[lyr]?.isVisible === false) return null;
    const seg = bldg.segments.find((s) => s.id === selectedPointKey.segmentId);
    if (!seg) return null;

    const r = selectedPointKey.offsetRatio;
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
            currentAccuracyOptions.sunlightStepMinutes,
            undefined,
            prefilteredObstacles
          )
        : analyzeSunlightAtPoint(
            exactPoint, seg, r, effectiveBuildings, bldg.id, settings,
            currentAccuracyOptions.sunlightStepMinutes,
            undefined,
            prefilteredObstacles
          );

    return {
      id: `pinned-${bldg.id}-${seg.id}-${r.toFixed(4)}`,
      point: exactPoint,
      normal: seg.normal,
      buildingId: bldg.id,
      segmentId: seg.id,
      shadowing: shadowRes,
      sunlight: sunRes,
    };
  }, [selectedPointKey, buildings, layerSettings, effectiveBuildings, settings, currentAccuracyOptions, sunlightMethod]);


  // Selected building object (respects layer visibility)
  const selectedBuilding = useMemo(() => {
    if (!selectedBuildingId) return null;
    const b = buildings.find((item) => item.id === selectedBuildingId);
    if (!b) return null;
    const lyr = b.layer || 'Domyślna (0)';
    if (layerSettings[lyr]?.isVisible === false) return null;
    return b;
  }, [buildings, selectedBuildingId, layerSettings]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCENE_STORAGE_KEY);
      if (!raw) return;
      const scene = JSON.parse(raw) as SavedScene;
      if (!scene || scene.version !== 1) return;

      setBuildings(scene.buildings ?? createSampleBuildings());
      setSelectedBuildingId(scene.selectedBuildingId ?? null);
      setSelectedPointKey(scene.selectedPointKey ?? null);
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
      selectedPointKey,
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
    selectedPointKey,
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
    setSelectedPointKey(null);
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
      setSelectedPointKey(null);
    }
  };

  // Finish drawing new building from canvas (Rectangle / Polyline)
  const handleFinishDrawing = (vertices: Point2D[], shapeType: 'rectangle' | 'polyline') => {
    if (vertices.length < 3) return;
    const defaultHeight = 15.0;
    const count = buildings.length + 1;
    const namePrefix = shapeType === 'rectangle' ? `Budynek (Prostokąt ${count})` : `Budynek (Polilinia ${count})`;
    const newBldg = createBuildingFromVertices(vertices, namePrefix, defaultHeight, false);

    setBuildings((prev) => [...prev, newBldg]);
    setSelectedBuildingId(newBldg.id);
    setSelectedPointKey(null);
    setDrawingMode('none');
    setDrawingVerticesCount(0);
  };

  const handleFacadePointMove = (buildingId: string, segmentId: string, offsetRatio: number) => {
    setSelectedPointKey({ buildingId, segmentId, offsetRatio });
  };

  // Cancel active drawing mode
  const handleCancelDrawing = () => {
    setDrawingMode('none');
    setDrawingVerticesCount(0);
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
    const map = new Map<string, number>();
    buildings.forEach((b) => {
      const lyr = b.layer || 'Domyślna (0)';
      map.set(lyr, (map.get(lyr) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
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
            setSelectedPointKey(null);
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
        if (
          fields.defaultHeight !== undefined ||
          fields.hWindowBottom !== undefined ||
          fields.isCityCentre !== undefined
        ) {
          updated.segments = updated.segments.map((s) => ({
            ...s,
            hTop: fields.defaultHeight ?? s.hTop,
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
          setSelectedPointKey(null);
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
          setSelectedPointKey(null);
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
    setSelectedPointKey(scene.selectedPointKey ?? null);
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
      selectedPointKey,
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

        // Poziom 2: Gdy żadne narzędzie nie jest aktywne -> odznaczenie obiektów i punktów
        setSelectedBuildingId(null);
        setSelectedPointKey(null);
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
      {/* Collapsible Left Sidebar */}
      <aside className={`app-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #f59e0b, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#fff' }}>USI Light 2.5D</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Analiza § 12 & § 56 WT</div>
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
          {/* GRUPA 1: PROJEKT, RZUT I WARSTWY                                          */}
          {/* (Lokalizacja, Jednostki DXF, Wgraj plik DXF & Załaduj scenę, Warstwy)     */}
          {/* ========================================================================= */}
          <div className="sidebar-group">
            <button
              type="button"
              className="sidebar-group-header"
              onClick={() => toggleSidebarGroup('project')}
              title="Zwiń / rozwiń grupę: Projekt, Rzut i Warstwy"
            >
              <div className="sidebar-group-title">
                <FolderKanban size={15} color="#f59e0b" />
                <span>Projekt, Rzut i Warstwy</span>
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
                      setSelectedPointKey(null);
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

                {/* 1.4 Warstwy analityczne */}
                <div className="ui-card">
                  <div className="ui-title">
                    <span>Warstwy analityczne</span>
                    <Layers size={14} color="#818cf8" />
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
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />

          {/* ========================================================================= */}
          {/* GRUPA 2: OBIEKTY I NARZĘDZIA                                              */}
          {/* (Edycja Obiektu 2.5D, Narzędzia)                                          */}
          {/* ========================================================================= */}
          <div className="sidebar-group">
            <button
              type="button"
              className="sidebar-group-header"
              onClick={() => toggleSidebarGroup('modeling')}
              title="Zwiń / rozwiń grupę: Obiekty i Narzędzia"
            >
              <div className="sidebar-group-title">
                <Box size={15} color="#818cf8" />
                <span>Obiekty i Narzędzia</span>
              </div>
              {isModelingGroupOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
            </button>

            {isModelingGroupOpen && (
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
                              <span
                                style={{
                                  fontSize: '9.5px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                  color: '#94a3b8',
                                }}
                              >
                                {lyr.count} {lyr.count === 1 ? 'obiekt' : 'obiekty'}
                              </span>
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
                          <div style={{ fontSize: '10.5px', color: '#818cf8', fontWeight: 600 }}>
                            Właściwości warstwy: <span style={{ color: '#fff' }}>{selectedLayerName}</span>
                          </div>

                          {/* Height H for all buildings on layer */}
                          <div>
                            <label style={{ display: 'block', fontSize: '10.5px', color: '#94a3b8', marginBottom: '3px' }}>
                              Wysokość H dla całej warstwy (m)
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
                                width: '100%',
                                backgroundColor: 'var(--bg-input)',
                                border: '1px solid var(--border-light)',
                                borderRadius: '6px',
                                padding: '5px 8px',
                                color: '#38bdf8',
                                fontWeight: 'bold',
                                fontFamily: 'monospace',
                                fontSize: '12px',
                              }}
                            />
                          </div>

                          {/* 3 Batch Action Buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleUpdateLayerBuildings(selectedLayerName, { isIncluded: !allIncluded })}
                              className={`btn-tile ${allIncluded ? 'active-emerald' : someIncluded ? 'active-amber' : 'inactive'}`}
                              style={{ padding: '6px 8px' }}
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
                              style={{ padding: '6px 8px' }}
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
                              style={{ padding: '6px 8px' }}
                            >
                              <span>Zabudowa śródmiejska (§ 12 ust. 5)</span>
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
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Nazwa bryły</label>
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

                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Wysokość przesłaniania H (m)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={selectedBuilding.defaultHeight}
                          onChange={(e) => updateSelectedBuilding({ defaultHeight: parseFloat(e.target.value) || 0 })}
                          style={{
                            width: '100%',
                            backgroundColor: 'var(--bg-input)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '8px',
                            padding: '7px 10px',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        />
                      </div>

                      {/* Real-world metric dimensions display */}
                      {(() => {
                        const xs = selectedBuilding.vertices.map((v) => v.x);
                        const ys = selectedBuilding.vertices.map((v) => v.y);
                        const w = Math.max(...xs) - Math.min(...xs);
                        const h = Math.max(...ys) - Math.min(...ys);
                        const perimeter = selectedBuilding.segments.reduce((sum, s) => sum + s.length, 0);
                        const isHuge = w > 200 || h > 200;

                        return (
                          <div
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              backgroundColor: isHuge ? 'rgba(244, 63, 94, 0.15)' : 'rgba(15, 23, 42, 0.7)',
                              border: `1px solid ${isHuge ? 'rgba(244, 63, 94, 0.35)' : 'var(--border-light)'}`,
                              fontSize: '11px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '3px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#94a3b8' }}>Rzut (Szer × Głęb):</span>
                              <b style={{ color: isHuge ? '#fca5a5' : '#38bdf8', fontFamily: 'monospace' }}>
                                {w.toFixed(2)} m × {h.toFixed(2)} m
                              </b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#94a3b8' }}>Obwód fasad:</span>
                              <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{perimeter.toFixed(2)} m</span>
                            </div>
                            {isHuge && (
                              <div style={{ fontSize: '10px', color: '#fda4af', marginTop: '2px' }}>
                                ⚠️ Bardzo duży rzut ({w.toFixed(0)}m)! Jeśli budynek miał mieć np. 10m, zmień jednostkę DXF na <b>cm</b> lub <b>mm</b>.
                              </div>
                            )}
                          </div>
                        );
                      })()}

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
                          <span>Zabudowa śródmiejska (§ 12 ust. 5)</span>
                          <span style={{ fontSize: '10px', fontWeight: 700 }}>{selectedBuilding.isCityCentre ? 'TAK' : 'NIE'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="ui-card" style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                    Kliknij dowolny budynek na rzucie CAD, aby edytować jego parametry.
                  </div>
                )}

                {/* 2.2 Narzędzia */}
                <div className="ui-card">
                  <div className="ui-title">
                    <span>Narzędzia</span>
                    <Wrench size={14} color="#818cf8" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* 1. Object Creation & Measurement Tools */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                        Tworzenie i pomiary:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
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
                          style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
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
                          style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
                          title="Rysuj nową zamkniętą polilinię wieloboczną"
                        >
                          <PenTool size={13} />
                          <span style={{ fontWeight: 600 }}>Polilinia</span>
                        </button>

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
                          style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
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
                          style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
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

                      {/* Active Dimensions List on Canvas */}
                      {dimensions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px', paddingTop: '6px', borderTop: '1px dashed var(--border-light)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#94a3b8', fontWeight: 600 }}>
                            <span>Wymiary na rzucie ({dimensions.length}):</span>
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
                            {dimensions.map((dim, idx) => {
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
                    </div>

                    {/* 2. Operations on Selected Building */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px', borderTop: '1px solid var(--border-light)' }}>
                      {selectedBuilding ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {/* Action buttons: Edytuj, Duplikuj, Usuń */}
                          <button
                            type="button"
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`btn-tile ${isEditMode ? 'active-amber' : 'inactive'}`}
                            style={{ justifyContent: 'center', gap: '6px', padding: '9px 12px' }}
                            title="Włącz tryb równoległego przesuwania krawędzi obiektu"
                          >
                            <Edit3 size={14} />
                            <span style={{ fontWeight: 600 }}>{isEditMode ? 'Zakończ edycję krawędzi' : 'Edytuj krawędzie (Offset)'}</span>
                          </button>

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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '10px',
                background: 'var(--accent-indigo)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              <ChevronRight size={14} />
              <span>Pokaż panel</span>
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
            title="Wróć do domyślnej orientacji układu"
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
            <RotateCcw size={13} />
            <span>Orientacja domyślna</span>
          </button>
        </div>

        {/* Legend & Stats Overlay at Bottom-Left */}
        <div className="cad-legend-bottom" style={{ gap: '12px', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '11px' }}>LEGENDA:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', backgroundColor: '#10b981', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px' }}>§ 12 Zgodne</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', backgroundColor: '#f43f5e', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px' }}>§ 12 Niezgodne</span>
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

          {/* Performance per point benchmark badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 7px',
              borderRadius: '5px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid #334155',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}
            title={`Czas pełnego przeliczenia aktywnych warstw analitycznych:\n• Łącznie: ${totalAnalysisMs.toFixed(3)} ms\n\nŚredni czas kalkulacji pojedynczego punktu fasady:\n• § 12 (Przesłanianie): ${avgShadowingMs.toFixed(3)} ms\n• § 56 (Nasłonecznienie): ${avgSunlightMs.toFixed(3)} ms`}
          >
            <Timer size={11} color="#94a3b8" />
            <span style={{ color: '#34d399', fontWeight: 600 }}>
              §12: {avgShadowingMs < 0.01 ? '<0.01' : avgShadowingMs.toFixed(2)}ms
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: '#fbbf24', fontWeight: 600 }}>
              §56: {avgSunlightMs < 0.01 ? '<0.01' : avgSunlightMs.toFixed(2)}ms
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
              Razem: {totalAnalysisMs < 0.01 ? '<0.01' : totalAnalysisMs.toFixed(2)}ms
            </span>
          </div>
        </div>

        {/* The CAD Canvas Element */}
        <div className="cad-canvas-wrapper" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
          <CadCanvas
            buildings={buildings}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={handleSelectBuilding}
            onBuildingMove={handleBuildingMove}
            analysisResults={analysisResults}
            selectedPointResult={selectedPointResult}
            activePointMode={activePointMode}
            onSelectPointResult={(res) => {
              if (!res) {
                setSelectedPointKey(null);
              } else {
                setSelectedPointKey({
                  buildingId: res.buildingId,
                  segmentId: res.segmentId,
                  offsetRatio: res.shadowing.offsetRatio,
                });
              }
            }}
            showNormals={showNormals}
            showShadowingLines={showShadowingLines}
            showSunlightLines={showSunlightLines}
            showShadowRange={showShadowRange}
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
          />
        </div>

        {/* Floating Point Inspector Modal */}
        <PointInspectorModal
          pointResult={selectedPointResult}
          activeMode={activePointMode}
          sunlightMethod={sunlightMethod}
          onModeChange={setActivePointMode}
          onClose={() => setSelectedPointKey(null)}
        />

        {/* Rotatable Compass Rose (Bottom-Right) */}
        <CompassRose
          rotationDeg={viewRotationDeg}
          onResetRotation={() => {
            setViewRotationDeg(0);
          }}
        />
      </main>
    </div>
  );
};

export default App;
