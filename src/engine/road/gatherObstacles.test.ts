import { describe, it, expect } from 'vitest';
import { gatherRoadObstacles } from './gatherObstacles';
import { BuildingLoop } from '../../types/geometry';

function makeBuilding(overrides: Partial<BuildingLoop>): BuildingLoop {
  return {
    id: 'b1',
    name: 'Test',
    layer: 'Domyślna (0)',
    isTested: false,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 15,
    hWindowBottom: 0.85,
    vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    ...overrides,
  };
}

describe('gatherRoadObstacles', () => {
  it('treats an isTested=true building as an obstacle (isTested is unrelated to road avoidance)', () => {
    const building = makeBuilding({ isTested: true, isIncluded: true });
    const obstacles = gatherRoadObstacles([building]);
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]).toEqual(building.vertices);
  });

  it('excludes a building explicitly marked isIncluded: false', () => {
    const building = makeBuilding({ isTested: true, isIncluded: false });
    const obstacles = gatherRoadObstacles([building]);
    expect(obstacles).toHaveLength(0);
  });

  it('excludes live road generators (roadPointA/B present) from becoming obstacles for other roads, regardless of category', () => {
    const road = makeBuilding({ category: 'boundary', areaType: 'utwardzenie', roadPointA: { x: 0, y: 0 }, roadPointB: { x: 20, y: 20 } });
    const obstacles = gatherRoadObstacles([road]);
    expect(obstacles).toHaveLength(0);
  });

  it('excludes a live road generator even if its areaType was manually changed to playground', () => {
    const road = makeBuilding({ category: 'boundary', areaType: 'playground', roadPointA: { x: 0, y: 0 }, roadPointB: { x: 20, y: 20 } });
    const obstacles = gatherRoadObstacles([road]);
    expect(obstacles).toHaveLength(0);
  });

  it('excludes an area marked areaType "utwardzenie" — hardstanding is not an obstacle for roads', () => {
    const hardstanding = makeBuilding({ category: 'boundary', areaType: 'utwardzenie' });
    const obstacles = gatherRoadObstacles([hardstanding]);
    expect(obstacles).toHaveLength(0);
  });

  it('still treats a playground area as an obstacle', () => {
    const playground = makeBuilding({ category: 'boundary', areaType: 'playground' });
    const obstacles = gatherRoadObstacles([playground]);
    expect(obstacles).toHaveLength(1);
  });
});
