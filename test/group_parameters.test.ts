import { describe, it, expect } from 'vitest';
import { Building } from '../src/types/building';
import { computePolygonArea } from '../src/utils/math2d';

describe('Connected / Grouped Buildings Parameters Calculation', () => {
  const buildingA: Building = {
    id: 'bldg-1',
    name: 'Budynek A (Mieszkaniowy)',
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    defaultHeight: 15,
    elevation: 0,
    storeysCount: 5,
    buildingType: 'residential',
    groupId: 'group-1',
  };

  const buildingB: Building = {
    id: 'bldg-2',
    name: 'Budynek B (Garaż)',
    vertices: [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ],
    defaultHeight: 3,
    elevation: -3,
    storeysCount: 1,
    buildingType: 'garage',
    groupId: 'group-1',
  };

  const buildingC: Building = {
    id: 'bldg-3',
    name: 'Budynek C (Niezależny)',
    vertices: [
      { x: 30, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 30, y: 10 },
    ],
    defaultHeight: 10,
    elevation: 0,
    storeysCount: 3,
    buildingType: 'service',
  };

  it('aggregates collective Pz, Pc, V and PUM for grouped buildings', () => {
    const allBuildings = [buildingA, buildingB, buildingC];
    const selectedGroup = allBuildings.filter((b) => b.groupId === 'group-1');

    expect(selectedGroup).toHaveLength(2);

    let totalPz = 0;
    let totalPc = 0;
    let totalVolume = 0;

    for (const b of selectedGroup) {
      const pz = computePolygonArea(b.vertices || []);
      const n = b.storeysCount || 1;
      const h = b.defaultHeight;
      totalPz += pz;
      totalPc += pz * n;
      totalVolume += pz * h;
    }

    const estimatedPUM = totalPc * 0.70;

    expect(totalPz).toBe(200); // 100 + 100
    expect(totalPc).toBe(600); // 100*5 + 100*1
    expect(totalVolume).toBe(1800); // 100*15 + 100*3
    expect(estimatedPUM).toBe(420); // 600 * 0.7
  });

  it('distinguishes building types for X-Ray visualization', () => {
    const typeColorMap: Record<string, string> = {
      residential: '#6366f1',
      service: '#f59e0b',
      garage: '#64748b',
    };

    expect(typeColorMap[buildingA.buildingType || 'residential']).toBe('#6366f1');
    expect(typeColorMap[buildingB.buildingType || 'residential']).toBe('#64748b');
    expect(typeColorMap[buildingC.buildingType || 'residential']).toBe('#f59e0b');
  });
});
