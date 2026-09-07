// src/hooks/useDemoRecorder.ts
// ⚠️ NARZĘDZIE MARKETINGOWE — TYLKO LOCAL DEV
// Cały kod jest opakowany w guard import.meta.env.DEV.
// Vite usuwa ten blok przy buildzie produkcyjnym (tree-shaking).

import { useEffect, useRef } from 'react';
import { CanvasRecorder } from '../utils/canvasRecorder';
import {
  runSolarDemo,
  runShadowingComplianceDemo,
  runRealtimeShadowEnvelopeDemo,
  runPatioSunlightDemo,
  runGeoSolarComparisonDemo,
  wait,
  runDynamicFacadeClashDemo,
} from '../utils/demoRunner';
import { useCadToolStore } from '../store/useCadToolStore';

export type DemoScenario = 'solar' | 'compliance' | 'envelope' | 'patio' | 'geo';

const SCENARIOS: Record<DemoScenario, () => Promise<void>> = {
  solar: runSolarDemo,
  compliance: runShadowingComplianceDemo,
  envelope: runRealtimeShadowEnvelopeDemo,
  patio: runPatioSunlightDemo,
  geo: runGeoSolarComparisonDemo,
  clash: runDynamicFacadeClashDemo,
};

/**
 * Hook montowany w CadCanvas.
 *
 * Wyzwalacze:
 *  - URL: http://localhost:3000/?recordDemo=solar
 *  - Skrót: Ctrl+Shift+D (uruchamia domyślny scenariusz 'solar')
 *
 * Format 1:1:
 *  Przed startem nagrywania tymczasowo zmienia CSS kontenera canvasa na kwadrat
 *  (min(window.innerWidth, window.innerHeight)), a po zakończeniu przywraca.
 *
 * Po zakończeniu nagrania plik `usi-demo-<scenariusz>.webm` jest automatycznie pobierany.
 */
export function useDemoRecorder(
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): void {
  const isRunningRef = useRef(false);

  useEffect(() => {
    // 🔒 Guard produkcyjny — cały efekt jest no-op w trybie PROD
    if (!import.meta.env.DEV) return;

    const params = new URLSearchParams(window.location.search);
    const demoMode = params.get('recordDemo') as DemoScenario | null;

    async function executeRecording(scenarioKey: DemoScenario): Promise<void> {
      if (!canvasRef.current || isRunningRef.current) return;
      isRunningRef.current = true;
      console.info(`[DemoRecorder] 🎬 Start nagrywania scenariusza: "${scenarioKey}"`);

      // ── Format 1:1 — tymczasowy kwadratowy CSS kontenera ──────────────
      const container = canvasRef.current.parentElement as HTMLElement | null;
      const originalWidth = container?.style.width ?? '';
      const originalHeight = container?.style.height ?? '';
      const squareSize = `${Math.min(window.innerWidth, window.innerHeight)}px`;

      if (container) {
        container.style.width = squareSize;
        container.style.height = squareSize;
      }

      // Czekamy na inicjalizację silnika, fontów i re-render po zmianie rozmiaru
      await wait(1200);

      // triggerFit po zmianie rozmiaru kontenera — viewport dopasuje się do nowego kwadratu
      useCadToolStore.getState().triggerFit();
      await wait(300);

      const recorder = new CanvasRecorder(canvasRef.current!);
      recorder.start();

      try {
        const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.solar;
        await scenario();
      } catch (err) {
        console.error(`[DemoRecorder] Błąd w trakcie wykonywania scenariusza "${scenarioKey}":`, err);
      } finally {
        const blob = await recorder.stop();

        // ── Przywrócenie oryginalnych wymiarów kontenera ─────────────────
        if (container) {
          container.style.width = originalWidth;
          container.style.height = originalHeight;
        }

        const fileName = `usi-demo-${scenarioKey}.webm`;
        CanvasRecorder.downloadBlob(blob, fileName);
        console.info(
          `[DemoRecorder] ✅ Nagranie zapisane: ${fileName} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`
        );
        isRunningRef.current = false;
      }
    }

    // Wyzwalacz URL
    if (demoMode && demoMode in SCENARIOS) {
      executeRecording(demoMode);
    }

    // Skrót klawiaturowy: Ctrl+Shift+D
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        executeRecording('solar');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canvasRef]);
}

