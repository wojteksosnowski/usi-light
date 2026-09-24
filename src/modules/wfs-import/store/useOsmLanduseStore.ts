/**
 * useOsmLanduseStore.ts
 *
 * Stan Zustand dla warstw zagospodarowania terenu OSM (Landuse).
 * Odpowiada za przechowywanie definicji warstw, właściwości renderowania (kolor, przezroczystość, widoczność),
 * pobranych cech geometrycznych oraz zarządzanie stanem pobierania.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Point2D } from '../../../types/geometry';
import { LatLon, CrsDetectionResult } from '../../../utils/geoTransform';
import { fetchOsmLanduse, OsmBbox } from '../services/osm/osmLanduseClient';
import { WfsTreeFeature, useWfsStore } from './useWfsStore';

export interface OsmLanduseFeature {
  id: string;
  layerId: string;
  name?: string;
  osmType: 'way' | 'relation';
  osmId: number;
  tags: Record<string, string>;
  geometryType?: 'polygon' | 'line';
  polygon?: Point2D[];
  holes?: Point2D[][];
  points?: Point2D[];
  areaM2?: number;
  lengthM?: number;
}

export interface OsmLanduseLayerConfig {
  id: string;
  name: string;
  description: string;
  color: string; // HEX lub RGBA (wypełnienie dla poligonów / kolor koron drzew)
  strokeColor: string; // HEX lub RGBA (obrys poligonów / kolor linii dla dróg)
  lineWidth?: number; // Szerokość linii dla geometrii liniowych (w px lub m)
  lineDash?: number[]; // Styl przerywany np. [6, 4]
  isLinear?: boolean; // Czy to warstwa o charakterze liniowym (drogi, tory, ścieżki)
  opacity: number; // 0.0 - 1.0
  isVisible: boolean;
  isLocked: boolean;
  order: number;
}

export const DEFAULT_OSM_LANDUSE_LAYERS: OsmLanduseLayerConfig[] = [
  {
    id: 'osm_landuse_water',
    name: 'Wody i zbiorniki',
    description: 'Rzeki, jeziora, stawy, baseny i zbiorniki retencyjne',
    color: '#38bdf8',
    strokeColor: '#0284c7',
    opacity: 0.35,
    isVisible: true,
    isLocked: false,
    order: 1,
  },
  {
    id: 'osm_landuse_forest',
    name: 'Lasy i zadrzewienia',
    description: 'Lasy, bory, zagajniki i zarośla',
    color: '#15803d',
    strokeColor: '#166534',
    opacity: 0.3,
    isVisible: true,
    isLocked: false,
    order: 2,
  },
  {
    id: 'osm_landuse_green',
    name: 'Parki, zieleńce i łąki',
    description: 'Parki miejskie, skwery, ogrody, łąki i trawniki',
    color: '#4ade80',
    strokeColor: '#22c55e',
    opacity: 0.28,
    isVisible: true,
    isLocked: false,
    order: 3,
  },
  {
    id: 'osm_landuse_farmland',
    name: 'Uprawy i tereny rolne',
    description: 'Pola uprawne, sady, ogródki działkowe i fermy',
    color: '#a3e635',
    strokeColor: '#84cc16',
    opacity: 0.25,
    isVisible: true,
    isLocked: false,
    order: 4,
  },
  {
    id: 'osm_landuse_sports',
    name: 'Sport i rekreacja',
    description: 'Boiska, stadiony, tory, place zabaw i ośrodki sportu',
    color: '#2dd4bf',
    strokeColor: '#0d9488',
    opacity: 0.28,
    isVisible: true,
    isLocked: false,
    order: 5,
  },
  {
    id: 'osm_landuse_civic',
    name: 'Edukacja i usługi publiczne',
    description: 'Szkoły, uczelnie, szpitale, urzędy i cmentarze',
    color: '#a855f7',
    strokeColor: '#9333ea',
    opacity: 0.25,
    isVisible: true,
    isLocked: false,
    order: 6,
  },
  {
    id: 'osm_landuse_residential',
    name: 'Tereny mieszkaniowe',
    description: 'Zabudowa mieszkaniowa jedno- i wielorodzinna',
    color: '#fbbf24',
    strokeColor: '#d97706',
    opacity: 0.22,
    isVisible: true,
    isLocked: false,
    order: 7,
  },
  {
    id: 'osm_landuse_commercial',
    name: 'Usługi i handel',
    description: 'Centra handlowe, biura i punkty usługowe',
    color: '#fb923c',
    strokeColor: '#ea580c',
    opacity: 0.25,
    isVisible: true,
    isLocked: false,
    order: 8,
  },
  {
    id: 'osm_landuse_industrial',
    name: 'Przemysł i infrastruktura',
    description: 'Zakłady produkcyjne, magazyny i tereny budowy',
    color: '#94a3b8',
    strokeColor: '#64748b',
    opacity: 0.25,
    isVisible: true,
    isLocked: false,
    order: 9,
  },
  {
    id: 'osm_parking',
    name: 'Parkingi i place',
    description: 'Parkingi naziemne, place postojowe i manewrowe',
    color: '#475569',
    strokeColor: '#64748b',
    opacity: 0.35,
    isVisible: true,
    isLocked: false,
    order: 10,
  },
  {
    id: 'osm_railways',
    name: 'Kolej i tramwaje',
    description: 'Tory kolejowe, linie tramwajowe i metra',
    color: '#64748b',
    strokeColor: '#64748b',
    lineWidth: 2.2,
    lineDash: [8, 4],
    isLinear: true,
    opacity: 0.85,
    isVisible: true,
    isLocked: false,
    order: 11,
  },
  {
    id: 'osm_roads_local',
    name: 'Drogi lokalne i dojazdowe',
    description: 'Ulice miejskie, osiedlowe, dojazdowe i strefy zamieszkania',
    color: '#cbd5e1',
    strokeColor: '#cbd5e1',
    lineWidth: 2,
    isLinear: true,
    opacity: 0.85,
    isVisible: true,
    isLocked: false,
    order: 12,
  },
  {
    id: 'osm_roads_highways',
    name: 'Drogi główne i tranzytowe',
    description: 'Autostrady, drogi ekspresowe, krajowe i wojewódzkie',
    color: '#ea580c',
    strokeColor: '#ea580c',
    lineWidth: 3.2,
    isLinear: true,
    opacity: 0.9,
    isVisible: true,
    isLocked: false,
    order: 13,
  },
  {
    id: 'osm_roads_paths',
    name: 'Ścieżki i chodniki',
    description: 'Chodniki, ścieżki rowerowe, ciągi piesze i drogi leśne',
    color: '#38bdf8',
    strokeColor: '#38bdf8',
    lineWidth: 1.3,
    lineDash: [4, 3],
    isLinear: true,
    opacity: 0.8,
    isVisible: true,
    isLocked: false,
    order: 14,
  },
  {
    id: 'osm_landuse_other',
    name: 'Inne obiekty OSM',
    description: 'Pozostałe formy zagospodarowania i obiekty',
    color: '#cbd5e1',
    strokeColor: '#94a3b8',
    opacity: 0.2,
    isVisible: true,
    isLocked: false,
    order: 15,
  },
  {
    id: 'osm_trees',
    name: 'Drzewa i zieleń wysoka',
    description: 'Pojedyncze drzewa, szpalery, korony i pomniki przyrody',
    color: '#22c55e',
    strokeColor: '#16a34a',
    opacity: 0.75,
    isVisible: true,
    isLocked: false,
    order: 16,
  },
];

interface OsmLanduseState {
  layers: OsmLanduseLayerConfig[];
  features: OsmLanduseFeature[];
  trees: WfsTreeFeature[];
  selectedLayerId: string | null;
  isFetching: boolean;
  error: string | null;
  lastBbox: OsmBbox | null;
  bufferedCenter: LatLon | null;
  bufferedRadius: number | null;

  // Master visibility toggle
  showOsmLanduseGroup: boolean;

  // Actions
  setShowOsmLanduseGroup: (show: boolean) => void;
  setSelectedLayerId: (layerId: string | null) => void;
  toggleLayerVisibility: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
  updateLayerConfig: (layerId: string, patch: Partial<OsmLanduseLayerConfig>) => void;
  setAllLayersVisibility: (visible: boolean) => void;
  setFeatures: (features: OsmLanduseFeature[]) => void;
  setTrees: (trees: WfsTreeFeature[]) => void;
  shiftFeatures: (delta: Point2D) => void;
  clearFeatures: () => void;
  isBufferValid: (center: LatLon, radius: number) => boolean;
  fetchLanduse: (
    bbox: OsmBbox,
    projectCenter: LatLon,
    projectCrs: CrsDetectionResult,
    radius?: number
  ) => Promise<void>;
}

export const useOsmLanduseStore = create<OsmLanduseState>()(
  persist(
    (set, get) => ({
      layers: DEFAULT_OSM_LANDUSE_LAYERS,
      features: [],
      trees: [],
      selectedLayerId: null,
      isFetching: false,
      error: null,
      lastBbox: null,
      bufferedCenter: null,
      bufferedRadius: null,
      showOsmLanduseGroup: true,

      setShowOsmLanduseGroup: (show) => {
        set({ showOsmLanduseGroup: show });
        // Synchronizuj widoczność globalnej warstwy drzew
        useWfsStore.getState().setShowTreesLayer(show);
      },

      setSelectedLayerId: (layerId) => set({ selectedLayerId: layerId }),

      toggleLayerVisibility: (layerId) => {
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === layerId ? { ...l, isVisible: !l.isVisible } : l
          ),
        }));
        if (layerId === 'osm_trees') {
          const treeLayer = get().layers.find((l) => l.id === 'osm_trees');
          useWfsStore.getState().setShowTreesLayer(treeLayer ? treeLayer.isVisible : true);
        }
      },

      toggleLayerLock: (layerId) =>
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === layerId ? { ...l, isLocked: !l.isLocked } : l
          ),
        })),

      updateLayerConfig: (layerId, patch) =>
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === layerId ? { ...l, ...patch } : l
          ),
        })),

      setAllLayersVisibility: (visible) => {
        set((state) => ({
          layers: state.layers.map((l) => ({ ...l, isVisible: visible })),
        }));
        useWfsStore.getState().setShowTreesLayer(visible);
      },

      setFeatures: (features) => set({ features }),
      setTrees: (trees) => {
        set({ trees });
        useWfsStore.getState().setTrees(trees);
      },

      shiftFeatures: (delta) => {
        if (delta.x === 0 && delta.y === 0) return;
        set((state) => ({
          features: state.features.map((f) => ({
            ...f,
            polygon: f.polygon
              ? f.polygon.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
              : undefined,
            holes: f.holes
              ? f.holes.map((h) =>
                  h.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
                )
              : undefined,
            points: f.points
              ? f.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
              : undefined,
          })),
          trees: state.trees.map((t) => ({
            ...t,
            position: { x: t.position.x + delta.x, y: t.position.y + delta.y },
          })),
        }));
      },

      clearFeatures: () => {
        set({ features: [], trees: [], error: null, lastBbox: null, bufferedCenter: null, bufferedRadius: null });
        useWfsStore.getState().setTrees([]);
      },

      isBufferValid: (center, radius) => {
        const state = get();
        if (state.features.length === 0 && state.trees.length === 0) return false;
        if (!state.bufferedCenter || !state.bufferedRadius) return false;
        const dLat = Math.abs(state.bufferedCenter.lat - center.lat);
        const dLon = Math.abs(state.bufferedCenter.lon - center.lon);
        const isClose = dLat < 0.0003 && dLon < 0.0004;
        return isClose && state.bufferedRadius >= radius;
      },

      fetchLanduse: async (bbox, projectCenter, projectCrs, radius) => {
        set({ isFetching: true, error: null });
        try {
          const result = await fetchOsmLanduse(bbox, projectCenter, projectCrs, radius);
          set({
            features: result.features,
            trees: result.trees,
            isFetching: false,
            error: null,
            lastBbox: bbox,
            bufferedCenter: projectCenter,
            bufferedRadius: radius || 200,
          });
          // Synchronizuj drzewa do globalnego stanu projektu WFS
          if (result.trees.length > 0) {
            useWfsStore.getState().setTrees(result.trees);
            useWfsStore.getState().setShowTreesLayer(true);
          }
        } catch (err) {
          set({
            isFetching: false,
            error: err instanceof Error ? err.message : 'Błąd pobierania danych OSM',
          });
          throw err;
        }
      },
    }),
    {
      name: 'usi-osm-landuse-store',
      version: 3,
      migrate: (persistedState: any) => {
        if (!persistedState || !persistedState.layers) {
          return { layers: DEFAULT_OSM_LANDUSE_LAYERS, showOsmLanduseGroup: true };
        }
        // Merge missing default layers into persisted state
        const existingIds = new Set(persistedState.layers.map((l: any) => l.id));
        const mergedLayers = [...persistedState.layers];
        for (const defLayer of DEFAULT_OSM_LANDUSE_LAYERS) {
          if (!existingIds.has(defLayer.id)) {
            mergedLayers.push(defLayer);
          }
        }
        return {
          ...persistedState,
          layers: mergedLayers,
        };
      },
      partialize: (state) => ({
        layers: state.layers,
        showOsmLanduseGroup: state.showOsmLanduseGroup,
      }),
    }
  )
);
