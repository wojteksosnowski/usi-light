import { runFullAnalysis, AnalysisAccuracyOptions, AnalysisBatchOutput } from './analysisEngine';
import { BuildingLoop, ProjectSettings } from '../types/geometry';

export interface AnalysisWorkerRequest {
  id: number;
  buildings: BuildingLoop[];
  settings: ProjectSettings;
  options?: AnalysisAccuracyOptions;
  sunlightMethod?: 'raycasting' | 'segments';
}

export interface AnalysisWorkerResponse {
  id: number;
  success: boolean;
  output?: any;
  error?: string;
}

self.onmessage = (e: MessageEvent<AnalysisWorkerRequest>) => {
  const { id, buildings, settings, options, sunlightMethod } = e.data;
  try {
    const output = runFullAnalysis(buildings, settings, options, sunlightMethod);
    self.postMessage({ id, success: true, output });
  } catch (err: any) {
    self.postMessage({ id, success: false, error: err?.message || String(err) });
  }
};
