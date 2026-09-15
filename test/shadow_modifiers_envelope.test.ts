import { describe, it, expect } from 'vitest';
import { BuildingLoop } from '../src/types/geometry';
import { applyBuildingModifiers } from '../src/engine/modifiers/modifierPipeline';
import { computeFullShadowAnalysis, computeHourlyShadowsLive } from '../src/utils/math2d/shadowEnvelope';
import { calculateSignedArea } from '../src/utils/math2d/polygons';

describe('Shadow Range Modifiers Support (Single-Story & Multi-Story)', () => {
  const base1StoryBuilding: BuildingLoop = {
    id: 'bldg-1s',
    name: 'Budynek 1-kondygnacyjny',
    layer: 'Domyślna (0)',
    isTested: true,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 4,
    elevation: 0,
    storeysCount: 1,
    storeyHeight: 4,
    vertices: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ],
    segments: [],
    modifiers: [
      {
        id: 'mod-corner-cut',
        type: 'corner_cut',
        name: 'Ścięcie narożnika',
        enabled: true,
        vertexIndex: 2, // narożnik (20, 20)
        depth: 8,
        mode: 'chamfer',
        scope: 'vertex',
        storiesCount: 0,
      },
    ],
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  it('uwzglednia modyfikatory dla budynku 1-kondygnacyjnego (storyPolygons.length === 1) w computeFullShadowAnalysis', () => {
    // 1. Oblicz modyfikatory budynku
    const { storyPolygons, segments } = applyBuildingModifiers(base1StoryBuilding);
    expect(storyPolygons.length).toBe(1);

    const buildingWithMod: BuildingLoop = {
      ...base1StoryBuilding,
      storyPolygons,
      segments,
    };

    const buildingWithoutMod: BuildingLoop = {
      ...base1StoryBuilding,
      storyPolygons: undefined,
      modifiers: [],
    };

    const resWithMod = computeFullShadowAnalysis([buildingWithMod], 52.23, 21.01, 'spring', 1.0);
    const resWithoutMod = computeFullShadowAnalysis([buildingWithoutMod], 52.23, 21.01, 'spring', 1.0);

    expect(resWithMod.envelopeLoops.length).toBeGreaterThan(0);
    expect(resWithoutMod.envelopeLoops.length).toBeGreaterThan(0);

    // Pole obwiedni cienia budynku ze ściętym narożnikiem musi być mniejsze niż dla pełnego prostokąta
    const areaWithMod = Math.abs(calculateSignedArea(resWithMod.envelopeLoops[0]));
    const areaWithoutMod = Math.abs(calculateSignedArea(resWithoutMod.envelopeLoops[0]));

    expect(areaWithMod).toBeLessThan(areaWithoutMod);
  });

  it('uwzglednia modyfikatory w trybie szybkiej interakcji computeHourlyShadowsLive', () => {
    const { storyPolygons, segments } = applyBuildingModifiers(base1StoryBuilding);
    const buildingWithMod: BuildingLoop = {
      ...base1StoryBuilding,
      storyPolygons,
      segments,
    };

    const buildingWithoutMod: BuildingLoop = {
      ...base1StoryBuilding,
      storyPolygons: undefined,
      modifiers: [],
    };

    const liveWithMod = computeHourlyShadowsLive([buildingWithMod], 52.23, 21.01, 'spring', 1.0);
    const liveWithoutMod = computeHourlyShadowsLive([buildingWithoutMod], 52.23, 21.01, 'spring', 1.0);

    expect(liveWithMod.envelopeLoops.length).toBeGreaterThan(0);
    expect(liveWithoutMod.envelopeLoops.length).toBeGreaterThan(0);

    const liveAreaWithMod = Math.abs(calculateSignedArea(liveWithMod.envelopeLoops[0]));
    const liveAreaWithoutMod = Math.abs(calculateSignedArea(liveWithoutMod.envelopeLoops[0]));

    expect(liveAreaWithMod).toBeLessThan(liveAreaWithoutMod);
  });

  it('uwzglednia modyfikatory budynku blokujacego o 1 kondygnacji', () => {
    const { storyPolygons, segments } = applyBuildingModifiers(base1StoryBuilding);
    const blockingBuildingWithMod: BuildingLoop = {
      ...base1StoryBuilding,
      id: 'blocking-1s',
      isTested: false,
      storyPolygons,
      segments,
    };

    const testedTarget: BuildingLoop = {
      id: 'tested-target',
      name: 'Badany',
      layer: 'Domyślna (0)',
      isTested: true,
      isIncluded: true,
      isCityCentre: false,
      buildingType: 'residential',
      defaultHeight: 10,
      elevation: 0,
      vertices: [
        { x: -10, y: -10 },
        { x: 30, y: -10 },
        { x: 30, y: 30 },
        { x: -10, y: 30 },
      ],
      segments: [],
      isClockwise: false,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const res = computeFullShadowAnalysis([testedTarget, blockingBuildingWithMod], 52.23, 21.01, 'spring', 1.0);
    expect(res.envelopeLoops.length).toBeGreaterThan(0);
  });
});
