import { useState, useEffect, useRef, useCallback } from 'react';
import { BuildingLoop, ProjectSettings } from '../types/geometry';
import { runFullAnalysis, AnalysisAccuracyOptions, AnalysisBatchOutput, EnabledAnalyses } from '../engine/analysisEngine';
import { AnalysisWorkerRequest, AnalysisWorkerResponse } from '../engine/analysis.worker';

export function useAnalysisWorker(
  buildings: BuildingLoop[],
  settings: ProjectSettings,
  options: AnalysisAccuracyOptions,
  sunlightMethod: 'raycasting' | 'segments' = 'raycasting',
  isLiveInteraction: boolean = false,
  enabledAnalyses?: EnabledAnalyses
) {
  // Initial immediate synchronous calculation for immediate initial mount
  const [analysisOutput, setAnalysisOutput] = useState<AnalysisBatchOutput>(() => {
    return runFullAnalysis(buildings, settings, options, sunlightMethod, enabledAnalyses);
  });

  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const workerRef = useRef<Worker | null>(null);
  const isBusyRef = useRef<boolean>(false);
  const nextReqId = useRef<number>(0);
  const lastAppliedReqId = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to spawn a clean Web Worker instance
  const initWorker = useCallback(() => {
    try {
      const worker = new Worker(
        new URL('../engine/analysis.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent<AnalysisWorkerResponse>) => {
        if (!isMountedRef.current) return;
        isBusyRef.current = false;
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

      worker.onerror = (err) => {
        console.warn('Web Worker error, resetting worker:', err);
        isBusyRef.current = false;
        setIsCalculating(false);
      };

      return worker;
    } catch (err) {
      console.warn('Could not instantiate Web Worker:', err);
      return null;
    }
  }, []);

  // Initialize Web Worker on mount and cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    workerRef.current = initWorker();

    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      workerRef.current?.terminate();
      workerRef.current = null;
      isBusyRef.current = false;
    };
  }, [initWorker]);

  // Dispatch calculation to Web Worker (with Terminate-on-Supersede guarantee)
  const dispatchCalculation = useCallback(
    (
      bldgs: BuildingLoop[],
      st: ProjectSettings,
      opt: AnalysisAccuracyOptions,
      method: 'raycasting' | 'segments',
      analyses?: EnabledAnalyses
    ) => {
      const reqId = ++nextReqId.current;

      if (!workerRef.current) {
        workerRef.current = initWorker();
      }

      if (workerRef.current) {
        // If worker is currently busy calculating a previous superseded task,
        // terminate it immediately in 0.01ms to clear the thread and queue completely!
        if (isBusyRef.current) {
          workerRef.current.terminate();
          workerRef.current = initWorker();
          isBusyRef.current = false;
        }

        if (workerRef.current) {
          setIsCalculating(true);
          isBusyRef.current = true;
          const req: AnalysisWorkerRequest = {
            id: reqId,
            buildings: bldgs,
            settings: st,
            options: opt,
            sunlightMethod: method,
            enabledAnalyses: analyses,
          };
          workerRef.current.postMessage(req);
        }
      } else {
        // Fallback to sync if worker is unavailable
        const output = runFullAnalysis(bldgs, st, opt, method, analyses);
        if (isMountedRef.current) {
          setAnalysisOutput(output);
          setIsCalculating(false);
          isBusyRef.current = false;
        }
      }
    },
    [initWorker]
  );

  // Trigger calculation whenever inputs change
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (isLiveInteraction) {
      // During active dragging / live interaction, throttle requests by 80ms to avoid flooding
      debounceTimerRef.current = setTimeout(() => {
        dispatchCalculation(buildings, settings, options, sunlightMethod, enabledAnalyses);
      }, 80);
    } else {
      // Immediate dispatch when not dragging (e.g. idle refinement or settings change)
      dispatchCalculation(buildings, settings, options, sunlightMethod, enabledAnalyses);
    }
  }, [buildings, settings, options, sunlightMethod, isLiveInteraction, enabledAnalyses, dispatchCalculation]);

  return {
    analysisOutput,
    isCalculating,
  };
}
