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

if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    moveTo = vi.fn();
    lineTo = vi.fn();
    closePath = vi.fn();
    arc = vi.fn();
  };
}

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
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    roundRect: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 50 }),
    translate: vi.fn(),
    rotate: vi.fn(),
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

    expect(layers.length).toBe(10);
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

  it('renders BuildingsLayer without error when a building or boundary is selected', () => {
    const buildingsLayer = new BuildingsLayer();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockBuildings: any[] = [
      {
        id: 'bldg-1',
        name: 'Budynek A',
        category: 'building',
        vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 15 }, { x: 0, y: 15 }],
        segments: [
          { p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 }, normal: { x: 0, y: -1 }, length: 20, angleRad: 0, hTop: 15, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
          { p1: { x: 20, y: 0 }, p2: { x: 20, y: 15 }, normal: { x: 1, y: 0 }, length: 15, angleRad: Math.PI / 2, hTop: 15, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
          { p1: { x: 20, y: 15 }, p2: { x: 0, y: 15 }, normal: { x: 0, y: 1 }, length: 20, angleRad: Math.PI, hTop: 15, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
          { p1: { x: 0, y: 15 }, p2: { x: 0, y: 0 }, normal: { x: -1, y: 0 }, length: 15, angleRad: -Math.PI / 2, hTop: 15, hBase: 0, hWindowBottom: 0.85, isCityCentre: false, buildingType: 'residential' },
        ],
        defaultHeight: 15,
        elevation: 0,
        isTested: true,
      },
      {
        id: 'boundary-1',
        name: 'Działka 123/4',
        plotNumber: '123/4',
        category: 'boundary',
        areaType: 'plot',
        vertices: [{ x: -10, y: -10 }, { x: 40, y: -10 }, { x: 40, y: 30 }, { x: -10, y: 30 }],
        segments: [
          { p1: { x: -10, y: -10 }, p2: { x: 40, y: -10 }, normal: { x: 0, y: -1 }, length: 50, angleRad: 0, hTop: 0, hBase: 0, hWindowBottom: 0, isCityCentre: false, buildingType: 'residential' },
          { p1: { x: 40, y: -10 }, p2: { x: 40, y: 30 }, normal: { x: 1, y: 0 }, length: 40, angleRad: Math.PI / 2, hTop: 0, hBase: 0, hWindowBottom: 0, isCityCentre: false, buildingType: 'residential' },
          { p1: { x: 40, y: 30 }, p2: { x: -10, y: 30 }, normal: { x: 0, y: 1 }, length: 50, angleRad: Math.PI, hTop: 0, hBase: 0, hWindowBottom: 0, isCityCentre: false, buildingType: 'residential' },
          { p1: { x: -10, y: 30 }, p2: { x: -10, y: -10 }, normal: { x: -1, y: 0 }, length: 40, angleRad: -Math.PI / 2, hTop: 0, hBase: 0, hWindowBottom: 0, isCityCentre: false, buildingType: 'residential' },
        ],
        isTested: true,
      },
    ];

    const ctx = createMockFrameContext({
      buildings: mockBuildings,
      visibleBuildings: mockBuildings,
      selectedBuildingId: 'bldg-1',
    });

    expect(() => buildingsLayer.render(ctx)).not.toThrow();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
