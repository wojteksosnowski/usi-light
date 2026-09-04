import { describe, it, expect } from 'vitest';
import { offsetPolygonEdge, updateBuildingWithNewVertices } from '@/utils/math2d';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { Point2D } from '../src/types/geometry';

describe('Parallel Edge Offset / Face Extrude Tool', () => {
  it('should offset a vertical edge in a rectangle preserving horizontal adjacent edges and all edge directions', () => {
    const rect: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ];

    // Edge 1 is x=10 from (10,0) to (10,5). Normal is (1, 0) (East).
    // Drag edge to the right by dx=+4
    const newVerts = offsetPolygonEdge(rect, 1, { x: 4, y: 0 });

    expect(newVerts.length).toBe(4);
    expect(newVerts[0]).toEqual({ x: 0, y: 0 });
    expect(newVerts[1]).toEqual({ x: 14, y: 0 }); // Extended along bottom edge direction (y=0)
    expect(newVerts[2]).toEqual({ x: 14, y: 5 }); // Extended along top edge direction (y=5)
    expect(newVerts[3]).toEqual({ x: 0, y: 5 });

    // Edge 0 (bottom) is still horizontal y=0, length grew from 10 to 14
    expect(newVerts[1].y).toBe(0);
    // Edge 1 (right) is still strictly vertical x=14
    expect(newVerts[1].x).toBe(14);
    expect(newVerts[2].x).toBe(14);
    // Edge 2 (top) is still horizontal y=5
    expect(newVerts[2].y).toBe(5);
  });

  it('should offset a horizontal edge in a rectangle preserving vertical adjacent edges', () => {
    const rect: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ];

    // Edge 2 is top horizontal edge y=5 from (10,5) to (0,5). Normal is (0, 1) (North).
    // Move edge up by dy=+3
    const newVerts = offsetPolygonEdge(rect, 2, { x: 0, y: 3 });

    expect(newVerts[0]).toEqual({ x: 0, y: 0 });
    expect(newVerts[1]).toEqual({ x: 10, y: 0 });
    expect(newVerts[2]).toEqual({ x: 10, y: 8 });
    expect(newVerts[3]).toEqual({ x: 0, y: 8 });
  });

  it('should update building segments with accurate outward normals and lengths after edge offset', () => {
    const buildings = createSampleBuildings();
    const bldg = buildings[0];

    const newVerts = offsetPolygonEdge(bldg.vertices, 0, { x: 0, y: -2 });
    const updated = updateBuildingWithNewVertices(bldg, newVerts);

    expect(updated.segments.length).toBe(bldg.segments.length);
    expect(updated.segments[0].normal.y).toBeCloseTo(-1, 3); // Normal still strictly south
  });
});
