import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobileKioskOverlay, getKioskStoreOverrides } from './MobileKioskOverlay';
import { applyStoreOverrides } from '../../store/storeSnapshot';
import { useSolarAnalysisStore } from '../../store/useSolarAnalysisStore';
import { useWfsStore } from '../../modules/wfs-import/store/useWfsStore';
import { useOsmLanduseStore } from '../../modules/wfs-import/store/useOsmLanduseStore';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useSceneStore } from '../../store/useSceneStore';
import { useUiStore } from '../../store/useUiStore';

describe('MobileKioskOverlay', () => {
  it('renderuje napis swiatlo.app jako nakładkę', () => {
    const html = renderToStaticMarkup(<MobileKioskOverlay stepMinutes={1} intervalMs={100} />);
    expect(html).toContain('swiatlo.app');
    expect(html).toContain('position:fixed');
    expect(html).toContain('color:#000000');
    expect(html).toContain('font-weight:900');
  });

  it('wyłącza wszystkie warstwy CAD i narzędzia w trybie Kiosk oraz przywraca je w 100% po restore()', () => {
    // 1. Ustawienie specyficznego stanu początkowego we wszystkich 6 store'ach
    useSolarAnalysisStore.setState({
      showNormals: true,
      showShadowingLines: true,
      showSunlightLines: true,
      showAnalysisPoints: true,
      showShadowRange: true,
      showShadowFill: true,
      showSatelliteLayer: true,
      activePinnedPointId: 'pt-123',
    });

    useWfsStore.setState({
      showGeoOverlayGroup: true,
      showKiutLayer: true,
      showBdotLayer: true,
      showOrthophotoLayer: true,
      showPlansOverlayGroup: true,
      showMpzpLayer: true,
      showMpzpZonesLayer: true,
      showLandCoverLayer: true,
      showOvertureGreenAreas: true,
      showTreesLayer: true,
    });

    const initialOsmLayers = [
      {
        id: 'osm_landuse_water',
        name: 'Wody',
        description: '',
        color: '#00f',
        strokeColor: '#00f',
        opacity: 0.5,
        isVisible: true,
        isLocked: false,
        order: 1,
      },
      {
        id: 'osm_landuse_forest',
        name: 'Lasy',
        description: '',
        color: '#0f0',
        strokeColor: '#0f0',
        opacity: 0.5,
        isVisible: true,
        isLocked: false,
        order: 2,
      },
    ];
    useOsmLanduseStore.setState({
      showOsmLanduseGroup: true,
      layers: initialOsmLayers,
    });

    useCadToolStore.setState({
      isDimensionToolActive: true,
      facadePointMode: true,
      drawingMode: 'rectangle',
    });

    useSceneStore.setState({
      selectedBuildingId: 'bldg-1',
      selectedBuildingIds: ['bldg-1', 'bldg-2'],
    });

    useUiStore.setState({
      isSidebarOpen: true,
    });

    // 2. Zaaplikowanie nadpisań Kiosku za pomocą generycznego helpera
    const restore = applyStoreOverrides(getKioskStoreOverrides());

    // 3. Weryfikacja, że WSZYSTKIE warstwy, narzędzia i selekcje zostały wyłączone
    const solarActive = useSolarAnalysisStore.getState();
    expect(solarActive.showNormals).toBe(false);
    expect(solarActive.showShadowingLines).toBe(false);
    expect(solarActive.showSunlightLines).toBe(false);
    expect(solarActive.showAnalysisPoints).toBe(false);
    expect(solarActive.showShadowRange).toBe(false);
    expect(solarActive.showShadowFill).toBe(false);
    expect(solarActive.showSatelliteLayer).toBe(false);
    expect(solarActive.activePinnedPointId).toBeNull();

    const wfsActive = useWfsStore.getState();
    expect(wfsActive.showGeoOverlayGroup).toBe(false);
    expect(wfsActive.showKiutLayer).toBe(false);
    expect(wfsActive.showBdotLayer).toBe(false);
    expect(wfsActive.showOrthophotoLayer).toBe(false);
    expect(wfsActive.showPlansOverlayGroup).toBe(false);
    expect(wfsActive.showMpzpLayer).toBe(false);
    expect(wfsActive.showMpzpZonesLayer).toBe(false);
    expect(wfsActive.showLandCoverLayer).toBe(false);
    expect(wfsActive.showOvertureGreenAreas).toBe(false);
    expect(wfsActive.showTreesLayer).toBe(false);

    const osmActive = useOsmLanduseStore.getState();
    expect(osmActive.showOsmLanduseGroup).toBe(false);
    expect(osmActive.layers.every((l) => !l.isVisible)).toBe(true);

    const cadToolsActive = useCadToolStore.getState();
    expect(cadToolsActive.isDimensionToolActive).toBe(false);
    expect(cadToolsActive.facadePointMode).toBe(false);
    expect(cadToolsActive.drawingMode).toBe('none');

    const sceneActive = useSceneStore.getState();
    expect(sceneActive.selectedBuildingId).toBeNull();
    expect(sceneActive.selectedBuildingIds).toEqual([]);

    const uiActive = useUiStore.getState();
    expect(uiActive.isSidebarOpen).toBe(false);

    // 4. Przywrócenie stanu (restore)
    restore();

    // 5. Weryfikacja, że stan wszystkich 6 store'ów został w 100% przywrócony
    const solarRestored = useSolarAnalysisStore.getState();
    expect(solarRestored.showNormals).toBe(true);
    expect(solarRestored.showShadowingLines).toBe(true);
    expect(solarRestored.showSunlightLines).toBe(true);
    expect(solarRestored.showAnalysisPoints).toBe(true);
    expect(solarRestored.showShadowRange).toBe(true);
    expect(solarRestored.showShadowFill).toBe(true);
    expect(solarRestored.showSatelliteLayer).toBe(true);
    expect(solarRestored.activePinnedPointId).toBe('pt-123');

    const wfsRestored = useWfsStore.getState();
    expect(wfsRestored.showGeoOverlayGroup).toBe(true);
    expect(wfsRestored.showKiutLayer).toBe(true);
    expect(wfsRestored.showBdotLayer).toBe(true);
    expect(wfsRestored.showOrthophotoLayer).toBe(true);
    expect(wfsRestored.showPlansOverlayGroup).toBe(true);
    expect(wfsRestored.showMpzpLayer).toBe(true);
    expect(wfsRestored.showMpzpZonesLayer).toBe(true);
    expect(wfsRestored.showLandCoverLayer).toBe(true);
    expect(wfsRestored.showOvertureGreenAreas).toBe(true);
    expect(wfsRestored.showTreesLayer).toBe(true);

    const osmRestored = useOsmLanduseStore.getState();
    expect(osmRestored.showOsmLanduseGroup).toBe(true);
    expect(osmRestored.layers.every((l) => l.isVisible)).toBe(true);

    const cadToolsRestored = useCadToolStore.getState();
    expect(cadToolsRestored.isDimensionToolActive).toBe(true);
    expect(cadToolsRestored.facadePointMode).toBe(true);
    expect(cadToolsRestored.drawingMode).toBe('rectangle');

    const sceneRestored = useSceneStore.getState();
    expect(sceneRestored.selectedBuildingId).toBe('bldg-1');
    expect(sceneRestored.selectedBuildingIds).toEqual(['bldg-1', 'bldg-2']);

    const uiRestored = useUiStore.getState();
    expect(uiRestored.isSidebarOpen).toBe(true);
  });
});
