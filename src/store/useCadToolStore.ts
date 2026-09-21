import { create } from 'zustand';
import { DEFAULT_SWEEP_WIDTH, DimensionItem, DimensionReference, DimensionType, Point2D } from '../types/geometry';
import { SweepAlignment } from '../utils/math2d/sweep';
import { APP_CONFIG } from '../config/appConfig';
import { useSceneStore } from './useSceneStore';

export type DrawingMode = 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'align';

export interface OsnapModes {
  vertex: boolean;
  intersection: boolean;
  perpendicular: boolean;
  edge: boolean;
  extension: boolean;
}

export interface OtrackModes {
  ortho: boolean;
  dominant: boolean;
  relative: boolean;
  dualIntersection: boolean;
}

interface CadToolState {
  // Drawing Tools
  drawingMode: DrawingMode;
  drawingCategory: import('../types/geometry').ObjectCategory;
  drawingVerticesCount: number;

  // Sweep (Wstęga) settings
  sweepWidth: number;
  sweepAlignment: SweepAlignment;

  // Edge editing & facade point mode
  isEditMode: boolean;
  facadePointMode: boolean;
  showModifiersPanel: boolean;

  // Linking mode display options
  hideOtherLabelsInLinkingMode: boolean;
  setHideOtherLabelsInLinkingMode: (hide: boolean | ((prev: boolean) => boolean)) => void;

  // Snapping settings
  isDirectionSnappingActive: boolean;
  isOsnapActive: boolean;
  osnapModes: OsnapModes;
  otrackModes: OtrackModes;
  noisePercentileCutoff: number;
  snapRadiusPx: number;
  // DEV-only: podgląd krawędzi, które przeszły/odrzucone przez filtr górnoprzepustowy EdgeSnapStrategy
  debugSnapHpfOverlayEnabled: boolean;

  // Dimensions
  dimensions: DimensionItem[];
  isDimensionToolActive: boolean;
  dimensionType: DimensionType;
  dimensionPendingRef: DimensionReference | null;

  // Project Brush tool ('W projekcie')
  isProjectBrushActive: boolean;

  // Align tool (edge-to-edge)
  alignPendingRef: DimensionReference | null;

  // Viewport & UCS rotation
  viewRotationMode: boolean;
  viewRotationDeg: number;
  savedViewRotationDeg: number;
  // Żądanie dopasowania widoku (Zoom Extents): nonce inkrementowany przy każdym wywołaniu,
  // ignoreSelection: true wymusza dopasowanie do całego projektu z pominięciem zaznaczenia
  fitRequest: { nonce: number; ignoreSelection: boolean };

  // Interaction accuracy flag
  isInteracting: boolean;

  // Tani, niezależny od zundo kanał do zasilania podglądu 3D na żywo podczas przeciągania
  // wierzchołka/krawędzi (przed commitem do useSceneStore, który następuje dopiero na mouseup).
  liveVertexPreview: { buildingId: string; vertexIndex: number; point: { x: number; y: number } } | null;

  // Actions
  setDrawingMode: (mode: DrawingMode) => void;
  setDrawingCategory: (category: import('../types/geometry').ObjectCategory) => void;
  setDrawingVerticesCount: (count: number) => void;
  setSweepWidth: (width: number) => void;
  setSweepAlignment: (alignment: SweepAlignment) => void;
  setIsEditMode: (active: boolean) => void;
  setFacadePointMode: (active: boolean) => void;
  setShowModifiersPanel: (show: boolean | ((prev: boolean) => boolean)) => void;

  toggleOsnap: () => void;
  setIsOsnapActive: (active: boolean) => void;
  toggleDirectionSnapping: () => void;
  setIsDirectionSnappingActive: (active: boolean) => void;

  toggleOsnapMode: (mode: keyof OsnapModes) => void;
  setOsnapModes: (modes: Partial<OsnapModes>) => void;
  setAllOsnapModes: (active: boolean) => void;

  toggleOtrackMode: (mode: keyof OtrackModes) => void;
  setOtrackModes: (modes: Partial<OtrackModes>) => void;
  setAllOtrackModes: (active: boolean) => void;

  setNoisePercentileCutoff: (cutoff: number) => void;
  setSnapRadiusPx: (radius: number) => void;
  setDebugSnapHpfOverlayEnabled: (active: boolean) => void;
  toggleDebugSnapHpfOverlay: () => void;

  // Dimension actions
  setDimensions: (dims: DimensionItem[] | ((prev: DimensionItem[]) => DimensionItem[])) => void;
  setIsDimensionToolActive: (active: boolean) => void;
  setDimensionType: (type: DimensionType) => void;
  setDimensionPendingRef: (ref: DimensionReference | null) => void;
  handleDimensionClickEdge: (buildingId: string, segmentId: string) => void;
  cancelDimension: () => void;

  // Project Brush actions
  setIsProjectBrushActive: (active: boolean) => void;
  toggleProjectBrush: () => void;

  // Align tool actions
  setAlignPendingRef: (ref: DimensionReference | null) => void;
  handleAlignClickEdge: (selectedBuildingId: string | null, buildingId: string, segmentId: string) => void;
  cancelAlign: () => void;
  deleteDimension: (id: string) => void;
  toggleDimensionType: (id: string) => void;
  clearAllDimensions: () => void;

  // Viewport / UCS actions
  setViewRotationMode: (active: boolean | ((prev: boolean) => boolean)) => void;
  setViewRotationDeg: (deg: number | ((prev: number) => number)) => void;
  setSavedViewRotationDeg: (deg: number | ((prev: number) => number)) => void;
  toggleUcsRotation: () => void;
  triggerFit: (options?: { ignoreSelection?: boolean }) => void;

  setIsInteracting: (interacting: boolean) => void;
  setLiveVertexPreview: (
    preview: { buildingId: string; vertexIndex: number; point: { x: number; y: number } } | null
  ) => void;

  resetCadTool: () => void;
}

export const useCadToolStore = create<CadToolState>((set, get) => ({
  drawingMode: 'none',
  drawingCategory: 'building',
  drawingVerticesCount: 0,

  sweepWidth: DEFAULT_SWEEP_WIDTH,
  sweepAlignment: 'center',

  isEditMode: false,
  facadePointMode: false,
  showModifiersPanel: false,
  hideOtherLabelsInLinkingMode: true,

  isDirectionSnappingActive: APP_CONFIG.directionSnapping.enabledDefault,
  isOsnapActive: APP_CONFIG.osnap?.enabledDefault ?? true,
  osnapModes: {
    vertex: true,
    intersection: true,
    perpendicular: true,
    edge: true,
    extension: true,
  },
  otrackModes: {
    ortho: true,
    dominant: true,
    relative: true,
    dualIntersection: true,
  },
  noisePercentileCutoff: APP_CONFIG.statistics?.defaultNoisePercentile ?? 20,
  snapRadiusPx: APP_CONFIG.osnap?.snapRadiusPx ?? 14,
  debugSnapHpfOverlayEnabled: false,

  dimensions: [],
  isDimensionToolActive: false,
  dimensionType: 'linear',
  dimensionPendingRef: null,

  isProjectBrushActive: false,

  alignPendingRef: null,

  viewRotationMode: false,
  viewRotationDeg: 0,
  savedViewRotationDeg: 0,
  fitRequest: { nonce: 0, ignoreSelection: false },

  isInteracting: false,
  liveVertexPreview: null,

  setDrawingMode: (mode) => set({ drawingMode: mode, ...(mode !== 'none' ? { isProjectBrushActive: false } : {}) }),
  setDrawingCategory: (category) => set({ drawingCategory: category }),
  setDrawingVerticesCount: (count) => set({ drawingVerticesCount: count }),
  setSweepWidth: (width) => set({ sweepWidth: Math.max(0.1, Number.isFinite(width) ? width : DEFAULT_SWEEP_WIDTH) }),
  setSweepAlignment: (alignment) => set({ sweepAlignment: alignment }),
  setIsEditMode: (active) => set({ isEditMode: active, ...(active ? { isProjectBrushActive: false } : {}) }),
  setFacadePointMode: (active) => set({ facadePointMode: active, ...(active ? { isProjectBrushActive: false } : {}) }),
  setShowModifiersPanel: (show) =>
    set((state) => ({
      showModifiersPanel: typeof show === 'function' ? show(state.showModifiersPanel) : show,
    })),
  setHideOtherLabelsInLinkingMode: (hide) =>
    set((state) => ({
      hideOtherLabelsInLinkingMode:
        typeof hide === 'function' ? hide(state.hideOtherLabelsInLinkingMode) : hide,
    })),

  toggleOsnap: () => set((state) => ({ isOsnapActive: !state.isOsnapActive })),
  setIsOsnapActive: (active) => set({ isOsnapActive: active }),
  toggleDirectionSnapping: () => set((state) => ({ isDirectionSnappingActive: !state.isDirectionSnappingActive })),
  setIsDirectionSnappingActive: (active) => set({ isDirectionSnappingActive: active }),

  toggleOsnapMode: (mode) =>
    set((state) => ({
      osnapModes: {
        ...state.osnapModes,
        [mode]: !state.osnapModes[mode],
      },
    })),
  setOsnapModes: (modes) =>
    set((state) => ({
      osnapModes: {
        ...state.osnapModes,
        ...modes,
      },
    })),
  setAllOsnapModes: (active) =>
    set(() => ({
      osnapModes: {
        vertex: active,
        intersection: active,
        perpendicular: active,
        edge: active,
        extension: active,
      },
    })),

  toggleOtrackMode: (mode) =>
    set((state) => ({
      otrackModes: {
        ...state.otrackModes,
        [mode]: !state.otrackModes[mode],
      },
    })),
  setOtrackModes: (modes) =>
    set((state) => ({
      otrackModes: {
        ...state.otrackModes,
        ...modes,
      },
    })),
  setAllOtrackModes: (active) =>
    set(() => ({
      otrackModes: {
        ortho: active,
        dominant: active,
        relative: active,
        dualIntersection: active,
      },
    })),

  setNoisePercentileCutoff: (cutoff) => set({ noisePercentileCutoff: Math.max(0, Math.min(80, cutoff)) }),
  setSnapRadiusPx: (radius) => set({ snapRadiusPx: Math.max(6, Math.min(30, radius)) }),
  setDebugSnapHpfOverlayEnabled: (active) => set({ debugSnapHpfOverlayEnabled: active }),
  toggleDebugSnapHpfOverlay: () => set((state) => ({ debugSnapHpfOverlayEnabled: !state.debugSnapHpfOverlayEnabled })),

  setDimensions: (updater) => {
    set((state) => ({
      dimensions: typeof updater === 'function' ? updater(state.dimensions) : updater,
    }));
  },

  setIsDimensionToolActive: (active) =>
    set({
      isDimensionToolActive: active,
      dimensionPendingRef: null,
      ...(active ? { isProjectBrushActive: false } : {}),
    }),
  setDimensionType: (type) => set({ dimensionType: type }),
  setDimensionPendingRef: (ref) => set({ dimensionPendingRef: ref }),

  setIsProjectBrushActive: (active) =>
    set({
      isProjectBrushActive: active,
      ...(active
        ? {
            isDimensionToolActive: false,
            dimensionPendingRef: null,
            drawingMode: 'none',
            drawingVerticesCount: 0,
            facadePointMode: false,
            isEditMode: false,
          }
        : {}),
    }),
  toggleProjectBrush: () =>
    set((state) => {
      const nextActive = !state.isProjectBrushActive;
      return {
        isProjectBrushActive: nextActive,
        ...(nextActive
          ? {
              isDimensionToolActive: false,
              dimensionPendingRef: null,
              drawingMode: 'none',
              drawingVerticesCount: 0,
              facadePointMode: false,
              isEditMode: false,
            }
          : {}),
      };
    }),

  handleDimensionClickEdge: (buildingId, segmentId) => {
    const { dimensionPendingRef, dimensionType } = get();
    if (!dimensionPendingRef) {
      set({ dimensionPendingRef: { buildingId, segmentId } });
    } else {
      if (dimensionPendingRef.buildingId === buildingId && dimensionPendingRef.segmentId === segmentId) {
        return;
      }
      const newDim: DimensionItem = {
        id: `dim-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: dimensionType,
        ref1: dimensionPendingRef,
        ref2: { buildingId, segmentId },
      };
      set((state) => ({
        dimensions: [...state.dimensions, newDim],
        dimensionPendingRef: null,
        isDimensionToolActive: false,
      }));
    }
  },

  cancelDimension: () => set({ dimensionPendingRef: null, isDimensionToolActive: false }),

  setAlignPendingRef: (ref) => set({ alignPendingRef: ref }),

  handleAlignClickEdge: (selectedBuildingId, buildingId, segmentId) => {
    if (!selectedBuildingId) return;
    const { alignPendingRef } = get();
    if (!alignPendingRef) {
      set({ alignPendingRef: { buildingId, segmentId } });
      return;
    }
    if (alignPendingRef.buildingId === buildingId && alignPendingRef.segmentId === segmentId) {
      return;
    }
    const secondRef = { buildingId, segmentId };
    const targetRef = alignPendingRef.buildingId === selectedBuildingId ? alignPendingRef : secondRef;
    const referenceRef = targetRef === alignPendingRef ? secondRef : alignPendingRef;
    if (targetRef.buildingId !== selectedBuildingId) {
      set({ alignPendingRef: null });
      return;
    }
    useSceneStore.getState().alignBuildingEdgeToEdge(targetRef, referenceRef);
    set({ alignPendingRef: null, drawingMode: 'none' });
  },

  cancelAlign: () => set({ alignPendingRef: null }),
  deleteDimension: (id) => set((state) => ({ dimensions: state.dimensions.filter((d) => d.id !== id) })),
  toggleDimensionType: (id) =>
    set((state) => ({
      dimensions: state.dimensions.map((d) =>
        d.id === id ? { ...d, type: d.type === 'linear' ? 'angular' : 'linear' } : d
      ),
    })),
  clearAllDimensions: () => set({ dimensions: [], dimensionPendingRef: null }),

  setViewRotationMode: (updater) =>
    set((state) => ({
      viewRotationMode: typeof updater === 'function' ? updater(state.viewRotationMode) : updater,
    })),

  setViewRotationDeg: (updater) =>
    set((state) => ({
      viewRotationDeg: typeof updater === 'function' ? updater(state.viewRotationDeg) : updater,
    })),

  setSavedViewRotationDeg: (updater) =>
    set((state) => ({
      savedViewRotationDeg: typeof updater === 'function' ? updater(state.savedViewRotationDeg) : updater,
    })),

  toggleUcsRotation: () => {
    set((state) => {
      if (Math.abs(state.viewRotationDeg) < 0.001) {
        return { viewRotationDeg: state.savedViewRotationDeg };
      }
      return {
        savedViewRotationDeg: state.viewRotationDeg,
        viewRotationDeg: 0,
      };
    });
  },

  triggerFit: (options) =>
    set((state) => ({
      fitRequest: { nonce: state.fitRequest.nonce + 1, ignoreSelection: options?.ignoreSelection ?? false },
    })),
  setIsInteracting: (interacting) => {
    set({ isInteracting: interacting });
    if (interacting) {
      useSceneStore.getState().startInteractionBatch();
    } else {
      useSceneStore.getState().commitInteractionBatch();
    }
    if (!interacting) {
      set({ liveVertexPreview: null });
    }
  },
  setLiveVertexPreview: (preview) => set({ liveVertexPreview: preview }),

  resetCadTool: () =>
    set({
      drawingMode: 'none',
      drawingCategory: 'building',
      drawingVerticesCount: 0,
      isEditMode: false,
      facadePointMode: false,
      showModifiersPanel: false,
      dimensions: [],
      isDimensionToolActive: false,
      dimensionPendingRef: null,
      isProjectBrushActive: false,
      alignPendingRef: null,
      viewRotationMode: false,
      viewRotationDeg: 0,
      savedViewRotationDeg: 0,
      isInteracting: false,
    }),
}));
