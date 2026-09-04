import { Point2D, BuildingLoop } from '../../types/geometry';
import { CachedLineEquation } from '../../utils/lineBufferEngine';
import { DominantDirection } from '../../utils/segmentStatistics';

export type SnapType =
  | 'vertex'
  | 'midpoint'
  | 'edge'
  | 'extension'
  | 'direction'
  | 'perpendicular'
  | 'otrack_intersection'
  | 'otrack_ray'
  | 'grid'
  | 'none';

export interface SnapGuideLine {
  p1: Point2D;
  p2: Point2D;
  type?: string;
  isStatistical?: boolean;
}

export interface TrackingRay {
  anchorId: string;
  origin: Point2D;
  type: 'horizontal' | 'vertical' | 'parallel' | 'perpendicular';
  isStatistical?: boolean;
  label: string;
  A: number;
  B: number;
  C: number;
  angleRad: number;
  p1: Point2D;
  p2: Point2D;
}

export interface AnchorPoint {
  id: string;
  point: Point2D;
  sourceType: 'vertex' | 'midpoint' | 'intersection' | 'custom';
  sourceBuildingId?: string;
  sourceEdgeId?: string;
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
  sourceEdgeIndex?: number;
  cachedEdge?: CachedLineEquation;
  intersectingAnchors?: [AnchorPoint, AnchorPoint];
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
  excludeSegmentIndices?: number[];
  hoveredBuildingId?: string;
  selectedBuildingId?: string;
  previousSnapResult?: SnapResult | null;
  hysteresisBonusPx?: number;
  minEdgeLengthMeters?: number;
  activeSnapTypes?: Partial<Record<SnapType, boolean>>;
}

export interface SnapStrategy {
  readonly name: string;
  readonly priority: number;
  findSnap(point: Point2D, context: SnapContext): SnapResult | null;
}

// Compatibility types for drawingToolRenderer & CadCanvas
export type OsnapSnapType =
  | 'endpoint'
  | 'otrack_intersection'
  | 'perpendicular'
  | 'otrack_ray'
  | 'midpoint'
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
  sourceEdgeIndex?: number;
  rayLine?: { p1: Point2D; p2: Point2D };
  activeRays?: TrackingRay[];
  isStatisticalGuide?: boolean;
  intersectingAnchors?: [AnchorPoint, AnchorPoint];
  cachedEdge?: CachedLineEquation;
  parallelAngleDeg?: number;
  collinearDistance?: number;
}
