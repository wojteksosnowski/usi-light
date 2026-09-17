import { describe, it, expect, vi } from 'vitest';
import { MasterplanRenderPipeline } from './MasterplanRenderPipeline';
import { CadRenderPipeline } from '../pipeline/CadRenderPipeline';
import { CadRenderFrameContext, CadRenderLayer } from '../pipeline/types';

describe('MasterplanRenderPipeline - Underlays Integration', () => {
  it('renders registered underlays (satellite_map and wfs_*) when shouldRender returns true', () => {
    const pipeline = CadRenderPipeline.getDefault();

    const mockSatelliteRender = vi.fn();
    const mockSatelliteLayer: CadRenderLayer = {
      id: 'satellite_map',
      zIndex: 0,
      shouldRender: vi.fn().mockReturnValue(true),
      render: mockSatelliteRender,
    };

    const mockWfsKiutRender = vi.fn();
    const mockWfsKiutLayer: CadRenderLayer = {
      id: 'wfs_kiut_overlay',
      zIndex: 8,
      shouldRender: vi.fn().mockReturnValue(true),
      render: mockWfsKiutRender,
    };

    const mockInactiveLayerRender = vi.fn();
    const mockInactiveLayer: CadRenderLayer = {
      id: 'wfs_mpzp_overlay',
      zIndex: 4,
      shouldRender: vi.fn().mockReturnValue(false),
      render: mockInactiveLayerRender,
    };

    pipeline.registerMainLayer(mockSatelliteLayer);
    pipeline.registerMainLayer(mockWfsKiutLayer);
    pipeline.registerMainLayer(mockInactiveLayer);

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 10 }),
    } as unknown as CanvasRenderingContext2D;

    const mockFrameContext: CadRenderFrameContext = {
      renderContext: {
        ctx: mockCtx,
        width: 1000,
        height: 800,
        viewState: { panX: 500, panY: 400, scale: 2 },
        viewRotationDeg: 0,
        latitude: 52.23,
        longitude: 21.01,
        equinoxDate: 'spring',
        sunlightMethod: 'raycasting',
        masterplanHourFraction: 12.0,
        isInteracting: false,
        worldToScreen: (x, y) => ({ sx: x, sy: y }),
        screenToWorld: (sx, sy) => ({ wx: sx, wy: sy }),
      },
      buildings: [],
      showSatelliteLayer: true,
      layerSettings: {},
    };

    MasterplanRenderPipeline.render(mockFrameContext);

    expect(mockSatelliteLayer.shouldRender).toHaveBeenCalledWith(mockFrameContext);
    expect(mockSatelliteRender).toHaveBeenCalledWith(mockFrameContext);

    expect(mockWfsKiutLayer.shouldRender).toHaveBeenCalledWith(mockFrameContext);
    expect(mockWfsKiutRender).toHaveBeenCalledWith(mockFrameContext);

    expect(mockInactiveLayer.shouldRender).toHaveBeenCalledWith(mockFrameContext);
    expect(mockInactiveLayerRender).not.toHaveBeenCalled();

    // Clean up pipeline
    pipeline.unregisterMainLayer('satellite_map');
    pipeline.unregisterMainLayer('wfs_kiut_overlay');
    pipeline.unregisterMainLayer('wfs_mpzp_overlay');
  });
});
