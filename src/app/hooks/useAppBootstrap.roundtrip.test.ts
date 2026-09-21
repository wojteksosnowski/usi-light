import { describe, it, expect, beforeEach } from 'vitest';

// Środowisko testowe (node) nie posiada localStorage — minimalny polyfill dla tego pliku.
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}
import { hydrateSceneIntoStores, SCENE_STORAGE_KEY } from './useAppBootstrap';
import { sanitizeBuildingForStorage, rehydrateBuildingFromStorage } from '@/utils/projectStorage';
import { SavedSceneData } from '@/store/useSceneStore';
import { BuildingLoop } from '@/types/geometry';

function makeBuilding(overrides: Partial<BuildingLoop> = {}): BuildingLoop {
  return {
    id: 'bldg-1',
    name: 'Budynek testowy',
    layer: 'Domyślna (0)',
    isTested: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 15,
    hWindowBottom: 0.85,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    segments: [],
    transform: { tx: 1, ty: 2, rotationDeg: 30 },
    ...overrides,
  };
}

/** Buduje syntetyczną scenę pokrywającą wszystkie persystowane elementy, w tym te objęte tą naprawą. */
function buildFullScene(): SavedSceneData {
  const testedBuilding = makeBuilding({
    id: 'bldg-tested',
    name: 'Budynek badany',
    isTested: true,
    holes: [
      [
        { x: 3, y: 3 },
        { x: 7, y: 3 },
        { x: 7, y: 7 },
        { x: 3, y: 7 },
      ],
    ],
    modifiers: [{ id: 'mod-1', type: 'story_offset', enabled: true } as any],
  });

  const accompanyingInvestmentPlot = makeBuilding({
    id: 'bldg-boundary',
    name: 'Działka inwestycji towarzyszącej',
    category: 'boundary',
    isTested: false,
    isAccompanyingInvestment: true,
    vertices: [
      { x: -5, y: -5 },
      { x: 20, y: -5 },
      { x: 20, y: 20 },
      { x: -5, y: 20 },
    ],
  });

  return {
    version: 1,
    buildings: [testedBuilding, accompanyingInvestmentPlot].map(sanitizeBuildingForStorage),
    selectedBuildingId: 'bldg-tested',
    pinnedPoints: [{ id: 'p1', buildingId: 'bldg-tested', segmentId: 'seg-0', offsetRatio: 0.5, label: 'P1' }],
    activePinnedPointId: 'p1',
    settings: { latitude: 52.23, longitude: 21.01, isCityCentreDefault: false, samplingInterval: 0.5 } as any,
    layerSettings: { 'Domyślna (0)': { isVisible: true } as any },
    dxfUnit: 'm',
    dxfImportInfo: null,
    viewRotationDeg: 37.5,
    savedViewRotationDeg: 12.25,
    sunlightMethod: 'raycasting',
    activePointMode: 'shadowing',
    selectedCity: 'Warszawa',
    mapsInput: '',
    mapsParseError: false,
  };
}

describe('Zapis i odczyt sceny (round-trip)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('zachowuje isAccompanyingInvestment po sanityzacji i rehydratacji budynku', () => {
    const original = makeBuilding({ category: 'boundary', isAccompanyingInvestment: true });
    const sanitized = sanitizeBuildingForStorage(original);
    expect(sanitized.isAccompanyingInvestment).toBe(true);

    const roundTripped = JSON.parse(JSON.stringify(sanitized));
    const rehydrated = rehydrateBuildingFromStorage(roundTripped);
    expect(rehydrated.isAccompanyingInvestment).toBe(true);
  });

  it('serializuje pełną scenę do localStorage i odczytuje ją identycznie', () => {
    const scene = buildFullScene();
    localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scene));

    const raw = localStorage.getItem(SCENE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const loaded = JSON.parse(raw!) as SavedSceneData;

    expect(loaded).toEqual(scene);

    // Weryfikacja pól objętych tym bugfixem
    const boundaryBuilding = loaded.buildings.find((b) => b.id === 'bldg-boundary');
    expect(boundaryBuilding?.isAccompanyingInvestment).toBe(true);
    expect(loaded.viewRotationDeg).toBe(37.5);
    expect(loaded.savedViewRotationDeg).toBe(12.25);
  });

  it('przywraca obrót UCS (viewRotationDeg/savedViewRotationDeg) do storów przy hydratacji', () => {
    const scene = buildFullScene();

    const calls: Record<string, any> = {};
    hydrateSceneIntoStores(scene, {
      loadSceneData: (s) => {
        calls.loadSceneData = s;
      },
      setSettings: (s) => {
        calls.setSettings = s;
      },
      setPinnedPoints: (p) => {
        calls.setPinnedPoints = p;
      },
      setActivePinnedPointId: (id) => {
        calls.setActivePinnedPointId = id;
      },
      setViewRotationDeg: (deg) => {
        calls.setViewRotationDeg = deg;
      },
      setSavedViewRotationDeg: (deg) => {
        calls.setSavedViewRotationDeg = deg;
      },
    });

    expect(calls.setViewRotationDeg).toBe(37.5);
    expect(calls.setSavedViewRotationDeg).toBe(12.25);
    expect(calls.setPinnedPoints).toEqual(scene.pinnedPoints);
    expect(calls.setActivePinnedPointId).toBe('p1');
    expect(calls.loadSceneData).toBe(scene);
  });
});
