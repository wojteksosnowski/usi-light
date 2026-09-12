import { describe, it, expect } from 'vitest';
import { rebuildBuildingSegments } from './segmentStatistics';
import { BuildingLoop } from '../types/geometry';

function makeBuilding(overrides: Partial<BuildingLoop> = {}): BuildingLoop {
  return {
    id: 'bldg-1',
    name: 'Test',
    layer: 'L1',
    isTested: false,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 15,
    hWindowBottom: 0.85,
    vertices: [],
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    ...overrides,
  };
}

describe('rebuildBuildingSegments z otworami', () => {
  const outer = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const hole = [
    { x: 3, y: 3 },
    { x: 7, y: 3 },
    { x: 7, y: 7 },
    { x: 3, y: 7 },
  ];

  it('generuje segmenty dla obrysu zewnętrznego i otworu', () => {
    const bldg = makeBuilding({ holes: [hole] });
    const result = rebuildBuildingSegments(bldg, outer);

    expect(result.segments.length).toBe(outer.length + hole.length);
    const outerSegs = result.segments.filter((s) => (s.ringIndex ?? 0) === 0);
    const holeSegs = result.segments.filter((s) => s.ringIndex === 1);
    expect(outerSegs).toHaveLength(4);
    expect(holeSegs).toHaveLength(4);
  });

  it('wymusza przeciwny kierunek nawijania otworu względem obrysu zewnętrznego', () => {
    // Otwór podany w tym samym kierunku co outer (CCW) -> musi zostać odwrócony wewnętrznie.
    const bldg = makeBuilding({ holes: [hole] });
    const result = rebuildBuildingSegments(bldg, outer);

    const holeSeg = result.segments.find((s) => s.ringIndex === 1)!;
    // Normalna segmentu otworu powinna wskazywać do wnętrza otworu (w stronę centrum 5,5),
    // czyli mieć niezerowy iloczyn skalarny z wektorem od p1 do centrum otworu.
    const center = { x: 5, y: 5 };
    const toCenter = { x: center.x - holeSeg.p1.x, y: center.y - holeSeg.p1.y };
    const dot = toCenter.x * holeSeg.normal.x + toCenter.y * holeSeg.normal.y;
    expect(dot).toBeGreaterThan(0);
  });

  it('nie generuje segmentów otworu gdy holes jest puste', () => {
    const bldg = makeBuilding();
    const result = rebuildBuildingSegments(bldg, outer);
    expect(result.segments.length).toBe(outer.length);
  });
});
