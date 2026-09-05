import {
  Point2D,
  BuildingLoop,
  FacadeSegment,
  ProjectSettings,
  AnalysisPointResult,
  ShadowAnalysisResult,
  PlaygroundSunlightResult,
} from '../../types/geometry';
import {
  runFullAnalysis,
  AnalysisAccuracyOptions,
  AnalysisBatchOutput,
  EnabledAnalyses,
} from '../analysisEngine';
import { RegulationEvaluator, SunlightEvaluationResult, ShadowingEvaluationResult } from '../regulationEvaluator';
import { ISolarEngine, SolarAnalysisContext, SunlightIntervalResult } from './types';
import { AnalyticalSolarEngine } from './AnalyticalSolarEngine';
import { LutSolarEngine } from './LutSolarEngine';

export type SolarEngineMode = 'analytical' | 'lut' | 'auto';

export interface SolarAnalysisEngineOptions {
  mode?: SolarEngineMode;
  isDragging?: boolean;
  analyticalMethod?: 'raycasting' | 'segments';
  stepMinutes?: number;
}

/**
 * SolarAnalysisEngine - Główna fasada silnika nasłonecznienia.
 *
 * Ujednolica dostęp do metod analitycznych i tablicowych LUT,
 * automatycznie przełącza silnik w zależności od interakcji użytkownika (np. 60 FPS LUT podczas drag & drop)
 * oraz integruje ewaluację normatywną poprzez RegulationEvaluator.
 */
export class SolarAnalysisEngine {
  private analyticalEngine: AnalyticalSolarEngine;
  private lutEngine: LutSolarEngine;
  private currentMode: SolarEngineMode;

  constructor(options: SolarAnalysisEngineOptions = {}) {
    this.analyticalEngine = new AnalyticalSolarEngine({
      method: options.analyticalMethod ?? 'raycasting',
      stepMinutes: options.stepMinutes ?? 5,
    });
    this.lutEngine = new LutSolarEngine();
    this.currentMode = options.mode ?? 'auto';
  }

  public setMode(mode: SolarEngineMode): void {
    this.currentMode = mode;
  }

  public getActiveEngine(isDragging: boolean = false): ISolarEngine {
    if (this.currentMode === 'lut' || (this.currentMode === 'auto' && isDragging)) {
      return this.lutEngine;
    }
    return this.analyticalEngine;
  }

  /**
   * Punktowe obliczenie nasłonecznienia dla fasady z ewaluacją prawną
   */
  public calculatePointSunlight(
    point: Point2D,
    segment: FacadeSegment,
    offsetRatio: number,
    buildings: BuildingLoop[],
    targetBuildingId: string,
    settings: ProjectSettings,
    ctx?: Partial<SolarAnalysisContext> & { isDragging?: boolean }
  ): SunlightIntervalResult {
    const engine = this.getActiveEngine(ctx?.isDragging ?? false);
    return engine.calculatePointSunlight(
      point,
      segment,
      offsetRatio,
      buildings,
      targetBuildingId,
      settings,
      ctx
    );
  }

  /**
   * Wykonanie pełnej analizy zbiorczej (batch analysis)
   */
  public runFullAnalysis(
    buildings: BuildingLoop[],
    settings: ProjectSettings,
    options?: AnalysisAccuracyOptions,
    sunlightMethod?: 'raycasting' | 'segments',
    enabledAnalyses?: EnabledAnalyses
  ): AnalysisBatchOutput {
    return runFullAnalysis(
      buildings,
      settings,
      options,
      sunlightMethod,
      enabledAnalyses
    );
  }

  /**
   * Bezpośrednia ewaluacja normatywna nasłonecznienia (§ 56 WT)
   */
  public evaluateSunlightCompliance(
    totalMinutes: number,
    isCityCentre: boolean = false
  ): SunlightEvaluationResult {
    return RegulationEvaluator.evaluateSunlight(totalMinutes, isCityCentre);
  }

  /**
   * Bezpośrednia ewaluacja normatywna przesłaniania (§ 12 WT)
   */
  public evaluateShadowingCompliance(
    sectors: import('../../types/geometry').ShadowingSector[]
  ): ShadowingEvaluationResult {
    return RegulationEvaluator.evaluateShadowing(sectors);
  }
}

// Globalna instancja domyślna dla łatwego importu
export const defaultSolarAnalysisEngine = new SolarAnalysisEngine();
