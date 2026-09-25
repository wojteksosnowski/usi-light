import React, { useEffect } from 'react';
import { useSolarAnalysisStore } from '../../store/useSolarAnalysisStore';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useUiStore } from '../../store/useUiStore';
import { useWfsStore } from '../../modules/wfs-import/store/useWfsStore';
import { useOsmLanduseStore } from '../../modules/wfs-import/store/useOsmLanduseStore';
import { useSceneStore } from '../../store/useSceneStore';

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
  const viewMode2D = useUiStore((s) => s.viewMode2D);
  const setViewMode2D = useUiStore((s) => s.setViewMode2D);
  const setMobileShowcasePreview = useUiStore((s) => s.setMobileShowcasePreview);
  const triggerFit = useCadToolStore((s) => s.triggerFit);

  const setMasterplanHourFraction = useSolarAnalysisStore((s) => s.setMasterplanHourFraction);

  // 1. Całkowite wyłączenie WSZYSTKICH warstw analitycznych, podkładowych i geodezyjnych
  useEffect(() => {
    const solar = useSolarAnalysisStore.getState();
    const wfs = useWfsStore.getState();
    const osm = useOsmLanduseStore.getState();
    const cadTools = useCadToolStore.getState();
    const scene = useSceneStore.getState();

    // Migawka stanu warstw analitycznych (Solar / §12 / §56 / Cień / Punkty / Satelita)
    const prevSolar = {
      showNormals: solar.showNormals,
      showShadowingLines: solar.showShadowingLines,
      showSunlightLines: solar.showSunlightLines,
      showAnalysisPoints: solar.showAnalysisPoints,
      showShadowRange: solar.showShadowRange,
      showShadowFill: solar.showShadowFill,
      showSatelliteLayer: solar.showSatelliteLayer,
      activePinnedPointId: solar.activePinnedPointId,
    };

    // Migawka stanu warstw podkładowych i planistycznych (GESUT, BDOT, Orto, MPZP, Zieleń, Drzewa)
    const prevWfs = {
      showGeoOverlayGroup: wfs.showGeoOverlayGroup,
      showKiutLayer: wfs.showKiutLayer,
      showBdotLayer: wfs.showBdotLayer,
      showOrthophotoLayer: wfs.showOrthophotoLayer,
      showPlansOverlayGroup: wfs.showPlansOverlayGroup,
      showMpzpLayer: wfs.showMpzpLayer,
      showMpzpZonesLayer: wfs.showMpzpZonesLayer,
      showLandCoverLayer: wfs.showLandCoverLayer,
      showOvertureGreenAreas: wfs.showOvertureGreenAreas,
      showTreesLayer: wfs.showTreesLayer,
    };

    // Migawka stanu zagospodarowania OSM
    const prevOsm = {
      showOsmLanduseGroup: osm.showOsmLanduseGroup,
      layers: osm.layers.map((l) => ({ ...l })),
    };

    // Migawka narzędzi kreślarskich i wymiarowania
    const prevCadTools = {
      isDimensionToolActive: cadTools.isDimensionToolActive,
      facadePointMode: cadTools.facadePointMode,
      drawingMode: cadTools.drawingMode,
    };

    // Migawka selekcji obiektów
    const prevSelection = {
      selectedBuildingId: scene.selectedBuildingId,
      selectedBuildingIds: [...scene.selectedBuildingIds],
    };

    // Migawka panelu bocznego
    const prevSidebarOpen = useUiStore.getState().isSidebarOpen;
    useUiStore.getState().setSidebarOpen(false);

    // WYŁĄCZ WSZYSTKIE WARSTWY ANALITYCZNE I PODKŁADOWE
    solar.setShowNormals(false);
    solar.setShowShadowingLines(false);
    solar.setShowSunlightLines(false);
    solar.setShowAnalysisPoints(false);
    solar.setShowShadowRange(false);
    solar.setShowShadowFill(false);
    solar.setShowSatelliteLayer(false);
    solar.setActivePinnedPointId(null);

    wfs.setShowGeoOverlayGroup(false);
    wfs.setShowKiutLayer(false);
    wfs.setShowBdotLayer(false);
    wfs.setShowOrthophotoLayer(false);
    wfs.setShowPlansOverlayGroup(false);
    wfs.setShowMpzpLayer(false);
    wfs.setShowMpzpZonesLayer(false);
    wfs.setShowLandCoverLayer(false);
    wfs.setShowOvertureGreenAreas(false);
    wfs.setShowTreesLayer(false);

    osm.setShowOsmLanduseGroup(false);
    osm.setAllLayersVisibility(false);

    cadTools.setIsDimensionToolActive(false);
    cadTools.setFacadePointMode(false);
    cadTools.setDrawingMode('none');

    scene.setSelectedBuildingId(null);
    scene.setSelectedBuildingIds([]);

    const prevMode = viewMode2D;
    setViewMode2D('masterplan_white');
    triggerFit({ ignoreSelection: true, fitMode: 'project_circle_cover' });
    const fitTimer1 = setTimeout(() => {
      triggerFit({ ignoreSelection: true, fitMode: 'project_circle_cover' });
    }, 60);
    const fitTimer2 = setTimeout(() => {
      triggerFit({ ignoreSelection: true, fitMode: 'project_circle_cover' });
    }, 180);

    // Automatyczne elastyczne centrowanie i dopasowanie przy zmianach rozmiaru ekranu
    const handleResize = () => {
      triggerFit({ ignoreSelection: true, fitMode: 'project_circle_cover' });
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Globalna cicha obsługa klawisza ESC do wyjścia z trybu Kiosk
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        setMobileShowcasePreview(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      clearTimeout(fitTimer1);
      clearTimeout(fitTimer2);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });

      // PRZYWRÓĆ STAN WSZYSTKICH WARSTW I NARZĘDZI
      solar.setShowNormals(prevSolar.showNormals);
      solar.setShowShadowingLines(prevSolar.showShadowingLines);
      solar.setShowSunlightLines(prevSolar.showSunlightLines);
      solar.setShowAnalysisPoints(prevSolar.showAnalysisPoints);
      solar.setShowShadowRange(prevSolar.showShadowRange);
      solar.setShowShadowFill(prevSolar.showShadowFill);
      solar.setShowSatelliteLayer(prevSolar.showSatelliteLayer);
      solar.setActivePinnedPointId(prevSolar.activePinnedPointId);

      wfs.setShowGeoOverlayGroup(prevWfs.showGeoOverlayGroup);
      wfs.setShowKiutLayer(prevWfs.showKiutLayer);
      wfs.setShowBdotLayer(prevWfs.showBdotLayer);
      wfs.setShowOrthophotoLayer(prevWfs.showOrthophotoLayer);
      wfs.setShowPlansOverlayGroup(prevWfs.showPlansOverlayGroup);
      wfs.setShowMpzpLayer(prevWfs.showMpzpLayer);
      wfs.setShowMpzpZonesLayer(prevWfs.showMpzpZonesLayer);
      wfs.setShowLandCoverLayer(prevWfs.showLandCoverLayer);
      wfs.setShowOvertureGreenAreas(prevWfs.showOvertureGreenAreas);
      wfs.setShowTreesLayer(prevWfs.showTreesLayer);

      osm.setShowOsmLanduseGroup(prevOsm.showOsmLanduseGroup);
      for (const layer of prevOsm.layers) {
        osm.updateLayerConfig(layer.id, { isVisible: layer.isVisible });
      }

      cadTools.setIsDimensionToolActive(prevCadTools.isDimensionToolActive);
      cadTools.setFacadePointMode(prevCadTools.facadePointMode);
      cadTools.setDrawingMode(prevCadTools.drawingMode);

      scene.setSelectedBuildingId(prevSelection.selectedBuildingId);
      scene.setSelectedBuildingIds(prevSelection.selectedBuildingIds);

      useUiStore.getState().setSidebarOpen(prevSidebarOpen);

      if (prevMode !== 'masterplan_white') {
        setViewMode2D(prevMode);
      }
      triggerFit();
    };
  }, [setMobileShowcasePreview, setViewMode2D, triggerFit, viewMode2D]);

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

  return null;
};
