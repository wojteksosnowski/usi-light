import { create } from 'zustand';
import { temporal } from 'zundo';
import { BuildingLoop, CadLayerSettings, Point2D, Modifier, DimensionReference, DEFAULT_SWEEP_WIDTH } from '../types/geometry';
import { createBuildingFromVertices, DxfUnitOption, DxfUnitInfo } from '../utils/dxfParser';
import { computeLineEquation, rebuildBuildingSegments } from '../utils/segmentStatistics';
import { translateLineBuffer, rotateLineBuffer } from '../utils/lineBufferEngine';
import { offsetPolygonEdge, offsetOpenPolylineEdge, updateBuildingWithNewVertices, booleanUnionBuildings, generateSweepPolygon, getPolygonCentroid, rotatePointAroundPivot } from '@/utils/math2d';
import { applyBuildingModifiers } from '../engine/modifiers/modifierPipeline';
import { useUiStore } from './useUiStore';

export interface SavedSceneData {
  version: 1;
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  settings?: any;
  layerSettings?: Record<string, CadLayerSettings>;
  selectedLayerName?: string | null;
  isLinkingMode?: boolean;
  linkingSourceId?: string | null;
  drawingMode?: any;
  dimensions?: any[];
  isEditMode?: boolean;
  isDimensionToolActive?: boolean;
  dimensionType?: any;
  showNormals?: boolean;
  showShadowingLines?: boolean;
  showSunlightLines?: boolean;
  showShadowRange?: boolean;
  sunlightMethod?: 'raycasting' | 'segments';
  activePointMode?: 'shadowing' | 'sunlight';
  selectedCity?: string;
  mapsInput?: string;
  mapsParseError?: boolean;
  viewRotationDeg?: number;
  savedViewRotationDeg?: number;
  dxfUnit?: DxfUnitOption;
  dxfImportInfo?: DxfUnitInfo | null;
  pinnedPoints?: any[];
  activePinnedPointId?: string | null;
  selectedPointKey?: any;
}

interface SceneState {
  buildings: BuildingLoop[];
  selectedBuildingId: string | null;
  selectedBuildingIds: string[]; // multi-select
  layerSettings: Record<string, CadLayerSettings>;
  selectedLayerName: string | null;
  isLinkingMode: boolean;
  linkingSourceId: string | null;
  dxfUnit: DxfUnitOption;
  dxfImportInfo: DxfUnitInfo | null;
  lastDxfText: string | null;

  openGroupId: string | null; // ID grupy logicznej, do której wnętrza użytkownik wszedł (izolacja grupy)

  // Actions
  setBuildings: (buildings: BuildingLoop[] | ((prev: BuildingLoop[]) => BuildingLoop[])) => void;
  setSelectedBuildingId: (id: string | null) => void;
  setSelectedBuildingIds: (ids: string[]) => void;
  setOpenGroupId: (groupId: string | null) => void;
  selectBuilding: (id: string | null, isMultiSelect?: boolean) => void;
  addBuilding: (building: BuildingLoop) => void;
  deleteBuilding: (id: string) => void;
  deleteBuildings: (ids: string[]) => void;
  duplicateBuilding: (sourceId: string) => void;
  updateBuilding: (id: string, patch: Partial<BuildingLoop>) => void;
  updateSelectedBuilding: (patch: Partial<BuildingLoop>) => void;
  adjustSelectedBuildingHeight: (deltaMeters: number) => void;
  updateBuildingVertices: (buildingId: string, newVertices: Point2D[]) => void;
  updateBuildingSweepPath: (buildingId: string, newSweepPath: Point2D[], width?: number, alignment?: 'center' | 'left' | 'right') => void;
  moveBuilding: (id: string, dx: number, dy: number) => void;
  moveBuildings: (ids: string[], dx: number, dy: number) => void;
  moveBuildingEdge: (buildingId: string, edgeIndex: number, dx: number, dy: number) => void;
  rotateBuilding: (id: string, pivot: Point2D, deltaAngleRad: number) => void;
  alignBuildingEdgeToEdge: (targetRef: DimensionReference, referenceRef: DimensionReference) => void;
  booleanUnion: (bldgIdA: string, bldgIdB: string) => { success: boolean; error?: string };

  // Modifiers
  addBuildingModifier: (buildingId: string, modifier: Modifier) => void;
  updateBuildingModifier: (buildingId: string, modifierId: string, patch: Partial<Modifier>) => void;
  removeBuildingModifier: (buildingId: string, modifierId: string) => void;
  reorderBuildingModifiers: (buildingId: string, fromIndex: number, toIndex: number) => void;
  toggleBuildingModifier: (buildingId: string, modifierId: string) => void;

  // Linking / Groups
  setIsLinkingMode: (isLinking: boolean) => void;
  setLinkingSourceId: (id: string | null) => void;
  performLinkBuildings: (sourceId: string, targetId: string) => void;
  performUnlinkBuilding: (id: string) => void;
  performUnlinkAllInGroup: (groupId: string) => void;
  updateGroup: (groupId: string, patch: Partial<BuildingLoop>) => void;
  rotateGroup: (groupId: string, targetDeg: number) => void;

  // Layers
  setLayerSettings: (settings: Record<string, CadLayerSettings> | ((prev: Record<string, CadLayerSettings>) => Record<string, CadLayerSettings>)) => void;
  setSelectedLayerName: (name: string | null) => void;
  toggleLayerVisibility: (layerName: string) => void;
  toggleLayerLock: (layerName: string) => void;
  toggleLayerGhost: (layerName: string) => void;
  toggleLayerSnapExclusion: (layerName: string) => void;
  updateLayerBuildings: (layerName: string, fields: Partial<BuildingLoop>) => void;
  selectLayerBuildings: (layerName: string) => void;

  // DXF
  setDxfUnit: (unit: DxfUnitOption) => void;
  setDxfImportInfo: (info: DxfUnitInfo | null) => void;
  setLastDxfText: (text: string | null) => void;

  // Bulk Load / Reset
  loadSceneData: (scene: Partial<SavedSceneData>) => void;
  resetScene: () => void;

  // Interaction Transactions (Undo Batching)
  startInteractionBatch: () => void;
  commitInteractionBatch: () => void;
  cancelInteractionBatch: () => void;
}

let interactionBatchSnapshot: {
  buildings: BuildingLoop[];
  layerSettings: Record<string, CadLayerSettings>;
} | null = null;

/** Derives storeysCount from a total height, given per-floor heights. */
function deriveStoreysCount(height: number, firstFloorHeight: number, typicalFloorHeight: number): number {
  return height > firstFloorHeight
    ? 1 + Math.max(1, Math.round((height - firstFloorHeight) / typicalFloorHeight))
    : 1;
}

/** Translates a building's vertices, sweep path, story/zone polygons, and facade segments by (dx, dy). */
export function translateBuildingGeometry(bldg: BuildingLoop, dx: number, dy: number): BuildingLoop {
  const translate = (p: Point2D) => ({ x: p.x + dx, y: p.y + dy });

  const newVertices = bldg.vertices.map(translate);
  const newHoles = bldg.holes ? bldg.holes.map((hole) => hole.map(translate)) : undefined;
  const newSweepPath = bldg.sweepPath ? bldg.sweepPath.map(translate) : undefined;

  const newStoryPolygons = bldg.storyPolygons
    ? bldg.storyPolygons.map((sf) => ({
        ...sf,
        polygon: sf.polygon.map(translate),
        holes: sf.holes?.map((hole) => hole.map(translate)),
      }))
    : undefined;

  const newZonePolygons = bldg.zonePolygons
    ? bldg.zonePolygons.map((zf) => ({
        ...zf,
        polygon: zf.polygon.map(translate),
        holes: zf.holes?.map((hole) => hole.map(translate)),
      }))
    : undefined;

  const newSegments = bldg.segments.map((s) => {
    const p1 = translate(s.p1);
    const p2 = translate(s.p2);
    return { ...s, p1, p2, lineEquation: computeLineEquation(p1, p2, s.normal) };
  });

  const currentTransform = bldg.transform || { tx: 0, ty: 0, rotationDeg: 0 };
  const newCachedLines = bldg.cachedLineEquations
    ? translateLineBuffer(bldg.cachedLineEquations, dx, dy)
    : undefined;

  return {
    ...bldg,
    vertices: newVertices,
    holes: newHoles,
    sweepPath: newSweepPath,
    storyPolygons: newStoryPolygons,
    zonePolygons: newZonePolygons,
    segments: newSegments,
    cachedLineEquations: newCachedLines,
    transform: {
      ...currentTransform,
      tx: (currentTransform.tx || 0) + dx,
      ty: (currentTransform.ty || 0) + dy,
    },
  };
}

/** Rotates a building's vertices, sweep path, story/zone polygons, and facade segments around a pivot. */
function rotateBuildingGeometry(bldg: BuildingLoop, pivot: Point2D, deltaAngleRad: number): BuildingLoop {
  const deltaDeg = (deltaAngleRad * 180) / Math.PI;
  const rotate = (v: Point2D) => rotatePointAroundPivot(v, pivot, deltaAngleRad);
  const rotateNormal = (n: Point2D) => rotatePointAroundPivot(n, { x: 0, y: 0 }, deltaAngleRad);

  const newVertices = bldg.vertices.map(rotate);
  const newHoles = bldg.holes ? bldg.holes.map((hole) => hole.map(rotate)) : undefined;
  const newSweepPath = bldg.sweepPath ? bldg.sweepPath.map(rotate) : undefined;

  const newStoryPolygons = bldg.storyPolygons
    ? bldg.storyPolygons.map((sf) => ({
        ...sf,
        polygon: sf.polygon.map(rotate),
        holes: sf.holes?.map((hole) => hole.map(rotate)),
      }))
    : undefined;

  const newZonePolygons = bldg.zonePolygons
    ? bldg.zonePolygons.map((zf) => ({
        ...zf,
        polygon: zf.polygon.map(rotate),
        holes: zf.holes?.map((hole) => hole.map(rotate)),
      }))
    : undefined;

  const newSegments = bldg.segments.map((s) => {
    const p1 = rotate(s.p1);
    const p2 = rotate(s.p2);
    const normal = rotateNormal(s.normal);
    return {
      ...s,
      p1,
      p2,
      normal,
      angleRad: Math.atan2(p2.y - p1.y, p2.x - p1.x),
      lineEquation: computeLineEquation(p1, p2, normal),
    };
  });

  const updatedTransform = {
    ...(bldg.transform || { tx: 0, ty: 0, rotationDeg: 0 }),
    rotationDeg: Number(((((bldg.transform?.rotationDeg || 0) + deltaDeg) % 360 + 360) % 360).toFixed(2)),
  };

  const newCachedLines = bldg.cachedLineEquations
    ? rotateLineBuffer(bldg.cachedLineEquations, pivot, deltaAngleRad)
    : undefined;

  return {
    ...bldg,
    vertices: newVertices,
    holes: newHoles,
    sweepPath: newSweepPath,
    transform: updatedTransform,
    storyPolygons: newStoryPolygons,
    zonePolygons: newZonePolygons,
    segments: newSegments,
    cachedLineEquations: newCachedLines,
  };
}

export const useSceneStore = create<SceneState>()(
  temporal(
    (set, get) => ({
  buildings: [],
  selectedBuildingId: null,
  selectedBuildingIds: [],
  layerSettings: {},
  selectedLayerName: null,
  isLinkingMode: false,
  linkingSourceId: null,
  dxfUnit: 'auto',
  dxfImportInfo: null,
  lastDxfText: null,
  openGroupId: null,

  setBuildings: (updater) => {
    set((state) => ({
      buildings: typeof updater === 'function' ? updater(state.buildings) : updater,
    }));
  },

  setOpenGroupId: (groupId) => {
    set({ openGroupId: groupId });
  },

  setSelectedBuildingId: (id) => {
    set((state) => {
      const bldg = id ? state.buildings.find((b) => b.id === id) : null;
      // Jeśli obiekt należy do grupy, a nie jesteśmy wewnątrz tej grupy, zaznaczamy wszystkie obiekty grupy
      if (bldg?.groupId && state.openGroupId !== bldg.groupId) {
        const groupBldgs = state.buildings.filter((b) => b.groupId === bldg.groupId);
        const groupIds = groupBldgs.map((b) => b.id);
        return {
          selectedBuildingId: id,
          selectedBuildingIds: groupIds,
        };
      }
      return {
        selectedBuildingId: id,
        selectedBuildingIds: id ? [id] : [],
      };
    });
  },

  setSelectedBuildingIds: (ids) => {
    set({
      selectedBuildingIds: ids,
      selectedBuildingId: ids.length > 0 ? ids[ids.length - 1] : null,
    });
  },

  selectBuilding: (id, isMultiSelect = false) => {
    const { isLinkingMode, linkingSourceId, performLinkBuildings, buildings, openGroupId } = get();
    if (isLinkingMode && linkingSourceId && id && id !== linkingSourceId) {
      performLinkBuildings(linkingSourceId, id);
      return;
    }

    if (!id) {
      set({ selectedBuildingId: null, selectedBuildingIds: [], openGroupId: null });
      return;
    }

    // Automatycznie otwieramy sidebar i przełączamy na 'Warstwy i obiekty' przy wyborze obiektu
    const uiState = useUiStore.getState();
    if (!uiState.isSidebarOpen) {
      uiState.setSidebarOpen(true);
    }
    if (uiState.openSidebarGroup !== 'layers') {
      uiState.setOpenSidebarGroup('layers');
    }

    const clickedBldg = buildings.find((b) => b.id === id);
    const clickedGroupId = clickedBldg?.groupId;

    // Jeśli kliknięto obiekt poza aktualnie otwartą grupą, zamykamy otwartą grupę
    const nextOpenGroupId = clickedGroupId && openGroupId === clickedGroupId ? openGroupId : null;

    if (isMultiSelect) {
      set((state) => {
        const exists = state.selectedBuildingIds.includes(id);
        const nextIds = exists
          ? state.selectedBuildingIds.filter((item) => item !== id)
          : [...state.selectedBuildingIds, id];
        return {
          selectedBuildingIds: nextIds,
          selectedBuildingId: nextIds.length > 0 ? nextIds[nextIds.length - 1] : null,
          openGroupId: nextOpenGroupId,
        };
      });
    } else {
      // Jeśli obiekt należy do grupy logicznej, a nie jesteśmy wewnątrz grupy -> zaznaczamy wszystkie obiekty grupy
      if (clickedGroupId && nextOpenGroupId !== clickedGroupId) {
        const groupBldgIds = buildings
          .filter((b) => b.groupId === clickedGroupId)
          .map((b) => b.id);
        set({
          selectedBuildingId: id,
          selectedBuildingIds: groupBldgIds,
          openGroupId: null,
        });
      } else {
        set({
          selectedBuildingId: id,
          selectedBuildingIds: [id],
          openGroupId: nextOpenGroupId,
        });
      }
    }
  },

  addBuilding: (building) => {
    set((state) => ({
      buildings: [...state.buildings, building],
      selectedBuildingId: building.id,
      selectedBuildingIds: [building.id],
    }));
  },

  deleteBuilding: (id) => {
    get().deleteBuildings([id]);
  },

  deleteBuildings: (ids) => {
    if (!ids || ids.length === 0) return;
    const idsSet = new Set(ids);

    set((state) => {
      const targets = state.buildings.filter((b) => idsSet.has(b.id));
      const remaining = state.buildings.filter((b) => !idsSet.has(b.id));

      let nextBuildings = remaining;
      const affectedGroupIds = new Set(targets.map((t) => t.groupId).filter(Boolean));
      affectedGroupIds.forEach((gId) => {
        const remainingInGroup = remaining.filter((b) => b.groupId === gId);
        if (remainingInGroup.length <= 1) {
          nextBuildings = nextBuildings.map((b) =>
            b.groupId === gId ? { ...b, groupId: undefined } : b
          );
        }
      });

      const nextSelectedIds = state.selectedBuildingIds.filter((id) => !idsSet.has(id));
      const nextSelectedId = state.selectedBuildingId && idsSet.has(state.selectedBuildingId)
        ? (nextSelectedIds[0] ?? null)
        : state.selectedBuildingId;

      return {
        buildings: nextBuildings,
        selectedBuildingIds: nextSelectedIds,
        selectedBuildingId: nextSelectedId,
      };
    });
  },

  duplicateBuilding: (sourceId) => {
    const { buildings } = get();
    const source = buildings.find((b) => b.id === sourceId);
    if (!source) return;

    const offset = 8.0;
    const newId = `bldg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const newName = `${source.name} (Kopia)`;

    const newVertices = source.vertices.map((v) => ({
      x: v.x + offset,
      y: v.y + offset,
    }));

    const newSegments = source.segments.map((s, idx) => ({
      ...s,
      id: `${newId}-seg-${idx + 1}`,
      p1: { x: s.p1.x + offset, y: s.p1.y + offset },
      p2: { x: s.p2.x + offset, y: s.p2.y + offset },
    }));

    const newSweepPath = source.sweepPath
      ? source.sweepPath.map((p) => ({ x: p.x + offset, y: p.y + offset }))
      : undefined;

    const duplicate: BuildingLoop = {
      ...source,
      id: newId,
      name: newName,
      vertices: newVertices,
      segments: newSegments,
      sweepPath: newSweepPath,
      groupId: undefined,
    };

    set((state) => ({
      buildings: [...state.buildings, duplicate],
      selectedBuildingId: newId,
      selectedBuildingIds: [newId],
    }));
  },

  updateBuilding: (id, patch) => {
    set((state) => ({
      buildings: state.buildings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  },

  updateSelectedBuilding: (fields) => {
    const { selectedBuildingIds, selectedBuildingId } = get();
    const targetIds = selectedBuildingIds.length > 0 ? selectedBuildingIds : (selectedBuildingId ? [selectedBuildingId] : []);
    if (targetIds.length === 0) return;

    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (!targetIds.includes(bldg.id)) return bldg;
        let updated = { ...bldg, ...fields };

        // Jeśli zmieniono parametry wstęgi (sweepWidth, sweepAlignment), regenerujemy obrys z sweepPath
        if (
          updated.sweepPath &&
          updated.sweepPath.length >= 2 &&
          (fields.sweepWidth !== undefined || fields.sweepAlignment !== undefined)
        ) {
          const w = updated.sweepWidth ?? DEFAULT_SWEEP_WIDTH;
          const align = updated.sweepAlignment ?? 'center';
          const newVerts = generateSweepPolygon(updated.sweepPath, w, align);
          if (newVerts.length >= 3) {
            updated = rebuildBuildingSegments(updated, newVerts);
          }
        }

        if (fields.category === 'boundary') {
          updated.defaultHeight = 0;
          updated.isTested = false;
        }

        const h1 = updated.firstFloorHeight ?? 3.0;
        const ht = updated.typicalFloorHeight ?? 3.0;

        if (fields.defaultHeight !== undefined && fields.storeysCount === undefined) {
          updated.storeysCount = deriveStoreysCount(fields.defaultHeight, h1, ht);
        } else if (fields.storeysCount !== undefined && fields.defaultHeight === undefined) {
          const n = Math.max(1, fields.storeysCount);
          updated.storeysCount = n;
          updated.defaultHeight = Number((h1 + (n - 1) * ht).toFixed(2));
        }

        if (
          fields.defaultHeight !== undefined ||
          fields.elevation !== undefined ||
          fields.hWindowBottom !== undefined ||
          fields.isCityCentre !== undefined ||
          fields.category !== undefined
        ) {
          const elev = updated.elevation ?? 0.0;
          const hTop = elev + (updated.defaultHeight ?? 15);
          updated.segments = updated.segments.map((s) => ({
            ...s,
            hTop,
            hBase: elev,
            hWindowBottom: fields.hWindowBottom ?? s.hWindowBottom,
            isCityCentre: fields.isCityCentre ?? s.isCityCentre,
          }));
        }

        if (updated.modifiers && updated.modifiers.length > 0) {
          const modRes = applyBuildingModifiers(updated);
          updated.storyPolygons = modRes.storyPolygons;
          updated.zonePolygons = modRes.zonePolygons;
          updated.segments = modRes.segments;
        }

        return updated;
      }),
    }));
  },

  adjustSelectedBuildingHeight: (deltaMeters) => {
    const { selectedBuildingIds, selectedBuildingId } = get();
    const targetIds = selectedBuildingIds.length > 0 ? selectedBuildingIds : (selectedBuildingId ? [selectedBuildingId] : []);
    if (targetIds.length === 0) return;

    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (!targetIds.includes(bldg.id)) return bldg;
        const nextHeight = Math.max(0.5, Number((bldg.defaultHeight + deltaMeters).toFixed(2)));
        const storeysCount = deriveStoreysCount(nextHeight, bldg.firstFloorHeight ?? 3.0, bldg.typicalFloorHeight ?? 3.0);
        const updated = {
          ...bldg,
          defaultHeight: nextHeight,
          storeysCount,
          segments: bldg.segments.map((seg) => ({
            ...seg,
            hTop: nextHeight,
          })),
        };
        if (updated.modifiers && updated.modifiers.length > 0) {
          const modRes = applyBuildingModifiers(updated);
          updated.storyPolygons = modRes.storyPolygons;
          updated.zonePolygons = modRes.zonePolygons;
          updated.segments = modRes.segments;
        }
        return updated;
      }),
    }));
  },

  updateBuildingVertices: (buildingId, newVertices) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        const rebuilt = rebuildBuildingSegments(bldg, newVertices);
        if (rebuilt.modifiers && rebuilt.modifiers.length > 0) {
          const modRes = applyBuildingModifiers(rebuilt);
          rebuilt.storyPolygons = modRes.storyPolygons && modRes.storyPolygons.length > 0 ? modRes.storyPolygons : undefined;
          rebuilt.zonePolygons = modRes.zonePolygons && modRes.zonePolygons.length > 0 ? modRes.zonePolygons : undefined;
          rebuilt.segments = modRes.segments;
        } else {
          rebuilt.storyPolygons = undefined;
          rebuilt.zonePolygons = undefined;
        }
        return rebuilt;
      }),
    }));
  },

  updateBuildingSweepPath: (buildingId, newSweepPath, width, alignment) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        const effectiveWidth = width ?? bldg.sweepWidth ?? DEFAULT_SWEEP_WIDTH;
        const effectiveAlignment = alignment ?? bldg.sweepAlignment ?? 'center';
        const newVertices = generateSweepPolygon(newSweepPath, effectiveWidth, effectiveAlignment);

        const rebuilt = rebuildBuildingSegments(bldg, newVertices);
        rebuilt.sweepPath = newSweepPath.map((p) => ({ ...p }));
        rebuilt.sweepWidth = effectiveWidth;
        rebuilt.sweepAlignment = effectiveAlignment;

        if (rebuilt.modifiers && rebuilt.modifiers.length > 0) {
          const modRes = applyBuildingModifiers(rebuilt);
          rebuilt.storyPolygons = modRes.storyPolygons && modRes.storyPolygons.length > 0 ? modRes.storyPolygons : undefined;
          rebuilt.zonePolygons = modRes.zonePolygons && modRes.zonePolygons.length > 0 ? modRes.zonePolygons : undefined;
          rebuilt.segments = modRes.segments;
        } else {
          rebuilt.storyPolygons = undefined;
          rebuilt.zonePolygons = undefined;
        }
        return rebuilt;
      }),
    }));
  },

  moveBuilding: (id, dx, dy) => {
    set((state) => {
      const targetBldg = state.buildings.find((b) => b.id === id);
      const targetGroupId = targetBldg?.groupId;
      const isGroupOpen = !!targetGroupId && state.openGroupId === targetGroupId;

      return {
        buildings: state.buildings.map((bldg) => {
          const shouldMove = bldg.id === id || (!isGroupOpen && !!targetGroupId && bldg.groupId === targetGroupId);
          if (!shouldMove) return bldg;
          return translateBuildingGeometry(bldg, dx, dy);
        }),
      };
    });
  },

  moveBuildings: (ids, dx, dy) => {
    if (!ids || ids.length === 0) return;
    set((state) => {
      const targetGroupIds = new Set<string>();
      ids.forEach((id) => {
        const b = state.buildings.find((item) => item.id === id);
        // Jeśli dana grupa nie jest otwarta w trybie wnętrza, dołączamy jej obiekty do przesunięcia grupowego
        if (b?.groupId && state.openGroupId !== b.groupId) {
          targetGroupIds.add(b.groupId);
        }
      });

      const idsSet = new Set(ids);

      return {
        buildings: state.buildings.map((bldg) => {
          const shouldMove = idsSet.has(bldg.id) || (!!bldg.groupId && targetGroupIds.has(bldg.groupId));
          if (!shouldMove) return bldg;
          return translateBuildingGeometry(bldg, dx, dy);
        }),
      };
    });
  },

  moveBuildingEdge: (buildingId, edgeIndex, dx, dy) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;

        // Jeśli obiekt to Wstęga (Sweep), przesuwamy odcinek linii generującej (sweepPath)
        // z zachowaniem ścisłej niezmienności kątów sąsiednich odcinków
        if (Array.isArray(bldg.sweepPath) && bldg.sweepPath.length >= 2) {
          if (edgeIndex >= 0 && edgeIndex < bldg.sweepPath.length - 1) {
            const nextSweepPath = offsetOpenPolylineEdge(bldg.sweepPath, edgeIndex, { x: dx, y: dy });

            const effectiveWidth = bldg.sweepWidth ?? DEFAULT_SWEEP_WIDTH;
            const effectiveAlignment = bldg.sweepAlignment ?? 'center';
            const newVertices = generateSweepPolygon(nextSweepPath, effectiveWidth, effectiveAlignment);

            const rebuilt = rebuildBuildingSegments(bldg, newVertices);
            rebuilt.sweepPath = nextSweepPath;
            rebuilt.sweepWidth = effectiveWidth;
            rebuilt.sweepAlignment = effectiveAlignment;

            if (rebuilt.modifiers && rebuilt.modifiers.length > 0) {
              const modRes = applyBuildingModifiers(rebuilt);
              rebuilt.storyPolygons = modRes.storyPolygons;
              rebuilt.zonePolygons = modRes.zonePolygons;
              rebuilt.segments = modRes.segments;
            }
            return rebuilt;
          }
        }

        // Standardowy poligon budynku: przesunięcie krawędzi z zachowaniem kątów sąsiednich ścian
        const newVertices = offsetPolygonEdge(bldg.vertices, edgeIndex, { x: dx, y: dy });
        const rebuilt = rebuildBuildingSegments(bldg, newVertices);
        if (rebuilt.modifiers && rebuilt.modifiers.length > 0) {
          const modRes = applyBuildingModifiers(rebuilt);
          rebuilt.storyPolygons = modRes.storyPolygons;
          rebuilt.zonePolygons = modRes.zonePolygons;
          rebuilt.segments = modRes.segments;
        }
        return rebuilt;
      }),
    }));
  },

  rotateBuilding: (id, pivot, deltaAngleRad) => {
    set((state) => {
      const targetBldg = state.buildings.find((b) => b.id === id);
      const targetGroupId = targetBldg?.groupId;
      const isGroupOpen = !!targetGroupId && state.openGroupId === targetGroupId;

      return {
        buildings: state.buildings.map((bldg) => {
          const shouldRotate = bldg.id === id || (!isGroupOpen && !!targetGroupId && bldg.groupId === targetGroupId);
          if (!shouldRotate) return bldg;
          return rotateBuildingGeometry(bldg, pivot, deltaAngleRad);
        }),
      };
    });
  },

  alignBuildingEdgeToEdge: (targetRef, referenceRef) => {
    const { buildings } = get();
    const targetBldg = buildings.find((b) => b.id === targetRef.buildingId);
    const referenceBldg = buildings.find((b) => b.id === referenceRef.buildingId);
    if (!targetBldg || !referenceBldg) return;

    const targetSeg = targetBldg.segments.find((s) => s.id === targetRef.segmentId);
    const referenceSeg = referenceBldg.segments.find((s) => s.id === referenceRef.segmentId);
    if (!targetSeg || !referenceSeg) return;

    // Edges are undirected lines: normalize both angles into [0, PI) before
    // taking the difference, so we always rotate by the shortest amount that
    // makes them parallel (never an unnecessary 180° flip).
    const normalizeLineAngle = (angleRad: number) => ((angleRad % Math.PI) + Math.PI) % Math.PI;
    let deltaRad = normalizeLineAngle(referenceSeg.angleRad) - normalizeLineAngle(targetSeg.angleRad);
    if (deltaRad > Math.PI / 2) deltaRad -= Math.PI;
    if (deltaRad < -Math.PI / 2) deltaRad += Math.PI;

    if (Math.abs(deltaRad) < 1e-6) return;

    const pivot = getPolygonCentroid(targetBldg.vertices);
    get().rotateBuilding(targetBldg.id, pivot, deltaRad);
  },

  booleanUnion: (bldgIdA, bldgIdB) => {
    const { buildings } = get();
    const bA = buildings.find((b) => b.id === bldgIdA);
    const bB = buildings.find((b) => b.id === bldgIdB);
    if (!bA || !bB) return { success: false, error: 'Nie znaleziono obiektów' };

    const res = booleanUnionBuildings(bA, bB);
    if (res.success && res.building) {
      const newBuilding = res.building;
      set((state) => ({
        buildings: [
          ...state.buildings.filter((b) => b.id !== bldgIdA && b.id !== bldgIdB),
          newBuilding,
        ],
        selectedBuildingId: newBuilding.id,
        selectedBuildingIds: [newBuilding.id],
      }));
      return { success: true };
    }
    return { success: false, error: res.error || 'Obiekty muszą się stykać lub przenikać, aby wykonać sumę.' };
  },

  addBuildingModifier: (buildingId, modifier) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        // Obiekt połączony w grupę logiczną (Node / Compound) nie może posiadać modyfikatorów
        if (bldg.groupId || bldg.category === 'compound') return bldg;
        const currentMods = bldg.modifiers || [];
        const newMods = [...currentMods, modifier];
        const withMods = { ...bldg, modifiers: newMods };
        const res = applyBuildingModifiers(withMods);
        return {
          ...withMods,
          storyPolygons: res.storyPolygons && res.storyPolygons.length > 0 ? res.storyPolygons : undefined,
          zonePolygons: res.zonePolygons && res.zonePolygons.length > 0 ? res.zonePolygons : undefined,
          segments: res.segments,
        };
      }),
    }));
  },

  updateBuildingModifier: (buildingId, modifierId, patch) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        const currentMods = bldg.modifiers || [];
        const newMods = currentMods.map((m) => (m.id === modifierId ? ({ ...m, ...patch } as Modifier) : m));
        const withMods = { ...bldg, modifiers: newMods };
        const res = applyBuildingModifiers(withMods);
        return {
          ...withMods,
          storyPolygons: res.storyPolygons && res.storyPolygons.length > 0 ? res.storyPolygons : undefined,
          zonePolygons: res.zonePolygons && res.zonePolygons.length > 0 ? res.zonePolygons : undefined,
          segments: res.segments,
        };
      }),
    }));
  },

  removeBuildingModifier: (buildingId, modifierId) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        const currentMods = bldg.modifiers || [];
        const newMods = currentMods.filter((m) => m.id !== modifierId);
        const withMods = { ...bldg, modifiers: newMods };
        if (newMods.length === 0) {
          const rebuilt = rebuildBuildingSegments(withMods, withMods.vertices);
          return {
            ...rebuilt,
            storyPolygons: undefined,
            zonePolygons: undefined,
          };
        }
        const res = applyBuildingModifiers(withMods);
        return {
          ...withMods,
          storyPolygons: res.storyPolygons && res.storyPolygons.length > 0 ? res.storyPolygons : undefined,
          zonePolygons: res.zonePolygons && res.zonePolygons.length > 0 ? res.zonePolygons : undefined,
          segments: res.segments,
        };
      }),
    }));
  },

  reorderBuildingModifiers: (buildingId, fromIndex, toIndex) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        const currentMods = [...(bldg.modifiers || [])];
        if (fromIndex < 0 || fromIndex >= currentMods.length || toIndex < 0 || toIndex >= currentMods.length) {
          return bldg;
        }
        const [moved] = currentMods.splice(fromIndex, 1);
        currentMods.splice(toIndex, 0, moved);
        const withMods = { ...bldg, modifiers: currentMods };
        const res = applyBuildingModifiers(withMods);
        return {
          ...withMods,
          storyPolygons: res.storyPolygons && res.storyPolygons.length > 0 ? res.storyPolygons : undefined,
          zonePolygons: res.zonePolygons && res.zonePolygons.length > 0 ? res.zonePolygons : undefined,
          segments: res.segments,
        };
      }),
    }));
  },

  toggleBuildingModifier: (buildingId, modifierId) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        const currentMods = bldg.modifiers || [];
        const newMods = currentMods.map((m) => (m.id === modifierId ? { ...m, enabled: !m.enabled } : m));
        const withMods = { ...bldg, modifiers: newMods };
        const res = applyBuildingModifiers(withMods);
        return {
          ...withMods,
          storyPolygons: res.storyPolygons && res.storyPolygons.length > 0 ? res.storyPolygons : undefined,
          zonePolygons: res.zonePolygons && res.zonePolygons.length > 0 ? res.zonePolygons : undefined,
          segments: res.segments,
        };
      }),
    }));
  },

  setIsLinkingMode: (isLinking) => set({ isLinkingMode: isLinking }),
  setLinkingSourceId: (id) => set({ linkingSourceId: id }),

  performLinkBuildings: (sourceId, targetId) => {
    set((state) => {
      const source = state.buildings.find((b) => b.id === sourceId);
      const target = state.buildings.find((b) => b.id === targetId);
      if (!source || !target) return state;

      const newGroupId = source.groupId || target.groupId || `group-${Date.now()}`;
      return {
        buildings: state.buildings.map((b) => {
          if (b.id === sourceId || b.id === targetId) {
            return { ...b, groupId: newGroupId };
          }
          if (source.groupId && b.groupId === source.groupId) {
            return { ...b, groupId: newGroupId };
          }
          if (target.groupId && b.groupId === target.groupId) {
            return { ...b, groupId: newGroupId };
          }
          return b;
        }),
      };
    });
  },

  performUnlinkBuilding: (id) => {
    set((state) => {
      const target = state.buildings.find((b) => b.id === id);
      if (!target || !target.groupId) return state;

      const remainingInGroup = state.buildings.filter(
        (b) => b.groupId === target.groupId && b.id !== id
      );

      return {
        buildings: state.buildings.map((b) => {
          if (b.id === id) {
            return { ...b, groupId: undefined };
          }
          if (remainingInGroup.length <= 1 && b.groupId === target.groupId) {
            return { ...b, groupId: undefined };
          }
          return b;
        }),
      };
    });
  },

  performUnlinkAllInGroup: (groupId) => {
    set((state) => ({
      buildings: state.buildings.map((b) => (b.groupId === groupId ? { ...b, groupId: undefined } : b)),
    }));
  },

  updateGroup: (groupId, patch) => {
    set((state) => ({
      buildings: state.buildings.map((b) => {
        if (b.groupId !== groupId) return b;
        return { ...b, ...patch };
      }),
    }));
  },

  rotateGroup: (groupId, targetDeg) => {
    set((state) => {
      const groupBuildings = state.buildings.filter((b) => b.groupId === groupId);
      if (groupBuildings.length === 0) return state;

      // Wyznacz wspólny centroid dla wszystkich obiektów grupy
      const targetBldgs = groupBuildings;

      const allVertices = targetBldgs.flatMap((b) => b.vertices || []);
      if (allVertices.length === 0) return state;

      const pivot = getPolygonCentroid(allVertices);

      // Oblicz bieżący kąt grupy
      const currentRot = targetBldgs[0]?.transform?.rotationDeg ?? 0;
      let deltaDeg = targetDeg - currentRot;
      while (deltaDeg > 180) deltaDeg -= 360;
      while (deltaDeg < -180) deltaDeg += 360;
      const deltaRad = (deltaDeg * Math.PI) / 180;

      return {
        buildings: state.buildings.map((bldg) => {
          if (bldg.groupId !== groupId) return bldg;
          return rotateBuildingGeometry(bldg, pivot, deltaRad);
        }),
      };
    });
  },

  setLayerSettings: (updater) => {
    set((state) => ({
      layerSettings: typeof updater === 'function' ? updater(state.layerSettings) : updater,
    }));
  },

  setSelectedLayerName: (name) => set({ selectedLayerName: name }),

  toggleLayerVisibility: (layerName) => {
    set((state) => {
      const willBeVisible = state.layerSettings[layerName]?.isVisible === false;
      const isSelectedOnLayer = state.selectedBuildingId
        ? (state.buildings.find((b) => b.id === state.selectedBuildingId)?.layer || 'Domyślna (0)') === layerName
        : false;

      return {
        selectedBuildingId: !willBeVisible && isSelectedOnLayer ? null : state.selectedBuildingId,
        selectedBuildingIds: !willBeVisible && isSelectedOnLayer ? [] : state.selectedBuildingIds,
        layerSettings: {
          ...state.layerSettings,
          [layerName]: {
            ...state.layerSettings[layerName],
            isVisible: willBeVisible,
          },
        },
      };
    });
  },

  toggleLayerLock: (layerName) => {
    set((state) => ({
      layerSettings: {
        ...state.layerSettings,
        [layerName]: {
          ...state.layerSettings[layerName],
          isLocked: !state.layerSettings[layerName]?.isLocked,
        },
      },
    }));
  },

  toggleLayerGhost: (layerName) => {
    set((state) => ({
      layerSettings: {
        ...state.layerSettings,
        [layerName]: {
          ...state.layerSettings[layerName],
          isGhosted: !state.layerSettings[layerName]?.isGhosted,
        },
      },
    }));
  },

  toggleLayerSnapExclusion: (layerName) => {
    set((state) => ({
      layerSettings: {
        ...state.layerSettings,
        [layerName]: {
          ...state.layerSettings[layerName],
          isSnapExcluded: !state.layerSettings[layerName]?.isSnapExcluded,
        },
      },
    }));
  },

  updateLayerBuildings: (layerName, fields) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        const bldgLayer = bldg.layer || 'Domyślna (0)';
        if (bldgLayer !== layerName) return bldg;
        const updated = { ...bldg, ...fields };
        if (
          fields.defaultHeight !== undefined ||
          fields.elevation !== undefined ||
          fields.hWindowBottom !== undefined ||
          fields.isCityCentre !== undefined
        ) {
          const elev = updated.elevation ?? 0.0;
          const hTop = elev + (updated.defaultHeight ?? 15);
          updated.segments = updated.segments.map((seg) => ({
            ...seg,
            hTop,
            hBase: elev,
            hWindowBottom: fields.hWindowBottom !== undefined ? fields.hWindowBottom : seg.hWindowBottom,
            isCityCentre: fields.isCityCentre !== undefined ? fields.isCityCentre : seg.isCityCentre,
          }));
        }
        return updated;
      }),
    }));
  },

  selectLayerBuildings: (layerName) => {
    const { buildings } = get();
    const matched = buildings.filter((b) => (b.layer || 'Domyślna (0)') === layerName);
    const ids = matched.map((b) => b.id);
    set({
      selectedBuildingIds: ids,
      selectedBuildingId: ids.length > 0 ? ids[0] : null,
      selectedLayerName: layerName,
    });
  },

  setDxfUnit: (unit) => set({ dxfUnit: unit }),
  setDxfImportInfo: (info) => set({ dxfImportInfo: info }),
  setLastDxfText: (text) => set({ lastDxfText: text }),

  loadSceneData: (scene) => {
    const rawBuildings = scene.buildings ?? [];
    const hydratedBuildings = rawBuildings.map((bldg) => {
      if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) return bldg;
      if (bldg.modifiers && bldg.modifiers.length > 0) {
        try {
          const modRes = applyBuildingModifiers(bldg);
          return {
            ...bldg,
            storyPolygons: modRes.storyPolygons,
            zonePolygons: modRes.zonePolygons,
            segments: modRes.segments,
          };
        } catch {
          return rebuildBuildingSegments(bldg, bldg.vertices);
        }
      }
      if (!bldg.segments || bldg.segments.length === 0) {
        return rebuildBuildingSegments(bldg, bldg.vertices);
      }
      return bldg;
    });

    set({
      buildings: hydratedBuildings,
      selectedBuildingId: scene.selectedBuildingId ?? null,
      selectedBuildingIds: scene.selectedBuildingId ? [scene.selectedBuildingId] : [],
      layerSettings: scene.layerSettings ?? {},
      selectedLayerName: scene.selectedLayerName ?? null,
      isLinkingMode: scene.isLinkingMode ?? false,
      linkingSourceId: scene.linkingSourceId ?? null,
      dxfUnit: scene.dxfUnit ?? 'auto',
      dxfImportInfo: scene.dxfImportInfo ?? null,
    });
  },

  resetScene: () => {
    interactionBatchSnapshot = null;
    set({
      buildings: [],
      selectedBuildingId: null,
      selectedBuildingIds: [],
      layerSettings: {},
      selectedLayerName: null,
      isLinkingMode: false,
      linkingSourceId: null,
    });
  },

  startInteractionBatch: () => {
    if (!interactionBatchSnapshot) {
      interactionBatchSnapshot = {
        buildings: get().buildings,
        layerSettings: get().layerSettings,
      };
    }
    useSceneStore.temporal.getState().pause();
  },

  commitInteractionBatch: () => {
    useSceneStore.temporal.getState().resume();
    if (interactionBatchSnapshot) {
      const initialSnapshot = interactionBatchSnapshot;
      interactionBatchSnapshot = null;
      const currentBuildings = get().buildings;
      const currentLayerSettings = get().layerSettings;

      const isBuildingsUnchanged = initialSnapshot.buildings === currentBuildings;
      const isLayerSettingsUnchanged = initialSnapshot.layerSettings === currentLayerSettings;

      if (!isBuildingsUnchanged || !isLayerSettingsUnchanged) {
        const temporalStore = useSceneStore.temporal;
        const limit = 50;
        const currentPast = temporalStore.getState().pastStates;
        let nextPast = [...currentPast, initialSnapshot];
        if (nextPast.length > limit) {
          nextPast = nextPast.slice(nextPast.length - limit);
        }
        temporalStore.setState({
          pastStates: nextPast,
          futureStates: [],
        });
      }
    }
  },

  cancelInteractionBatch: () => {
    if (interactionBatchSnapshot) {
      const initialSnapshot = interactionBatchSnapshot;
      interactionBatchSnapshot = null;
      set({
        buildings: initialSnapshot.buildings,
        layerSettings: initialSnapshot.layerSettings,
      });
    }
    useSceneStore.temporal.getState().resume();
  },
}),
{
  limit: 50,
  partialize: (state) => ({
    buildings: state.buildings,
    layerSettings: state.layerSettings,
  }),
  equality: (pastState, currentState) =>
    pastState.buildings === currentState.buildings &&
    pastState.layerSettings === currentState.layerSettings,
}
)
);
