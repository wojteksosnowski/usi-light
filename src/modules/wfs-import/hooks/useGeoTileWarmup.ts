import { useEffect } from 'react';
import { useLicenseStore, useSolarAnalysisStore } from '../../../store';
import { APP_CONFIG } from '../../../config/appConfig';
import { prefetchAllGeoLayersWarmup } from '../registerGeoLayers';
import { useWfsStore } from '../store/useWfsStore';

/**
 * Cichy warm-up bufora kafli WMS (Z16–Z18) dla WSZYSTKICH serwisów — przy starcie aplikacji
 * oraz przy każdej zmianie środka/promienia projektu, niezależnie od tego czy warstwy są włączone.
 *
 * Odroczony dwustopniowo (debounce + `requestIdleCallback`), żeby nie konkurować o sieć i główny
 * wątek z hydratacją sceny, workerem analiz i pierwszym renderem. Bramka PRO jest w środku
 * `prefetchAllGeoLayersWarmup`; `isPro` w dependencies oznacza, że warm-up wystartuje również
 * wtedy, gdy licencja rozwiąże się dopiero po montażu (async `initializeLicense`).
 */
export function useGeoTileWarmup() {
  const isPro = useLicenseStore((s) => s.isPro);
  const latitude = useSolarAnalysisStore((s) => s.settings.latitude);
  const longitude = useSolarAnalysisStore((s) => s.settings.longitude);
  const projectRadius = useWfsStore((s) => s.projectRadius);

  useEffect(() => {
    if (!isPro) return;

    let cancelWarmup: (() => void) | null = null;
    let idleHandle = 0;

    const startWarmup = () => {
      cancelWarmup = prefetchAllGeoLayersWarmup(latitude, longitude, projectRadius);
    };

    const scheduleInIdle = () => {
      if (typeof requestIdleCallback === 'undefined') {
        startWarmup();
        return;
      }
      idleHandle = requestIdleCallback(startWarmup, { timeout: 3000 });
    };

    const delayTimer = setTimeout(scheduleInIdle, APP_CONFIG.geo.wmsWarmupDelayMs);

    return () => {
      clearTimeout(delayTimer);
      if (idleHandle !== 0 && typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(idleHandle);
      // Anuluje jeszcze niewystrzelone starty poszczególnych serwisów (stagger) — bez tego szybka
      // zmiana środka projektu wysłałaby serię żądań dla już nieaktualnych współrzędnych.
      cancelWarmup?.();
    };
  }, [isPro, latitude, longitude, projectRadius]);
}
