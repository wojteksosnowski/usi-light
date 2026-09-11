import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { SharedProjectPayload, SharedProjectPayloadV2, SharedBuildingV2, PointTuple } from '../types/sharing';
import { BuildingLoop, CadLayerSettings, PinnedFacadePoint, Point2D } from '../types/geometry';
import { SHARE_V2_BUILDING_DEFAULTS, omitIfDefault } from './shareDefaults';
import { normalizeLegacyBuildingTypes } from './legacyBuildingType';

/**
 * Konwertuje Uint8Array do ciągu Base64 z bezpiecznym dzieleniem na chunki (unika Maximum call stack size exceeded).
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Konwertuje ciąg Base64 do Uint8Array.
 */
export function base64ToUint8Array(base64Str: string): Uint8Array {
  const binary = atob(base64Str);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Kompresuje obiekt SharedProjectPayload do ciągu Base64 za pomocą GZIP (fflate).
 */
export function compressProjectData(payload: SharedProjectPayload): string {
  const jsonStr = JSON.stringify(payload);
  const u8 = strToU8(jsonStr);
  const compressed = gzipSync(u8, { level: 9 });
  return uint8ArrayToBase64(compressed);
}

/**
 * Dekompresuje ciąg Base64 do obiektu SharedProjectPayload za pomocą GZIP (fflate).
 */
export function decompressProjectData(base64Str: string): SharedProjectPayload {
  const u8 = base64ToUint8Array(base64Str);
  const decompressed = gunzipSync(u8);
  const jsonStr = strFromU8(decompressed);
  const parsed = JSON.parse(jsonStr) as SharedProjectPayload;

  if (!parsed || (parsed.v !== 1 && parsed.v !== 2) || !parsed.scene || !Array.isArray(parsed.scene.buildings)) {
    throw new Error('Nieprawidłowy format lub uszkodzona struktura projektu.');
  }
  normalizeLegacyBuildingTypes(parsed.scene.buildings as unknown as BuildingLoop[]);

  return parsed;
}

/**
 * Serializuje i kompresuje payload do surowych bajtów (bez Base64) — używane jako
 * wejście do szyfrowania E2EE (patrz shareCrypto.ts), gdzie szyfrowanie następuje
 * po kompresji (dane zaszyfrowane nie kompresują się dalej).
 */
export function serializeAndGzipPayload(payload: SharedProjectPayload): Uint8Array {
  return gzipSync(strToU8(JSON.stringify(payload)), { level: 9 });
}

/**
 * Odwrotność serializeAndGzipPayload — z odszyfrowanych surowych bajtów do payloadu.
 */
export function gunzipAndDeserializePayload(gzippedBytes: Uint8Array): SharedProjectPayload {
  const jsonStr = strFromU8(gunzipSync(gzippedBytes));
  const parsed = JSON.parse(jsonStr) as SharedProjectPayload;

  if (!parsed || (parsed.v !== 1 && parsed.v !== 2) || !parsed.scene || !Array.isArray(parsed.scene.buildings)) {
    throw new Error('Nieprawidłowy format lub uszkodzona struktura projektu.');
  }
  normalizeLegacyBuildingTypes(parsed.scene.buildings as unknown as BuildingLoop[]);

  return parsed;
}

export interface CompressionStats {
  rawSizeBytes: number;
  compressedSizeBytes: number;
  reductionPercentage: number;
}

/**
 * Oblicza statystyki kompresji payloadu.
 */
export function getCompressionStats(payload: SharedProjectPayload, base64Compressed: string): CompressionStats {
  const rawSizeBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  const compressedSizeBytes = base64Compressed.length;
  const reductionPercentage = rawSizeBytes > 0
    ? Math.max(0, Math.round(((rawSizeBytes - compressedSizeBytes) / rawSizeBytes) * 100))
    : 0;

  return {
    rawSizeBytes,
    compressedSizeBytes,
    reductionPercentage,
  };
}

export function pointToTuple(p: Point2D): PointTuple {
  return [p.x, p.y];
}

export function tupleToPoint([x, y]: PointTuple): Point2D {
  return { x, y };
}

export function pointsToTuples(pts: Point2D[]): PointTuple[] {
  return pts.map(pointToTuple);
}

export function tuplesToPoints(tuples: PointTuple[]): Point2D[] {
  return tuples.map(tupleToPoint);
}

function toSharedBuildingV2(b: BuildingLoop): SharedBuildingV2 {
  const out: SharedBuildingV2 = {
    id: b.id,
    name: b.name,
    layer: b.layer,
    isTested: b.isTested,
    vertices: pointsToTuples(b.vertices),
    defaultHeight: b.defaultHeight,
    transform: b.transform,
  };
  omitIfDefault(out, 'transform', b.transform, SHARE_V2_BUILDING_DEFAULTS.transform);
  omitIfDefault(out, 'category', b.category, SHARE_V2_BUILDING_DEFAULTS.category);
  omitIfDefault(out, 'elevation', b.elevation, SHARE_V2_BUILDING_DEFAULTS.elevation);
  omitIfDefault(out, 'firstFloorHeight', b.firstFloorHeight, SHARE_V2_BUILDING_DEFAULTS.firstFloorHeight);
  omitIfDefault(out, 'typicalFloorHeight', b.typicalFloorHeight, SHARE_V2_BUILDING_DEFAULTS.typicalFloorHeight);
  omitIfDefault(out, 'hWindowBottom', b.hWindowBottom, SHARE_V2_BUILDING_DEFAULTS.hWindowBottom);
  omitIfDefault(out, 'isCityCentre', b.isCityCentre, SHARE_V2_BUILDING_DEFAULTS.isCityCentre);
  omitIfDefault(out, 'buildingType', b.buildingType, SHARE_V2_BUILDING_DEFAULTS.buildingType);
  omitIfDefault(out, 'isIncluded', b.isIncluded, SHARE_V2_BUILDING_DEFAULTS.isIncluded);
  if (b.areaType !== undefined) out.areaType = b.areaType;
  if (b.plotNumber !== undefined) out.plotNumber = b.plotNumber;
  if (b.storeysCount !== undefined) out.storeysCount = b.storeysCount;
  if (b.isLocked !== undefined) out.isLocked = b.isLocked;
  if (b.isGhosted !== undefined) out.isGhosted = b.isGhosted;
  if (b.groupId !== undefined) out.groupId = b.groupId;
  if (b.modifiers && b.modifiers.length > 0) out.modifiers = b.modifiers;
  if (b.sweepPath && b.sweepPath.length > 0) out.sweepPath = pointsToTuples(b.sweepPath);
  if (b.sweepWidth !== undefined) out.sweepWidth = b.sweepWidth;
  if (b.sweepAlignment !== undefined) out.sweepAlignment = b.sweepAlignment;
  if (b.playgroundVoronoi !== undefined) out.playgroundVoronoi = b.playgroundVoronoi;
  if (b.playgroundParams !== undefined) out.playgroundParams = b.playgroundParams;
  // Explicitly NOT copied: segments, storyPolygons, zonePolygons, isClockwise (all derived).
  return out;
}

export interface ExtractStateOptions {
  buildings: BuildingLoop[];
  selectedBuildingId?: string | null;
  pinnedPoints?: PinnedFacadePoint[];
  activePinnedPointId?: string | null;
  layerSettings?: Record<string, CadLayerSettings>;
  selectedLayerName?: string | null;
  dimensions?: any[];
  dxfUnit?: any;
  dxfImportInfo?: any;
  settings: {
    latitude: number;
    longitude: number;
    equinoxDate: 'spring' | 'autumn';
    isCityCentreDefault?: boolean;
    samplingInterval?: number;
  };
  selectedCity?: string;
  mapsInput?: string;
  showNormals?: boolean;
  showShadowingLines?: boolean;
  showSunlightLines?: boolean;
  showAnalysisPoints?: boolean;
  showShadowRange?: boolean;
  showShadowFill?: boolean;
  showSatelliteLayer?: boolean;
  satelliteOpacity?: number;
  showProjectParameters?: boolean;
  sunlightMethod?: 'raycasting' | 'segments';
  activePointMode?: 'shadowing' | 'sunlight';
  viewRotationDeg?: number;
  savedViewRotationDeg?: number;
  projectName?: string;
}

/**
 * Tworzy minimalny obiekt SharedProjectPayload (v2) ze stanu aplikacji.
 * Pomija dane wyliczane (segments, storyPolygons, zonePolygons) oraz stan UI/sesji
 * (przełączniki widoczności, zaznaczenia, viewport) — zachowuje wyłącznie dane
 * źródłowe potrzebne do odtworzenia projektu.
 */
export function createSharedPayloadFromState(options: ExtractStateOptions): SharedProjectPayloadV2 {
  return {
    v: 2,
    createdAt: Date.now(),
    metadata: {
      name: options.projectName || `Projekt ${options.selectedCity || 'Światło'}`,
      northAngleDeg: options.viewRotationDeg ?? 0,
    },
    solar: {
      analysisType: 'SECTION_13',
      date: options.settings.equinoxDate === 'autumn' ? '2026-09-23' : '2026-03-21',
      latitude: options.settings.latitude,
      longitude: options.settings.longitude,
      selectedCity: options.selectedCity,
      equinoxDate: options.settings.equinoxDate,
      sunlightMethod: options.sunlightMethod,
      mapsInput: options.mapsInput,
    },
    scene: {
      buildings: options.buildings.map(toSharedBuildingV2),
      pinnedPoints: options.pinnedPoints && options.pinnedPoints.length > 0 ? options.pinnedPoints : undefined,
      layerSettings: options.layerSettings,
      dimensions: options.dimensions && options.dimensions.length > 0 ? options.dimensions : undefined,
      dxfUnit: options.dxfUnit,
      dxfImportInfo: options.dxfImportInfo,
    },
  };
}
