import { create } from 'zustand';
import { Point2D, BuildingLoop } from '../../../types/geometry';

export interface WfsTreeFeature {
  id: number;
  position: Point2D;
  inventoryNumber: string;
  namePolish: string;
  nameLatin: string;
  height: number;
  trunkCircumference: string;
  managingUnit: string;
  updatedAt: string;
}

export type WfsImportStage = 'idle' | 'parcels' | 'buildings' | 'trees' | 'done';

export interface WfsImportStatus {
  isFetching: boolean;
  stage: WfsImportStage;
  progressDone: number;
  progressTotal: number;
  buildingsCount: number;
  parcelsCount: number;
  treesCount: number;
  error: string | null;
  info: string | null;
}

export interface WfsImportOptions {
  buildings: boolean;
  parcels: boolean;
  trees: boolean;
  terrainShading: boolean;
  egibOverlay: boolean;
}

export type ProjectRadius = 50 | 100 | 200 | 300;

interface WfsState {
  trees: WfsTreeFeature[];
  status: WfsImportStatus;
  options: WfsImportOptions;

  // Środek projektu & promień
  projectRadius: ProjectRadius;
  isProjectCenterLocked: boolean;

  // Warstwy podkładów geodezyjnych i branżowych (PRO)
  showGeoOverlayGroup: boolean; // Master toggle
  showOrthophotoLayer: boolean;
  orthophotoOpacity: number;
  showKiutLayer: boolean;
  kiutOpacity: number;
  showMpzpLayer: boolean;
  mpzpOpacity: number;
  showBdotLayer: boolean;
  bdotOpacity: number;
  showTerrainLayer: boolean;
  terrainOpacity: number;
  showEgibLayer: boolean;
  egibOpacity: number;
  showTreesLayer: boolean;

  lastImportBbox: [number, number, number, number] | null;

  loadingParcels: BuildingLoop[];
  addLoadingParcels: (loops: BuildingLoop[]) => void;
  clearLoadingParcels: () => void;

  setTrees: (trees: WfsTreeFeature[]) => void;
  setStatus: (patch: Partial<WfsImportStatus>) => void;
  setOptions: (patch: Partial<WfsImportOptions>) => void;
  setProjectRadius: (radius: ProjectRadius) => void;
  setIsProjectCenterLocked: (locked: boolean) => void;

  setShowGeoOverlayGroup: (show: boolean) => void;
  setShowOrthophotoLayer: (show: boolean) => void;
  setOrthophotoOpacity: (val: number) => void;
  setShowKiutLayer: (show: boolean) => void;
  setKiutOpacity: (val: number) => void;
  setShowMpzpLayer: (show: boolean) => void;
  setMpzpOpacity: (val: number) => void;
  setShowBdotLayer: (show: boolean) => void;
  setBdotOpacity: (val: number) => void;
  setShowTerrainLayer: (show: boolean) => void;
  setTerrainOpacity: (val: number) => void;
  setShowEgibLayer: (show: boolean) => void;
  setEgibOpacity: (val: number) => void;
  setShowTreesLayer: (show: boolean) => void;

  setLastImportBbox: (bbox: [number, number, number, number] | null) => void;
  resetStatus: () => void;
}

const defaultStatus: WfsImportStatus = {
  isFetching: false,
  stage: 'idle',
  progressDone: 0,
  progressTotal: 0,
  buildingsCount: 0,
  parcelsCount: 0,
  treesCount: 0,
  error: null,
  info: null,
};

const STAGE_LABELS: Record<WfsImportStage, string> = {
  idle: '',
  parcels: 'Pobieranie działek…',
  buildings: 'Pobieranie budynków…',
  trees: 'Pobieranie drzew…',
  done: 'Zakończono',
};

export const WFS_IMPORT_CONTINUE_HINT = 'Możesz kontynuować pracę — dane zostaną dodane po zakończeniu.';

export function formatWfsProgress(status: WfsImportStatus): string {
  const label = STAGE_LABELS[status.stage] || 'Pobieranie danych…';
  if (status.progressTotal > 0) {
    const pct = Math.round((status.progressDone / status.progressTotal) * 100);
    return `${label} ${status.progressDone} z ${status.progressTotal} punktów (${pct}%)`;
  }
  return label;
}

export const useWfsStore = create<WfsState>((set) => ({
  trees: [],
  status: { ...defaultStatus },
  options: {
    buildings: true,
    parcels: true,
    trees: false,
    terrainShading: false,
    egibOverlay: false,
  },

  projectRadius: 200,
  isProjectCenterLocked: true,

  showGeoOverlayGroup: false,
  showOrthophotoLayer: false,
  orthophotoOpacity: 0.85,
  showKiutLayer: false,
  kiutOpacity: 0.65,
  showMpzpLayer: false,
  mpzpOpacity: 0.5,
  showBdotLayer: false,
  bdotOpacity: 0.6,
  showTerrainLayer: false,
  terrainOpacity: 0.35,
  showEgibLayer: false,
  egibOpacity: 0.45,
  showTreesLayer: false,

  lastImportBbox: null,

  loadingParcels: [],
  addLoadingParcels: (loops) =>
    set((state) => ({ loadingParcels: [...state.loadingParcels, ...loops] })),
  clearLoadingParcels: () => set({ loadingParcels: [] }),

  setTrees: (trees) => set({ trees }),
  setStatus: (patch) =>
    set((state) => ({ status: { ...state.status, ...patch } })),
  setOptions: (patch) =>
    set((state) => ({ options: { ...state.options, ...patch } })),

  setProjectRadius: (radius) => set({ projectRadius: radius }),
  setIsProjectCenterLocked: (locked) => set({ isProjectCenterLocked: locked }),

  setShowGeoOverlayGroup: (show) => set({ showGeoOverlayGroup: show }),
  setShowOrthophotoLayer: (show) => set({ showOrthophotoLayer: show }),
  setOrthophotoOpacity: (val) => set({ orthophotoOpacity: val }),
  setShowKiutLayer: (show) => set({ showKiutLayer: show }),
  setKiutOpacity: (val) => set({ kiutOpacity: val }),
  setShowMpzpLayer: (show) => set({ showMpzpLayer: show }),
  setMpzpOpacity: (val) => set({ mpzpOpacity: val }),
  setShowBdotLayer: (show) => set({ showBdotLayer: show }),
  setBdotOpacity: (val) => set({ bdotOpacity: val }),
  setShowTerrainLayer: (show) => set({ showTerrainLayer: show }),
  setTerrainOpacity: (val) => set({ terrainOpacity: val }),
  setShowEgibLayer: (show) => set({ showEgibLayer: show }),
  setEgibOpacity: (val) => set({ egibOpacity: val }),
  setShowTreesLayer: (show) => set({ showTreesLayer: show }),

  setLastImportBbox: (bbox) => set({ lastImportBbox: bbox }),
  resetStatus: () => set({ status: { ...defaultStatus } }),
}));
