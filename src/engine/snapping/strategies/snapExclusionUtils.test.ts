import { describe, it, expect } from 'vitest';
import { isIdExcluded, isLineExcluded, filterCandidateLines } from './snapExclusionUtils';
import { SnapContext } from '../types';
import { createCachedLineEquation } from '../../../utils/lineBufferEngine';

describe('isIdExcluded', () => {
  it('matches an id present in the excluded set exactly', () => {
    expect(isIdExcluded('bldg-a', new Set(['bldg-a']))).toBe(true);
  });

  it('matches a sub-part id prefixed with `${exId}_`', () => {
    expect(isIdExcluded('bldg-a_zone_0', new Set(['bldg-a']))).toBe(true);
  });

  it('matches a sub-part id prefixed with `${exId}-`', () => {
    expect(isIdExcluded('bldg-a-edge-1', new Set(['bldg-a']))).toBe(true);
  });

  it('returns false for an unrelated id', () => {
    expect(isIdExcluded('bldg-b', new Set(['bldg-a']))).toBe(false);
  });

  it('does not match an id that merely contains the excluded id without the separator', () => {
    expect(isIdExcluded('bldg-abc', new Set(['bldg-a']))).toBe(false);
  });

  it('returns false for an empty excluded set', () => {
    expect(isIdExcluded('bldg-a', new Set())).toBe(false);
  });
});

const baseContext: SnapContext = {
  mouseWorld: { x: 0, y: 0 },
  mouseScreen: { sx: 0, sy: 0 },
  worldToScreen: (wx, wy) => ({ sx: wx, sy: wy }),
  screenToWorld: (sx, sy) => ({ wx: sx, wy: sy }),
  buildings: [],
  lineBuffer: [],
  isOsnapActive: true,
  isDirectionSnappingActive: false,
};

describe('isLineExcluded', () => {
  const line = createCachedLineEquation('e1', 'bldg-a', 0, { x: 0, y: 0 }, { x: 1, y: 0 });

  it('excludes a line whose objectId matches context.excludeBuildingId', () => {
    const ctx: SnapContext = { ...baseContext, excludeBuildingId: 'bldg-a' };
    expect(isLineExcluded(line, ctx)).toBe(true);
  });

  it('excludes a line whose objectId is a sub-part of excludeBuildingId', () => {
    const subLine = createCachedLineEquation('e2', 'bldg-a_zone_0', 0, { x: 0, y: 0 }, { x: 1, y: 0 });
    const ctx: SnapContext = { ...baseContext, excludeBuildingId: 'bldg-a' };
    expect(isLineExcluded(subLine, ctx)).toBe(true);
  });

  it('excludes a line whose objectId matches one of excludeBuildingIds', () => {
    const ctx: SnapContext = { ...baseContext, excludeBuildingIds: ['bldg-x', 'bldg-a'] };
    expect(isLineExcluded(line, ctx)).toBe(true);
  });

  it('combines excludeBuildingId with excludeBuildingIds', () => {
    const otherLine = createCachedLineEquation('e3', 'bldg-y', 0, { x: 0, y: 0 }, { x: 1, y: 0 });
    const ctx: SnapContext = { ...baseContext, excludeBuildingId: 'bldg-y', excludeBuildingIds: ['bldg-x'] };
    expect(isLineExcluded(otherLine, ctx)).toBe(true);
  });

  it('returns false when no exclusion is configured', () => {
    expect(isLineExcluded(line, baseContext)).toBe(false);
  });

  it('returns false for an unrelated line', () => {
    const ctx: SnapContext = { ...baseContext, excludeBuildingId: 'bldg-z' };
    expect(isLineExcluded(line, ctx)).toBe(false);
  });
});

describe('filterCandidateLines', () => {
  const lineA = createCachedLineEquation('e1', 'bldg-a', 0, { x: 0, y: 0 }, { x: 1, y: 0 });
  const lineB = createCachedLineEquation('e2', 'bldg-b', 0, { x: 0, y: 1 }, { x: 1, y: 1 });

  it('is a passthrough when no exclusion filters are set in context', () => {
    expect(filterCandidateLines([lineA, lineB], baseContext)).toEqual([lineA, lineB]);
  });

  it('filters out lines matching excludeBuildingId', () => {
    const ctx: SnapContext = { ...baseContext, excludeBuildingId: 'bldg-a' };
    expect(filterCandidateLines([lineA, lineB], ctx)).toEqual([lineB]);
  });

  it('filters out lines matching any excludeBuildingIds entry', () => {
    const ctx: SnapContext = { ...baseContext, excludeBuildingIds: ['bldg-a', 'bldg-b'] };
    expect(filterCandidateLines([lineA, lineB], ctx)).toEqual([]);
  });

  it('returns an empty array unchanged for an empty input list', () => {
    const ctx: SnapContext = { ...baseContext, excludeBuildingId: 'bldg-a' };
    expect(filterCandidateLines([], ctx)).toEqual([]);
  });
});
