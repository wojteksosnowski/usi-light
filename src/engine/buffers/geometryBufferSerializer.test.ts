import { describe, it, expect } from 'vitest';
import {
  serializeGeometryToFlatBuffer,
  deserializeObstacleSegmentsFromBuffer,
} from './geometryBufferSerializer';
import { BuildingLoop } from '../../types/geometry';

describe('GeometryBufferSerializer', () => {
  const dummyBuildings: BuildingLoop[] = [
    {
      id: 'b1',
      name: 'Budynek A',
      layer: 'Projektowane',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      defaultHeight: 25.0,
      elevation: 2.0,
      hWindowBottom: 0.85,
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 15 },
        { x: 0, y: 15 },
      ],
      segments: [
        {
          id: 's1',
          p1: { x: 0, y: 0 },
          p2: { x: 20, y: 0 },
          normal: { x: 0, y: -1 },
          length: 20,
          angleRad: 0,
          hTop: 25.0,
          hBase: 2.0,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential',
        },
        {
          id: 's2',
          p1: { x: 20, y: 0 },
          p2: { x: 20, y: 15 },
          normal: { x: 1, y: 0 },
          length: 15,
          angleRad: Math.PI / 2,
          hTop: 25.0,
          hBase: 2.0,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential',
        },
      ],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    },
  ];

  it('serializes buildings into continuous ArrayBuffer and deserializes segments accurately', () => {
    const serialized = serializeGeometryToFlatBuffer(dummyBuildings);
    expect(serialized.numBuildings).toBe(1);
    expect(serialized.numSegments).toBe(2);
    expect(serialized.numVertices).toBe(4);
    expect(serialized.buffer.byteLength).toBeGreaterThan(0);

    const segments = deserializeObstacleSegmentsFromBuffer(serialized.buffer);
    expect(segments.length).toBe(2);

    expect(segments[0].p1x).toBeCloseTo(0, 5);
    expect(segments[0].p1y).toBeCloseTo(0, 5);
    expect(segments[0].p2x).toBeCloseTo(20, 5);
    expect(segments[0].p2y).toBeCloseTo(0, 5);
    expect(segments[0].normalX).toBeCloseTo(0, 5);
    expect(segments[0].normalY).toBeCloseTo(-1, 5);
    expect(segments[0].hTop).toBeCloseTo(25, 5);
    expect(segments[0].hBase).toBeCloseTo(2, 5);

    expect(segments[1].p1x).toBeCloseTo(20, 5);
    expect(segments[1].p2x).toBeCloseTo(20, 5);
    expect(segments[1].p2y).toBeCloseTo(15, 5);
    expect(segments[1].normalX).toBeCloseTo(1, 5);
    expect(segments[1].normalY).toBeCloseTo(0, 5);
  });
});
