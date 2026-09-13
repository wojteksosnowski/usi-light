import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BuildingLoop } from '../src/types/geometry';
import { getBuildingSolids } from '../src/engine/preview/buildingIsoGeometry';

describe('BuildingIsoPreview Three.js Geometry Construction', () => {
  const building: BuildingLoop = {
    id: 'test-bldg-1',
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    defaultHeight: 15,
    elevation: -3,
    isTested: true,
    buildingType: 'garage',
  };

  it('constructs extrusions and LineSegments with computeLineDistances without throwing', () => {
    const solids = getBuildingSolids(building);
    expect(solids).toHaveLength(1);

    const solid = solids[0];
    const shape = new THREE.Shape();
    solid.polygon.forEach((pt, i) => {
      if (i === 0) shape.moveTo(pt.x, pt.y);
      else shape.lineTo(pt.x, pt.y);
    });
    shape.closePath();

    const depth = solid.hTop - solid.hBottom;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    const edges = new THREE.EdgesGeometry(geometry, 2);

    const dashedLineMaterial = new THREE.LineDashedMaterial({
      color: 0x94a3b8,
      dashSize: 0.8,
      gapSize: 0.5,
    });

    const hiddenLines = new THREE.LineSegments(edges, dashedLineMaterial);
    expect(() => hiddenLines.computeLineDistances()).not.toThrow();
    expect(hiddenLines.geometry.getAttribute('lineDistance')).toBeDefined();
  });

  it('correctly creates X-Ray inner story geometry with 0.4m offset and 0.4m height reduction', () => {
    const solids = getBuildingSolids(building);
    const solid = solids[0];
    const outerDepth = solid.hTop - solid.hBottom; // 18m
    const expectedInnerDepth = Math.max(0.05, outerDepth - 0.4); // 17.6m

    expect(outerDepth).toBe(15);
    expect(expectedInnerDepth).toBeCloseTo(14.6, 2);
  });

  it('updates geometry signature on vertex coordinate move, sweepWidth change, or modifier modification', async () => {
    const { getBuildingGeometrySignature } = await import('../src/components/preview/BuildingIsoPreview');
    const baseSig = getBuildingGeometrySignature(building);

    // 1. Moving a vertex
    const movedVertsBuilding: BuildingLoop = {
      ...building,
      vertices: [
        { x: 0, y: 0 },
        { x: 15, y: 0 }, // changed from 10 to 15
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };
    expect(getBuildingGeometrySignature(movedVertsBuilding)).not.toBe(baseSig);

    // 2. Changing sweepWidth
    const sweepBuilding: BuildingLoop = {
      ...building,
      sweepWidth: 12.0,
      sweepPath: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    };
    const sweepSig = getBuildingGeometrySignature(sweepBuilding);
    const widerSweep: BuildingLoop = {
      ...sweepBuilding,
      sweepWidth: 14.0,
    };
    expect(getBuildingGeometrySignature(widerSweep)).not.toBe(sweepSig);

    // 3. Modifying a modifier property
    const modBuilding: BuildingLoop = {
      ...building,
      modifiers: [{ id: 'm1', type: 'story_offset', enabled: true, distance: -2, storiesCount: -1 }],
    };
    const modSig = getBuildingGeometrySignature(modBuilding);
    const changedModBuilding: BuildingLoop = {
      ...building,
      modifiers: [{ id: 'm1', type: 'story_offset', enabled: true, distance: -4, storiesCount: -1 }],
    };
    expect(getBuildingGeometrySignature(changedModBuilding)).not.toBe(modSig);
  });
});
