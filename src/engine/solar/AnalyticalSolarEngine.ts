import {
  Point2D,
  BuildingLoop,
  FacadeSegment,
  ProjectSettings,
  SunlightResult,
} from '../../types/geometry';
import { analyzeSunlightAtPoint, analyzeSunlightAtPointSegments } from '../analysisEngine';
import { RegulationEvaluator } from '../regulationEvaluator';
import { ISolarEngine, SolarAnalysisContext, SunlightIntervalResult } from './types';

export interface AnalyticalSolarEngineOptions {
  method?: 'raycasting' | 'segments';
  stepMinutes?: number;
}

export class AnalyticalSolarEngine implements ISolarEngine {
  readonly id = 'analytical' as const;
  private method: 'raycasting' | 'segments';
  private stepMinutes: number;

  constructor(options: AnalyticalSolarEngineOptions = {}) {
    this.method = options.method ?? 'raycasting';
    this.stepMinutes = options.stepMinutes ?? 5;
  }

  public calculatePointSunlight(
    point: Point2D,
    segment: FacadeSegment,
    offsetRatio: number,
    buildings: BuildingLoop[],
    targetBuildingId: string,
    settings: ProjectSettings,
    ctx?: Partial<SolarAnalysisContext>
  ): SunlightIntervalResult {
    const isCityCentre = ctx?.isCityCentre ?? segment.isCityCentre ?? settings.isCityCentreDefault ?? false;
    const stepMin = ctx?.stepMinutes ?? this.stepMinutes;

    const rawResult: SunlightResult = this.method === 'segments'
      ? analyzeSunlightAtPointSegments(
          point,
          segment,
          offsetRatio,
          buildings,
          targetBuildingId,
          settings
        )
      : analyzeSunlightAtPoint(
          point,
          segment,
          offsetRatio,
          buildings,
          targetBuildingId,
          settings,
          stepMin
        );

    const evaluation = RegulationEvaluator.evaluateSunlight(
      rawResult.totalMinutes,
      isCityCentre
    );

    return {
      totalMinutes: rawResult.totalMinutes,
      totalHours: rawResult.totalHours,
      isCompliant: evaluation.isCompliant,
      timeSlots: rawResult.timeSlots,
      evaluation,
      rawResult,
    };
  }
}
