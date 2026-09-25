import type { Point2D } from './geometry';

/**
 * Wierzchołek cienia w architekturze Canonical Precomputed Geometry.
 * Wiąże punkt rzutowany na poziom Z=0 z wierzchołkiem źródłowym XY i maksymalną wysokością Z.
 */
export interface FastShadowVertex {
  /** Współrzędne wierzchołka cienia na podstawowym poziomie odniesienia Z = 0 */
  readonly x0: number;
  readonly y0: number;

  /** Wierzchołek translacyjny (pozycja XY punktu bryły generującego cień, rzut ortogonalny na Z=zMax) */
  readonly vx: number;
  readonly vy: number;

  /** Maksymalna wysokość Z punktu, powyżej której ten punkt nie rzuca cienia */
  readonly zMax: number;
}

/**
 * Pierścień wierzchołków cienia (kontur zewnętrzny lub otwór donut).
 */
export interface CanonicalShadowRing {
  readonly vertices: readonly FastShadowVertex[];
  /** Flaga określająca, czy pierścień reprezentuje bryłę pełną (false), czy otwór/patio (true) */
  readonly isHole: boolean;
}

/**
 * Składowa cienia pojedynczego elementu bryły (kondygnacja, wykusz, taras, brama).
 */
export interface CanonicalShadowComponent {
  /** Unikalny identyfikator składowej (np. bldg1_story0, bldg1_bay_window) */
  readonly componentId: string;
  /** Identyfikator budynku macierzystego */
  readonly sourceBuildingId: string;
  /** Dolny poziom Z elementu */
  readonly zMin: number;
  /** Górny poziom Z elementu */
  readonly zMax: number;
  /** Pierścienie cienia (obrysy zewnętrzne i otwory) */
  readonly rings: readonly CanonicalShadowRing[];
}

/**
 * Kompletny kanoniczny cień obiektu zbuforowany w GeometryCompiler.
 */
export interface CanonicalBuildingShadow {
  readonly buildingId: string;
  /** Kąt azymutu / identyfikator wpisu pozycji słońca */
  readonly sunAngleHash: string;
  /** Składowe cienia rozbite per kondygnacja / element */
  readonly components: readonly CanonicalShadowComponent[];
}
