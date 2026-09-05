import { BuildingLoop, CadLayerSettings, PinnedFacadePoint } from './geometry';
import { DxfUnitOption, DxfUnitInfo } from '../utils/dxfParser';

export interface SharedProjectPayload {
  v: 1; // wersja schematu pod przyszłe migracje
  createdAt: number;
  metadata: {
    name?: string;
    northAngleDeg: number;
  };
  // Stan rzutni i podkładu
  viewport: {
    center?: [number, number]; // [lat, lng]
    zoom?: number;
    rotation: number;
    savedRotation?: number;
  };
  // Parametry analizy nasłonecznienia (§ 13 / § 56 / § 60 WT)
  solar: {
    analysisType?: 'SECTION_13' | 'SECTION_60';
    date?: string; // ISO date string (domyślnie równonoc 21 marca)
    timeOfDayMinutes?: number;
    latitude: number;
    longitude: number;
    selectedCity?: string;
    equinoxDate?: 'spring' | 'autumn';
    sunlightMethod?: 'raycasting' | 'segments';
    activePointMode?: 'shadowing' | 'sunlight';
    showNormals?: boolean;
    showShadowingLines?: boolean;
    showSunlightLines?: boolean;
    showShadowRange?: boolean;
    showShadowFill?: boolean;
    showSatelliteLayer?: boolean;
    satelliteOpacity?: number;
    mapsInput?: string;
  };
  // Warstwy, obiekty i modyfikatory
  scene: {
    buildings: BuildingLoop[];
    selectedBuildingId?: string | null;
    pinnedPoints?: PinnedFacadePoint[];
    activePinnedPointId?: string | null;
    layerSettings?: Record<string, CadLayerSettings>;
    selectedLayerName?: string | null;
    dimensions?: any[];
    dxfUnit?: DxfUnitOption;
    dxfImportInfo?: DxfUnitInfo | null;
  };
}

export interface ShareApiResponse {
  shareId: string;
  url: string;
}

export interface ShareApiGetResponse {
  compressedData: string;
}

export interface ShareApiErrorResponse {
  error: string;
}
