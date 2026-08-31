import { useState, useEffect, useRef } from 'react';
import { BuildingLoop, ProjectSettings } from '../types/geometry';
import { runFullAnalysis, AnalysisAccuracyOptions, AnalysisBatchOutput } from '../engine/analysisEngine';
import { AnalysisWorkerRequest, AnalysisWorkerResponse } from '../engine/analysis.worker';

export function useAnalysisWorker(
  buildings: BuildingLoop[],
  settings: ProjectSettings,
  options: AnalysisAccuracyOptions,
  sunlightMethod: 'raycasting' | 'segments' = 'raycasting'
) {
  // Initial immediate synchronous calculation for immediate initial mount
  const [analysisOutput, setAnalysisOutput] = useState<AnalysisBatchOutput>(() => {
    return runFullAnalysis(buildings, settings, options, sunlightMethod);
  });

  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const workerRef = useRef<Worker | null>(null);
  const nextReqId = useRef<number>(0);
  const lastAppliedReqId = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Initialize Web Worker instance
  useEffect(() => {
    isMountedRef.current = true;
    try {
      workerRef.current = new Worker(
        new URL('../engine/analysis.worker.ts', import.meta.url),
        { type: 'module' }
      );

      workerRef.current.onmessage = (e: MessageEvent<AnalysisWorkerResponse>) => {
        if (!isMountedRef.current) return;
        const { id, success, output } = e.data;
        if (success && output && id >= lastAppliedReqId.current) {
          lastAppliedReqId.current = id;
          setAnalysisOutput(output);
          if (id >= nextReqId.current) {
            setIsCalculating(false);
          }
        } else if (!success) {
          setIsCalculating(false);
        }
      };

      workerRef.current.onerror = (err) => {
        console.warn('Web Worker error, falling back to main thread calculation:', err);
        setIsCalculating(false);
      };
    } catch (err) {
      console.warn('Could not instantiate Web Worker:', err);
    }

    return () => {
      isMountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Post calculation task when inputs change
  useEffect(() => {
    const reqId = ++nextReqId.current;
    if (workerRef.current) {
      setIsCalculating(true);
      const req: AnalysisWorkerRequest = {
        id: reqId,
        buildings,
        settings,
        options,
        sunlightMethod,
      };
      workerRef.current.postMessage(req);
    } else {
      // Fallback to sync if worker is unavailable
      const output = runFullAnalysis(buildings, settings, options, sunlightMethod);
      if (isMountedRef.current) {
        setAnalysisOutput(output);
        setIsCalculating(false);
      }
    }
  }, [buildings, settings, options, sunlightMethod]);

  return {
    analysisOutput,
    isCalculating,
  };
}
