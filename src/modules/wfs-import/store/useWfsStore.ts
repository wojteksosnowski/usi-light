import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

/** Cecha liniowa (drogi/koleje) z tematu Overture `transportation`, we współrzędnych CAD lokalnych. */
export interface OvertureLineFeature {
  id: string;
  points: Point2D[];
  className: string | null;
}

/**
 * Cecha powierzchniowa (zieleń — land_use/land_cover, lub wody — type=water) z tematu Overture
 * `base`, we współrzędnych CAD lokalnych. Zieleń pochodzi z `api.overturemapsapi.com` (`/base`),
 * wody z surowych partycji Overture przez `overtureDuckDb.ts` (wrapper REST ich nie eksponuje).
 */
export interface OverturePolygonFeature {
  id: string;
  rings: Point2D[][];
  className: string | null;
}

/**
 * Strefa MPZP (miejscowy plan zagospodarowania przestrzennego) z usługi REST BGiK m.st. Warszawy
 * "PrzeznaczenieTerenow" (patrz `wfsMpzpWarsawClient.ts`) — geometria + atrybuty przeznaczenia
 * terenu, we współrzędnych CAD lokalnych. Pilot ograniczony do Warszawy.
 */
export interface MpzpZoneFeature {
  id: string;
  rings: Point2D[][];
  funSymb: string | null;
  funNazwa: string | null;
  maxWysokosc: string | null;
  intenZab: string | null;
  powBio: string | null;
  liczKond: string | null;
  nazwaPlan: string | null;
}

/**
 * Jednostka pokrycia terenu z ogólnopolskiej usługi WFS GUGiK "wfsLCV" (INSPIRE Land Cover,
 * `lcv:LandCoverUnit`, źródło BDOT10k) — patrz `wfsLcvClient.ts`. W przeciwieństwie do
 * `MpzpZoneFeature.rings` (płaska lista pierścieni, bez rozróżnienia obrys/otwór) geometria
 * jest tu zapisana jako obrys + otwory (jak `BuildingLoop.holes`), bo te wielokąty realnie
 * mają enklawy/wyspy — płaski rendering "każdy pierścień osobno" zamalowałby otwór.
 */
export interface LandCoverFeature {
  id: string;
  outer: Point2D[];
  holes?: Point2D[][];
  /** Sufiks URI klasyfikacji, np. "grass", "arableLand", "flowingWater" (patrz `landCoverRenderer.ts`). */
  landCoverClass: string | null;
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
  // Warstwy KIUT/BDOT są renderowane przez GUGiK z myślą o białym tle (STYLES= puste, brak
  // wariantu na ciemne tło) — nieczytelne na ciemnym płótnie CAD bez korekcji kolorów po
  // stronie klienta (patrz `wmsOverlayRenderer.ts` `invertColors`).
  kiutInvertColors: boolean;
  showMpzpLayer: boolean;
  mpzpOpacity: number;
  showBdotLayer: boolean;
  bdotOpacity: number;
  bdotInvertColors: boolean;
  showTerrainLayer: boolean;
  terrainOpacity: number;
  showTreesLayer: boolean;

  // Warstwa kontekstowa Overture Maps (zieleń — land_use/land_cover) przez
  // `api.overturemapsapi.com` (`/base`). Drogi/koleje/wody przez surowe partycje Overture
  // (`overtureDuckDb.ts`, DuckDB-WASM) świadomie wycofane z UI — w praktyce zacinały
  // aplikację (paczki mvp/eh DuckDB-WASM są jednowątkowe, ~32-128 plików skanowanych
  // sekwencyjnie), patrz komentarz przy ensureOvertureContextLoaded() w ProjectGroup.tsx.
  overtureGreenAreas: OverturePolygonFeature[];
  showOvertureGreenAreas: boolean;

  // Strefy MPZP (wektor) — pilot Warszawa, patrz wfsMpzpWarsawClient.ts. Niezależne od
  // showMpzpLayer (raster WMS ogólnopolski) — użytkownik może chcieć oba naraz.
  mpzpZones: MpzpZoneFeature[];
  showMpzpZonesLayer: boolean;

  // Pokrycie terenu (wektor) — ogólnopolskie, patrz wfsLcvClient.ts.
  landCoverUnits: LandCoverFeature[];
  showLandCoverLayer: boolean;

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
  setKiutInvertColors: (invert: boolean) => void;
  setShowMpzpLayer: (show: boolean) => void;
  setMpzpOpacity: (val: number) => void;
  setShowBdotLayer: (show: boolean) => void;
  setBdotOpacity: (val: number) => void;
  setBdotInvertColors: (invert: boolean) => void;
  setShowTerrainLayer: (show: boolean) => void;
  setTerrainOpacity: (val: number) => void;
  setShowTreesLayer: (show: boolean) => void;

  setOvertureGreenAreas: (features: OverturePolygonFeature[]) => void;
  setShowOvertureGreenAreas: (show: boolean) => void;

  setMpzpZones: (zones: MpzpZoneFeature[]) => void;
  setShowMpzpZonesLayer: (show: boolean) => void;

  setLandCoverUnits: (units: LandCoverFeature[]) => void;
  setShowLandCoverLayer: (show: boolean) => void;

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

/** Migawka indywidualnych stanów warstw GEO, przywracana przy ponownym włączeniu master toggle'a.
 * Celowo poza stanem store'u (nie persystujemy jej) — to tylko pamięć "ostatniego układu" w ramach sesji. */
let geoLayersSnapshot: { kiut: boolean; mpzp: boolean; bdot: boolean; terrain: boolean } | null = null;

export const useWfsStore = create<WfsState>()(
  persist(
    (set, get) => ({
      trees: [],
      status: { ...defaultStatus },
      options: {
        buildings: true,
        parcels: true,
        trees: false,
        terrainShading: false,
      },

      projectRadius: 200,
      isProjectCenterLocked: true,

      showGeoOverlayGroup: false,
      showOrthophotoLayer: false,
      orthophotoOpacity: 0.85,
      showKiutLayer: false,
      kiutOpacity: 0.65,
      kiutInvertColors: true,
      showMpzpLayer: false,
      mpzpOpacity: 0.5,
      showBdotLayer: false,
      bdotOpacity: 0.6,
      bdotInvertColors: true,
      showTerrainLayer: false,
      terrainOpacity: 0.35,
      showTreesLayer: false,

  overtureGreenAreas: [],
  showOvertureGreenAreas: false,

  mpzpZones: [],
  showMpzpZonesLayer: false,

  landCoverUnits: [],
  showLandCoverLayer: false,

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

  setShowGeoOverlayGroup: (show) => {
    const state = get();
    if (show) {
      const snapshot = geoLayersSnapshot;
      geoLayersSnapshot = null;
      set({
        showGeoOverlayGroup: true,
        showKiutLayer: snapshot?.kiut ?? state.showKiutLayer,
        showMpzpLayer: snapshot?.mpzp ?? state.showMpzpLayer,
        showBdotLayer: snapshot?.bdot ?? state.showBdotLayer,
        showTerrainLayer: snapshot?.terrain ?? state.showTerrainLayer,
      });
    } else {
      geoLayersSnapshot = {
        kiut: state.showKiutLayer,
        mpzp: state.showMpzpLayer,
        bdot: state.showBdotLayer,
        terrain: state.showTerrainLayer,
      };
      set({
        showGeoOverlayGroup: false,
        showKiutLayer: false,
        showMpzpLayer: false,
        showBdotLayer: false,
        showTerrainLayer: false,
      });
    }
  },
  setShowOrthophotoLayer: (show) => set({ showOrthophotoLayer: show }),
  setOrthophotoOpacity: (val) => set({ orthophotoOpacity: val }),
  setShowKiutLayer: (show) => set({ showKiutLayer: show }),
  setKiutOpacity: (val) => set({ kiutOpacity: val }),
  setKiutInvertColors: (invert) => set({ kiutInvertColors: invert }),
  setShowMpzpLayer: (show) => set({ showMpzpLayer: show }),
  setMpzpOpacity: (val) => set({ mpzpOpacity: val }),
  setShowBdotLayer: (show) => set({ showBdotLayer: show }),
  setBdotOpacity: (val) => set({ bdotOpacity: val }),
  setBdotInvertColors: (invert) => set({ bdotInvertColors: invert }),
  setShowTerrainLayer: (show) => set({ showTerrainLayer: show }),
  setTerrainOpacity: (val) => set({ terrainOpacity: val }),
  setShowTreesLayer: (show) => set({ showTreesLayer: show }),

  setOvertureGreenAreas: (features) => set({ overtureGreenAreas: features }),
  setShowOvertureGreenAreas: (show) => set({ showOvertureGreenAreas: show }),

  setMpzpZones: (zones) => set({ mpzpZones: zones }),
  setShowMpzpZonesLayer: (show) => set({ showMpzpZonesLayer: show }),

  setLandCoverUnits: (units) => set({ landCoverUnits: units }),
  setShowLandCoverLayer: (show) => set({ showLandCoverLayer: show }),

  setLastImportBbox: (bbox) => set({ lastImportBbox: bbox }),
  resetStatus: () => set({ status: { ...defaultStatus } }),
    }),
    {
      name: 'usi-wfs-store',
      partialize: (state) => ({
        showGeoOverlayGroup: state.showGeoOverlayGroup,
        showOrthophotoLayer: state.showOrthophotoLayer,
        orthophotoOpacity: state.orthophotoOpacity,
        showKiutLayer: state.showKiutLayer,
        kiutOpacity: state.kiutOpacity,
        kiutInvertColors: state.kiutInvertColors,
        showMpzpLayer: state.showMpzpLayer,
        mpzpOpacity: state.mpzpOpacity,
        showBdotLayer: state.showBdotLayer,
        bdotOpacity: state.bdotOpacity,
        bdotInvertColors: state.bdotInvertColors,
        showTerrainLayer: state.showTerrainLayer,
        terrainOpacity: state.terrainOpacity,
        showTreesLayer: state.showTreesLayer,
        showOvertureGreenAreas: state.showOvertureGreenAreas,
        showMpzpZonesLayer: state.showMpzpZonesLayer,
        showLandCoverLayer: state.showLandCoverLayer,
        projectRadius: state.projectRadius,
      }),
    }
  )
);
