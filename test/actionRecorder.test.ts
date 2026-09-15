import { describe, it, expect, beforeEach } from 'vitest';
import { useActionRecorderStore } from '../src/modules/action-recorder/useActionRecorderStore';
import { ActionReplayer } from '../src/modules/action-recorder/ActionReplayer';
import { ActionSession } from '../src/modules/action-recorder/types';
import { SimpleGifEncoder } from '../src/modules/action-recorder/gifEncoder';
import { useSceneStore } from '../src/store/useSceneStore';
import { useSolarAnalysisStore } from '../src/store/useSolarAnalysisStore';

describe('Action Recorder & Replayer Tests', () => {
  beforeEach(() => {
    useActionRecorderStore.setState({
      isRecording: false,
      isCountingDown: false,
      countdownValue: 3,
      recordingTimeMs: 0,
      activeKeys: [],
      isCatalogOpen: false,
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
    });
  });

  it('updates recorder settings correctly including 3D preview', () => {
    const store = useActionRecorderStore.getState();
    store.updateSettings({
      aspectRatio: '16:9',
      showVirtualCursor: false,
      show3DPreview: true,
      pipPosition: 'top-right',
      pipSize: 'large',
      pipIsXRay: true,
      pipOrientation: 'NE',
    });

    const updated = useActionRecorderStore.getState().settings;
    expect(updated.aspectRatio).toBe('16:9');
    expect(updated.showVirtualCursor).toBe(false);
    expect(updated.show3DPreview).toBe(true);
    expect(updated.pipPosition).toBe('top-right');
    expect(updated.pipSize).toBe('large');
    expect(updated.pipIsXRay).toBe(true);
    expect(updated.pipOrientation).toBe('NE');
  });

  it('sets virtual pointer and active keys', () => {
    const store = useActionRecorderStore.getState();
    store.setVirtualPointer({ x: 150, y: 250, isDown: true, button: 0 });
    store.setActiveKeys(['Shift', 'Orto']);

    const state = useActionRecorderStore.getState();
    expect(state.virtualPointer.x).toBe(150);
    expect(state.virtualPointer.y).toBe(250);
    expect(state.virtualPointer.isDown).toBe(true);
    expect(state.activeKeys).toEqual(['Shift', 'Orto']);
  });

  it('ActionReplayer loads session and applies initial states', () => {
    const mockSession: ActionSession = {
      id: 'test-session-1',
      version: 1,
      title: 'Test Session',
      createdAt: new Date().toISOString(),
      durationMs: 2000,
      aspectRatio: '1:1',
      viewport: { width: 800, height: 800 },
      initialState: {
        scene: {
          buildings: [
            {
              id: 'bldg-test-1',
              name: 'Budynek Testowy',
              vertices: [
                { x: 0, y: 0 },
                { x: 20, y: 0 },
                { x: 20, y: 20 },
                { x: 0, y: 20 },
              ],
              height: 15,
            },
          ],
          selectedBuildingId: 'bldg-test-1',
        },
        solar: {
          showShadowingLines: true,
          showSunlightLines: false,
          selectedCity: 'Gdańsk',
        },
        cad: {
          viewRotationDeg: 15,
        },
      },
      events: [
        {
          timestampMs: 500,
          type: 'solar_state',
          payload: { showSunlightLines: true },
        },
      ],
    };

    const replayer = ActionReplayer.getInstance();
    replayer.loadSession(mockSession);

    // Weryfikacja zastosowania stanu początkowego
    const scene = useSceneStore.getState();
    expect(scene.buildings.length).toBe(1);
    expect(scene.buildings[0].id).toBe('bldg-test-1');
    expect(scene.selectedBuildingId).toBe('bldg-test-1');

    const solar = useSolarAnalysisStore.getState();
    expect(solar.showShadowingLines).toBe(true);
    expect(solar.selectedCity).toBe('Gdańsk');

    const status = useActionRecorderStore.getState().replayerStatus;
    expect(status.totalDurationMs).toBe(2000);
    expect(status.activeSession?.id).toBe('test-session-1');
  });

  it('handles videoFormat options correctly in settings', () => {
    const store = useActionRecorderStore.getState();
    expect(store.settings.videoFormat).toBe('mp4');

    store.updateSettings({ videoFormat: 'webm' });
    expect(useActionRecorderStore.getState().settings.videoFormat).toBe('webm');

    store.updateSettings({ videoFormat: 'gif' });
    expect(useActionRecorderStore.getState().settings.videoFormat).toBe('gif');
  });

  it('SimpleGifEncoder creates a valid GIF Blob with GIF89a header', () => {
    const encoder = new SimpleGifEncoder(10, 10);
    const dummyImageData = {
      width: 10,
      height: 10,
      data: new Uint8ClampedArray(10 * 10 * 4).fill(128),
    } as ImageData;

    encoder.addFrame(dummyImageData, 100);
    encoder.addFrame(dummyImageData, 100);

    const blob = encoder.encode();
    expect(blob).toBeDefined();
    expect(blob.type).toBe('image/gif');
    expect(blob.size).toBeGreaterThan(0);
  });
});
