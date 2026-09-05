import { AnalysisAccuracyOptions, AnalysisBatchOutput, EnabledAnalyses } from './analysisEngine';
import { defaultSolarAnalysisEngine } from './solar';
import { BuildingLoop, ProjectSettings } from '../types/geometry';

export interface AnalysisWorkerRequest {
  id: number;
  buildings: BuildingLoop[];
  settings: ProjectSettings;
  options?: AnalysisAccuracyOptions;
  sunlightMethod?: 'raycasting' | 'segments';
  enabledAnalyses?: EnabledAnalyses;
}

export interface AnalysisWorkerResponse {
  id: number;
  success: boolean;
  output?: any;
  error?: string;
}

self.onmessage = (e: MessageEvent<AnalysisWorkerRequest>) => {
  const { id, buildings, settings, options, sunlightMethod, enabledAnalyses } = e.data;
  try {
    const output = defaultSolarAnalysisEngine.runFullAnalysis(
      buildings,
      settings,
      options,
      sunlightMethod,
      enabledAnalyses
    );
    self.postMessage({ id, success: true, output });
  } catch (err: any) {
    self.postMessage({ id, success: false, error: err?.message || String(err) });
  }
};
