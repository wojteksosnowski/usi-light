import { create } from 'zustand';
import { DEFAULT_SWEEP_WIDTH, DimensionItem, DimensionReference, DimensionType, Point2D } from '../types/geometry';
import { SweepAlignment } from '../utils/math2d/sweep';
import { APP_CONFIG } from '../config/appConfig';
import { useSceneStore } from './useSceneStore';
import { DEFAULT_SNAP_ENGINE_CONFIG, SnapType, EDGE_UCS_DEADBAND_DEG } from '../engine/snapping/types';
export type DrawingMode = 'none' | 'rectangle' | 'polyline' | 'sweep' | 'vertexEdit' | 'align';

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

  // Silnik SNAP/OSNAP — parametry z SnapEngineConfig (spec §5) i K_cat (spec §3, computeCategoryAffinityBonus),
  // wcześniej zahardkodowane w SnapCoordinator/types.ts, teraz sterowalne z panelu "Dociąganie".
  snapApertureRadiusPx: number; // R_aperture
  snapProjectRadiusMeters: number; // R_proj
  snapEdgeUcsDeadbandDeg: number; // Deadband EDGE_UCS/OTRACK (przechowywany w stopniach dla UI)
  snapTypeWeights: Partial<Record<SnapType, number>>; // M_type — podzbiór widoczny w UI
  snapCategorySameWeightPx: number; // K_cat: ta sama kategoria
  snapCategoryBalconyToBuildingWeightPx: number; // K_cat: balkon → budynek
  snapCategoryBuildingToBoundaryWeightPx: number; // K_cat: budynek → granica działki

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
  // Aktywny układ współrzędnych: WORLDUCS (0°) / USERUCS (ręczny) / EDGEUCS (z dominującej krawędzi)
  ucsMode: 'world' | 'user' | 'edge';
  // Kąt EDGEUCS wyliczony z analyzeSegmentsStatistics (dominantDirections[0]); null gdy brak
  // rozróżnialnej dominanty (isTrackingActive === false) — wtedy tryb 'edge' degraduje do 0°.
  computedEdgeUcsAngleDeg: number | null;
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

  setSnapApertureRadiusPx: (px: number) => void;
  setSnapProjectRadiusMeters: (m: number) => void;
  setSnapEdgeUcsDeadbandDeg: (deg: number) => void;
  setSnapTypeWeight: (type: SnapType, weight: number) => void;
  setSnapCategorySameWeightPx: (px: number) => void;
  setSnapCategoryBalconyToBuildingWeightPx: (px: number) => void;
  setSnapCategoryBuildingToBoundaryWeightPx: (px: number) => void;
  resetSnapEngineDefaults: () => void;

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
  setComputedEdgeUcsAngleDeg: (deg: number | null) => void;
  setUcsMode: (mode: 'world' | 'user' | 'edge') => void;
  cycleUcsMode: () => void;
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

  snapApertureRadiusPx: DEFAULT_SNAP_ENGINE_CONFIG.apertureRadiusPx,
  snapProjectRadiusMeters: DEFAULT_SNAP_ENGINE_CONFIG.projectRadius,
  snapEdgeUcsDeadbandDeg: EDGE_UCS_DEADBAND_DEG,
  snapTypeWeights: {
    vertex: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.vertex,
    otrack_intersection: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.otrack_intersection,
    perpendicular: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.perpendicular,
    extension: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.extension,
    edge: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.edge,
  },
  snapCategorySameWeightPx: 5.0,
  snapCategoryBalconyToBuildingWeightPx: 6.0,
  snapCategoryBuildingToBoundaryWeightPx: 2.0,
  dimensions: [],
  isDimensionToolActive: false,
  dimensionType: 'linear',
  dimensionPendingRef: null,

  isProjectBrushActive: false,

  alignPendingRef: null,

  viewRotationMode: false,
  viewRotationDeg: 0,
  savedViewRotationDeg: 0,
  ucsMode: 'world',
  computedEdgeUcsAngleDeg: null,
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

  setSnapApertureRadiusPx: (px) => set({ snapApertureRadiusPx: px }),
  setSnapProjectRadiusMeters: (m) => set({ snapProjectRadiusMeters: m }),
  setSnapEdgeUcsDeadbandDeg: (deg) => set({ snapEdgeUcsDeadbandDeg: deg }),
  setSnapTypeWeight: (type, weight) =>
    set((state) => ({ snapTypeWeights: { ...state.snapTypeWeights, [type]: weight } })),
  setSnapCategorySameWeightPx: (px) => set({ snapCategorySameWeightPx: px }),
  setSnapCategoryBalconyToBuildingWeightPx: (px) => set({ snapCategoryBalconyToBuildingWeightPx: px }),
  setSnapCategoryBuildingToBoundaryWeightPx: (px) => set({ snapCategoryBuildingToBoundaryWeightPx: px }),
  resetSnapEngineDefaults: () =>
    set({
      snapApertureRadiusPx: DEFAULT_SNAP_ENGINE_CONFIG.apertureRadiusPx,
      snapProjectRadiusMeters: DEFAULT_SNAP_ENGINE_CONFIG.projectRadius,
      snapEdgeUcsDeadbandDeg: EDGE_UCS_DEADBAND_DEG,
      snapTypeWeights: {
        vertex: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.vertex,
        otrack_intersection: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.otrack_intersection,
        perpendicular: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.perpendicular,
        extension: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.extension,
        edge: DEFAULT_SNAP_ENGINE_CONFIG.typeWeights.edge,
      },
      snapCategorySameWeightPx: 5.0,
      snapCategoryBalconyToBuildingWeightPx: 6.0,
      snapCategoryBuildingToBoundaryWeightPx: 2.0,
    }),

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

  setComputedEdgeUcsAngleDeg: (deg) => set({ computedEdgeUcsAngleDeg: deg }),
  setUcsMode: (mode) => set({ ucsMode: mode }),

  cycleUcsMode: () => {
    set((state) => {
      const order: Array<'world' | 'user' | 'edge'> = ['world', 'user', 'edge'];
      const nextMode = order[(order.indexOf(state.ucsMode) + 1) % order.length];

      // Zapamiętaj bieżący kąt jako USERUCS, jeśli opuszczamy tryb ręczny z niezerowym kątem
      const savedViewRotationDeg =
        state.ucsMode === 'user' && Math.abs(state.viewRotationDeg) > 0.001
          ? state.viewRotationDeg
          : state.savedViewRotationDeg;

      let nextViewRotationDeg = 0;
      if (nextMode === 'user') {
        nextViewRotationDeg = savedViewRotationDeg;
      } else if (nextMode === 'edge') {
        nextViewRotationDeg = state.computedEdgeUcsAngleDeg ?? 0;
      }

      return {
        ucsMode: nextMode,
        savedViewRotationDeg,
        viewRotationDeg: nextViewRotationDeg,
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
      ucsMode: 'world',
      isInteracting: false,
    }),
}));
