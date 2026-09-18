import { describe, it, expect, vi } from 'vitest';
import {
  getDominantBuildingType,
  computeBuildingTypeEffect,
  renderBuildingTypeOffset,
  extractBuildingFunctionZones,
  renderMasterplanFunctionOverlays,
} from './masterplanBuildingTypes';
import { BuildingLoop } from '@/types/geometry';
import { APP_CONFIG } from '@/config/appConfig';
import { applyBuildingModifiers } from '@/engine/modifiers/modifierPipeline';

describe('masterplanBuildingTypes', () => {
  it('correctly detects dominant building type as residential for mostly residential project', () => {
    const buildings: BuildingLoop[] = [
      {
        id: 'b1',
        name: 'B1',
        buildingType: 'residential',
        storeysCount: 5,
        defaultHeight: 15,
        hWindowBottom: 0.85,
        isCityCentre: false,
        layer: '0',
        isTested: true,
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      } as unknown as BuildingLoop,
      {
        id: 'b2',
        name: 'B2',
        buildingType: 'service',
        storeysCount: 1,
        defaultHeight: 3.5,
        hWindowBottom: 0.85,
        isCityCentre: false,
        layer: '0',
        isTested: false,
        vertices: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }],
      } as unknown as BuildingLoop,
    ];

    expect(getDominantBuildingType(buildings)).toBe('residential');
  });

  it('correctly detects dominant building type when service dominates', () => {
    const buildings: BuildingLoop[] = [
      {
        id: 'b1',
        name: 'B1',
        buildingType: 'service',
        storeysCount: 6,
        defaultHeight: 20,
        hWindowBottom: 0.85,
        isCityCentre: false,
        layer: '0',
        isTested: true,
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      } as unknown as BuildingLoop,
      {
        id: 'b2',
        name: 'B2',
        buildingType: 'residential',
        storeysCount: 1,
        defaultHeight: 3.0,
        hWindowBottom: 0.85,
        isCityCentre: false,
        layer: '0',
        isTested: false,
        vertices: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }],
      } as unknown as BuildingLoop,
    ];

    expect(getDominantBuildingType(buildings)).toBe('service');
  });

  it('computes increasing blur and decreasing alpha (higher transparency) for increasing overhead stories', () => {
    const effectTop = computeBuildingTypeEffect('service', 0);
    const effectMid = computeBuildingTypeEffect('service', 2);
    const effectDeep = computeBuildingTypeEffect('service', 5);

    expect(effectTop.color).toBe(APP_CONFIG.isoPreview.colors.xray.service);
    expect(effectMid.blurPx).toBeGreaterThan(effectTop.blurPx);
    expect(effectDeep.blurPx).toBeGreaterThan(effectMid.blurPx);

    // Alpha maleje (przezroczystość rośnie)
    expect(effectTop.alpha).toBeGreaterThan(effectMid.alpha);
    expect(effectMid.alpha).toBeGreaterThan(effectDeep.alpha);
  });

  it('renders building type offset into canvas context with clip and blur filter', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      filter: 'none',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const polygon = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];

    const effect = computeBuildingTypeEffect('service', 1);
    renderBuildingTypeOffset(mockCtx, polygon, undefined, effect, 1.0);

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.clip).toHaveBeenCalledWith('evenodd');
    expect(mockCtx.fill).toHaveBeenCalledWith('evenodd');
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('extracts function zones from zone_function modifier (scope: storeys, ground floor)', () => {
    const baseBldg: BuildingLoop = {
      id: 'bldg-zf-1',
      name: 'Residential with Service Ground',
      buildingType: 'residential',
      defaultHeight: 15.0,
      storeysCount: 5,
      firstFloorHeight: 3.0,
      typicalFloorHeight: 3.0,
      elevation: 0,
      hWindowBottom: 0.85,
      isCityCentre: false,
      layer: '0',
      isTested: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      modifiers: [
        {
          id: 'mod-zf-1',
          type: 'zone_function',
          enabled: true,
          buildingType: 'service',
          scope: 'storeys',
          storiesCount: 1, // parter
        },
      ],
      segments: [],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const res = applyBuildingModifiers(baseBldg);
    const bldgWithMods: BuildingLoop = { ...baseBldg, storyPolygons: res.storyPolygons };

    const dominant = getDominantBuildingType([bldgWithMods]);
    expect(dominant).toBe('residential');

    const zones = extractBuildingFunctionZones([bldgWithMods], dominant);
    expect(zones.length).toBe(1);
    expect(zones[0].buildingType).toBe('service');
    expect(zones[0].overheadStories).toBe(4); // 5 - 0 - 1 = 4
  });

  it('extracts function zones from zone_function modifier (scope: edge_offset, 10m ribbon)', () => {
    const baseBldg: BuildingLoop = {
      id: 'bldg-zf-2',
      name: 'Residential with Edge Service Ribbon',
      buildingType: 'residential',
      defaultHeight: 12.0,
      storeysCount: 4,
      firstFloorHeight: 3.0,
      typicalFloorHeight: 3.0,
      elevation: 0,
      hWindowBottom: 0.85,
      isCityCentre: false,
      layer: '0',
      isTested: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ],
      modifiers: [
        {
          id: 'mod-zf-2',
          type: 'zone_function',
          enabled: true,
          buildingType: 'service',
          scope: 'edge_offset',
          storiesCount: 1, // parter pasmo
          edgeIndex: 0,
          depth: 10.0,
        },
      ],
      segments: [],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const res = applyBuildingModifiers(baseBldg);
    const bldgWithMods: BuildingLoop = { ...baseBldg, storyPolygons: res.storyPolygons };

    const dominant = getDominantBuildingType([bldgWithMods]);
    expect(dominant).toBe('residential');

    const zones = extractBuildingFunctionZones([bldgWithMods], dominant);
    expect(zones.length).toBe(1);
    expect(zones[0].buildingType).toBe('service');
    expect(zones[0].overheadStories).toBe(3); // 4 - 0 - 1 = 3
  });

  it('renders function overlays on masterplan for covered service zones', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      filter: 'none',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const baseBldg: BuildingLoop = {
      id: 'bldg-zf-3',
      name: 'Residential with Service Ground',
      buildingType: 'residential',
      defaultHeight: 15.0,
      storeysCount: 5,
      firstFloorHeight: 3.0,
      typicalFloorHeight: 3.0,
      elevation: 0,
      hWindowBottom: 0.85,
      isCityCentre: false,
      layer: '0',
      isTested: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      modifiers: [
        {
          id: 'mod-zf-3',
          type: 'zone_function',
          enabled: true,
          buildingType: 'service',
          scope: 'storeys',
          storiesCount: 1,
        },
      ],
      segments: [],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const res = applyBuildingModifiers(baseBldg);
    const bldgWithMods: BuildingLoop = { ...baseBldg, storyPolygons: res.storyPolygons };

    renderMasterplanFunctionOverlays(mockCtx, [bldgWithMods], 1.0, 'residential');

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.clip).toHaveBeenCalledWith('evenodd');
    expect(mockCtx.fill).toHaveBeenCalledWith('evenodd');
    expect(mockCtx.restore).toHaveBeenCalled();
  });
});
