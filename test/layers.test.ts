import { describe, it, expect } from 'vitest';
import { BuildingLoop, CadLayerSettings } from '../src/types/geometry';
import { createSampleBuildings } from '../src/utils/dxfParser';

describe('CAD Layers Management (Warstwy CAD)', () => {
  it('groups active buildings by layer correctly', () => {
    const buildings = createSampleBuildings();
    // Ensure layer tags
    buildings[0].layer = 'PROJEKT';
    buildings[1].layer = 'ISTNIEJACE';
    buildings[2].layer = 'ISTNIEJACE';

    const map = new Map<string, number>();
    buildings.forEach((b) => {
      const lyr = b.layer || 'Domyślna (0)';
      map.set(lyr, (map.get(lyr) || 0) + 1);
    });

    const activeLayers = Array.from(map.entries()).map(([name, count]) => ({ name, count }));
    expect(activeLayers).toEqual([
      { name: 'PROJEKT', count: 1 },
      { name: 'ISTNIEJACE', count: 2 },
    ]);
  });

  it('batch updates isIncluded, isTested, isCityCentre and height for all buildings on a layer', () => {
    let buildings = createSampleBuildings();
    buildings[0].layer = 'WARSTWA_A';
    buildings[1].layer = 'WARSTWA_A';
    buildings[2].layer = 'WARSTWA_B';

    // Batch update WARSTWA_A
    const targetLayer = 'WARSTWA_A';
    const fields = { isIncluded: false, isTested: true, isCityCentre: true, defaultHeight: 28.5 };

    buildings = buildings.map((bldg) => {
      if ((bldg.layer || 'Domyślna (0)') !== targetLayer) return bldg;
      const updated = { ...bldg, ...fields };
      updated.segments = updated.segments.map((seg) => ({
        ...seg,
        hTop: fields.defaultHeight,
        isCityCentre: fields.isCityCentre,
      }));
      return updated;
    });

    // Check WARSTWA_A buildings
    const bldgsA = buildings.filter((b) => b.layer === 'WARSTWA_A');
    expect(bldgsA.length).toBe(2);
    bldgsA.forEach((b) => {
      expect(b.isIncluded).toBe(false);
      expect(b.isTested).toBe(true);
      expect(b.isCityCentre).toBe(true);
      expect(b.defaultHeight).toBe(28.5);
      expect(b.segments[0].hTop).toBe(28.5);
    });

    // Check WARSTWA_B building is untouched
    const bldgB = buildings.find((b) => b.layer === 'WARSTWA_B')!;
    expect(bldgB.isIncluded !== false).toBe(true);
    expect(bldgB.defaultHeight).not.toBe(28.5);
  });

  it('correctly calculates top elevation for depth sorting and respects boundary category', async () => {
    const { getBuildingTopElevation } = await import('../src/components/CadCanvas');
    const boundary = { category: 'boundary', elevation: 10, defaultHeight: 5 };
    const bldgLow = { category: 'building', elevation: 0, defaultHeight: 12 };
    const bldgHigh = { category: 'building', elevation: 5, defaultHeight: 25 };
    const bldgWithStory = {
      category: 'building',
      elevation: 2,
      defaultHeight: 10,
      storyPolygons: [{ hTop: 30 }],
    };

    expect(getBuildingTopElevation(boundary as any)).toBe(-999999);
    expect(getBuildingTopElevation(bldgLow as any)).toBe(12);
    expect(getBuildingTopElevation(bldgHigh as any)).toBe(30);
    expect(getBuildingTopElevation(bldgWithStory as any)).toBe(32);

    const list = [boundary, bldgLow, bldgWithStory, bldgHigh];
    const sorted = [...list].sort((a, b) => getBuildingTopElevation(b as any) - getBuildingTopElevation(a as any));

    expect(sorted[0]).toBe(bldgWithStory);
    expect(sorted[1]).toBe(bldgHigh);
    expect(sorted[2]).toBe(bldgLow);
    expect(sorted[3]).toBe(boundary);
  });

  it('correctly evaluates isBuildingLocked for individual and layer locks', async () => {
    const { isBuildingLocked } = await import('../src/components/CadCanvas');
    const layerSettings = {
      'WARSTWA_LOCKED': { isLocked: true },
      'WARSTWA_OPEN': { isLocked: false },
    };

    expect(isBuildingLocked(null, layerSettings)).toBe(false);
    expect(isBuildingLocked(undefined, layerSettings)).toBe(false);
    expect(isBuildingLocked({ isLocked: true, layer: 'WARSTWA_OPEN' }, layerSettings)).toBe(true);
    expect(isBuildingLocked({ isLocked: false, layer: 'WARSTWA_LOCKED' }, layerSettings)).toBe(true);
    expect(isBuildingLocked({ isLocked: false, layer: 'WARSTWA_OPEN' }, layerSettings)).toBe(false);
    expect(isBuildingLocked({ isLocked: false }, layerSettings)).toBe(false);
  });

  it('manages layer controls: Lock, Ghost, and Visibility', () => {
    const layerSettings: Record<string, CadLayerSettings> = {};

    // 1. Lock toggle
    layerSettings['PROJEKT'] = { ...layerSettings['PROJEKT'], isLocked: true };
    expect(layerSettings['PROJEKT'].isLocked).toBe(true);

    // 2. Ghost toggle
    layerSettings['ISTNIEJACE'] = { ...layerSettings['ISTNIEJACE'], isGhosted: true };
    expect(layerSettings['ISTNIEJACE'].isGhosted).toBe(true);

    // 3. Visibility toggle
    layerSettings['POMOCNICZA'] = { ...layerSettings['POMOCNICZA'], isVisible: false };
    expect(layerSettings['POMOCNICZA'].isVisible).toBe(false);
  });
});
