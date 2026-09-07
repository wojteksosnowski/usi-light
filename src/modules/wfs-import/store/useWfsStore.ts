import { create } from 'zustand';
import { Point2D } from '../../../types/geometry';

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

export interface WfsImportStatus {
  isFetching: boolean;
  buildingsCount: number;
  parcelsCount: number;
  treesCount: number;
  error: string | null;
}

export interface WfsImportOptions {
  buildings: boolean;
  parcels: boolean;
  trees: boolean;
  terrainShading: boolean;
  egibOverlay: boolean;
}

interface WfsState {
  trees: WfsTreeFeature[];
  status: WfsImportStatus;
  options: WfsImportOptions;
  showTerrainLayer: boolean;
  showTreesLayer: boolean;
  showEgibLayer: boolean;
  lastImportBbox: [number, number, number, number] | null;

  setTrees: (trees: WfsTreeFeature[]) => void;
  setStatus: (patch: Partial<WfsImportStatus>) => void;
  setOptions: (patch: Partial<WfsImportOptions>) => void;
  setShowTerrainLayer: (show: boolean) => void;
  setShowTreesLayer: (show: boolean) => void;
  setShowEgibLayer: (show: boolean) => void;
  setLastImportBbox: (bbox: [number, number, number, number] | null) => void;
  resetStatus: () => void;
}

const defaultStatus: WfsImportStatus = {
  isFetching: false,
  buildingsCount: 0,
  parcelsCount: 0,
  treesCount: 0,
  error: null,
};

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
  showTerrainLayer: false,
  showTreesLayer: false,
  showEgibLayer: false,
  lastImportBbox: null,

  setTrees: (trees) => set({ trees }),

  setStatus: (patch) =>
    set((state) => ({ status: { ...state.status, ...patch } })),

  setOptions: (patch) =>
    set((state) => ({ options: { ...state.options, ...patch } })),

  setShowTerrainLayer: (show) => set({ showTerrainLayer: show }),
  setShowTreesLayer: (show) => set({ showTreesLayer: show }),
  setShowEgibLayer: (show) => set({ showEgibLayer: show }),

  setLastImportBbox: (bbox) => set({ lastImportBbox: bbox }),

  resetStatus: () => set({ status: { ...defaultStatus } }),
}));
