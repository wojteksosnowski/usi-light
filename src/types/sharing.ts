import {
  BuildingLoop,
  CadLayerSettings,
  PinnedFacadePoint,
  Modifier,
  BuildingType,
  ObjectCategory,
  AreaType,
  PlaygroundVoronoiConfig,
} from './geometry';
import { DxfUnitOption, DxfUnitInfo } from '../utils/dxfParser';

// ---- V1 (legacy, read-only going forward; kept verbatim for back-compat) ----
export interface SharedProjectPayloadV1 {
  v: 1; // wersja schematu pod przyszłe migracje
  createdAt: number;
  metadata: {
    name?: string;
    northAngleDeg: number;
  };
  viewport: {
    center?: [number, number]; // [lat, lng]
    zoom?: number;
    rotation: number;
    savedRotation?: number;
  };
  solar: {
    analysisType?: 'SECTION_13' | 'SECTION_60';
    date?: string;
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
    showAnalysisPoints?: boolean;
    showShadowRange?: boolean;
    showShadowFill?: boolean;
    showSatelliteLayer?: boolean;
    satelliteOpacity?: number;
    showProjectParameters?: boolean;
    mapsInput?: string;
  };
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

// ---- V2 (minimal wire format) ----

/** Flat [x, y] tuple used only at the share-payload boundary; full float64, never rounded. */
export type PointTuple = [number, number];

/**
 * Minimal per-building record for sharing: only modifier INPUT parameters.
 * Derived geometry (segments, storyPolygons, zonePolygons, isClockwise) is intentionally
 * omitted — the loader regenerates it via applyBuildingModifiers.
 */
export interface SharedBuildingV2 {
  id: string;
  name: string;
  layer: string;
  isTested: boolean;
  vertices: PointTuple[];
  transform: { tx: number; ty: number; rotationDeg: number };
  defaultHeight: number;

  category?: ObjectCategory; // default 'building'
  areaType?: AreaType;
  plotNumber?: string;
  elevation?: number; // default 0.0
  firstFloorHeight?: number; // default 3.5
  typicalFloorHeight?: number; // default 3.0
  storeysCount?: number;
  isCityCentre?: boolean; // default false
  buildingType?: BuildingType; // default 'residential'
  hWindowBottom?: number; // default 0.85
  isIncluded?: boolean; // default true
  isLocked?: boolean;
  isGhosted?: boolean;
  groupId?: string;
  modifiers?: Modifier[];
  sweepPath?: PointTuple[];
  sweepWidth?: number;
  sweepAlignment?: 'center' | 'left' | 'right';
  playgroundVoronoi?: boolean;
  playgroundParams?: PlaygroundVoronoiConfig;
}

export interface SharedProjectPayloadV2 {
  v: 2;
  createdAt: number;
  metadata: {
    name?: string;
    northAngleDeg: number;
  };
  solar: {
    analysisType?: 'SECTION_13' | 'SECTION_60';
    date?: string;
    latitude: number;
    longitude: number;
    selectedCity?: string;
    equinoxDate?: 'spring' | 'autumn';
    sunlightMethod?: 'raycasting' | 'segments';
    mapsInput?: string;
  };
  scene: {
    buildings: SharedBuildingV2[];
    pinnedPoints?: PinnedFacadePoint[];
    layerSettings?: Record<string, CadLayerSettings>;
    dimensions?: any[];
    dxfUnit?: DxfUnitOption;
    dxfImportInfo?: DxfUnitInfo | null;
  };
  // No viewport: recipient uses zoomToFit/triggerFit on load instead of restoring pan/zoom.
}

export type SharedProjectPayload = SharedProjectPayloadV1 | SharedProjectPayloadV2;

export interface ShareApiResponse {
  shareId: string;
  url: string;
  ttlDays: number;
}

/**
 * Rekord zaszyfrowany przechowywany na serwerze (Redis) — bez klucza, wyłącznie IV + szyfrogram.
 */
export interface EncryptedShareRecord {
  version: 1;
  iv: string;
  ciphertext: string;
  createdAt: number;
}

export interface ShareApiGetResponse {
  compressedData?: string; // format legacy (niezaszyfrowane linki utworzone przed E2EE)
  version?: 1;
  iv?: string;
  ciphertext?: string;
}

export interface ShareApiErrorResponse {
  error: string;
}
