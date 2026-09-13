import { useSceneStore } from '../../store/useSceneStore';
import { useSolarAnalysisStore } from '../../store/useSolarAnalysisStore';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useActionRecorderStore } from './useActionRecorderStore';
import { ActionSession, ActionSessionEvent, VideoFormatOption } from './types';
import { saveRecording } from './actionRecorderStorage';
import { SimpleGifEncoder } from './gifEncoder';

export class ActionRecorderEngine {
  private static instance: ActionRecorderEngine | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private gifEncoder: SimpleGifEncoder | null = null;
  private gifInterval: any = null;
  private currentExtension = 'webm';
  private currentMimeType = 'video/webm';
  private events: ActionSessionEvent[] = [];
  private startTimeMs = 0;
  private timerInterval: any = null;
  private unsubscribeStores: Array<() => void> = [];
  private eventCleanupFns: Array<() => void> = [];
  private containerOriginalStyle: { width: string; height: string } | null = null;
  private initialSnapshots: { scene: any; solar: any; cad: any } | null = null;
  private boundCanvas: HTMLCanvasElement | null = null;
  private boundContainer: HTMLElement | null = null;
  private activeKeySet = new Set<string>();

  static getInstance(): ActionRecorderEngine {
    if (!ActionRecorderEngine.instance) {
      ActionRecorderEngine.instance = new ActionRecorderEngine();
    }
    return ActionRecorderEngine.instance;
  }

  isRecording(): boolean {
    return useActionRecorderStore.getState().isRecording;
  }

  private getOptimalMimeType(format: VideoFormatOption): { mimeType: string; extension: string } {
    if (format === 'mp4') {
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('video/mp4; codecs=avc1.42E01E,mp4a.40.2')) {
          return { mimeType: 'video/mp4; codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' };
        }
        if (MediaRecorder.isTypeSupported('video/mp4; codecs=avc1')) {
          return { mimeType: 'video/mp4; codecs=avc1', extension: 'mp4' };
        }
        if (MediaRecorder.isTypeSupported('video/mp4')) {
          return { mimeType: 'video/mp4', extension: 'mp4' };
        }
      }
      // Fallback do WebM VP9 jeśli MP4 nie jest wspierany przez przeglądarkę
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
          return { mimeType: 'video/webm; codecs=vp9', extension: 'webm' };
        }
      }
      return { mimeType: 'video/webm', extension: 'webm' };
    }

    if (format === 'gif') {
      return { mimeType: 'image/gif', extension: 'gif' };
    }

    // Domyślny format: WebM
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
        return { mimeType: 'video/webm; codecs=vp9', extension: 'webm' };
      }
    }
    return { mimeType: 'video/webm', extension: 'webm' };
  }

  async start(
    canvas: HTMLCanvasElement,
    container: HTMLElement | null
  ): Promise<void> {
    if (this.isRecording()) return;

    this.boundCanvas = canvas;
    this.boundContainer = container;
    const store = useActionRecorderStore.getState();
    const settings = store.settings;

    // ── 1. Obsługa odliczania (3-2-1) ──────────────────────────────────
    if (settings.countdownSeconds > 0) {
      store.setIsCountingDown(true, settings.countdownSeconds);
      for (let s = settings.countdownSeconds; s > 0; s--) {
        store.setCountdownValue(s);
        await new Promise((r) => setTimeout(r, 1000));
      }
      store.setIsCountingDown(false, 0);
    }

    // ── 2. Dopasowanie proporcji kontenera (Aspect Ratio) ──────────────
    if (container) {
      this.containerOriginalStyle = {
        width: container.style.width || '',
        height: container.style.height || '',
      };

      if (settings.aspectRatio === '1:1') {
        const sqSize = `${Math.min(window.innerWidth, window.innerHeight)}px`;
        container.style.width = sqSize;
        container.style.height = sqSize;
      } else if (settings.aspectRatio === '16:9') {
        let w = window.innerWidth;
        let h = Math.round((w * 9) / 16);
        if (h > window.innerHeight) {
          h = window.innerHeight;
          w = Math.round((h * 16) / 9);
        }
        container.style.width = `${w}px`;
        container.style.height = `${h}px`;
      }

      // triggerFit po zmianie rozmiaru rzutni
      await new Promise((r) => setTimeout(r, 100));
      useCadToolStore.getState().triggerFit();
      await new Promise((r) => setTimeout(r, 150));
    }

    // ── 3. Snapshot stanu początkowego ────────────────────────────────
    const sceneState = useSceneStore.getState();
    const solarState = useSolarAnalysisStore.getState();
    const cadState = useCadToolStore.getState();

    this.initialSnapshots = {
      scene: {
        buildings: JSON.parse(JSON.stringify(sceneState.buildings || [])),
        selectedBuildingId: sceneState.selectedBuildingId,
        selectedBuildingIds: [...(sceneState.selectedBuildingIds || [])],
        layerSettings: JSON.parse(JSON.stringify(sceneState.layerSettings || {})),
      },
      solar: {
        pinnedPoints: JSON.parse(JSON.stringify(solarState.pinnedPoints || [])),
        showShadowingLines: solarState.showShadowingLines,
        showSunlightLines: solarState.showSunlightLines,
        showShadowRange: solarState.showShadowRange,
        showShadowFill: solarState.showShadowFill,
        showNormals: solarState.showNormals,
        showAnalysisPoints: solarState.showAnalysisPoints,
        selectedCity: solarState.selectedCity,
        settings: JSON.parse(JSON.stringify(solarState.settings || {})),
        sunlightMethod: solarState.sunlightMethod,
      },
      cad: {
        dimensions: JSON.parse(JSON.stringify(cadState.dimensions || [])),
        viewRotationDeg: cadState.viewRotationDeg,
        drawingMode: cadState.drawingMode,
        isEditMode: cadState.isEditMode,
        isDimensionToolActive: cadState.isDimensionToolActive,
      },
    };

    this.events = [];
    this.recordedChunks = [];
    this.startTimeMs = performance.now();
    this.activeKeySet.clear();

    // ── 4. Inicjalizacja Nagrywania (Wideo MediaRecorder lub GIF) ─────
    const optimal = this.getOptimalMimeType(settings.videoFormat);
    this.currentExtension = optimal.extension;
    this.currentMimeType = optimal.mimeType;

    if (settings.videoFormat === 'gif') {
      const maxGifW = 640;
      const scale = Math.min(1, maxGifW / (canvas.width || 640));
      const targetW = Math.max(320, Math.round((canvas.width || 640) * scale));
      const targetH = Math.max(240, Math.round((canvas.height || 480) * scale));

      const offCanvas = document.createElement('canvas');
      offCanvas.width = targetW;
      offCanvas.height = targetH;
      const offCtx = offCanvas.getContext('2d');

      this.gifEncoder = new SimpleGifEncoder(targetW, targetH);
      const frameDelayMs = 100; // 10 FPS dla GIF

      this.gifInterval = setInterval(() => {
        if (!this.isRecording() || !offCtx) return;
        try {
          offCtx.clearRect(0, 0, targetW, targetH);
          offCtx.drawImage(canvas, 0, 0, targetW, targetH);
          const imgData = offCtx.getImageData(0, 0, targetW, targetH);
          this.gifEncoder?.addFrame(imgData, frameDelayMs);
        } catch (e) {
          console.warn('[ActionRecorderEngine] Błąd klatki GIF:', e);
        }
      }, frameDelayMs);
    } else {
      const fps = settings.fps || 60;
      const stream = canvas.captureStream ? canvas.captureStream(fps) : (canvas as any).mozCaptureStream?.(fps);

      if (stream && typeof MediaRecorder !== 'undefined') {
        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: optimal.mimeType,
          videoBitsPerSecond: settings.bitrate || 8_000_000,
        });

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            this.recordedChunks.push(e.data);
          }
        };

        this.mediaRecorder.start(100);
      }
    }

    // ── 5. Rejestracja listenerów Store i DOM ──────────────────────────
    this.setupStoreListeners();
    this.setupDomListeners(canvas);

    // ── 6. Aktualizacja stanu w Zustand i timer ─────────────────────────
    store.setIsRecording(true);
    store.setRecordingTimeMs(0);

    this.timerInterval = setInterval(() => {
      const elapsed = performance.now() - this.startTimeMs;
      useActionRecorderStore.getState().setRecordingTimeMs(Math.round(elapsed));
    }, 100);
  }

  private setupStoreListeners(): void {
    // Scene store listener
    const unsubScene = useSceneStore.subscribe((state, prev) => {
      if (!this.isRecording()) return;
      if (
        state.buildings !== prev.buildings ||
        state.selectedBuildingId !== prev.selectedBuildingId ||
        state.selectedBuildingIds !== prev.selectedBuildingIds ||
        state.layerSettings !== prev.layerSettings
      ) {
        this.recordEvent('scene_state', {
          buildings: JSON.parse(JSON.stringify(state.buildings || [])),
          selectedBuildingId: state.selectedBuildingId,
          selectedBuildingIds: [...(state.selectedBuildingIds || [])],
          layerSettings: JSON.parse(JSON.stringify(state.layerSettings || {})),
        });
      }
    });

    // Solar store listener
    const unsubSolar = useSolarAnalysisStore.subscribe((state, prev) => {
      if (!this.isRecording()) return;
      if (
        state.pinnedPoints !== prev.pinnedPoints ||
        state.showShadowingLines !== prev.showShadowingLines ||
        state.showSunlightLines !== prev.showSunlightLines ||
        state.showShadowRange !== prev.showShadowRange ||
        state.showShadowFill !== prev.showShadowFill ||
        state.showNormals !== prev.showNormals ||
        state.showAnalysisPoints !== prev.showAnalysisPoints ||
        state.selectedCity !== prev.selectedCity ||
        state.settings !== prev.settings
      ) {
        this.recordEvent('solar_state', {
          pinnedPoints: JSON.parse(JSON.stringify(state.pinnedPoints || [])),
          showShadowingLines: state.showShadowingLines,
          showSunlightLines: state.showSunlightLines,
          showShadowRange: state.showShadowRange,
          showShadowFill: state.showShadowFill,
          showNormals: state.showNormals,
          showAnalysisPoints: state.showAnalysisPoints,
          selectedCity: state.selectedCity,
          settings: JSON.parse(JSON.stringify(state.settings || {})),
        });
      }
    });

    // Cad store listener
    const unsubCad = useCadToolStore.subscribe((state, prev) => {
      if (!this.isRecording()) return;
      if (
        state.dimensions !== prev.dimensions ||
        state.viewRotationDeg !== prev.viewRotationDeg ||
        state.drawingMode !== prev.drawingMode ||
        state.isEditMode !== prev.isEditMode ||
        state.isDimensionToolActive !== prev.isDimensionToolActive
      ) {
        this.recordEvent('cad_state', {
          dimensions: JSON.parse(JSON.stringify(state.dimensions || [])),
          viewRotationDeg: state.viewRotationDeg,
          drawingMode: state.drawingMode,
          isEditMode: state.isEditMode,
          isDimensionToolActive: state.isDimensionToolActive,
        });
      }
    });

    this.unsubscribeStores.push(unsubScene, unsubSolar, unsubCad);
  }

  private setupDomListeners(canvas: HTMLCanvasElement): void {
    const onPointerMove = (e: PointerEvent | MouseEvent) => {
      if (!this.isRecording()) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      useActionRecorderStore.getState().setVirtualPointer({
        x,
        y,
        visible: true,
      });

      this.recordEvent('pointer_move', { x, y });
    };

    const onPointerDown = (e: PointerEvent | MouseEvent) => {
      if (!this.isRecording()) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      useActionRecorderStore.getState().setVirtualPointer({
        x,
        y,
        isDown: true,
        button: e.button,
        lastClickMs: performance.now(),
      });

      this.recordEvent('pointer_down', { x, y, button: e.button });
    };

    const onPointerUp = (e: PointerEvent | MouseEvent) => {
      if (!this.isRecording()) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      useActionRecorderStore.getState().setVirtualPointer({
        x,
        y,
        isDown: false,
        button: e.button,
      });

      this.recordEvent('pointer_up', { x, y, button: e.button });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignoruj powtarzające się klawisze w inputach
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      const keyLabel = this.formatKeyLabel(e.key);
      if (keyLabel) {
        this.activeKeySet.add(keyLabel);
        useActionRecorderStore
          .getState()
          .setActiveKeys(Array.from(this.activeKeySet));
      }

      if (!this.isRecording()) return;
      this.recordEvent('key_down', {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const keyLabel = this.formatKeyLabel(e.key);
      if (keyLabel) {
        this.activeKeySet.delete(keyLabel);
        useActionRecorderStore
          .getState()
          .setActiveKeys(Array.from(this.activeKeySet));
      }

      if (!this.isRecording()) return;
      this.recordEvent('key_up', {
        key: e.key,
        code: e.code,
      });
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.eventCleanupFns.push(() => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  private formatKeyLabel(key: string): string | null {
    if (key === 'Control') return 'Ctrl';
    if (key === 'Shift') return 'Shift';
    if (key === 'Alt') return 'Alt';
    if (key === 'Meta') return 'Cmd';
    if (key === 'Escape') return 'Esc';
    if (key === 'Delete') return 'Del';
    if (key === 'Backspace') return 'Backspace';
    if (key === ' ') return 'Spacja';
    if (key.length === 1) return key.toUpperCase();
    return key;
  }

  private recordEvent(type: ActionSessionEvent['type'], payload: any): void {
    if (!this.startTimeMs) return;
    const timestampMs = Math.round(performance.now() - this.startTimeMs);
    this.events.push({
      timestampMs,
      type,
      payload,
    });
  }

  async stop(): Promise<{
    session: ActionSession;
    videoBlob: Blob;
    extension: string;
    mimeType: string;
  } | null> {
    if (!this.mediaRecorder && !this.gifEncoder) return null;

    clearInterval(this.timerInterval);
    this.timerInterval = null;

    if (this.gifInterval) {
      clearInterval(this.gifInterval);
      this.gifInterval = null;
    }

    this.unsubscribeStores.forEach((fn) => fn());
    this.unsubscribeStores = [];

    this.eventCleanupFns.forEach((fn) => fn());
    this.eventCleanupFns = [];

    const durationMs = Math.round(performance.now() - this.startTimeMs);
    const store = useActionRecorderStore.getState();
    const settings = store.settings;

    let videoBlob: Blob;
    if (this.gifEncoder) {
      videoBlob = this.gifEncoder.encode();
      this.gifEncoder = null;
    } else {
      videoBlob = await new Promise((resolve) => {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
          resolve(new Blob(this.recordedChunks, { type: this.currentMimeType }));
          return;
        }
        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.recordedChunks, { type: this.currentMimeType });
          resolve(blob);
        };
        this.mediaRecorder.stop();
      });
      this.mediaRecorder = null;
    }

    // Przywróć oryginalne wymiary kontenera
    if (this.boundContainer && this.containerOriginalStyle) {
      this.boundContainer.style.width = this.containerOriginalStyle.width;
      this.boundContainer.style.height = this.containerOriginalStyle.height;
    }

    const rect = this.boundCanvas?.getBoundingClientRect() || {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const session: ActionSession = {
      id: `rec-${Date.now()}`,
      version: 1,
      title: `Nagranie ${new Date().toLocaleTimeString('pl-PL')}`,
      createdAt: new Date().toISOString(),
      durationMs,
      aspectRatio: settings.aspectRatio,
      videoFormat: settings.videoFormat,
      viewport: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      initialState: this.initialSnapshots || {
        scene: {},
        solar: {},
        cad: {},
      },
      events: this.events,
    };

    // Zapisz sesję i wideo w IndexedDB
    try {
      await saveRecording(session, videoBlob);
    } catch (err) {
      console.error('[ActionRecorderEngine] Błąd zapisu do IndexedDB:', err);
    }

    // Reset stanu Zustand
    store.setIsRecording(false);
    store.setRecordingTimeMs(0);
    store.setActiveKeys([]);
    store.setVirtualPointer({ visible: false, isDown: false });

    return {
      session,
      videoBlob,
      extension: this.currentExtension,
      mimeType: this.currentMimeType,
    };
  }
}
