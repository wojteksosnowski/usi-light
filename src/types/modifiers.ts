import { AreaType, BuildingType, Point2D } from './geometry';

export type ModifierType =
  | 'story_offset'
  | 'zone_offset'
  | 'bay_window'
  | 'terrace'
  | 'donut'
  | 'corner_cut'
  | 'gate'
  | 'sztyca'
  | 'pila'
  | 'zone_function';

export interface BaseModifier {
  id: string;
  type: ModifierType;
  enabled: boolean;
  name?: string;
}

export interface StoryOffsetModifier extends BaseModifier {
  type: 'story_offset';
  distance: number;      // metry (+ na zewnątrz / nadwieszenie, - do wewnątrz / cofnięcie)
  storiesCount: number;  // < 0: N kondygnacji od góry (poddasze/penthouse); > 0: N kondygnacji od dołu (podcień)
}

export type ZoneCornerType = 'miter' | 'round' | 'chamfer';

export interface ZoneOffsetModifier extends BaseModifier {
  type: 'zone_offset';
  distance: number;      // metry (+ na zewnątrz bufor, - do wnętrza obiektu)
  areaType?: AreaType;
  cornerType?: ZoneCornerType; // proste (miter) | zaokrąglone (round, r=|distance|) | ścięte (chamfer, d=|distance|); domyślnie 'miter'
  name?: string;
}

export type BayWindowAngle = 90 | 60 | 45 | 30;

export interface BayWindowModifier extends BaseModifier {
  type: 'bay_window';
  width: number;           // Szerokość czoła wykuszu na krawędzi (metry)
  projection: number;      // Wysunięcie równoległe (metry, >0 na zewnątrz, <0 do wnętrza)
  storiesCount: number;    // Kondygnacja: <0 od góry, >0 od dołu, 0 cała wysokość / obszar
  edgeIndex?: number;      // Opcjonalny indeks krawędzi (domyślnie najdłuższa)
  sideAngle?: BayWindowAngle; // Kąt ścian bocznych: 90, 60, 45, 30 stopni (domyślnie 45)
  positionRatio?: number;  // Położenie wzdłuż krawędzi: 0.0 (początek) .. 0.5 (środek) .. 1.0 (koniec)
}

export type TerraceVariant = 'drop' | 'steps';

export interface TerraceModifier extends BaseModifier {
  type: 'terrace';
  depth: number;           // 'a' - łączny uskok krawędzi (metry, domyślnie -4m, <0 cofnięcie, >0 nadwieszenie)
  storiesCount: number;    // Kondygnacja: <0 od góry (np. -1 penthouse), >0 od dołu, 0 cała bryła
  edgeIndex?: number;      // Indeks modyfikowanej krawędzi (domyślnie najdłuższa lub 0)
  variant?: TerraceVariant; // 'drop' (uskok) | 'steps' (stopnie), domyślnie 'drop'
  autoDistance?: boolean;   // Czy tryb automatycznego mierzenia 'a' jest aktywny na żywo
}

export interface DonutModifier extends BaseModifier {
  type: 'donut';
  offset: number;          // Odsunięcie otworu do wnętrza (metry, domyślnie -12m)
  storiesCount: number;    // Kondygnacja: <0 od góry, >0 od dołu, 0 cała wysokość
}

export type CornerCutMode = 'chamfer' | 'fillet' | 'notch';
export type CornerCutScope = 'all' | 'edge' | 'vertex';

export interface CornerCutModifier extends BaseModifier {
  type: 'corner_cut';
  depth: number;           // 'd' - wielkość ścięcia (metry)
  storiesCount: number;    // Kondygnacja: <0 od góry, >0 od dołu, 0 cała bryła
  mode: CornerCutMode;      // chamfer (ukośne ścięcie) | fillet (zaokrąglenie) | notch (wycięcie karo)
  scope: CornerCutScope;    // all (wszystkie narożniki) | edge (narożniki krawędzi) | vertex (jeden narożnik)
  edgeIndex?: number;      // Indeks krawędzi gdy scope === 'edge' (konwencja jak w bay_window/terrace: zewnętrzne 0..n-1, potem otwory)
  vertexIndex?: number;    // Indeks wierzchołka gdy scope === 'vertex' (ta sama konwencja globalnego indeksu, dla wierzchołków)
}

export interface GateModifier extends BaseModifier {
  type: 'gate';
  width: number;           // 'a' - szerokość bramy (metry)
  storiesCount: number;    // Kondygnacja: >0 od dołu (+1 parter), <0 od góry, 0 cała bryła
  edgeIndex?: number;      // Indeks krawędzi wejściowej (domyślnie najdłuższa lub 0)
  positionRatio?: number;  // Położenie wzdłuż dopuszczalnego odcinka: 0.0 (początek) .. 0.5 (środek) .. 1.0 (koniec)
  autoWidth?: boolean;     // Czy tryb automatycznej maksymalnej szerokości jest aktywny
}

export interface SztycaModifier extends BaseModifier {
  type: 'sztyca';
  storiesCount: number;    // Liczba dodatkowych kondygnacji na szczycie (>=1, domyślnie 1)
  storeyHeight: number;    // Wysokość dodawanej kondygnacji (m, domyślnie 3.0)
  offset?: number;         // Opcjonalne odsunięcie/cofnięcie krawędzi sztycy (m, domyślnie 0.0)
}

export type PilaAngle = 90 | 120 | 135 | 150;
export type PilaAlignment = 'perpendicular' | 'prev_edge' | 'next_edge';

export interface PilaModifier extends BaseModifier {
  type: 'pila';
  teethCount: number;      // Liczba zębów / uskoków (>=1, domyślnie 1)
  depth?: number;          // Opcjonalna głębokość (wyliczana automatycznie z geometrii)
  toothAngle?: PilaAngle;  // Kąt schodkowania: 90, 120, 135, 150 stopni (domyślnie 90)
  alignment?: PilaAlignment; // Kierunek skoku: 'perpendicular' (domyślnie), 'prev_edge', 'next_edge'
  storiesCount: number;    // Kondygnacja: <0 od góry, >0 od dołu, 0 cała bryła
  edgeIndex?: number;      // Indeks modyfikowanej krawędzi (domyślnie najdłuższa lub 0)
}

export type ZoneFunctionScope = 'storeys' | 'edge_offset';

export interface ZoneFunctionModifier extends BaseModifier {
  type: 'zone_function';
  buildingType: BuildingType; // Docelowy typ budynku: 'residential' | 'service' | 'garage'
  scope: ZoneFunctionScope;   // 'storeys' (cały obrys) | 'edge_offset' (pas od krawędzi)
  storiesCount: number;       // Kondygnacja: <0 od góry, >0 od dołu, 0 cała bryła
  edgeIndex?: number;         // Indeks krawędzi (dla scope === 'edge_offset')
  depth?: number;             // Głębokość strefy w głąb budynku (metry, domyślnie 10.0m)
}

export type Modifier =
  | StoryOffsetModifier
  | ZoneOffsetModifier
  | BayWindowModifier
  | TerraceModifier
  | DonutModifier
  | CornerCutModifier
  | GateModifier
  | SztycaModifier
  | PilaModifier
  | ZoneFunctionModifier;

function newModifierId(prefix: string): string {
  return `mod-${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
}

/**
 * Fabryki domyślnych wartości modyfikatorów — jedyne źródło prawdy dla wartości startowych,
 * używane zarówno przez panel modyfikatorów, jak i przyciski "dodaj" w pasku narzędzi (ToolsGroup).
 */
export function createDefaultStoryOffsetModifier(): StoryOffsetModifier {
  return {
    id: newModifierId('story'),
    type: 'story_offset',
    enabled: true,
    distance: -2.0, // domyślnie 2m cofnięcia
    storiesCount: -1, // domyślnie ostatnia kondygnacja (penthouse)
  };
}

export function createDefaultZoneOffsetModifier(): ZoneOffsetModifier {
  return {
    id: newModifierId('zone'),
    type: 'zone_offset',
    enabled: true,
    distance: 4.0, // domyślnie 4m bufora na zewnątrz
    areaType: 'plot',
    cornerType: 'miter',
    name: 'Strefa buforowa',
  };
}

export function createDefaultBayWindowModifier(): BayWindowModifier {
  return {
    id: newModifierId('bay'),
    type: 'bay_window',
    enabled: true,
    width: 4.0, // domyślnie 4m szerokości
    projection: 1.5, // domyślnie 1.5m wysunięcia
    storiesCount: 0, // domyślnie cała wysokość / obszar
    edgeIndex: 0,
  };
}

export function createDefaultTerraceModifier(): TerraceModifier {
  return {
    id: newModifierId('terrace'),
    type: 'terrace',
    enabled: true,
    depth: -4.0, // domyślnie -4m głębokość uskoku
    storiesCount: -1, // domyślnie ostatnia kondygnacja (penthouse)
    variant: 'drop',
    edgeIndex: 0,
  };
}

export function createDefaultDonutModifier(): DonutModifier {
  return {
    id: newModifierId('donut'),
    type: 'donut',
    enabled: true,
    offset: -12.0, // domyślnie -12m offset otworu
    storiesCount: 0, // domyślnie cała wysokość / bryła
  };
}

/**
 * Tworzy domyślny modyfikator "Ścięcie narożnika" (używane przez pasek narzędzi i panel boczny)
 */
export function createDefaultCornerCutModifier(): CornerCutModifier {
  return {
    id: newModifierId('cut'),
    type: 'corner_cut',
    enabled: true,
    depth: 1.0,
    storiesCount: 0,
    mode: 'chamfer',
    scope: 'all',
    edgeIndex: 0,
    vertexIndex: 0,
  };
}

/**
 * Tworzy domyślny modyfikator "Brama (prześwit / przejazd)"
 */
export function createDefaultGateModifier(): GateModifier {
  return {
    id: newModifierId('gate'),
    type: 'gate',
    enabled: true,
    width: 4.0,           // domyślnie 4m szerokości
    storiesCount: 1,      // domyślnie parter (+1)
    positionRatio: 0.5,   // domyślnie środek
    autoWidth: false,
    edgeIndex: 0,
  };
}

/**
 * Tworzy domyślny modyfikator "Sztyca (nadbudowa / dodatkowe piętra)"
 */
export function createDefaultSztycaModifier(): SztycaModifier {
  return {
    id: newModifierId('sztyca'),
    type: 'sztyca',
    enabled: true,
    storiesCount: 1,      // 1 dodatkowa kondygnacja
    storeyHeight: 3.0,    // 3.0m wysokości
    offset: 0.0,          // ten sam obrys co najwyższa kondygnacja
  };
}

/**
 * Tworzy domyślny modyfikator "Piła (schodkowanie krawędzi)"
 */
export function createDefaultPilaModifier(): PilaModifier {
  return {
    id: newModifierId('pila'),
    type: 'pila',
    enabled: true,
    teethCount: 1,        // 1 uskok (2 podsegmenty: b-a)
    toothAngle: 90,
    alignment: 'prev_edge',
    storiesCount: 0,      // cała bryła
    edgeIndex: 0,
  };
}

/**
 * Tworzy domyślny modyfikator "Strefa funkcji (typ budynku)"
 */
export function createDefaultZoneFunctionModifier(): ZoneFunctionModifier {
  return {
    id: newModifierId('zfunc'),
    type: 'zone_function',
    enabled: true,
    buildingType: 'service', // domyślnie usługi
    scope: 'storeys',        // domyślnie kondygnacje
    storiesCount: 1,         // domyślnie parter (+1)
    depth: 10.0,             // 10m pasmo od krawędzi
    edgeIndex: 0,
  };
}

export interface StoryFootprint {
  storyIndex: number;    // Indeks kondygnacji 0 .. K-1
  hBottom: number;       // Rzędna spodu kondygnacji (m)
  hTop: number;          // Rzędna wierzchu kondygnacji (m)
  polygon: Point2D[];    // Zewnętrzny obrys 2D danej kondygnacji
  holes?: Point2D[][];   // Wewnętrzne otwory (np. dziedzińce / patio z modyfikatora Donat)
  // Dziedziczone ID krawędzi obrysu zewnętrznego: edgeOrigins[i] to indeks krawędzi z baseVertices,
  // po której "dziedziczy" krawędź polygon[i] -> polygon[i+1] (albo null dla krawędzi nowo powstałej,
  // np. ściany tunelu bramy, bez odpowiednika w oryginalnym obrysie). Pozwala selektorowi edgeIndex
  // odnaleźć potomków oryginalnej ściany bez zgadywania geometrycznego od zera przy każdym kroku.
  // Brak tego pola (undefined) oznacza "nieznane pochodzenie" — wywołuje fallback na dopasowanie
  // geometryczne względem baseVertices (patrz modifierIndexTarget.ts).
  edgeOrigins?: (number | null)[];
  // Analogiczne dziedziczenie ID dla krawędzi otworów (dziedzińce/patio z Donata): holeOrigins[h][i]
  // to LOKALNY indeks (w obrębie otworu h w momencie jego powstania) krawędzi, po której dziedziczy
  // krawędź holes[h][i] -> holes[h][i+1] (albo null dla nowej krawędzi, np. cięcia bramą w otwór).
  // Otwory nie mają odpowiednika w baseVertices — numeracja jest własna, per otwór, nadawana przy
  // jego utworzeniu (np. przez `donut`). Utrzymywane tym samym uniwersalnym mechanizmem co
  // edgeOrigins, dla każdego typu modyfikatora jednakowo (patrz modifierRegistry.ts: applyModifier).
  holeOrigins?: (number | null)[][];
  buildingType?: BuildingType; // Indywidualne przeznaczenie kondygnacji/obrysu (np. po modyfikatorze strefy funkcji)
}

export interface ZoneFootprint {
  id: string;
  areaType?: AreaType;
  distance: number;
  polygon: Point2D[];    // zewnętrzna granica pasa strefy
  holes?: Point2D[][];   // wewnętrzna granica pasa strefy (jak StoryFootprint.holes); brak = pełny wielokąt, fallback
}

/**
 * Wyznacza indeks krawędzi do podświetlenia w podglądzie izometrycznym.
 * Odpowiada rozwiniętemu modyfikatorowi (jeśli posiada krawędź), z fallbackiem na pierwszy aktywny modyfikator z krawędzią.
 */
export function getActiveHighlightEdgeIndex(
  modifiers: Modifier[] | undefined,
  expandedModifierId?: string | null
): number | undefined {
  if (!modifiers || modifiers.length === 0) return undefined;
  const hasEdge = (m: Modifier): m is Modifier & { edgeIndex?: number } =>
    m.enabled && 'edgeIndex' in m && (m as { edgeIndex?: number }).edgeIndex !== undefined;

  const targetMod = expandedModifierId
    ? modifiers.find((m) => m.id === expandedModifierId)
    : modifiers.find(hasEdge);

  if (!targetMod || !hasEdge(targetMod)) return undefined;
  const edgeIdx = targetMod.edgeIndex;
  return edgeIdx === undefined || edgeIdx === -1 ? 0 : edgeIdx;
}

