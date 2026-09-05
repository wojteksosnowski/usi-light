import { create } from 'zustand';
import { ProjectSettings, PinnedFacadePoint, AnalysisPointResult } from '../types/geometry';
import { AnalysisBatchOutput } from '../engine/analysisEngine';

export type AccuracyStage = 'live' | 'stage1' | 'stage2' | 'final';

export interface PolishCity {
  name: string;
  lat: number;
  lon: number;
}

export const POLISH_CITIES: PolishCity[] = [
  { name: 'Warszawa', lat: 52.2297, lon: 21.0122 },
  { name: 'Gdańsk',   lat: 54.3520, lon: 18.6466 },
  { name: 'Wrocław',  lat: 51.1079, lon: 17.0385 },
  { name: 'Kraków',   lat: 50.0647, lon: 19.9450 },
  { name: 'Poznań',   lat: 52.4064, lon: 16.9252 },
];

interface SolarAnalysisState {
  settings: ProjectSettings;
  selectedCity: string;
  mapsInput: string;
  mapsParseError: boolean;

  // Analysis display options
  showNormals: boolean;
  showShadowingLines: boolean;
  showSunlightLines: boolean;
  showAnalysisPoints: boolean;
  showShadowRange: boolean;
  showShadowFill: boolean;
  showSatelliteLayer: boolean;
  satelliteOpacity: number;

  // Analysis calculations & modes
  sunlightMethod: 'raycasting' | 'segments';
  accuracyStage: AccuracyStage;
  analysisOutput: AnalysisBatchOutput;
  isCalculating: boolean;

  // Pinned points
  pinnedPoints: PinnedFacadePoint[];
  activePinnedPointId: string | null;
  activePointMode: 'shadowing' | 'sunlight';
  selectedPointResult: AnalysisPointResult | null;

  // Actions
  setSettings: (settings: ProjectSettings | ((prev: ProjectSettings) => ProjectSettings)) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  setSelectedCity: (city: string) => void;
  setMapsInput: (input: string) => void;
  setMapsParseError: (err: boolean) => void;

  setShowNormals: (show: boolean | ((prev: boolean) => boolean)) => void;
  setShowShadowingLines: (show: boolean | ((prev: boolean) => boolean)) => void;
  setShowSunlightLines: (show: boolean | ((prev: boolean) => boolean)) => void;
  setShowAnalysisPoints: (show: boolean | ((prev: boolean) => boolean)) => void;
  setShowShadowRange: (show: boolean | ((prev: boolean) => boolean)) => void;
  setShowShadowFill: (show: boolean | ((prev: boolean) => boolean)) => void;
  setShowSatelliteLayer: (show: boolean | ((prev: boolean) => boolean)) => void;
  setSatelliteOpacity: (opacity: number) => void;

  setSunlightMethod: (method: 'raycasting' | 'segments') => void;
  setAccuracyStage: (stage: AccuracyStage) => void;
  setAnalysisOutput: (output: AnalysisBatchOutput) => void;
  setIsCalculating: (calculating: boolean) => void;

  setPinnedPoints: (pts: PinnedFacadePoint[] | ((prev: PinnedFacadePoint[]) => PinnedFacadePoint[])) => void;
  setActivePinnedPointId: (id: string | null) => void;
  setActivePointMode: (mode: 'shadowing' | 'sunlight') => void;
  setSelectedPointResult: (res: AnalysisPointResult | null) => void;

  addPinnedPoint: (pt: { buildingId: string; segmentId: string; offsetRatio: number }) => void;
  deletePinnedPoint: (id: string) => void;
  updatePinnedPoint: (id: string, buildingId: string, segmentId: string, offsetRatio: number) => void;
  clearPinnedPoints: () => void;
}

export const useSolarAnalysisStore = create<SolarAnalysisState>((set, get) => ({
  settings: {
    latitude: 52.2297,
    longitude: 21.0122,
    isCityCentreDefault: false,
    samplingInterval: 0.25,
    equinoxDate: 'spring',
  },
  selectedCity: 'Warszawa',
  mapsInput: '',
  mapsParseError: false,

  showNormals: false,
  showShadowingLines: true,
  showSunlightLines: true,
  showAnalysisPoints: true,
  showShadowRange: true,
  showShadowFill: false,
  showSatelliteLayer: true,
  satelliteOpacity: 0.65,

  // Linijka Słońca jest domyślną metodą obliczeń w '56'
  sunlightMethod: 'segments',
  accuracyStage: 'final',
  analysisOutput: {
    results: [],
    avgShadowingMs: 0,
    avgSunlightMs: 0,
    avgSunlightSegMs: 0,
    totalShadowingTimeMs: 0,
    totalSunlightTimeMs: 0,
    shadowEnvelopeMs: 0,
    totalAnalysisMs: 0,
    totalPoints: 0,
  },
  isCalculating: false,

  pinnedPoints: [],
  activePinnedPointId: null,
  activePointMode: 'shadowing',
  selectedPointResult: null,

  setSettings: (updater) =>
    set((state) => ({
      settings: typeof updater === 'function' ? updater(state.settings) : updater,
    })),

  updateSettings: (patch) =>
    set((state) => ({
      settings: { ...state.settings, ...patch },
    })),

  setSelectedCity: (city) => set({ selectedCity: city }),
  setMapsInput: (input) => set({ mapsInput: input }),
  setMapsParseError: (err) => set({ mapsParseError: err }),

  setShowNormals: (updater) =>
    set((state) => ({
      showNormals: typeof updater === 'function' ? updater(state.showNormals) : updater,
    })),

  setShowShadowingLines: (updater) =>
    set((state) => ({
      showShadowingLines: typeof updater === 'function' ? updater(state.showShadowingLines) : updater,
    })),

  setShowSunlightLines: (updater) =>
    set((state) => ({
      showSunlightLines: typeof updater === 'function' ? updater(state.showSunlightLines) : updater,
    })),

  setShowAnalysisPoints: (updater) =>
    set((state) => ({
      showAnalysisPoints: typeof updater === 'function' ? updater(state.showAnalysisPoints) : updater,
    })),

  setShowShadowRange: (updater) =>
    set((state) => ({
      showShadowRange: typeof updater === 'function' ? updater(state.showShadowRange) : updater,
    })),

  setShowShadowFill: (updater) =>
    set((state) => ({
      showShadowFill: typeof updater === 'function' ? updater(state.showShadowFill) : updater,
    })),

  setShowSatelliteLayer: (updater) =>
    set((state) => ({
      showSatelliteLayer: typeof updater === 'function' ? updater(state.showSatelliteLayer) : updater,
    })),

  setSatelliteOpacity: (opacity) => set({ satelliteOpacity: opacity }),

  setSunlightMethod: (method) => set({ sunlightMethod: method }),
  setAccuracyStage: (stage) => set({ accuracyStage: stage }),
  setAnalysisOutput: (output) => set({ analysisOutput: output }),
  setIsCalculating: (calculating) => set({ isCalculating: calculating }),

  setPinnedPoints: (updater) =>
    set((state) => ({
      pinnedPoints: typeof updater === 'function' ? updater(state.pinnedPoints) : updater,
    })),

  setActivePinnedPointId: (id) => set({ activePinnedPointId: id }),
  setActivePointMode: (mode) => set({ activePointMode: mode }),
  setSelectedPointResult: (res) => set({ selectedPointResult: res }),

  addPinnedPoint: ({ buildingId, segmentId, offsetRatio }) => {
    const { pinnedPoints } = get();
    const existingIndex = pinnedPoints.findIndex(
      (p) => p.buildingId === buildingId && p.segmentId === segmentId
    );

    if (existingIndex >= 0) {
      set((state) => ({
        pinnedPoints: state.pinnedPoints.map((p, idx) =>
          idx === existingIndex ? { ...p, offsetRatio } : p
        ),
        activePinnedPointId: state.pinnedPoints[existingIndex].id,
      }));
    } else {
      const newPt: PinnedFacadePoint = {
        id: `pinned-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        buildingId,
        segmentId,
        offsetRatio,
        label: `P${pinnedPoints.length + 1}`,
      };
      set((state) => ({
        pinnedPoints: [...state.pinnedPoints, newPt],
        activePinnedPointId: newPt.id,
      }));
    }
  },

  deletePinnedPoint: (id) => {
    set((state) => {
      const filtered = state.pinnedPoints.filter((p) => p.id !== id);
      const reindexed = filtered.map((p, idx) => ({ ...p, label: `P${idx + 1}` }));
      return {
        pinnedPoints: reindexed,
        activePinnedPointId: state.activePinnedPointId === id ? (reindexed[0]?.id ?? null) : state.activePinnedPointId,
      };
    });
  },

  updatePinnedPoint: (id, buildingId, segmentId, offsetRatio) => {
    set((state) => ({
      pinnedPoints: state.pinnedPoints.map((p) =>
        p.id === id ? { ...p, buildingId, segmentId, offsetRatio } : p
      ),
    }));
  },

  clearPinnedPoints: () => set({ pinnedPoints: [], activePinnedPointId: null }),
}));
