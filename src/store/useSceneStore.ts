import { create } from 'zustand';
import { BuildingLoop, CadLayerSettings, Point2D } from '../types/geometry';
import { createSampleBuildings, createBuildingFromVertices, DxfUnitOption, DxfUnitInfo } from '../utils/dxfParser';
import { rebuildBuildingSegments } from '../utils/segmentStatistics';
import { offsetPolygonEdge, updateBuildingWithNewVertices, booleanUnionBuildings } from '@/utils/math2d';

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

  // Actions
  setBuildings: (buildings: BuildingLoop[] | ((prev: BuildingLoop[]) => BuildingLoop[])) => void;
  setSelectedBuildingId: (id: string | null) => void;
  selectBuilding: (id: string | null, isMultiSelect?: boolean) => void;
  addBuilding: (building: BuildingLoop) => void;
  deleteBuilding: (id: string) => void;
  deleteBuildings: (ids: string[]) => void;
  duplicateBuilding: (sourceId: string) => void;
  updateBuilding: (id: string, patch: Partial<BuildingLoop>) => void;
  updateSelectedBuilding: (patch: Partial<BuildingLoop>) => void;
  adjustSelectedBuildingHeight: (deltaMeters: number) => void;
  updateBuildingVertices: (buildingId: string, newVertices: Point2D[]) => void;
  moveBuilding: (id: string, dx: number, dy: number) => void;
  moveBuildings: (ids: string[], dx: number, dy: number) => void;
  moveBuildingEdge: (buildingId: string, edgeIndex: number, dx: number, dy: number) => void;
  booleanUnion: (bldgIdA: string, bldgIdB: string) => { success: boolean; error?: string };

  // Linking / Groups
  setIsLinkingMode: (isLinking: boolean) => void;
  setLinkingSourceId: (id: string | null) => void;
  performLinkBuildings: (sourceId: string, targetId: string) => void;
  performUnlinkBuilding: (id: string) => void;
  performUnlinkAllInGroup: (groupId: string) => void;

  // Layers
  setLayerSettings: (settings: Record<string, CadLayerSettings> | ((prev: Record<string, CadLayerSettings>) => Record<string, CadLayerSettings>)) => void;
  setSelectedLayerName: (name: string | null) => void;
  toggleLayerVisibility: (layerName: string) => void;
  toggleLayerLock: (layerName: string) => void;
  toggleLayerGhost: (layerName: string) => void;
  updateLayerBuildings: (layerName: string, fields: Partial<BuildingLoop>) => void;
  selectLayerBuildings: (layerName: string) => void;

  // DXF
  setDxfUnit: (unit: DxfUnitOption) => void;
  setDxfImportInfo: (info: DxfUnitInfo | null) => void;
  setLastDxfText: (text: string | null) => void;

  // Bulk Load / Reset
  loadSceneData: (scene: Partial<SavedSceneData>) => void;
  resetScene: () => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  buildings: createSampleBuildings(),
  selectedBuildingId: 'bldg-1',
  selectedBuildingIds: ['bldg-1'],
  layerSettings: {},
  selectedLayerName: null,
  isLinkingMode: false,
  linkingSourceId: null,
  dxfUnit: 'auto',
  dxfImportInfo: null,
  lastDxfText: null,

  setBuildings: (updater) => {
    set((state) => ({
      buildings: typeof updater === 'function' ? updater(state.buildings) : updater,
    }));
  },

  setSelectedBuildingId: (id) => {
    set({
      selectedBuildingId: id,
      selectedBuildingIds: id ? [id] : [],
    });
  },

  selectBuilding: (id, isMultiSelect = false) => {
    const { isLinkingMode, linkingSourceId, performLinkBuildings } = get();
    if (isLinkingMode && linkingSourceId && id && id !== linkingSourceId) {
      performLinkBuildings(linkingSourceId, id);
      set({
        isLinkingMode: false,
        linkingSourceId: null,
        selectedBuildingId: id,
        selectedBuildingIds: [id],
      });
      return;
    }

    if (!id) {
      set({ selectedBuildingId: null, selectedBuildingIds: [] });
      return;
    }

    if (isMultiSelect) {
      set((state) => {
        const exists = state.selectedBuildingIds.includes(id);
        const nextIds = exists
          ? state.selectedBuildingIds.filter((item) => item !== id)
          : [...state.selectedBuildingIds, id];
        return {
          selectedBuildingIds: nextIds,
          selectedBuildingId: nextIds.length > 0 ? nextIds[nextIds.length - 1] : null,
        };
      });
    } else {
      set({
        selectedBuildingId: id,
        selectedBuildingIds: [id],
      });
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

    const duplicate: BuildingLoop = {
      ...source,
      id: newId,
      name: newName,
      vertices: newVertices,
      segments: newSegments,
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
        const updated = { ...bldg, ...fields };

        if (fields.category === 'boundary') {
          updated.defaultHeight = 0;
          updated.isTested = false;
        }

        const h1 = updated.firstFloorHeight ?? 3.0;
        const ht = updated.typicalFloorHeight ?? 3.0;

        if (fields.defaultHeight !== undefined && fields.storeysCount === undefined) {
          const H = fields.defaultHeight;
          updated.storeysCount = H > h1 ? 1 + Math.max(1, Math.round((H - h1) / ht)) : 1;
        } else if (fields.storeysCount !== undefined && fields.defaultHeight === undefined) {
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
        return {
          ...bldg,
          defaultHeight: nextHeight,
          segments: bldg.segments.map((seg) => ({
            ...seg,
            hTop: nextHeight,
          })),
        };
      }),
    }));
  },

  updateBuildingVertices: (buildingId, newVertices) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        return rebuildBuildingSegments(bldg, newVertices);
      }),
    }));
  },

  moveBuilding: (id, dx, dy) => {
    set((state) => {
      const targetBldg = state.buildings.find((b) => b.id === id);
      const targetGroupId = targetBldg?.groupId;

      return {
        buildings: state.buildings.map((bldg) => {
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
        if (b?.groupId) targetGroupIds.add(b.groupId);
      });

      const idsSet = new Set(ids);

      return {
        buildings: state.buildings.map((bldg) => {
          const shouldMove = idsSet.has(bldg.id) || (!!bldg.groupId && targetGroupIds.has(bldg.groupId));
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
        }),
      };
    });
  },

  moveBuildingEdge: (buildingId, edgeIndex, dx, dy) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
        if (bldg.id !== buildingId) return bldg;
        const newVerts = offsetPolygonEdge(bldg.vertices, edgeIndex, { x: dx, y: dy });
        return updateBuildingWithNewVertices(bldg, newVerts);
      }),
    }));
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

  updateLayerBuildings: (layerName, fields) => {
    set((state) => ({
      buildings: state.buildings.map((bldg) => {
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
    set({
      buildings: scene.buildings ?? createSampleBuildings(),
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
    set({
      buildings: createSampleBuildings(),
      selectedBuildingId: 'bldg-1',
      selectedBuildingIds: ['bldg-1'],
      layerSettings: {},
      selectedLayerName: null,
      isLinkingMode: false,
      linkingSourceId: null,
    });
  },
}));
