// src/modules/action-recorder/types.ts
// ⚠️ MODUŁ NAGRYWANIA I ODTWARZANIA SESJI AKCJI (DEV / LOCAL)

export type AspectRatioOption = '1:1' | '16:9' | 'viewport';

export interface ActionSessionEvent {
  timestampMs: number;
  type:
    | 'pointer_move'
    | 'pointer_down'
    | 'pointer_up'
    | 'key_down'
    | 'key_up'
    | 'scene_state'
    | 'solar_state'
    | 'cad_state';
  payload: any;
}

export interface ActionSession {
  id: string;
  version: 1;
  title: string;
  createdAt: string;
  durationMs: number;
  aspectRatio: AspectRatioOption;
  viewport: {
    width: number;
    height: number;
  };
  initialState: {
    scene: any;
    solar: any;
    cad: any;
  };
  events: ActionSessionEvent[];
}

export interface CatalogItem {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  aspectRatio: AspectRatioOption;
  eventCount: number;
  hasVideo: boolean;
  hasSessionData: boolean;
  videoBlobSize?: number;
}

export type PipPosition = 'bottom-right' | 'top-right' | 'bottom-left';
export type PipSize = 'small' | 'medium' | 'large';

export interface RecorderSettings {
  aspectRatio: AspectRatioOption;
  countdownSeconds: number; // 0, 3
  showVirtualCursor: boolean;
  showKeystrokes: boolean;
  showRecBadge: boolean;
  show3DPreview: boolean;
  pipPosition: PipPosition;
  pipSize: PipSize;
  pipIsXRay: boolean;
  pipOrientation: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  fps: number;
  bitrate: number;
}

export interface ReplayerStatus {
  isPlaying: boolean;
  isPaused: boolean;
  currentTimeMs: number;
  totalDurationMs: number;
  playbackSpeed: number; // 0.5, 1, 1.5, 2
  activeSession: ActionSession | null;
}
