import { useEffect } from 'react';
import { useLicenseStore, useSolarAnalysisStore } from '../../../store';
import { APP_CONFIG } from '../../../config/appConfig';
import { prefetchAllGeoLayersWarmup } from '../registerGeoLayers';
import { useWfsStore } from '../store/useWfsStore';
import { fetchDtmBbox } from '../services/wcsGugikClient';
import { wgs84ToCadPoint, CrsDetectionResult } from '../../../utils/geoTransform';

const EPSG_2180: CrsDetectionResult = {
  crs: 'EPSG:2180',
  description: 'PL-1992',
  geodeticLabel: 'ETRF2000-PL / CS1992',
  isGeodetic: true,
};

/**
 * Cichy warm-up bufora kafli WMS (Z16–Z18) oraz siatki NMT DTM — przy starcie aplikacji
 * oraz przy każdej zmianie środka/promienia projektu, niezależnie od tego czy warstwy są włączone.
 *
 * Odroczony dwustopniowo (debounce + `requestIdleCallback`), żeby nie konkurować o sieć i główny
 * wątek z hydratacją sceny, workerem analiz i pierwszym renderem.
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
    const abortController = new AbortController();

    const startWarmup = () => {
      // 1. Warm-up kafli rastrowych WMS
      cancelWarmup = prefetchAllGeoLayersWarmup(latitude, longitude, projectRadius);

      // 2. Warm-up siatki NMT DTM w tle (asynchronicznie)
      const fetchDtmInBackground = async () => {
        try {
          useWfsStore.getState().setIsTerrainDtmBuffering(true, 15);
          const centerPl1992 = wgs84ToCadPoint({ lat: latitude, lon: longitude }, EPSG_2180);
          const minX = centerPl1992.x - projectRadius;
          const minY = centerPl1992.y - projectRadius;
          const maxX = centerPl1992.x + projectRadius;
          const maxY = centerPl1992.y + projectRadius;

          useWfsStore.getState().setIsTerrainDtmBuffering(true, 45);
          const dtm = await fetchDtmBbox(minX, minY, maxX, maxY, 'DTM_PL-KRON86-NH', abortController.signal);
          if (!abortController.signal.aborted) {
            useWfsStore.getState().setTerrainDtmCache(dtm);
            console.log('[useGeoTileWarmup] Bufor NMT DTM załadowany w tle ✓');
          }
        } catch (err: any) {
          if (!abortController.signal.aborted) {
            console.warn('[useGeoTileWarmup] Ciche buforowanie NMT DTM w tle:', err?.message || err);
            useWfsStore.getState().setIsTerrainDtmBuffering(false, 0);
          }
        }
      };

      // Uruchamiamy pobieranie DTM z lekkim opóźnieniem, żeby nie blokować pierwszych zapytań WMS
      setTimeout(() => {
        if (!abortController.signal.aborted) {
          fetchDtmInBackground();
        }
      }, 500);
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
      abortController.abort();
      if (idleHandle !== 0 && typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(idleHandle);
      cancelWarmup?.();
    };
  }, [isPro, latitude, longitude, projectRadius]);
}
