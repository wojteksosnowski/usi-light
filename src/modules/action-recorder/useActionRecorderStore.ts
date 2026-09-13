// src/modules/action-recorder/useActionRecorderStore.ts
// Magazyn Zustand dla stanu nagrywania, odtwarzania i opcji narzędzia dev

import { create } from 'zustand';
import {
  ActionSession,
  AspectRatioOption,
  RecorderSettings,
  ReplayerStatus,
} from './types';

interface ActionRecorderStoreState {
  // Stan nagrywania
  isRecording: boolean;
  isCountingDown: boolean;
  countdownValue: number;
  recordingTimeMs: number;

  // Ustawienia
  settings: RecorderSettings;

  // HUD & Wirtualny kursor
  activeKeys: string[];
  virtualPointer: {
    x: number;
    y: number;
    visible: boolean;
    isDown: boolean;
    button: number;
    lastClickMs: number;
  };

  // Katalog nagrań
  isCatalogOpen: boolean;

  // Odtwarzacz
  replayerStatus: ReplayerStatus;

  // Referencja do Canvasu 3D WebGL (do transferu klatek w potoku wideo)
  pipCanvas: HTMLCanvasElement | null;

  // Akcje
  setIsRecording: (isRecording: boolean) => void;
  setIsCountingDown: (isCountingDown: boolean, val?: number) => void;
  setCountdownValue: (val: number) => void;
  setRecordingTimeMs: (ms: number) => void;
  updateSettings: (patch: Partial<RecorderSettings>) => void;
  setAspectRatio: (aspect: AspectRatioOption) => void;
  setIsCatalogOpen: (open: boolean) => void;
  setActiveKeys: (keys: string[]) => void;
  setVirtualPointer: (
    patch: Partial<ActionRecorderStoreState['virtualPointer']>
  ) => void;
  setReplayerStatus: (patch: Partial<ReplayerStatus>) => void;
  setPipCanvas: (canvas: HTMLCanvasElement | null) => void;
}

export const useActionRecorderStore = create<ActionRecorderStoreState>(
  (set) => ({
    isRecording: false,
    isCountingDown: false,
    countdownValue: 3,
    recordingTimeMs: 0,

    settings: {
      aspectRatio: '1:1',
      videoFormat: 'mp4',
      countdownSeconds: 3,
      showVirtualCursor: true,
      showKeystrokes: true,
      showRecBadge: true,
      show3DPreview: true,
      pipPosition: 'bottom-right',
      pipSize: 'medium',
      pipIsXRay: false,
      pipOrientation: 'SW',
      fps: 60,
      bitrate: 8_000_000,
    },

    pipCanvas: null,

    activeKeys: [],
    virtualPointer: {
      x: 0,
      y: 0,
      visible: false,
      isDown: false,
      button: 0,
      lastClickMs: 0,
    },

    isCatalogOpen: false,

    replayerStatus: {
      isPlaying: false,
      isPaused: false,
      currentTimeMs: 0,
      totalDurationMs: 0,
      playbackSpeed: 1,
      activeSession: null,
    },

    setIsRecording: (isRecording) => set({ isRecording }),
    setIsCountingDown: (isCountingDown, val = 3) =>
      set({ isCountingDown, countdownValue: val }),
    setCountdownValue: (countdownValue) => set({ countdownValue }),
    setRecordingTimeMs: (recordingTimeMs) => set({ recordingTimeMs }),
    updateSettings: (patch) =>
      set((state) => ({ settings: { ...state.settings, ...patch } })),
    setAspectRatio: (aspectRatio) =>
      set((state) => ({ settings: { ...state.settings, aspectRatio } })),
    setIsCatalogOpen: (isCatalogOpen) => set({ isCatalogOpen }),
    setActiveKeys: (activeKeys) => set({ activeKeys }),
    setVirtualPointer: (patch) =>
      set((state) => ({
        virtualPointer: { ...state.virtualPointer, ...patch },
      })),
    setReplayerStatus: (patch) =>
      set((state) => ({
        replayerStatus: { ...state.replayerStatus, ...patch },
      })),
    setPipCanvas: (pipCanvas) => set({ pipCanvas }),
  })
);
