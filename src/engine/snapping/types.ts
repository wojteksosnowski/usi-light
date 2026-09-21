import { Point2D, BuildingLoop, ObjectCategory } from '../../types/geometry';
import { CachedLineEquation } from '../../utils/lineBufferEngine';
import { DominantDirection, EDGE_UCS_DEADBAND_DEG, EDGE_UCS_DEADBAND_RAD } from '../../utils/segmentStatistics';
import { SpatialLineIndex } from './SpatialLineIndex';

// Re-eksport wagowego progu deadbandu EDGE_UCS/OTRACK (spec §2.2), żeby konsumenci
// warstwy snappingu i testy mogli go importować z jednego, oczywistego miejsca.
export { EDGE_UCS_DEADBAND_DEG, EDGE_UCS_DEADBAND_RAD };

export type SnapType =
  | 'vertex'
  | 'intersection'
  | 'perpendicular'
  | 'edge'
  | 'extension'
  | 'direction'
  | 'otrack_intersection'
  | 'otrack_ray'
  | 'nearest'
  | 'grid'
  | 'none';

export interface ActiveSnapState {
  candidate: SnapResult;
  screenPos: { sx: number; sy: number };
  captureRadiusPx: number; // np. 12px
  releaseRadiusPx: number; // np. 18px
  acquiredAt: number;
}

export interface ToleranceBounds {
  screenPx: number;
  minWorldMeters: number;
  maxWorldMeters: number;
}

export interface SnapGuideLine {
  p1: Point2D;
  p2: Point2D;
  type: 'parallel' | 'perpendicular' | 'intersection' | 'extension' | 'dominant' | 'otrack' | 'otrack_ray' | 'guide_intersection';
  label?: string;
  sourceOrigin?: Point2D;
  sourceSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number };
  isStatistical?: boolean;
}

export interface TrackingRay {
  origin: Point2D;
  angleRad: number;
  type?: 'ortho_h' | 'ortho_v' | 'edge_parallel' | 'edge_perp' | 'dominant' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular';
  sourceAnchor?: AnchorPoint;
  anchorId?: string;
  label: string;
  A: number;
  B: number;
  C: number;
  p1: Point2D;
  p2: Point2D;
  isStatistical?: boolean;
}

export interface AnchorPoint {
  id: string; // np. `anchor_${objectId}_${vertexIndex}`
  point: Point2D;
  sourceObjectId?: string;
  sourceType?: string;
  sourceBuildingId?: string;
  sourceCategory?: ObjectCategory;
  sourceName?: string;
  sourceVertexIndex?: number;
  sourceEdgeIndex?: number;
  sourceEdgeAngle?: number;
  acquiredAt: number;
}

export interface SnapResult {
  point: Point2D;
  snapped: boolean;
  type: SnapType;
  label?: string;
  description?: string;
  screenDistancePx?: number;
  guideLines?: SnapGuideLine[];
  activeRays?: TrackingRay[];
  isStatisticalGuide?: boolean;
  sourcePoint?: Point2D;
  sourceBuildingId?: string;
  sourceCategory?: ObjectCategory;
  sourceName?: string;
  sourceEdgeIndex?: number;
  cachedEdge?: CachedLineEquation;
  intersectingAnchors?: [AnchorPoint, AnchorPoint];
  secondarySnap?: SnapResult;
  secondaryGuideLines?: SnapGuideLine[];
  metadata?: Record<string, unknown>;
}

export interface SnapContext {
  mouseWorld: Point2D;
  mouseScreen: { sx: number; sy: number };
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  screenToWorld: (sx: number, sy: number) => { wx: number; wy: number };
  buildings: BuildingLoop[];
  lineBuffer: CachedLineEquation[];
  acquiredAnchors?: AnchorPoint[];
  dominantDirections?: DominantDirection[];
  originPoint?: Point2D | null;
  polylineVertices?: Point2D[];
  isOsnapActive: boolean;
  isDirectionSnappingActive: boolean;
  gridSnapEnabled?: boolean;
  gridSize?: number;
  thresholdPx?: number;
  excludeBuildingId?: string;
  excludeBuildingIds?: string[];
  excludeSegmentIndices?: number[];
  hoveredBuildingId?: string;
  selectedBuildingId?: string;
  activeCategory?: ObjectCategory;
  sourceObjectId?: string;
  categoryAffinityWeights?: Partial<Record<ObjectCategory, number>>;
  previousSnapResult?: SnapResult | null;
  hysteresisBonusPx?: number;
  minEdgeLengthMeters?: number;
  minToleranceMeters?: number; // np. 0.05m dla skrajnego zoom in
  maxToleranceMeters?: number; // np. 3.00m dla skrajnego zoom out
  candidateIndex?: number; // Indeks wybranego kandydata z klawisza Tab
  /** Indeks przestrzenny (rbush) nad lineBuffer, wstrzykiwany przez SnapCoordinator.
   *  Gdy undefined, strategie korzystają z liniowego skanu (kompatybilność wsteczna). */
  spatialIndex?: SpatialLineIndex;
  /** Rozwiązana konfiguracja silnika (spec §5), wstrzykiwana przez SnapCoordinator.evaluate(). */
  config?: SnapEngineConfig;
  /** DEV-only: żądanie zebrania surowych kandydatów krawędzi (przed/po SNAPfiltrze, patrz EdgeSnapStrategy.ts) do podglądu debugowego. */
  debugCollectEdgeHpf?: boolean;
  /** DEV-only: wypełniane przez EdgeSnapStrategy, gdy debugCollectEdgeHpf jest true — wyniki SNAPfiltra. */
  debugEdgeHpfCandidates?: { point: Point2D; passed: boolean }[];
}

export interface SnapStrategy {
  readonly name: string;
  readonly priority: number;
  findSnap(point: Point2D, context: SnapContext): SnapResult | null;
  /** Opcjonalna metoda zwracająca wszystkich pasujących kandydatów dla przełączania Tab */
  findAllSnaps?(point: Point2D, context: SnapContext): SnapResult[];
}

/**
 * Wagi typów punktów SNAP wg hierarchii OSNAP (wyższa waga = silniejsze przyciąganie
 * przy tej samej odległości efektywnej). Używane do globalnego porównania d_eff
 * między kandydatami ze WSZYSTKICH strategii w SnapCoordinator.evaluate().
 */
/** Typy SnapResult należące do grupy OSNAP (bramkowane wyłącznie przez isOsnapActive). */
export const OSNAP_TYPES: readonly SnapType[] = ['vertex', 'intersection', 'perpendicular', 'edge', 'extension', 'nearest'];

/** Typy SnapResult należące do grupy OTRACK (bramkowane wyłącznie przez isOtrackActive). */
export const OTRACK_TYPES: readonly SnapType[] = ['direction', 'otrack_intersection', 'otrack_ray'];

export const SNAP_TYPE_WEIGHTS: Record<SnapType, number> = {
  vertex: 1.5,
  intersection: 1.3,
  otrack_intersection: 1.3,
  perpendicular: 1.0,
  extension: 0.8,
  edge: 0.75,
  otrack_ray: 0.7,
  direction: 0.7,
  nearest: 0.75,
  grid: 0.5,
  none: 0.01,
};

/**
 * Konfiguracja silnika SNAP/OSNAP/OTRACK (spec §5, `SnapEngineConfig`). Zbiera w jednym,
 * wstrzykiwalnym obiekcie to, co dotąd było rozproszonymi stałymi modułowymi i literałami
 * powtórzonymi w każdej strategii.
 */
export interface SnapEngineConfig {
  /** Domyślna apertura w px, gdy SnapContext.thresholdPx nie został podany. */
  apertureRadiusPx: number;
  /** R_proj (metry) — promień normalizacji długości krawędzi w computeEdgeScore. */
  projectRadius: number;
  /** Kopia progu deadbandu EDGE_UCS/OTRACK (spec §2.2), nadpisywalna per-instancja. */
  edgeUcsDeadbandRad: number;
  /** Wagi hierarchii typów punktów SNAP używane do globalnego porównania d_eff. */
  typeWeights: Record<SnapType, number>;
}

export const DEFAULT_SNAP_ENGINE_CONFIG: SnapEngineConfig = {
  apertureRadiusPx: 12,
  projectRadius: 50,
  edgeUcsDeadbandRad: EDGE_UCS_DEADBAND_RAD,
  typeWeights: SNAP_TYPE_WEIGHTS,
};

/**
 * Oblicza multiplikatywny wynik jakości krawędzi Score(e) = S_len * S_dist * S_cat,
 * promujący długie, bliskie i tematycznie zgodne krawędzie nad drobnymi detalami.
 * maxEdgeLengthMeters pozwala znormalizować S_len względem najdłuższej krawędzi w scenie
 * (fallback: krzywa nasycenia log10, gdy nieznana).
 */
export function computeEdgeScore(
  edgeLengthMeters: number,
  distanceToEdgeMeters: number,
  apertureWorldMeters: number,
  edgeCategory: ObjectCategory | undefined,
  activeCategory: ObjectCategory | undefined,
  maxEdgeLengthMeters = 50,
  categoryWeights?: Partial<Record<ObjectCategory, number>>
): number {
  const sLen = Math.log10(Math.max(0, edgeLengthMeters) + 1) / Math.log10(maxEdgeLengthMeters + 1);
  const sLenClamped = Math.min(1, Math.max(0.05, sLen));
  const sDist = Math.min(1, Math.max(0, 1 - distanceToEdgeMeters / Math.max(apertureWorldMeters, 1e-6)));
  const catBonus = computeCategoryAffinityBonus(edgeCategory, activeCategory, categoryWeights);
  const sCat = catBonus > 0 ? 1.0 : 0.6;
  return sLenClamped * Math.max(0.05, sDist) * sCat;
}

/**
 * Oblicza bonus odległościowy (odejmowany od effDist w px) wynikający z preferencji kategorii obiektu
 */
export function computeCategoryAffinityBonus(
  targetCategory: ObjectCategory | undefined,
  activeCategory: ObjectCategory | undefined,
  customWeights?: Partial<Record<ObjectCategory, number>>
): number {
  if (!activeCategory || !targetCategory) return 0;
  if (customWeights && typeof customWeights[targetCategory] === 'number') {
    return customWeights[targetCategory]!;
  }
  // Standardowa hierarchia wag w pikselach:
  if (activeCategory === targetCategory) {
    return 5.0; // Silny bonus dla tej samej kategorii (np. działka do działki, budynek do budynku)
  }
  if (activeCategory === 'balcony' && targetCategory === 'building') {
    return 6.0; // Balkon naturalnie lgnie do elewacji budynku
  }
  if (activeCategory === 'building' && targetCategory === 'boundary') {
    return 2.0; // Budynek chętnie wyrównuje się do granicy działki
  }
  return 0.0;
}

/**
 * Oblicza promień tolerancji w jednostkach świata z uwzględnieniem ograniczeń min/max (clamping)
 */
export function computeClampedWorldTolerance(
  point: Point2D,
  context: SnapContext,
  defaultScreenPx = 12,
  minMeters = 0.05,
  maxMeters = 3.0
): { worldRadius: number; pxPerMeter: number; thresholdPx: number } {
  const thresholdPx = context.thresholdPx ?? context.config?.apertureRadiusPx ?? defaultScreenPx;
  const s0 = context.worldToScreen(point.x, point.y);
  const s1 = context.worldToScreen(point.x + 1, point.y);
  const pxPerMeter = Math.hypot(s1.sx - s0.sx, s1.sy - s0.sy) || 20;
  const rawWorld = (thresholdPx * 2) / pxPerMeter + 0.2;
  const minM = context.minToleranceMeters ?? minMeters;
  const maxM = context.maxToleranceMeters ?? maxMeters;
  const worldRadius = Math.min(maxM, Math.max(minM, rawWorld));
  return { worldRadius, pxPerMeter, thresholdPx };
}

// Compatibility types for drawingToolRenderer & CadCanvas
export type OsnapSnapType =
  | 'endpoint'
  | 'otrack_intersection'
  | 'perpendicular'
  | 'otrack_ray'
  | 'nearest'
  | 'extension'
  | 'parallel_lock'
  | 'collinear_lock';

export interface OsnapSnapResult {
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  type: OsnapSnapType;
  snappedPoint: Point2D;
  screenDistancePx: number;
  label: string;
  description: string;
  sourcePoint?: Point2D;
  sourceBuildingId?: string;
  sourceCategory?: ObjectCategory;
  sourceName?: string;
  sourceEdgeIndex?: number;
  rayLine?: { p1: Point2D; p2: Point2D };
  activeRays?: TrackingRay[];
  isStatisticalGuide?: boolean;
  intersectingAnchors?: [AnchorPoint, AnchorPoint];
  cachedEdge?: CachedLineEquation;
  parallelAngleDeg?: number;
  collinearDistance?: number;
  secondarySnap?: OsnapSnapResult;
  secondaryRayLine?: { p1: Point2D; p2: Point2D };
  secondaryType?: OsnapSnapType;
}

export interface DirectionSnapResult {
  snappedPoint: Point2D;
  originPoint: Point2D;
  guideAngleDeg: number;
  relationType: 'parallel' | 'perpendicular' | 'dominant' | 'guide_intersection';
  isStatistical?: boolean; // true dla siatek głównych i statystycznych, false dla konkretnych krawędzi
  guideLine: { p1: Point2D; p2: Point2D };
  secondGuideLine?: { p1: Point2D; p2: Point2D; originPoint?: Point2D; angleDeg?: number; label?: string };
  intersectedSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number; buildingName?: string };
  distanceFromOrigin: number;
  diffAngleDeg: number;
  sourceLabel?: string;
  sourceSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number };
}

export interface CalculateDirectionSnapOptions {
  currentMouseWorld: Point2D;
  originPoint: Point2D;
  secondaryOriginPoints?: Point2D[];
  buildings?: BuildingLoop[];
  dominantDirections?: DominantDirection[];
  polylineVertices?: Point2D[];
  staticReferenceSegments?: { p1: Point2D; p2: Point2D; label?: string; buildingId?: string; edgeIndex?: number }[];
  worldToScreen?: (wx: number, wy: number) => { sx: number; sy: number };
  angleToleranceDeg?: number;
  screenSnapThresholdPx?: number;
  minDistanceMeters?: number;
  maxNearbySegments?: number;
  guideLineLengthMeters?: number;
  hoveredBuildingId?: string;
  selectedBuildingId?: string;
  activeCategory?: ObjectCategory;
  excludeBuildingId?: string;
  excludeBuildingIds?: string[];
  excludeSegmentIndices?: number[];
  /** Grupowa flaga OTRACK — brak per-typu gatingu (ortho/dominant/relative/dualIntersection). */
  isOtrackActive?: boolean;
}

export interface DirectionCandidate {
  angleDeg: number;
  relationType: 'parallel' | 'perpendicular' | 'dominant';
  sourceLabel?: string;
  priority: number;
  sourceSegment?: { p1: Point2D; p2: Point2D; buildingId?: string; edgeIndex?: number };
}
