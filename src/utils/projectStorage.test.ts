import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStoredProjectsList,
  getStoredProjectById,
  saveProjectToStorage,
  deleteStoredProject,
  LOCAL_STORAGE_PROJECTS_KEY,
} from './projectStorage';
import { createSampleBuildings } from './dxfParser';

describe('projectStorage', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
      clear: () => { mockStorage = {}; },
    };
    (globalThis as any).window = {
      localStorage: storageMock,
    };
  });

  it('zwraca pustą listę gdy brak zapisanych projektów', () => {
    const list = getStoredProjectsList();
    expect(list).toEqual([]);
  });

  it('zapisuje nowy projekt i zwraca go na liście', () => {
    const sampleBuildings = createSampleBuildings();
    const saved = saveProjectToStorage({
      name: 'Osiedle Leśne',
      version: 1,
      scene: {
        buildings: sampleBuildings,
      },
      solar: {
        settings: { latitude: 52.23, longitude: 21.01, equinoxDate: 'spring', isCityCentreDefault: false, samplingInterval: 0.25 },
        selectedCity: 'Warszawa',
      },
    });

    expect(saved.id).toBeDefined();
    expect(saved.name).toBe('Osiedle Leśne');
    expect(saved.buildingsCount).toBe(sampleBuildings.length);

    const list = getStoredProjectsList();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(saved.id);
    expect(list[0].name).toBe('Osiedle Leśne');
    expect(list[0].city).toBe('Warszawa');
  });

  it('odczytuje pełne dane projektu po ID', () => {
    const sampleBuildings = createSampleBuildings();
    const saved = saveProjectToStorage({
      name: 'Inwestycja Parkowa',
      version: 1,
      scene: {
        buildings: sampleBuildings,
      },
      solar: {
        settings: { latitude: 50.06, longitude: 19.94, equinoxDate: 'autumn', isCityCentreDefault: false, samplingInterval: 0.25 },
        selectedCity: 'Kraków',
      },
    });

    const full = getStoredProjectById(saved.id);
    expect(full).not.toBeNull();
    expect(full?.name).toBe('Inwestycja Parkowa');
    expect(full?.solar.selectedCity).toBe('Kraków');
    expect(full?.scene.buildings.length).toBe(sampleBuildings.length);
  });

  it('aktualizuje istniejący projekt pod tym samym ID', () => {
    const sampleBuildings = createSampleBuildings();
    const saved = saveProjectToStorage({
      name: 'Projekt A',
      version: 1,
      scene: { buildings: sampleBuildings },
      solar: {
        settings: { latitude: 52.23, longitude: 21.01, equinoxDate: 'spring', isCityCentreDefault: false, samplingInterval: 0.25 },
        selectedCity: 'Warszawa',
      },
    });

    const updated = saveProjectToStorage(
      {
        name: 'Projekt A (zaktualizowany)',
        version: 1,
        scene: { buildings: sampleBuildings },
        solar: {
          settings: { latitude: 52.23, longitude: 21.01, equinoxDate: 'spring', isCityCentreDefault: false, samplingInterval: 0.25 },
          selectedCity: 'Gdańsk',
        },
      },
      saved.id
    );

    expect(updated.id).toBe(saved.id);
    const list = getStoredProjectsList();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Projekt A (zaktualizowany)');
    expect(list[0].city).toBe('Gdańsk');
  });

  it('usuwa projekt z localStorage po ID', () => {
    const saved1 = saveProjectToStorage({
      name: 'P1',
      version: 1,
      scene: { buildings: [] },
      solar: { settings: { latitude: 52, longitude: 21, equinoxDate: 'spring', isCityCentreDefault: false, samplingInterval: 0.25 }, selectedCity: 'Warszawa' },
    });
    const saved2 = saveProjectToStorage({
      name: 'P2',
      version: 1,
      scene: { buildings: [] },
      solar: { settings: { latitude: 52, longitude: 21, equinoxDate: 'spring', isCityCentreDefault: false, samplingInterval: 0.25 }, selectedCity: 'Warszawa' },
    });

    expect(getStoredProjectsList().length).toBe(2);

    const res = deleteStoredProject(saved1.id);
    expect(res).toBe(true);

    const remaining = getStoredProjectsList();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(saved2.id);
  });
});
