import { BuildingLoop, CadLayerSettings, PinnedFacadePoint, ProjectSettings } from '../types/geometry';
import { DxfUnitOption, DxfUnitInfo } from '../utils/dxfParser';
import { normalizeLegacyBuildingTypes } from './legacyBuildingType';

export const LOCAL_STORAGE_PROJECTS_KEY = 'usi_saved_projects_v1';

export interface StoredProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  city?: string;
  buildingsCount: number;
}

export interface StoredProjectData extends StoredProjectSummary {
  version: 1;
  scene: {
    buildings: BuildingLoop[];
    selectedBuildingId?: string | null;
    layerSettings?: Record<string, CadLayerSettings>;
    selectedLayerName?: string | null;
    pinnedPoints?: PinnedFacadePoint[];
    activePinnedPointId?: string | null;
    dimensions?: any[];
    dxfUnit?: DxfUnitOption;
    dxfImportInfo?: DxfUnitInfo | null;
  };
  solar: {
    settings: ProjectSettings;
    selectedCity: string;
    mapsInput?: string;
    mapsParseError?: boolean;
    sunlightMethod?: 'raycasting' | 'segments';
    showNormals?: boolean;
    showShadowingLines?: boolean;
    showSunlightLines?: boolean;
    showShadowRange?: boolean;
    showShadowFill?: boolean;
    showSatelliteLayer?: boolean;
    satelliteOpacity?: number;
    activePointMode?: 'shadowing' | 'sunlight';
  };
  viewport?: {
    viewRotationDeg?: number;
    savedViewRotationDeg?: number;
  };
}

/**
 * Bezpiecznie pobiera listę podsumowań zapisanych projektów z LocalStorage.
 */
export function getStoredProjectsList(): StoredProjectSummary[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any) => ({
        id: String(item.id || ''),
        name: String(item.name || 'Projekt bez nazwy'),
        createdAt: Number(item.createdAt || Date.now()),
        updatedAt: Number(item.updatedAt || Date.now()),
        city: item.city ? String(item.city) : undefined,
        buildingsCount: Number(item.buildingsCount ?? item.scene?.buildings?.length ?? 0),
      }))
      .filter((p) => p.id.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.warn('Błąd podczas odczytu listy projektów z localStorage:', err);
    return [];
  }
}

/**
 * Pobiera pełne dane pojedynczego projektu po ID.
 */
export function getStoredProjectById(id: string): StoredProjectData | null {
  if (typeof window === 'undefined' || !window.localStorage || !id) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const found = parsed.find((p: any) => p.id === id);
    if (!found) return null;

    if (found.scene?.buildings && Array.isArray(found.scene.buildings)) {
      normalizeLegacyBuildingTypes(found.scene.buildings);
    }

    return found as StoredProjectData;
  } catch (err) {
    console.warn(`Błąd podczas odczytu projektu ${id} z localStorage:`, err);
    return null;
  }
}

export const MAX_STORED_PROJECTS = 25;

/**
 * Zapisuje nowy lub aktualizuje istniejący projekt w LocalStorage z ochroną przed przepełnieniem pamięci (QuotaExceededError).
 */
export function saveProjectToStorage(
  projectPayload: Omit<StoredProjectData, 'id' | 'createdAt' | 'updatedAt' | 'buildingsCount'>,
  existingId?: string | null
): StoredProjectData {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Pamięć lokalna przeglądarki jest niedostępna.');
  }

  const raw = window.localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
  let list: StoredProjectData[] = [];
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch {
    list = [];
  }

  const now = Date.now();
  const id = existingId || `proj-${now}-${Math.random().toString(36).substr(2, 5)}`;
  const existingIndex = list.findIndex((p) => p.id === id);

  const fullRecord: StoredProjectData = {
    ...projectPayload,
    id,
    version: 1,
    name: projectPayload.name.trim() || `Projekt ${projectPayload.solar?.selectedCity || 'Światło'}`,
    createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : now,
    updatedAt: now,
    city: projectPayload.solar?.selectedCity,
    buildingsCount: projectPayload.scene?.buildings?.length ?? 0,
  };

  if (existingIndex >= 0) {
    list[existingIndex] = fullRecord;
  } else {
    list.unshift(fullRecord);
  }

  // Zabezpieczenie przed wyciekiem danych / zapychaniem pamięci dysku przeglądarki:
  // 1. Sortowanie od najnowszego i twardy limit projektów (LRU eviction)
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (list.length > MAX_STORED_PROJECTS) {
    list = list.slice(0, MAX_STORED_PROJECTS);
  }

  // 2. Bezpieczny zapis z obsługą QuotaExceededError
  try {
    window.localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(list));
  } catch (err: any) {
    console.warn('Przekroczono limit localStorage (QuotaExceeded). Próba zwolnienia najstarszych projektów...', err);
    // Jeśli nadal brak miejsca, sukcesywnie usuwamy najstarsze projekty aż zapis się powiedzie
    while (list.length > 1) {
      list.pop();
      try {
        window.localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(list));
        return fullRecord;
      } catch {
        // Kontynuuj redukcję
      }
    }
    throw new Error('Brak wolnego miejsca w pamięci przeglądarki dla zapisu projektu.');
  }

  return fullRecord;
}

/**
 * Usuwa projekt o podanym ID z LocalStorage.
 */
export function deleteStoredProject(id: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage || !id) return false;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;

    const filtered = parsed.filter((p: any) => p.id !== id);
    window.localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.warn(`Błąd podczas usuwania projektu ${id} z localStorage:`, err);
    return false;
  }
}
