export interface Point2D {
  x: number;
  y: number;
}

export interface Vector2D {
  x: number;
  y: number;
}

export type BuildingType = 'residential' | 'childcare' | 'other';

export interface FacadeSegment {
  id: string;
  p1: Point2D;
  p2: Point2D;
  normal: Vector2D; // Outward unit normal vector
  length: number;
  angleRad: number; // Wall azimuth/angle in radians
  hTop: number; // Top shadowing edge elevation (m)
  hWindowBottom: number; // Bottom edge of window elevation (default parapet e.g. 0.85m)
  isCityCentre: boolean;
  buildingType: BuildingType;
}

export interface BuildingLoop {
  id: string;
  name: string;
  layer: string;
  isTested: boolean; // True for the building under analysis, false for existing/obstacles
  isIncluded?: boolean; // True (default) if included in calculations (as tested or obstacle); false to ignore
  isCityCentre: boolean;
  buildingType: BuildingType;
  defaultHeight: number;
  hWindowBottom: number;
  vertices: Point2D[];
  segments: FacadeSegment[];
  isClockwise: boolean;
  transform: {
    tx: number;
    ty: number;
    rotationDeg: number;
  };
}

export interface ShadowingSector {
  startAngleDeg: number;
  endAngleDeg: number;
  spanDeg: number;
  isFree: boolean;
  minObstacleDistance?: number;
  requiredDistance?: number;
}

export interface ShadowingResult {
  point: Point2D;
  segmentId: string;
  offsetRatio: number; // 0 to 1 along the segment
  isCompliant: boolean; // § 12 requirement satisfied
  maxContinuousFreeSpanDeg: number;
  totalFreeSpanDeg: number;
  sectors: ShadowingSector[];
  rays: {
    angleDeg: number; // Angle relative to normal (-78 to +78)
    worldAngleDeg: number;
    isFree: boolean;
    hitDistance: number;
    reqDistance: number;
    hitPoint?: Point2D;
    obstacleId?: string;
  }[];
}

export interface SunlightTimeSlot {
  time: string; // "HH:MM"
  azimuthDeg: number;
  elevationDeg: number;
  isSunAboveHorizon: boolean;
  isAngleAbove12Deg: boolean;
  isDirectSunlight: boolean;
  blockingObstacleId?: string;
  blockingAngleDeg?: number;
}

export interface SunlightResult {
  point: Point2D;
  segmentId: string;
  offsetRatio: number;
  totalMinutes: number;
  totalHours: number;
  isCompliant: boolean; // >= 3.0h (or 1.5h in city centre)
  timeSlots: SunlightTimeSlot[];
}

export interface AnalysisPointResult {
  id: string;
  point: Point2D;
  normal: Vector2D;
  segmentId: string;
  buildingId: string;
  shadowing: ShadowingResult;
  sunlight: SunlightResult;
}

export interface ProjectSettings {
  latitude: number; // e.g. 52.2297 for Warsaw
  longitude: number; // e.g. 21.0122
  isCityCentreDefault: boolean;
  samplingInterval: number; // in meters, e.g. 0.5m
  equinoxDate: 'spring' | 'autumn'; // March 21 vs Sept 23
}
