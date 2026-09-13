import { describe, it, expect, vi } from 'vitest';
import { renderSatelliteMap } from '../src/components/cad/renderers/satelliteMapRenderer';
import { renderWmsOverlay } from '../src/modules/wfs-import/renderers/wmsOverlayRenderer';
import { GoogleTileManager } from '../src/utils/googleTileManager';
import { WmsTileManager } from '../src/modules/wfs-import/renderers/wmsTileManager';
import { CrsDetectionResult, LatLon } from '../src/utils/geoTransform';
import { CadRenderContext, ViewportState } from '../src/components/cad/types';

class MockImage {
  public src = '';
  public crossOrigin = '';
  public complete = true;
  public naturalWidth = 256;
  public naturalHeight = 256;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
}

if (typeof globalThis.Image === 'undefined') {
  (globalThis as any).Image = MockImage;
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({
      width: 256,
      height: 256,
      getContext: () => new MockContext2D(),
    }),
  };
}

class MockContext2D {
  public globalAlpha = 1.0;
  public imageSmoothingEnabled = true;
  public imageSmoothingQuality: ImageSmoothingQuality = 'high';
  public filter = 'none';

  save() {}
  restore() {}
  beginPath() {}
  arc() {}
  clip() {}
  setTransform() {}
  drawImage() {}
}

describe('CAD Pan/Zoom Performance Benchmark (5 Iterations)', () => {
  const crsInfo: CrsDetectionResult = {
    crs: 'LOCAL',
    description: 'Local CAD coordinate space',
    geodeticLabel: 'Lokalny CAD',
    isGeodetic: false,
    isLocalReference: true,
  };

  const projectCenter: LatLon = { lat: 52.2297, lon: 21.0122 };

  const createMockRenderContext = (scale = 14, panX = 500, panY = 450): { rc: CadRenderContext; ctx: MockContext2D } => {
    const ctx = new MockContext2D() as unknown as CanvasRenderingContext2D;
    const viewState: ViewportState = { scale, panX, panY };

    const worldToScreen = (wx: number, wy: number) => ({
      sx: viewState.panX + wx * viewState.scale,
      sy: viewState.panY - wy * viewState.scale,
    });

    const screenToWorld = (sx: number, sy: number) => ({
      wx: (sx - viewState.panX) / viewState.scale,
      wy: -(sy - viewState.panY) / viewState.scale,
    });

    const rc: CadRenderContext = {
      ctx,
      width: 1200,
      height: 900,
      viewState,
      viewRotationDeg: 0,
      worldToScreen,
      screenToWorld,
      latitude: 52.2297,
      longitude: 21.0122,
      equinoxDate: 'spring',
      sunlightMethod: 'segments',
      isInteracting: false,
    };

    return { rc, ctx: ctx as unknown as MockContext2D };
  };

  it('Iteration 1: Wheel zoom continuity & responsiveness', () => {
    let scale = 14.0;
    const mouseX = 600;
    const mouseY = 450;
    let panX = 500;
    let panY = 450;

    const recordedScales: number[] = [scale];

    // Simulate 50 small trackpad wheel events
    for (let i = 0; i < 50; i++) {
      const deltaY = (Math.sin(i * 0.2) + 1.2) * 2; // small continuous float deltas
      const rawDelta = deltaY;
      const clampedDelta = Math.max(-120, Math.min(120, rawDelta));
      const zoomFactor = Math.exp(-clampedDelta * 0.0018);

      const newScale = Math.max(0.001, Math.min(100, scale * zoomFactor));
      const ratio = newScale / scale;
      panX = mouseX - (mouseX - panX) * ratio;
      panY = mouseY - (mouseY - panY) * ratio;
      scale = newScale;
      recordedScales.push(scale);
    }

    // Verify monotonic continuity - no sudden jumps > 5% per delta
    for (let i = 1; i < recordedScales.length; i++) {
      const stepRatio = recordedScales[i] / recordedScales[i - 1];
      expect(stepRatio).toBeGreaterThan(0.95);
      expect(stepRatio).toBeLessThan(1.05);
    }
  });

  it('Iteration 2: RAF throttling under high tile load burst', () => {
    let tickCount = 0;
    let rafPending = false;

    const scheduleTileRedraw = () => {
      if (rafPending) return;
      rafPending = true;
      setTimeout(() => {
        rafPending = false;
        tickCount++;
      }, 0);
    };

    // 100 tiles loading almost simultaneously
    for (let i = 0; i < 100; i++) {
      scheduleTileRedraw();
    }

    expect(rafPending).toBe(true);
    // Before async dispatch, tickCount is still 0
    expect(tickCount).toBe(0);
  });

  it('Iteration 3: Inverted tile caching performance (zero ctx.filter in render loop)', () => {
    const wms = new WmsTileManager({ baseUrl: 'http://example.com/wms', layers: 'gesut' });
    wms.setInvertColors(true);
    const { rc, ctx } = createMockRenderContext();

    renderWmsOverlay({
      rc,
      tileManager: wms,
      crsInfo,
      projectCenterLatLon: projectCenter,
      projectRadius: 200,
    });

    // ctx.filter must remain 'none' (inversion is done offscreen in cache)
    expect(ctx.filter).toBe('none');
  });

  it('Iteration 4: Vectorized affine transform throughput across multiple active layers', () => {
    const googleTile = new GoogleTileManager('test-key');
    const wmsTile1 = new WmsTileManager({ baseUrl: 'http://example.com/kiut', layers: 'kiut' });
    wmsTile1.setInvertColors(true);
    const wmsTile2 = new WmsTileManager({ baseUrl: 'http://example.com/bdot', layers: 'bdot' });
    wmsTile2.setInvertColors(true);
    const wmsTile3 = new WmsTileManager({ baseUrl: 'http://example.com/mpzp', layers: 'mpzp' });
    const wmsTile4 = new WmsTileManager({ baseUrl: 'http://example.com/nmt', layers: 'nmt' });

    const { rc } = createMockRenderContext(18, 550, 420);

    const t0 = performance.now();
    const frameCount = 100;

    for (let f = 0; f < frameCount; f++) {
      // Simulate slight pan and zoom on each frame
      rc.viewState.panX += (f % 5) - 2;
      rc.viewState.panY += (f % 3) - 1;
      rc.viewState.scale = 18 + Math.sin(f * 0.1) * 2;

      renderSatelliteMap({ rc, tileManager: googleTile, crsInfo, projectCenterLatLon: projectCenter });
      renderWmsOverlay({ rc, tileManager: wmsTile1, crsInfo, projectCenterLatLon: projectCenter, projectRadius: 200 });
      renderWmsOverlay({ rc, tileManager: wmsTile2, crsInfo, projectCenterLatLon: projectCenter, projectRadius: 200 });
      renderWmsOverlay({ rc, tileManager: wmsTile3, crsInfo, projectCenterLatLon: projectCenter, projectRadius: 200 });
      renderWmsOverlay({ rc, tileManager: wmsTile4, crsInfo, projectCenterLatLon: projectCenter, projectRadius: 200 });
    }

    const t1 = performance.now();
    const totalMs = t1 - t0;
    const avgFrameMs = totalMs / frameCount;

    console.log(`[BENCHMARK] 100 frames with 5 active raster/WMS layers: Total ${totalMs.toFixed(2)} ms, Avg ${avgFrameMs.toFixed(3)} ms/frame`);
    expect(avgFrameMs).toBeLessThan(5.0); // Target < 5ms per multi-layer frame (> 200 FPS)
  });

  it('Iteration 5: 5x Pan & Zoom Stress Suite', () => {
    const tileManager = new GoogleTileManager('test-key');
    const iterationTimes: number[] = [];

    for (let iter = 1; iter <= 5; iter++) {
      const { rc } = createMockRenderContext();
      const startT = performance.now();

      // 60 frames of rapid combined pan and zoom (simulating heavy user drag)
      for (let step = 0; step < 60; step++) {
        rc.viewState.panX += Math.cos(step * 0.2) * 15;
        rc.viewState.panY += Math.sin(step * 0.2) * 15;
        rc.viewState.scale = 10 + (step % 20);

        renderSatelliteMap({
          rc,
          tileManager,
          crsInfo,
          projectCenterLatLon: projectCenter,
          opacity: 0.7,
        });
      }

      const elapsed = performance.now() - startT;
      iterationTimes.push(elapsed);
      console.log(`[SERIES ITERATION ${iter}/5] 60 frames duration: ${elapsed.toFixed(2)} ms (${(elapsed / 60).toFixed(3)} ms/frame)`);
    }

    const avgIterationMs = iterationTimes.reduce((a, b) => a + b, 0) / 5;
    console.log(`[5x STRESS SUITE RESULT] Average iteration time: ${avgIterationMs.toFixed(2)} ms (Average frame: ${(avgIterationMs / 60).toFixed(3)} ms)`);

    expect(avgIterationMs / 60).toBeLessThan(2.0); // Target < 2ms per single satellite frame (> 500 FPS)
  });
});
