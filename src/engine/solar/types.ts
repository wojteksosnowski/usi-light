import {
  Point2D,
  BuildingLoop,
  FacadeSegment,
  ProjectSettings,
  SunlightResult,
  SunlightTimeSlot,
} from '../../types/geometry';
import { SunlightEvaluationResult } from '../regulationEvaluator';

export interface SolarAnalysisContext {
  latitude: number;
  longitude?: number;
  date?: Date | string;
  timeWindow?: { startHour: number; endHour: number };
  minContinuousDurationMin?: number;
  isCityCentre?: boolean;
  stepMinutes?: number;
}

export interface SunlightInterval {
  startHour: number;
  endHour: number;
  durationMinutes: number;
}

export interface SunlightIntervalResult {
  totalMinutes: number;
  totalHours: number;
  isCompliant: boolean;
  timeSlots?: SunlightTimeSlot[];
  intervals?: SunlightInterval[];
  evaluation?: SunlightEvaluationResult;
  rawResult?: SunlightResult;
}

export interface ISolarEngine {
  readonly id: 'analytical' | 'lut';
  calculatePointSunlight(
    point: Point2D,
    segment: FacadeSegment,
    offsetRatio: number,
    buildings: BuildingLoop[],
    targetBuildingId: string,
    settings: ProjectSettings,
    ctx?: Partial<SolarAnalysisContext>
  ): SunlightIntervalResult;
}
