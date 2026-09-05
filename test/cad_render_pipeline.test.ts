import { describe, it, expect, vi } from 'vitest';
import {
  CadRenderPipeline,
  CadRenderLayer,
  CadRenderFrameContext,
  GridLayer,
  ShadowRangeLayer,
  BuildingsLayer,
  DrawingToolLayer,
} from '../src/components/cad/pipeline';
import { CadRenderContext } from '../src/components/cad/types';

describe('CadRenderPipeline & Layer Orchestration', () => {
  const mockCtx = {
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  const mockRenderContext: CadRenderContext = {
    ctx: mockCtx,
    width: 800,
    height: 600,
    viewState: { panX: 0, panY: 0, scale: 1 },
    viewRotationDeg: 0,
    worldToScreen: (wx, wy) => ({ sx: wx, sy: wy }),
    screenToWorld: (sx, sy) => ({ wx: sx, wy: sy }),
    latitude: 52.23,
    longitude: 21.01,
    equinoxDate: 'spring',
  };

  const createMockFrameContext = (overrides?: Partial<CadRenderFrameContext>): CadRenderFrameContext => ({
    renderContext: mockRenderContext,
    buildings: [],
    visibleBuildings: [],
    selectedBuildingId: null,
    hoveredBuildingId: null,
    hoveredEdge: null,
    isEditMode: false,
    showNormals: false,
    analysisResults: [],
    selectedPointResult: null,
    activePointMode: 'shadowing',
    isLinkingMode: false,
    linkingSourceId: null,
    layerSettings: {},
    editingEdgeLength: null,
    hoveredEdgeLengthBadge: null,
    pinnedPointResults: [],
    activePinnedPointId: null,
    liveFacadeSnap: null,
    facadePointMode: false,
    drawingMode: 'none',
    showAnalysisPoints: false,
    showShadowRange: false,
    showShadowFill: false,
    showShadowingLines: false,
    showSunlightLines: false,
    shadowRangeLoopsToRender: [],
    hourlyShadowsToRender: [],
    dimensions: [],
    isDimensionMode: false,
    dimensionPendingRef: null,
    dimHoveredEdge: null,
    dimensionType: 'linear',
    rotationHover: null,
    viewRotationMode: false,
    showSatelliteLayer: false,
    satelliteOpacity: 1,
    tileManager: null,
    crsInfo: { epsg: 2180, isCustom: false, label: 'PL-1992' },
    draggedVertexIndex: null,
    dragVertexPreviewPt: null,
    ...overrides,
  });

  it('initializes default main layers in strict Z-Index order', () => {
    const pipeline = new CadRenderPipeline();
    const layers = pipeline.getMainLayers();

    expect(layers.length).toBe(9);
    for (let i = 0; i < layers.length - 1; i++) {
      expect(layers[i].zIndex).toBeLessThanOrEqual(layers[i + 1].zIndex);
    }
  });

  it('correctly filters layers via shouldRender condition', () => {
    const executedLayers: string[] = [];

    const layerA: CadRenderLayer = {
      id: 'layer_a',
      zIndex: 10,
      shouldRender: () => true,
      render: () => {
        executedLayers.push('layer_a');
      },
    };

    const layerB: CadRenderLayer = {
      id: 'layer_b',
      zIndex: 20,
      shouldRender: () => false,
      render: () => {
        executedLayers.push('layer_b');
      },
    };

    const pipeline = new CadRenderPipeline([layerA, layerB], []);
    pipeline.renderMain(createMockFrameContext());

    expect(executedLayers).toEqual(['layer_a']);
  });

  it('isolates errors in layers without interrupting the rest of the pipeline', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const executedLayers: string[] = [];

    const faultyLayer: CadRenderLayer = {
      id: 'faulty_layer',
      zIndex: 10,
      shouldRender: () => true,
      render: () => {
        throw new Error('Boom in layer!');
      },
    };

    const nextLayer: CadRenderLayer = {
      id: 'next_layer',
      zIndex: 20,
      shouldRender: () => true,
      render: () => {
        executedLayers.push('next_layer');
      },
    };

    const pipeline = new CadRenderPipeline([faultyLayer, nextLayer], []);
    pipeline.renderMain(createMockFrameContext());

    expect(executedLayers).toEqual(['next_layer']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('allows dynamic registration and unregistration of layers', () => {
    const pipeline = new CadRenderPipeline([]);
    expect(pipeline.getMainLayers().length).toBe(0);

    const customLayer: CadRenderLayer = {
      id: 'custom_heat_map',
      zIndex: 35,
      shouldRender: () => true,
      render: vi.fn(),
    };

    pipeline.registerMainLayer(customLayer);
    expect(pipeline.getMainLayers().length).toBe(1);
    expect(pipeline.getMainLayers()[0].id).toBe('custom_heat_map');

    pipeline.unregisterMainLayer('custom_heat_map');
    expect(pipeline.getMainLayers().length).toBe(0);
  });

  it('renders overlay layers with clearRect buffer reset', () => {
    const overlayRenderSpy = vi.fn();
    const overlayLayer: CadRenderLayer = {
      id: 'test_overlay',
      zIndex: 90,
      shouldRender: () => true,
      render: overlayRenderSpy,
    };

    const pipeline = new CadRenderPipeline([], [overlayLayer]);
    pipeline.renderOverlay(createMockFrameContext());

    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(overlayRenderSpy).toHaveBeenCalled();
  });
});
