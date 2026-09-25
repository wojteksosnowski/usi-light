import React, { useEffect, useRef } from 'react';
import { useSolarAnalysisStore } from '../../store/useSolarAnalysisStore';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useUiStore } from '../../store/useUiStore';
import { useWfsStore } from '../../modules/wfs-import/store/useWfsStore';
import { useOsmLanduseStore, OsmLanduseLayerConfig } from '../../modules/wfs-import/store/useOsmLanduseStore';
import { useSceneStore } from '../../store/useSceneStore';

import { applyStoreOverrides, StoreOverrideEntry } from '../../store/storeSnapshot';

const KIOSK_FIT_OPTS = { ignoreSelection: true, fitMode: 'project_circle_cover' as const };

/**
 * Zwraca konfigurację wyłączenia wszystkich warstw analitycznych, podkładowych i narzędzi w trybie Kiosk.
 */
export function getKioskStoreOverrides(): StoreOverrideEntry[] {
  return [
    {
      store: useSolarAnalysisStore,
      overrides: {
        showNormals: false,
        showShadowingLines: false,
        showSunlightLines: false,
        showAnalysisPoints: false,
        showShadowRange: false,
        showShadowFill: false,
        showSatelliteLayer: false,
        activePinnedPointId: null,
      },
    },
    {
      store: useWfsStore,
      overrides: {
        showGeoOverlayGroup: false,
        showKiutLayer: false,
        showBdotLayer: false,
        showOrthophotoLayer: false,
        showPlansOverlayGroup: false,
        showMpzpLayer: false,
        showMpzpZonesLayer: false,
        showLandCoverLayer: false,
        showOvertureGreenAreas: false,
        showTreesLayer: false,
      },
    },
    {
      store: useOsmLanduseStore,
      capture: (s: any) => ({
        showOsmLanduseGroup: s.showOsmLanduseGroup,
        layers: (s.layers || []).map((l: OsmLanduseLayerConfig) => ({ ...l })),
      }),
      apply: () => {
        const osm = useOsmLanduseStore.getState();
        osm.setShowOsmLanduseGroup(false);
        osm.setAllLayersVisibility(false);
      },
      restore: (_, snapshot) => {
        const osm = useOsmLanduseStore.getState();
        osm.setShowOsmLanduseGroup(snapshot.showOsmLanduseGroup);
        for (const layer of snapshot.layers) {
          osm.updateLayerConfig(layer.id, { isVisible: layer.isVisible });
        }
      },
    },
    {
      store: useCadToolStore,
      overrides: {
        isDimensionToolActive: false,
        facadePointMode: false,
        drawingMode: 'none',
      },
    },
    {
      store: useSceneStore,
      overrides: {
        selectedBuildingId: null,
        selectedBuildingIds: [],
      },
    },
    {
      store: useUiStore,
      overrides: {
        isSidebarOpen: false,
      },
    },
  ];
}

interface MobileKioskOverlayProps {
  /** Krok w minutach co tick (domyślnie 1 min) */
  stepMinutes?: number;
  /** Odstęp czasowy w milisekundach (domyślnie 1000 / 30 ms = 1/30 s) */
  intervalMs?: number;
}

export const MobileKioskOverlay: React.FC<MobileKioskOverlayProps> = ({
  stepMinutes = 1,
  intervalMs = 1000 / 30,
}) => {
  const setViewMode2D = useUiStore((s) => s.setViewMode2D);
  const setMobileShowcasePreview = useUiStore((s) => s.setMobileShowcasePreview);
  const triggerFit = useCadToolStore((s) => s.triggerFit);

  const setMasterplanHourFraction = useSolarAnalysisStore((s) => s.setMasterplanHourFraction);
  const initialViewModeRef = useRef(useUiStore.getState().viewMode2D);

  // 1. Całkowite wyłączenie WSZYSTKICH warstw analitycznych, podkładowych i geodezyjnych ze snapshotem
  useEffect(() => {
    const restoreStores = applyStoreOverrides(getKioskStoreOverrides());

    const prevMode = initialViewModeRef.current;
    setViewMode2D('masterplan_white');
    triggerFit(KIOSK_FIT_OPTS);
    const fitTimer1 = setTimeout(() => triggerFit(KIOSK_FIT_OPTS), 60);
    const fitTimer2 = setTimeout(() => triggerFit(KIOSK_FIT_OPTS), 180);

    // Automatyczne elastyczne centrowanie i dopasowanie przy zmianach rozmiaru ekranu,
    // skoalescowane do rAF, żeby seria zdarzeń resize podczas przeciągania okna nie
    // odpalała pełnego przeliczenia dopasowania widoku na każdą klatkę.
    const hasWindow = typeof window !== 'undefined';
    let resizeRafId: number | null = null;
    const handleResize = () => {
      if (resizeRafId !== null) return;
      if (typeof requestAnimationFrame === 'function') {
        resizeRafId = requestAnimationFrame(() => {
          resizeRafId = null;
          triggerFit(KIOSK_FIT_OPTS);
        });
      } else {
        triggerFit(KIOSK_FIT_OPTS);
      }
    };
    if (hasWindow) {
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);
    }

    // Globalna cicha obsługa klawisza ESC do wyjścia z trybu Kiosk
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        setMobileShowcasePreview(false);
      }
    };
    if (hasWindow) {
      window.addEventListener('keydown', handleKeyDown, { capture: true });
    }

    return () => {
      clearTimeout(fitTimer1);
      clearTimeout(fitTimer2);
      if (resizeRafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(resizeRafId);
      }
      if (hasWindow) {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
        window.removeEventListener('keydown', handleKeyDown, { capture: true });
      }

      // Przywróć stan wszystkich warstw i narzędzi
      restoreStores();

      if (prevMode !== 'masterplan_white') {
        setViewMode2D(prevMode);
      }
      triggerFit();
    };
  }, [setMobileShowcasePreview, setViewMode2D, triggerFit]);

  // 2. Automatyczna animacja słońca w tle od 7:00 do 17:00 (-5h do +5h od południa)
  useEffect(() => {
    const timer = setInterval(() => {
      const current = useSolarAnalysisStore.getState().masterplanHourFraction;
      let next = current + stepMinutes / 60;
      if (next > 17.0 || next < 7.0) {
        next = 7.0;
      }
      setMasterplanHourFraction(next);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [stepMinutes, intervalMs, setMasterplanHourFraction]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
        paddingBottom: '1rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 100,
      }}
    >
      <span
        style={{
          color: '#000000',
          fontSize: 'clamp(2rem, 5vw, 3.25rem)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        swiatlo.app
      </span>
    </div>
  );
};

