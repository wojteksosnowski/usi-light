import { BuildingLoop, CadLayerSettings, PinnedFacadePoint, ProjectSettings } from '../types/geometry';
import { DxfUnitOption, DxfUnitInfo } from '../utils/dxfParser';
import { normalizeLegacyBuildingTypes } from './legacyBuildingType';
import { applyBuildingModifiers } from '../engine/modifiers/modifierPipeline';
import { rebuildBuildingSegments } from './segmentStatistics';

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
 * Sanityzuje budynek do kompaktowej postaci przed zapisem do pamięci masowej (LocalStorage).
 * Usuwa ciężkie, pochodne bufory i tablice (storyPolygons, zonePolygons, rozbudowane segments),
 * które są w pełni deterministycznie odtwarzane przy odczycie przez potok modyfikatorów.
 */
export function sanitizeBuildingForStorage(bldg: BuildingLoop): BuildingLoop {
  if (!bldg) return bldg;
  const {
    id,
    name,
    layer,
    vertices,
    holes,
    modifiers,
    sweepPath,
    sweepWidth,
    sweepAlignment,
    defaultHeight,
    elevation,
    firstFloorHeight,
    typicalFloorHeight,
    hWindowBottom,
    isCityCentre,
    isTested,
    isIncluded,
    isLocked,
    isAccompanyingInvestment,
    category,
    areaType,
    buildingType,
    plotNumber,
    plotId,
    landUseClass,
    landUseType,
    cadastralDetails,
    transform,
    heightSource,
    groupId,
  } = bldg;

  return {
    id,
    name,
    layer,
    vertices: vertices ? vertices.map((v) => ({ x: v.x, y: v.y })) : [],
    holes: holes ? holes.map((h) => h.map((v) => ({ x: v.x, y: v.y }))) : undefined,
    modifiers: modifiers && modifiers.length > 0 ? structuredClone(modifiers) : undefined,
    sweepPath: sweepPath ? sweepPath.map((v) => ({ x: v.x, y: v.y })) : undefined,
    sweepWidth,
    sweepAlignment,
    defaultHeight,
    elevation,
    firstFloorHeight,
    typicalFloorHeight,
    hWindowBottom,
    isCityCentre,
    isTested,
    isIncluded,
    isLocked,
    isAccompanyingInvestment,
    category,
    areaType,
    buildingType,
    plotNumber,
    plotId,
    landUseClass,
    landUseType,
    cadastralDetails,
    transform: transform
      ? { tx: transform.tx ?? 0, ty: transform.ty ?? 0, rotationDeg: transform.rotationDeg ?? 0 }
      : { tx: 0, ty: 0, rotationDeg: 0 },
    heightSource,
    groupId,
    segments: [], // Wyczyszczone - odtwarzane natychmiast przy odczycie
  };
}

/**
 * Rehydratuje budynek odczytany z pamięci masowej, odtwarzając segmenty fasad i modyfikatory.
 */
export function rehydrateBuildingFromStorage(bldg: BuildingLoop): BuildingLoop {
  if (!bldg || !Array.isArray(bldg.vertices) || bldg.vertices.length < 3) return bldg;

  if (bldg.modifiers && bldg.modifiers.length > 0) {
    try {
      const modRes = applyBuildingModifiers(bldg);
      return {
        ...bldg,
        storyPolygons: modRes.storyPolygons,
        zonePolygons: modRes.zonePolygons,
        segments: modRes.segments,
      };
    } catch {
      return rebuildBuildingSegments(bldg, bldg.vertices);
    }
  }

  if (!bldg.segments || bldg.segments.length === 0) {
    return rebuildBuildingSegments(bldg, bldg.vertices);
  }

  return bldg;
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
      found.scene.buildings = found.scene.buildings.map(rehydrateBuildingFromStorage);
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
  existingId?: string | null,
  options?: { buildingsAlreadySanitized?: boolean }
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

  const rawBuildings = projectPayload.scene?.buildings || [];
  const sanitizedBuildings = options?.buildingsAlreadySanitized
    ? rawBuildings
    : rawBuildings.map(sanitizeBuildingForStorage);

  const fullRecord: StoredProjectData = {
    ...projectPayload,
    id,
    version: 1,
    name: projectPayload.name.trim() || `Projekt ${projectPayload.solar?.selectedCity || 'Światło'}`,
    createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : now,
    updatedAt: now,
    city: projectPayload.solar?.selectedCity,
    buildingsCount: rawBuildings.length,
    scene: {
      ...projectPayload.scene,
      buildings: sanitizedBuildings,
    },
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
        return {
          ...fullRecord,
          scene: {
            ...fullRecord.scene,
            buildings: fullRecord.scene.buildings.map(rehydrateBuildingFromStorage),
          },
        };
      } catch {
        // Kontynuuj redukcję
      }
    }
    throw new Error('Brak wolnego miejsca w pamięci przeglądarki dla zapisu projektu.');
  }

  return {
    ...fullRecord,
    scene: {
      ...fullRecord.scene,
      buildings: fullRecord.scene.buildings.map(rehydrateBuildingFromStorage),
    },
  };
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
