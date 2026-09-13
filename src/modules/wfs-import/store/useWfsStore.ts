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

export type OvertureLandUseCategory =
  | 'green'
  | 'water'
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'institutional'
  | 'agricultural'
  | 'infrastructure'
  | 'other';

/**
 * Cecha powierzchniowa (zagospodarowanie/pokrycie terenu: zieleń, woda, mieszkalnictwo, usługi,
 * przemysł itp.) z tematu Overture `base`, we współrzędnych CAD lokalnych.
 */
export interface OverturePolygonFeature {
  id: string;
  rings: Point2D[][];
  className: string | null;
  category?: OvertureLandUseCategory;
}

/**
 * Strefa MPZP (miejscowy plan zagospodarowania przestrzennego) — geometria + atrybuty przeznaczenia
 * terenu i wskaźniki urbanistyczne, we współrzędnych CAD lokalnych.
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

export type MpzpLineType =
  | 'nieprzekraczalna_linia_zabudowy'
  | 'obowiazujaca_linia_zabudowy'
  | 'linia_rozgraniczajaca'
  | 'inna';

/**
 * Obiekt liniowy MPZP (np. nieprzekraczalna linia zabudowy, obowiązująca linia zabudowy,
 * linia rozgraniczająca) we współrzędnych CAD lokalnych.
 */
export interface MpzpLineFeature {
  id: string;
  points: Point2D[];
  lineType: MpzpLineType;
  label?: string;
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

  // Warstwy podkładów geodezyjnych (PRO) - Podkład (GESUT, BDOT10k)
  showGeoOverlayGroup: boolean; // Master toggle Podkład
  showOrthophotoLayer: boolean;
  orthophotoOpacity: number;
  showKiutLayer: boolean;
  kiutOpacity: number;
  kiutInvertColors: boolean;
  showBdotLayer: boolean;
  bdotOpacity: number;
  bdotInvertColors: boolean;
  // Wspólne krycie i inwersja kolorów dla grupy Podkład (WMS: GESUT + BDOT10k)
  geoOverlayOpacity: number;
  geoOverlayInvertColors: boolean;

  // Warstwy planistyczne, kontekstowe i ukształtowania terenu (PRO) - Plany
  showPlansOverlayGroup: boolean; // Master toggle Plany
  showMpzpLayer: boolean;
  mpzpOpacity: number;
  showTerrainLayer: boolean;
  terrainOpacity: number;
  showTreesLayer: boolean;

  // Warstwa kontekstowa Overture Maps (zieleń / zagospodarowanie)
  overtureGreenAreas: OverturePolygonFeature[];
  showOvertureGreenAreas: boolean;

  // Strefy i linie MPZP (wektor)
  mpzpZones: MpzpZoneFeature[];
  mpzpLines: MpzpLineFeature[];
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

  /** Przesuwa wszystkie zaimportowane warstwy wektorowe o wektor delta (zachowanie pozycji geograficznej przy zmianie środka projektu) */
  shiftVectorLayers: (delta: Point2D) => void;

  setShowGeoOverlayGroup: (show: boolean) => void;
  setShowPlansOverlayGroup: (show: boolean) => void;
  setShowOrthophotoLayer: (show: boolean) => void;
  setOrthophotoOpacity: (val: number) => void;
  setShowKiutLayer: (show: boolean) => void;
  setKiutOpacity: (val: number) => void;
  setKiutInvertColors: (invert: boolean) => void;
  setShowBdotLayer: (show: boolean) => void;
  setBdotOpacity: (val: number) => void;
  setBdotInvertColors: (invert: boolean) => void;
  setGeoOverlayOpacity: (val: number) => void;
  setGeoOverlayInvertColors: (invert: boolean) => void;

  setShowMpzpLayer: (show: boolean) => void;
  setMpzpOpacity: (val: number) => void;
  setShowTerrainLayer: (show: boolean) => void;
  setTerrainOpacity: (val: number) => void;
  setShowTreesLayer: (show: boolean) => void;

  setOvertureGreenAreas: (features: OverturePolygonFeature[]) => void;
  setShowOvertureGreenAreas: (show: boolean) => void;

  setMpzpZones: (zones: MpzpZoneFeature[]) => void;
  setMpzpLines: (lines: MpzpLineFeature[]) => void;
  setMpzpData: (zones: MpzpZoneFeature[], lines: MpzpLineFeature[]) => void;
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

/** Migawka indywidualnych stanów warstw w grupie Podkład (GESUT + BDOT10k), przywracana przy ponownym włączeniu master toggle'a Podkład. */
let geoLayersSnapshot: { kiut: boolean; bdot: boolean } | null = null;

/** Migawka indywidualnych stanów warstw planistycznych, kontekstowych i ukształtowania terenu, przywracana przy ponownym włączeniu master toggle'a Plany. */
let plansLayersSnapshot: {
  mpzp: boolean;
  terrain: boolean;
  overture: boolean;
  mpzpZones: boolean;
  landCover: boolean;
} | null = null;

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
      showPlansOverlayGroup: false,
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
      geoOverlayOpacity: 0.65,
      geoOverlayInvertColors: true,
      showTerrainLayer: false,
      terrainOpacity: 0.35,
      showTreesLayer: false,

  overtureGreenAreas: [],
  showOvertureGreenAreas: false,

  mpzpZones: [],
  mpzpLines: [],
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

  shiftVectorLayers: (delta: Point2D) => {
    if (delta.x === 0 && delta.y === 0) return;
    set((state) => {
      // 1. Overture polygons
      const overtureGreenAreas = state.overtureGreenAreas.map((poly) => ({
        ...poly,
        rings: poly.rings.map((ring) =>
          ring.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
        ),
      }));

      // 2. MPZP zones & lines
      const mpzpZones = state.mpzpZones.map((zone) => ({
        ...zone,
        rings: zone.rings.map((ring) =>
          ring.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
        ),
      }));

      const mpzpLines = state.mpzpLines.map((line) => ({
        ...line,
        points: line.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
      }));

      // 3. Land cover units
      const landCoverUnits = state.landCoverUnits.map((unit) => ({
        ...unit,
        outer: unit.outer.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
        holes: unit.holes
          ? unit.holes.map((hole) =>
              hole.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
            )
          : undefined,
      }));

      // 4. Trees
      const trees = state.trees.map((tree) => ({
        ...tree,
        position: { x: tree.position.x + delta.x, y: tree.position.y + delta.y },
      }));

      return {
        overtureGreenAreas,
        mpzpZones,
        mpzpLines,
        landCoverUnits,
        trees,
      };
    });
  },

  setShowGeoOverlayGroup: (show) => {
    const state = get();
    if (show) {
      const snapshot = geoLayersSnapshot;
      geoLayersSnapshot = null;
      set({
        showGeoOverlayGroup: true,
        showKiutLayer: snapshot?.kiut ?? (state.showKiutLayer || !state.showBdotLayer),
        showBdotLayer: snapshot?.bdot ?? state.showBdotLayer,
      });
    } else {
      geoLayersSnapshot = {
        kiut: state.showKiutLayer,
        bdot: state.showBdotLayer,
      };
      set({
        showGeoOverlayGroup: false,
        showKiutLayer: false,
        showBdotLayer: false,
      });
    }
  },
  setShowPlansOverlayGroup: (show) => {
    const state = get();
    if (show) {
      const snapshot = plansLayersSnapshot;
      plansLayersSnapshot = null;
      set({
        showPlansOverlayGroup: true,
        showMpzpLayer: snapshot?.mpzp ?? (state.showMpzpLayer || (!state.showTerrainLayer && !state.showOvertureGreenAreas && !state.showMpzpZonesLayer && !state.showLandCoverLayer)),
        showTerrainLayer: snapshot?.terrain ?? state.showTerrainLayer,
        showOvertureGreenAreas: snapshot?.overture ?? state.showOvertureGreenAreas,
        showMpzpZonesLayer: snapshot?.mpzpZones ?? state.showMpzpZonesLayer,
        showLandCoverLayer: snapshot?.landCover ?? state.showLandCoverLayer,
      });
    } else {
      plansLayersSnapshot = {
        mpzp: state.showMpzpLayer,
        terrain: state.showTerrainLayer,
        overture: state.showOvertureGreenAreas,
        mpzpZones: state.showMpzpZonesLayer,
        landCover: state.showLandCoverLayer,
      };
      set({
        showPlansOverlayGroup: false,
        showMpzpLayer: false,
        showTerrainLayer: false,
        showOvertureGreenAreas: false,
        showMpzpZonesLayer: false,
        showLandCoverLayer: false,
      });
    }
  },
  setShowOrthophotoLayer: (show) => set({ showOrthophotoLayer: show }),
  setOrthophotoOpacity: (val) => set({ orthophotoOpacity: val }),
  setShowKiutLayer: (show) => set({ showKiutLayer: show }),
  setKiutOpacity: (val) => set({ kiutOpacity: val, geoOverlayOpacity: val }),
  setKiutInvertColors: (invert) => set({ kiutInvertColors: invert, geoOverlayInvertColors: invert }),
  setShowBdotLayer: (show) => set({ showBdotLayer: show }),
  setBdotOpacity: (val) => set({ bdotOpacity: val }),
  setBdotInvertColors: (invert) => set({ bdotInvertColors: invert }),
  setGeoOverlayOpacity: (val) => set({ geoOverlayOpacity: val, kiutOpacity: val, bdotOpacity: val }),
  setGeoOverlayInvertColors: (invert) => set({ geoOverlayInvertColors: invert, kiutInvertColors: invert, bdotInvertColors: invert }),

  setShowMpzpLayer: (show) => set({ showMpzpLayer: show }),
  setMpzpOpacity: (val) => set({ mpzpOpacity: val }),
  setShowTerrainLayer: (show) => set({ showTerrainLayer: show }),
  setTerrainOpacity: (val) => set({ terrainOpacity: val }),
  setShowTreesLayer: (show) => set({ showTreesLayer: show }),

  setOvertureGreenAreas: (features) => set({ overtureGreenAreas: features }),
  setShowOvertureGreenAreas: (show) => set({ showOvertureGreenAreas: show }),

  setMpzpZones: (zones) => set({ mpzpZones: zones }),
  setMpzpLines: (lines) => set({ mpzpLines: lines }),
  setMpzpData: (zones, lines) => set({ mpzpZones: zones, mpzpLines: lines }),
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
        showPlansOverlayGroup: state.showPlansOverlayGroup,
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
        geoOverlayOpacity: state.geoOverlayOpacity,
        geoOverlayInvertColors: state.geoOverlayInvertColors,
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
