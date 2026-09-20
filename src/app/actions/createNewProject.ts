import { useSceneStore, useSolarAnalysisStore, useCadToolStore, useUiStore } from '@/store';
import { SCENE_STORAGE_KEY } from '@/app/hooks/useAppBootstrap';

/**
 * Pełny reset aplikacji do stanu "nowego projektu": czyści scenę, historię undo,
 * ustawienia analizy, punkty pomiarowe i zapisany stan sceny w localStorage.
 * Nie czyści cache'u kafli WMS/geo — jest niezależny od treści projektu.
 */
export function createNewProject(): void {
  useSceneStore.getState().resetScene();
  useSceneStore.temporal.getState().clear();
  useSolarAnalysisStore.getState().resetSolarAnalysis();
  useCadToolStore.getState().resetCadTool();

  try {
    localStorage.removeItem(SCENE_STORAGE_KEY);
  } catch (err) {
    console.warn('Nie udało się usunąć zapisanej sceny z localStorage:', err);
  }

  useUiStore.getState().markSaved(Date.now());
}
