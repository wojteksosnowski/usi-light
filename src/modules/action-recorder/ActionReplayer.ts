// src/modules/action-recorder/ActionReplayer.ts
// Deterministyczny silnik odtwarzania sesji JSON (Replay Engine)

import { useSceneStore } from '../../store/useSceneStore';
import { useSolarAnalysisStore } from '../../store/useSolarAnalysisStore';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useActionRecorderStore } from './useActionRecorderStore';
import { ActionSession, ActionSessionEvent } from './types';

export class ActionReplayer {
  private static instance: ActionReplayer | null = null;

  private currentSession: ActionSession | null = null;
  private isPlaying = false;
  private isPaused = false;
  private playbackSpeed = 1;
  private currentEventIndex = 0;
  private sessionStartTimeMs = 0;
  private pausedAtTimeMs = 0;
  private rafId: number | null = null;

  static getInstance(): ActionReplayer {
    if (!ActionReplayer.instance) {
      ActionReplayer.instance = new ActionReplayer();
    }
    return ActionReplayer.instance;
  }

  loadSession(session: ActionSession): void {
    this.stop();
    this.currentSession = session;
    this.currentEventIndex = 0;
    this.pausedAtTimeMs = 0;

    // Przywróć stan początkowy
    this.applyInitialState(session);

    useActionRecorderStore.getState().setReplayerStatus({
      activeSession: session,
      totalDurationMs: session.durationMs,
      currentTimeMs: 0,
      isPlaying: false,
      isPaused: false,
      playbackSpeed: this.playbackSpeed,
    });
  }

  private applyInitialState(session: ActionSession): void {
    const init = session.initialState;
    if (!init) return;

    // 1. Scena
    if (init.scene) {
      const scene = useSceneStore.getState();
      if (init.scene.buildings) {
        scene.setBuildings(JSON.parse(JSON.stringify(init.scene.buildings)));
      }
      scene.setSelectedBuildingId(init.scene.selectedBuildingId || null);
      if (init.scene.selectedBuildingIds) {
        scene.setSelectedBuildingIds(init.scene.selectedBuildingIds);
      }
      if (init.scene.pinnedPoints) {
        scene.setPinnedPoints(JSON.parse(JSON.stringify(init.scene.pinnedPoints)));
      }
      if (init.scene.dimensions) {
        scene.setDimensions(JSON.parse(JSON.stringify(init.scene.dimensions)));
      }
    }

    // 2. Analiza Słoneczna
    if (init.solar) {
      const solar = useSolarAnalysisStore.getState();
      if (init.solar.showShadowingLines !== undefined)
        solar.setShowShadowingLines(init.solar.showShadowingLines);
      if (init.solar.showSunlightLines !== undefined)
        solar.setShowSunlightLines(init.solar.showSunlightLines);
      if (init.solar.showShadowRange !== undefined)
        solar.setShowShadowRange(init.solar.showShadowRange);
      if (init.solar.showShadowFill !== undefined)
        solar.setShowShadowFill(init.solar.showShadowFill);
      if (init.solar.showNormals !== undefined)
        solar.setShowNormals(init.solar.showNormals);
      if (init.solar.showAnalysisPoints !== undefined)
        solar.setShowAnalysisPoints(init.solar.showAnalysisPoints);
      if (init.solar.selectedCity)
        solar.setSelectedCity(init.solar.selectedCity);
      if (init.solar.settings)
        solar.updateSettings(init.solar.settings);
    }

    // 3. Widok CAD
    if (init.cad) {
      const cad = useCadToolStore.getState();
      if (init.cad.viewRotationDeg !== undefined) {
        cad.setViewRotationDeg(init.cad.viewRotationDeg);
      }
      cad.triggerFit();
    }
  }

  play(): void {
    if (!this.currentSession) return;

    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this.sessionStartTimeMs =
        performance.now() - this.pausedAtTimeMs / this.playbackSpeed;
    } else {
      this.applyInitialState(this.currentSession);
      this.currentEventIndex = 0;
      this.isPlaying = true;
      this.isPaused = false;
      this.sessionStartTimeMs = performance.now();
    }

    useActionRecorderStore.getState().setReplayerStatus({
      isPlaying: true,
      isPaused: false,
    });

    this.tick();
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.isPaused = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    useActionRecorderStore.getState().setReplayerStatus({
      isPlaying: false,
      isPaused: true,
    });
  }

  stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentEventIndex = 0;
    this.pausedAtTimeMs = 0;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    useActionRecorderStore.getState().setVirtualPointer({
      visible: false,
      isDown: false,
    });
    useActionRecorderStore.getState().setActiveKeys([]);

    useActionRecorderStore.getState().setReplayerStatus({
      isPlaying: false,
      isPaused: false,
      currentTimeMs: 0,
      activeSession: null,
    });
  }

  setSpeed(speed: number): void {
    if (this.isPlaying) {
      const currentProgressMs =
        (performance.now() - this.sessionStartTimeMs) * this.playbackSpeed;
      this.playbackSpeed = speed;
      this.sessionStartTimeMs =
        performance.now() - currentProgressMs / this.playbackSpeed;
    } else {
      this.playbackSpeed = speed;
    }

    useActionRecorderStore.getState().setReplayerStatus({
      playbackSpeed: speed,
    });
  }

  seek(targetTimeMs: number): void {
    if (!this.currentSession) return;
    const clampedTime = Math.max(
      0,
      Math.min(targetTimeMs, this.currentSession.durationMs)
    );

    // Zresetuj stan początkowy i zaaplikuj wszystkie zdarzenia do punktu docelowego
    this.applyInitialState(this.currentSession);
    this.currentEventIndex = 0;

    for (let i = 0; i < this.currentSession.events.length; i++) {
      const ev = this.currentSession.events[i];
      if (ev.timestampMs <= clampedTime) {
        this.applyEvent(ev);
        this.currentEventIndex = i + 1;
      } else {
        break;
      }
    }

    this.pausedAtTimeMs = clampedTime;
    this.sessionStartTimeMs =
      performance.now() - clampedTime / this.playbackSpeed;

    useActionRecorderStore.getState().setReplayerStatus({
      currentTimeMs: clampedTime,
    });
  }

  private tick = (): void => {
    if (!this.isPlaying || !this.currentSession) return;

    const elapsedWall = performance.now() - this.sessionStartTimeMs;
    const currentSessionMs = elapsedWall * this.playbackSpeed;
    this.pausedAtTimeMs = currentSessionMs;

    // Zaaplikuj wszystkie zaległe zdarzenia
    const events = this.currentSession.events;
    while (
      this.currentEventIndex < events.length &&
      events[this.currentEventIndex].timestampMs <= currentSessionMs
    ) {
      this.applyEvent(events[this.currentEventIndex]);
      this.currentEventIndex++;
    }

    useActionRecorderStore.getState().setReplayerStatus({
      currentTimeMs: Math.min(currentSessionMs, this.currentSession.durationMs),
    });

    if (currentSessionMs >= this.currentSession.durationMs) {
      // Koniec odtwarzania
      this.isPlaying = false;
      this.isPaused = false;
      useActionRecorderStore.getState().setReplayerStatus({
        isPlaying: false,
        isPaused: false,
        currentTimeMs: this.currentSession.durationMs,
      });
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private applyEvent(ev: ActionSessionEvent): void {
    switch (ev.type) {
      case 'pointer_move':
        useActionRecorderStore.getState().setVirtualPointer({
          x: ev.payload.x,
          y: ev.payload.y,
          visible: true,
        });
        break;
      case 'pointer_down':
        useActionRecorderStore.getState().setVirtualPointer({
          x: ev.payload.x,
          y: ev.payload.y,
          isDown: true,
          button: ev.payload.button ?? 0,
          lastClickMs: performance.now(),
        });
        break;
      case 'pointer_up':
        useActionRecorderStore.getState().setVirtualPointer({
          x: ev.payload.x,
          y: ev.payload.y,
          isDown: false,
        });
        break;
      case 'key_down': {
        const key = ev.payload.key;
        const formatted =
          key === 'Shift' ? 'Shift' : key === 'Control' ? 'Ctrl' : key;
        useActionRecorderStore.getState().setActiveKeys([formatted]);
        break;
      }
      case 'key_up':
        useActionRecorderStore.getState().setActiveKeys([]);
        break;
      case 'scene_state': {
        const scene = useSceneStore.getState();
        if (ev.payload.buildings) {
          scene.setBuildings(JSON.parse(JSON.stringify(ev.payload.buildings)));
        }
        scene.setSelectedBuildingId(ev.payload.selectedBuildingId || null);
        if (ev.payload.selectedBuildingIds) {
          scene.setSelectedBuildingIds(ev.payload.selectedBuildingIds);
        }
        if (ev.payload.pinnedPoints) {
          scene.setPinnedPoints(
            JSON.parse(JSON.stringify(ev.payload.pinnedPoints))
          );
        }
        if (ev.payload.dimensions) {
          scene.setDimensions(JSON.parse(JSON.stringify(ev.payload.dimensions)));
        }
        break;
      }
      case 'solar_state': {
        const solar = useSolarAnalysisStore.getState();
        if (ev.payload.showShadowingLines !== undefined)
          solar.setShowShadowingLines(ev.payload.showShadowingLines);
        if (ev.payload.showSunlightLines !== undefined)
          solar.setShowSunlightLines(ev.payload.showSunlightLines);
        if (ev.payload.showShadowRange !== undefined)
          solar.setShowShadowRange(ev.payload.showShadowRange);
        if (ev.payload.showShadowFill !== undefined)
          solar.setShowShadowFill(ev.payload.showShadowFill);
        if (ev.payload.showNormals !== undefined)
          solar.setShowNormals(ev.payload.showNormals);
        if (ev.payload.showAnalysisPoints !== undefined)
          solar.setShowAnalysisPoints(ev.payload.showAnalysisPoints);
        if (ev.payload.selectedCity)
          solar.setSelectedCity(ev.payload.selectedCity);
        if (ev.payload.settings)
          solar.updateSettings(ev.payload.settings);
        break;
      }
      case 'cad_state': {
        const cad = useCadToolStore.getState();
        if (ev.payload.viewRotationDeg !== undefined) {
          cad.setViewRotationDeg(ev.payload.viewRotationDeg);
        }
        break;
      }
    }
  }
}
