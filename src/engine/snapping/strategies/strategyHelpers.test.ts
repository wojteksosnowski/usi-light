import { describe, it, expect } from 'vitest';
import {
  resolveCandidateEdges,
  screenDistance,
  computeHysteresisAdjustedDist,
  findSnapFromAll,
  computeCategoryAndHoverBonus,
} from './strategyHelpers';
import { SnapContext, SnapResult } from '../types';
import { CachedLineEquation } from '../../../utils/lineBufferEngine';

function makeEdge(overrides: Partial<CachedLineEquation> = {}): CachedLineEquation {
  return {
    id: 'e1',
    objectId: 'b1',
    edgeIndex: 0,
    p1: { x: 0, y: 0 },
    p2: { x: 10, y: 0 },
    A: 0,
    B: 1,
    C: 0,
    length: 10,
    uX: 1,
    uY: 0,
    ...overrides,
  } as CachedLineEquation;
}

function makeContext(overrides: Partial<SnapContext> = {}): SnapContext {
  return {
    mouseWorld: { x: 0, y: 0 },
    mouseScreen: { sx: 0, sy: 0 },
    worldToScreen: (wx, wy) => ({ sx: wx * 20, sy: wy * 20 }),
    screenToWorld: (sx, sy) => ({ wx: sx / 20, wy: sy / 20 }),
    buildings: [],
    lineBuffer: [],
    isOsnapActive: true,
    isDirectionSnappingActive: true,
    ...overrides,
  };
}

describe('strategyHelpers', () => {
  it('resolveCandidateEdges falls back to linear scan of lineBuffer when no spatialIndex', () => {
    const edge = makeEdge();
    const context = makeContext({ lineBuffer: [edge] });
    expect(resolveCandidateEdges(context, -1, -1, 1, 1)).toEqual([edge]);
  });

  it('resolveCandidateEdges applies exclusion filtering (filterCandidateLines)', () => {
    const edge = makeEdge({ objectId: 'excluded' });
    const context = makeContext({ lineBuffer: [edge], excludeBuildingId: 'excluded' });
    expect(resolveCandidateEdges(context, -1, -1, 1, 1)).toEqual([]);
  });

  it('screenDistance computes hypot between mouseScreen and worldToScreen(point)', () => {
    const context = makeContext({ mouseScreen: { sx: 30, sy: 40 } });
    expect(screenDistance(context, { x: 0, y: 0 })).toBe(50);
  });

  it('computeHysteresisAdjustedDist subtracts bonus when predicate matches', () => {
    const prev: SnapResult = { point: { x: 0, y: 0 }, snapped: true, type: 'vertex' };
    const context = makeContext({ previousSnapResult: prev, hysteresisBonusPx: 3.5 });
    expect(computeHysteresisAdjustedDist(10, context, () => true)).toBe(6.5);
  });

  it('computeHysteresisAdjustedDist leaves dist unchanged when no previousSnapResult', () => {
    const context = makeContext();
    expect(computeHysteresisAdjustedDist(10, context, () => true)).toBe(10);
  });

  it('computeHysteresisAdjustedDist leaves dist unchanged when predicate does not match', () => {
    const prev: SnapResult = { point: { x: 0, y: 0 }, snapped: true, type: 'vertex' };
    const context = makeContext({ previousSnapResult: prev });
    expect(computeHysteresisAdjustedDist(10, context, () => false)).toBe(10);
  });

  it('findSnapFromAll returns the first (best) candidate from findAllSnaps', () => {
    const results: SnapResult[] = [
      { point: { x: 1, y: 1 }, snapped: true, type: 'vertex' },
      { point: { x: 2, y: 2 }, snapped: true, type: 'edge' },
    ];
    const strategy = { findAllSnaps: () => results };
    const context = makeContext();
    expect(findSnapFromAll(strategy, { x: 0, y: 0 }, context)).toBe(results[0]);
  });

  it('findSnapFromAll returns null when findAllSnaps yields no candidates', () => {
    const strategy = { findAllSnaps: () => [] };
    const context = makeContext();
    expect(findSnapFromAll(strategy, { x: 0, y: 0 }, context)).toBeNull();
  });

  it('computeCategoryAndHoverBonus adds hover/selected bonus on top of category bonus', () => {
    const edge = makeEdge({ objectId: 'hovered-building' });
    const context = makeContext({ hoveredBuildingId: 'hovered-building' });
    expect(computeCategoryAndHoverBonus(edge, context, 5.0)).toBe(7.0);
  });

  it('computeCategoryAndHoverBonus returns just the category bonus without hover/selected match', () => {
    const edge = makeEdge({ objectId: 'other-building' });
    const context = makeContext({ hoveredBuildingId: 'hovered-building' });
    expect(computeCategoryAndHoverBonus(edge, context, 5.0)).toBe(5.0);
  });
});
