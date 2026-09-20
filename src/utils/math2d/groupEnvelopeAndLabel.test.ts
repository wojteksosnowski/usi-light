import { describe, it, expect } from 'vitest';
import { computeGroupEnvelope } from './groupEnvelope';
import { resolveScreenLabelPositions, ScreenLabelItem } from './labelPlacement';
import { BuildingLoop } from '@/types/geometry';

describe('groupEnvelope - computeGroupEnvelope', () => {
  it('returns empty array when no buildings or empty vertices provided', () => {
    expect(computeGroupEnvelope([])).toEqual([]);
    expect(computeGroupEnvelope([{ id: 'b1', vertices: [] } as any])).toEqual([]);
  });

  it('computes offset envelope for a single building polygon', () => {
    const square: BuildingLoop = {
      id: 'b1',
      name: 'B1',
      layer: '0',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      hWindowBottom: 0.85,
      category: 'building',
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      segments: [],
      defaultHeight: 10,
    };

    const envelope = computeGroupEnvelope([square], 1.0);
    expect(envelope.length).toBeGreaterThan(0);
    expect(envelope[0].length).toBeGreaterThan(4); // Miter/round offset vertices
  });

  it('computes unified envelope for two adjacent or overlapping buildings', () => {
    const b1: BuildingLoop = {
      id: 'b1',
      name: 'B1',
      layer: '0',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      hWindowBottom: 0.85,
      category: 'building',
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      segments: [],
      defaultHeight: 10,
    };

    const b2: BuildingLoop = {
      id: 'b2',
      name: 'B2',
      layer: '0',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      hWindowBottom: 0.85,
      category: 'building',
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
      vertices: [
        { x: 9, y: 0 },
        { x: 19, y: 0 },
        { x: 19, y: 10 },
        { x: 9, y: 10 },
      ],
      segments: [],
      defaultHeight: 10,
    };

    const envelope = computeGroupEnvelope([b1, b2], 1.0);
    expect(envelope.length).toBeGreaterThan(0);
    // Two overlapping/touching squares + offset buffer form a single unified boundary loop
    expect(envelope.length).toBe(1);
  });
});

describe('labelPlacement - resolveScreenLabelPositions', () => {
  it('returns empty list for empty input', () => {
    expect(resolveScreenLabelPositions([])).toEqual([]);
  });

  it('keeps single label at its original position', () => {
    const items: ScreenLabelItem[] = [
      {
        id: '1',
        originalAnchor: { x: 5, y: 5 },
        screenPos: { sx: 100, sy: 100 },
        width: 28,
        height: 28,
        type: 'plus',
      },
    ];

    const placed = resolveScreenLabelPositions(items);
    expect(placed.length).toBe(1);
    expect(placed[0].placedScreenPos.sx).toBe(100);
    expect(placed[0].placedScreenPos.sy).toBe(100);
  });

  it('relaxes colliding labels away from each other so they do not overlap', () => {
    const items: ScreenLabelItem[] = [
      {
        id: '1',
        originalAnchor: { x: 5, y: 5 },
        screenPos: { sx: 100, sy: 100 },
        width: 28,
        height: 28,
        type: 'plus',
      },
      {
        id: '2',
        originalAnchor: { x: 5.1, y: 5.1 },
        screenPos: { sx: 102, sy: 102 }, // Heavy overlap with item 1
        width: 28,
        height: 28,
        type: 'minus',
      },
    ];

    const placed = resolveScreenLabelPositions(items, 4);
    expect(placed.length).toBe(2);

    const dist = Math.hypot(
      placed[0].placedScreenPos.sx - placed[1].placedScreenPos.sx,
      placed[0].placedScreenPos.sy - placed[1].placedScreenPos.sy
    );

    // Initial distance was ~2.8px, after relaxation with 28x28 boxes + 4px margin it should be >= 28px
    expect(dist).toBeGreaterThan(20);
  });
});
