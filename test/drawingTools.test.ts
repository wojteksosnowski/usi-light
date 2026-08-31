import { describe, it, expect } from 'vitest';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { Point2D } from '../src/types/geometry';

describe('Drawing Tools: Rectangle and Polyline Creation', () => {
  it('should create a valid 4-segment BuildingLoop from rectangle vertices', () => {
    // 2 clicks define a rectangle: p1(5, 5), p2(25, 15)
    const p1 = { x: 5, y: 5 };
    const p2 = { x: 25, y: 15 };
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    const rectVerts: Point2D[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];

    const building = createBuildingFromVertices(rectVerts, 'Nowy Prostokąt Test', 15.0, false);

    expect(building.id).toMatch(/^bldg-/);
    expect(building.name).toBe('Nowy Prostokąt Test');
    expect(building.vertices.length).toBe(4);
    expect(building.segments.length).toBe(4);
    expect(building.defaultHeight).toBe(15.0);

    // Verify segment lengths: 20m (width), 10m (height), 20m (width), 10m (height)
    expect(building.segments[0].length).toBeCloseTo(20.0, 3);
    expect(building.segments[1].length).toBeCloseTo(10.0, 3);
    expect(building.segments[2].length).toBeCloseTo(20.0, 3);
    expect(building.segments[3].length).toBeCloseTo(10.0, 3);

    // Verify outward normals
    // Bottom wall (y=5, normal points south [0, -1])
    expect(building.segments[0].normal.x).toBeCloseTo(0, 3);
    expect(building.segments[0].normal.y).toBeCloseTo(-1, 3);
  });

  it('should create a valid closed polygon BuildingLoop from arbitrary polyline vertices', () => {
    // Triangle polyline
    const polyVerts: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8.66 },
    ];

    const building = createBuildingFromVertices(polyVerts, 'Nowa Polilinia Test', 18.0, true);

    expect(building.id).toMatch(/^bldg-/);
    expect(building.isTested).toBe(true);
    expect(building.vertices.length).toBe(3);
    expect(building.segments.length).toBe(3);
    expect(building.segments[0].length).toBeCloseTo(10.0, 3);
    expect(building.segments[1].length).toBeCloseTo(10.0, 2);
    expect(building.segments[2].length).toBeCloseTo(10.0, 2);
  });

  it('should create an oriented rectangle aligned with rotated view angle (e.g. 45 deg)', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10 * Math.SQRT2, y: 0 }; // Vector (14.14, 0)
    const viewRotationDeg = 45;

    const theta = (viewRotationDeg * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const ux = cosT;
    const uy = -sinT;
    const vx = sinT;
    const vy = cosT;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const w = dx * ux + dy * uy;
    const h = dx * vx + dy * vy;

    const rectVertices: Point2D[] = [
      { x: p1.x, y: p1.y },
      { x: p1.x + w * ux, y: p1.y + w * uy },
      { x: p1.x + w * ux + h * vx, y: p1.y + w * uy + h * vy },
      { x: p1.x + h * vx, y: p1.y + h * vy },
    ];

    const building = createBuildingFromVertices(rectVertices, 'Rotated Rect', 15.0);
    expect(building.vertices.length).toBe(4);
    // Width and height in view space should each be 10m
    expect(Math.abs(w)).toBeCloseTo(10.0);
    expect(Math.abs(h)).toBeCloseTo(10.0);
    expect(building.segments[0].length).toBeCloseTo(10.0);
    expect(building.segments[1].length).toBeCloseTo(10.0);
  });
});
