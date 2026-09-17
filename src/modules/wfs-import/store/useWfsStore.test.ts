import { describe, it, expect, beforeEach } from 'vitest';
import { useWfsStore } from './useWfsStore';

describe('useWfsStore - shiftVectorLayers and group toggles', () => {
  beforeEach(() => {
    useWfsStore.setState({
      trees: [{
        id: 1,
        position: { x: 10, y: 20 },
        inventoryNumber: 'T1',
        namePolish: 'Dąb',
        nameLatin: 'Quercus',
        height: 12,
        trunkCircumference: '120',
        managingUnit: 'ZOM',
        updatedAt: '2024-01-01',
      }],
      overtureGreenAreas: [{
        id: 'ov-1',
        rings: [[{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 5 }]],
        className: 'park',
        category: 'green',
      }],
      mpzpZones: [{
        id: 'mpzp-1',
        rings: [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 0 }]],
        funSymb: 'M',
        funNazwa: 'Mieszkaniowa',
        maxWysokosc: '15',
        intenZab: '1.2',
        powBio: '30%',
        liczKond: '4',
        nazwaPlan: 'Plan 1',
      }],
      landCoverUnits: [{
        id: 'lcv-1',
        outer: [{ x: 30, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 40 }, { x: 30, y: 30 }],
        holes: [[{ x: 32, y: 32 }, { x: 35, y: 32 }, { x: 35, y: 35 }, { x: 32, y: 32 }]],
        landCoverClass: 'grass',
      }],
      showGeoOverlayGroup: false,
      showPlansOverlayGroup: false,
      showKiutLayer: false,
      showBdotLayer: false,
      showMpzpLayer: false,
      showTerrainLayer: false,
      showOvertureGreenAreas: false,
      showMpzpZonesLayer: false,
      showLandCoverLayer: false,
    });
  });

  it('shiftVectorLayers poprawnie przesuwa punkty we wszystkich warstwach wektorowych o deltę', () => {
    const delta = { x: 100, y: -50 };
    useWfsStore.getState().shiftVectorLayers(delta);

    const state = useWfsStore.getState();

    // Drzewa
    expect(state.trees[0].position.x).toBe(110);
    expect(state.trees[0].position.y).toBe(-30);

    // Overture
    expect(state.overtureGreenAreas[0].rings[0][0]).toEqual({ x: 105, y: -45 });
    expect(state.overtureGreenAreas[0].rings[0][1]).toEqual({ x: 115, y: -45 });

    // MPZP
    expect(state.mpzpZones[0].rings[0][0]).toEqual({ x: 100, y: -50 });
    expect(state.mpzpZones[0].rings[0][2]).toEqual({ x: 120, y: -30 });

    // Pokrycie terenu (outer + holes)
    expect(state.landCoverUnits[0].outer[0]).toEqual({ x: 130, y: -20 });
    expect(state.landCoverUnits[0].holes![0][0]).toEqual({ x: 132, y: -18 });
  });

  it('obsługuje master toggle dla grupy Plany z uwzględnieniem pokrycia terenu', () => {
    const s = useWfsStore.getState();
    s.setShowLandCoverLayer(true);
    s.setShowOvertureGreenAreas(true);

    // Wyłączenie grupy Plany -> wyłącza wszystkie podwarstwy
    s.setShowPlansOverlayGroup(false);
    expect(useWfsStore.getState().showPlansOverlayGroup).toBe(false);
    expect(useWfsStore.getState().showLandCoverLayer).toBe(false);
    expect(useWfsStore.getState().showOvertureGreenAreas).toBe(false);

    // Ponowne włączenie grupy Plany -> przywraca stan ze snapshotu
    useWfsStore.getState().setShowPlansOverlayGroup(true);
    expect(useWfsStore.getState().showPlansOverlayGroup).toBe(true);
    expect(useWfsStore.getState().showLandCoverLayer).toBe(true);
    expect(useWfsStore.getState().showOvertureGreenAreas).toBe(true);
  });

  it('wspólne krycie i inwersja w grupie Podkład synchronizują się poprawnie', () => {
    const s = useWfsStore.getState();
    s.setGeoOverlayOpacity(0.4);
    expect(useWfsStore.getState().geoOverlayOpacity).toBe(0.4);
    expect(useWfsStore.getState().kiutOpacity).toBe(0.4);
    expect(useWfsStore.getState().bdotOpacity).toBe(0.4);

    s.setGeoOverlayInvertColors(false);
    expect(useWfsStore.getState().geoOverlayInvertColors).toBe(false);
    expect(useWfsStore.getState().kiutInvertColors).toBe(false);
    expect(useWfsStore.getState().bdotInvertColors).toBe(false);
  });

  it('obsługuje inwersję kolorów dla warstwy WMS MPZP', () => {
    const s = useWfsStore.getState();
    expect(s.mpzpInvertColors).toBe(true);
    s.setMpzpInvertColors(false);
    expect(useWfsStore.getState().mpzpInvertColors).toBe(false);
    s.setMpzpInvertColors(true);
    expect(useWfsStore.getState().mpzpInvertColors).toBe(true);
  });
});
