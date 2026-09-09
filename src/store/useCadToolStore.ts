import { create } from 'zustand';
import { DimensionItem, DimensionReference, DimensionType, Point2D } from '../types/geometry';
import { SweepAlignment } from '../utils/math2d/sweep';
import { APP_CONFIG } from '../config/appConfig';
import { useSceneStore } from './useSceneStore';

interface CadToolState {
  // Drawing Tools
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'align' | 'union';
  drawingVerticesCount: number;

  // Sweep (Wstęga) settings
  sweepWidth: number;
  sweepAlignment: SweepAlignment;

  // Edge editing & facade point mode
  isEditMode: boolean;
  facadePointMode: boolean;
  showModifiersPanel: boolean;

  // Snapping settings
  isDirectionSnappingActive: boolean;
  isOsnapActive: boolean;

  // Dimensions
  dimensions: DimensionItem[];
  isDimensionToolActive: boolean;
  dimensionType: DimensionType;
  dimensionPendingRef: DimensionReference | null;

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

  // Actions
  setDrawingMode: (mode: 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'align' | 'union') => void;
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

  // Dimension actions
  setDimensions: (dims: DimensionItem[] | ((prev: DimensionItem[]) => DimensionItem[])) => void;
  setIsDimensionToolActive: (active: boolean) => void;
  setDimensionType: (type: DimensionType) => void;
  setDimensionPendingRef: (ref: DimensionReference | null) => void;
  handleDimensionClickEdge: (buildingId: string, segmentId: string) => void;
  cancelDimension: () => void;

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
}

export const useCadToolStore = create<CadToolState>((set, get) => ({
  drawingMode: 'none',
  drawingVerticesCount: 0,

  sweepWidth: 5.0,
  sweepAlignment: 'center',

  isEditMode: false,
  facadePointMode: false,
  showModifiersPanel: false,

  isDirectionSnappingActive: APP_CONFIG.directionSnapping.enabledDefault,
  isOsnapActive: APP_CONFIG.osnap?.enabledDefault ?? true,

  dimensions: [],
  isDimensionToolActive: false,
  dimensionType: 'linear',
  dimensionPendingRef: null,

  alignPendingRef: null,

  viewRotationMode: false,
  viewRotationDeg: 0,
  savedViewRotationDeg: 0,
  fitRequest: { nonce: 0, ignoreSelection: false },

  isInteracting: false,

  setDrawingMode: (mode) => set({ drawingMode: mode }),
  setDrawingVerticesCount: (count) => set({ drawingVerticesCount: count }),
  setSweepWidth: (width) => set({ sweepWidth: Math.max(0.1, Number.isFinite(width) ? width : 5.0) }),
  setSweepAlignment: (alignment) => set({ sweepAlignment: alignment }),
  setIsEditMode: (active) => set({ isEditMode: active }),
  setFacadePointMode: (active) => set({ facadePointMode: active }),
  setShowModifiersPanel: (show) =>
    set((state) => ({
      showModifiersPanel: typeof show === 'function' ? show(state.showModifiersPanel) : show,
    })),

  toggleOsnap: () => set((state) => ({ isOsnapActive: !state.isOsnapActive })),
  setIsOsnapActive: (active) => set({ isOsnapActive: active }),
  toggleDirectionSnapping: () => set((state) => ({ isDirectionSnappingActive: !state.isDirectionSnappingActive })),
  setIsDirectionSnappingActive: (active) => set({ isDirectionSnappingActive: active }),

  setDimensions: (updater) => {
    set((state) => ({
      dimensions: typeof updater === 'function' ? updater(state.dimensions) : updater,
    }));
  },

  setIsDimensionToolActive: (active) => set({ isDimensionToolActive: active, dimensionPendingRef: null }),
  setDimensionType: (type) => set({ dimensionType: type }),
  setDimensionPendingRef: (ref) => set({ dimensionPendingRef: ref }),

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
  },
}));
