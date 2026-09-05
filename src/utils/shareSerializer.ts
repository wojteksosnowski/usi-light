import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { SharedProjectPayload } from '../types/sharing';
import { BuildingLoop, CadLayerSettings, PinnedFacadePoint } from '../types/geometry';

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

  if (!parsed || parsed.v !== 1 || !parsed.scene || !Array.isArray(parsed.scene.buildings)) {
    throw new Error('Nieprawidłowy format lub uszkodzona struktura projektu.');
  }

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
  sunlightMethod?: 'raycasting' | 'segments';
  activePointMode?: 'shadowing' | 'sunlight';
  viewRotationDeg?: number;
  savedViewRotationDeg?: number;
  projectName?: string;
}

/**
 * Tworzy kompletny obiekt SharedProjectPayload ze stanu aplikacji.
 */
export function createSharedPayloadFromState(options: ExtractStateOptions): SharedProjectPayload {
  return {
    v: 1,
    createdAt: Date.now(),
    metadata: {
      name: options.projectName || `Projekt ${options.selectedCity || 'USI Light'}`,
      northAngleDeg: options.viewRotationDeg ?? 0,
    },
    viewport: {
      rotation: options.viewRotationDeg ?? 0,
      savedRotation: options.savedViewRotationDeg ?? 0,
    },
    solar: {
      analysisType: 'SECTION_13',
      date: options.settings.equinoxDate === 'autumn' ? '2026-09-23' : '2026-03-21',
      latitude: options.settings.latitude,
      longitude: options.settings.longitude,
      selectedCity: options.selectedCity,
      equinoxDate: options.settings.equinoxDate,
      sunlightMethod: options.sunlightMethod,
      activePointMode: options.activePointMode,
      showNormals: options.showNormals,
      showShadowingLines: options.showShadowingLines,
      showSunlightLines: options.showSunlightLines,
      showAnalysisPoints: options.showAnalysisPoints,
      showShadowRange: options.showShadowRange,
      showShadowFill: options.showShadowFill,
      showSatelliteLayer: options.showSatelliteLayer,
      satelliteOpacity: options.satelliteOpacity,
      mapsInput: options.mapsInput,
    },
    scene: {
      buildings: options.buildings,
      selectedBuildingId: options.selectedBuildingId,
      pinnedPoints: options.pinnedPoints,
      activePinnedPointId: options.activePinnedPointId,
      layerSettings: options.layerSettings,
      selectedLayerName: options.selectedLayerName,
      dimensions: options.dimensions,
      dxfUnit: options.dxfUnit,
      dxfImportInfo: options.dxfImportInfo,
    },
  };
}
