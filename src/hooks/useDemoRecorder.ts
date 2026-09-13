// src/hooks/useDemoRecorder.ts
// ⚠️ NARZĘDZIE REJESTRACJI I ODTWARZANIA DZIAŁAŃ (DEV ONLY)

import { useEffect, useRef } from 'react';
import { ActionRecorderEngine } from '../modules/action-recorder/ActionRecorderEngine';
import { useActionRecorderStore } from '../modules/action-recorder/useActionRecorderStore';
import { downloadBlob, downloadJson } from '../modules/action-recorder/actionRecorderStorage';

/**
 * Hook podpinany do CadCanvas.
 * Obsługuje globalny skrót klawiaturowy:
 *  - ~ (lub ` / Backquote) — Rozpoczęcie / Zatrzymanie nagrywania
 */
export function useDemoRecorder(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef?: React.RefObject<HTMLDivElement | null>
): {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
} {
  const engine = ActionRecorderEngine.getInstance();
  const isBusyRef = useRef(false);

  const startRecording = async () => {
    if (!canvasRef.current || isBusyRef.current) return;
    isBusyRef.current = true;
    try {
      const container = containerRef?.current || (canvasRef.current.parentElement as HTMLElement | null);
      await engine.start(canvasRef.current, container);
    } finally {
      isBusyRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    try {
      const result = await engine.stop();
      if (result) {
        console.info(`[ActionRecorder] ✅ Zapisano sesję: ${result.session.id}`);
        // Automatyczne pobranie wygenerowanych plików
        const titleSafe = result.session.title.replace(/\s+/g, '_');
        downloadBlob(result.videoBlob, `${titleSafe}.webm`);
        downloadJson(result.session, `${titleSafe}.json`);
      }
    } finally {
      isBusyRef.current = false;
    }
  };

  useEffect(() => {
    // 🔒 Guard produkcyjny — cały efekt jest no-op w trybie PROD
    if (!import.meta.env.DEV) return;

    const handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
      // Ignoruj wpisywanie tekstu w polach edycyjnych
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Skrót: ~ lub ` (Backquote)
      if (e.key === '~' || e.key === '`' || e.code === 'Backquote') {
        e.preventDefault();
        e.stopPropagation();

        if (engine.isRecording()) {
          await stopRecording();
        } else {
          await startRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [canvasRef, containerRef]);

  return {
    startRecording,
    stopRecording,
  };
}
