import { describe, it, expect } from 'vitest';
import { getOrComputeBuildingGeo, getBuildingLabelHitAtPoint, getBuildingLabelScreenAnchor, getBuildingLabelCardSize } from './buildingsRenderer';
import { BuildingLoop } from '@/types/geometry';

describe('buildingsRenderer label optimizations and cache', () => {
  const sampleBuilding: BuildingLoop = {
    id: 'bldg-opt-1',
    name: 'Budynek A',
    layer: 'Domyślna (0)',
    isTested: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 18,
    hWindowBottom: 0.85,
    vertices: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 15 },
      { x: 0, y: 15 },
    ],
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  it('computes and caches labelAnchor, dominantAngleRad, cardSize, and minScaleForLabel', () => {
    const geo = getOrComputeBuildingGeo(sampleBuilding);
    expect(geo).toBeDefined();
    if (!geo) return;

    // Stały anchor
    expect(geo.labelAnchor.x).toBeCloseTo(20, 0.5);
    expect(geo.labelAnchor.y).toBeCloseTo(7.5, 0.5);

    // Kąt dominujący dla prostokąta poziomego powinien być bliski 0
    expect(Math.abs(geo.dominantAngleRad)).toBeCloseTo(0, 0.1);

    // cardSize
    expect(geo.cardSize.cardW).toBeGreaterThanOrEqual(42);
    expect(geo.cardSize.cardH).toBe(34);

    // minScaleForLabel (dla 40x15m: minScaleElongated = max(55/40, 34*0.75/15) = 1.7 px/m)
    expect(geo.minScaleForLabel).toBeGreaterThan(0);
    expect(geo.minScaleForLabel).toBeCloseTo(1.7, 0.1);
  });


  it('hits label only when scale is above minScaleForLabel', () => {
    const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 5, sy: wy * 5 });

    // Przy skali 5.0 px/m (zoom in) - trafia w etykietę w (20, 7.5) -> screen (100, 37.5)
    const hitIdHighZoom = getBuildingLabelHitAtPoint(
      100,
      38,
      [sampleBuilding],
      worldToScreen,
      5.0
    );
    expect(hitIdHighZoom).toBe('bldg-opt-1');

    // Przy skali 0.5 px/m (zoom out, poniżej minScaleForLabel) - natychmiast odrzucone O(1)
    const hitIdLowZoom = getBuildingLabelHitAtPoint(
      100,
      38,
      [sampleBuilding],
      worldToScreen,
      0.5
    );
    expect(hitIdLowZoom).toBeNull();
  });

  it('computes stable bottom screen anchor', () => {
    const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 4, sy: wy * 4 });
    const anchor = getBuildingLabelScreenAnchor(sampleBuilding, worldToScreen);
    expect(anchor).toBeDefined();
    if (!anchor) return;

    expect(anchor.sx).toBeCloseTo(20 * 4, 1);
    expect(anchor.bottomSy).toBeCloseTo(7.5 * 4 + 34 / 2, 1);
  });
});
