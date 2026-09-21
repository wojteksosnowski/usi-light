import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CadRenderPipeline } from './CadRenderPipeline';
import { CadRenderFrameContext, CadRenderLayer, CadRenderTier } from './types';
import { BuildingsLayer } from './layers/BuildingsLayer';
import { BuildingsDragPreviewLayer } from './layers/BuildingsDragPreviewLayer';
import { BuildingLoop } from '../../../types/geometry';

vi.mock('../renderers/buildingsRenderer', () => ({
  renderBuildings: vi.fn(),
  getBuildingLabelScreenAnchor: vi.fn(),
}));

import { renderBuildings } from '../renderers/buildingsRenderer';

function makeCtxStub(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

function makeFrameContext(overrides: Partial<CadRenderFrameContext> = {}): CadRenderFrameContext {
  return {
    renderContext: {
      ctx: makeCtxStub(),
      width: 100,
      height: 100,
      viewState: { panX: 0, panY: 0, scale: 1 },
      viewRotationDeg: 0,
      worldToScreen: (wx: number, wy: number) => ({ sx: wx, sy: wy }),
      screenToWorld: (sx: number, sy: number) => ({ wx: sx, wy: sy }),
      latitude: 52.23,
      longitude: 21.01,
      equinoxDate: 'spring',
    },
    buildings: [],
    ...overrides,
  };
}

function makeMockLayer(id: string, tier: CadRenderTier, zIndex: number): CadRenderLayer & { render: ReturnType<typeof vi.fn> } {
  return {
    id,
    zIndex,
    tier,
    shouldRender: vi.fn(() => true),
    render: vi.fn((_context: CadRenderFrameContext) => undefined),
  };
}

function makeBuilding(id: string): BuildingLoop {
  return {
    id,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    segments: [],
  } as unknown as BuildingLoop;
}

describe('CadRenderPipeline - podział na tiery', () => {
  it('domyślne warstwy są poprawnie przypisane do tierów background/scene/hud', () => {
    const pipeline = new CadRenderPipeline();
    const mainLayers = pipeline.getMainLayers();
    const overlayLayers = pipeline.getOverlayLayers();

    const byId = (id: string) => [...mainLayers, ...overlayLayers].find((l) => l.id === id);

    expect(byId('satellite_map')?.tier).toBe('background');
    expect(byId('grid')?.tier).toBe('background');
    expect(byId('buildings')?.tier).toBe('scene');
    expect(byId('shadow_range')?.tier).toBe('scene');
    expect(byId('drawing_tool_overlay')?.tier).toBe('hud');
    expect(byId('buildings_drag_preview')?.tier).toBe('hud');
    expect(byId('recorder_visuals')?.tier).toBe('hud');

    // Warstwy background/scene żyją wyłącznie w mainLayers, HUD wyłącznie w overlayLayers.
    for (const layer of mainLayers) {
      expect(layer.tier).not.toBe('hud');
    }
    for (const layer of overlayLayers) {
      expect(layer.tier).toBe('hud');
    }
  });

  it('renderBackground nie wywołuje warstw tier=scene', () => {
    const bgLayer = makeMockLayer('bg', 'background', 0);
    const sceneLayer = makeMockLayer('scene', 'scene', 10);
    const pipeline = new CadRenderPipeline([bgLayer, sceneLayer], []);

    const ctx = makeCtxStub();
    pipeline.renderBackground(makeFrameContext(), ctx);

    expect(bgLayer.render).toHaveBeenCalledTimes(1);
    expect(sceneLayer.render).not.toHaveBeenCalled();
  });

  it('renderScene nie wywołuje warstw tier=background', () => {
    const bgLayer = makeMockLayer('bg', 'background', 0);
    const sceneLayer = makeMockLayer('scene', 'scene', 10);
    const pipeline = new CadRenderPipeline([bgLayer, sceneLayer], []);

    const ctx = makeCtxStub();
    pipeline.renderScene(makeFrameContext(), ctx);

    expect(sceneLayer.render).toHaveBeenCalledTimes(1);
    expect(bgLayer.render).not.toHaveBeenCalled();
  });
});

describe('BuildingsLayer - brak podmiany geometrii podczas przeciągania', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderBuildings zawsze otrzymuje niezmienioną tablicę buildings, nawet przy aktywnym drag preview', () => {
    const building = makeBuilding('b1');
    const layer = new BuildingsLayer();

    const context = makeFrameContext({
      buildings: [building],
      selectedBuildingId: 'b1',
      draggedVertexIndex: 0,
      dragVertexPreviewPt: { x: 999, y: 999 },
    });

    layer.render(context);

    expect(renderBuildings).toHaveBeenCalledTimes(1);
    const passedBuildings = (renderBuildings as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(passedBuildings).toBe(context.buildings);
    expect(passedBuildings[0].vertices[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('BuildingsDragPreviewLayer - shouldRender', () => {
  const layer = new BuildingsDragPreviewLayer();

  it('zwraca false gdy nic nie jest przeciągane', () => {
    const context = makeFrameContext({
      buildings: [makeBuilding('b1')],
      selectedBuildingId: 'b1',
      draggedVertexIndex: null,
      dragVertexPreviewPt: null,
    });
    expect(layer.shouldRender(context)).toBe(false);
  });

  it('zwraca false gdy brak selectedBuildingId', () => {
    const context = makeFrameContext({
      buildings: [makeBuilding('b1')],
      selectedBuildingId: null,
      draggedVertexIndex: 0,
      dragVertexPreviewPt: { x: 1, y: 1 },
    });
    expect(layer.shouldRender(context)).toBe(false);
  });

  it('zwraca true gdy trwa przeciąganie wierzchołka wybranego budynku', () => {
    const context = makeFrameContext({
      buildings: [makeBuilding('b1')],
      selectedBuildingId: 'b1',
      draggedVertexIndex: 2,
      dragVertexPreviewPt: { x: 5, y: 5 },
    });
    expect(layer.shouldRender(context)).toBe(true);
  });
});
