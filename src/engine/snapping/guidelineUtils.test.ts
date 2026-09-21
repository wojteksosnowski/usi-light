import { describe, it, expect } from 'vitest';
import { buildCenteredGuideline, buildExtendedGuideline } from './guidelineUtils';

describe('guidelineUtils', () => {
  it('buildCenteredGuideline extends symmetrically from origin along dir by halfLen', () => {
    const line = buildCenteredGuideline({ x: 10, y: 10 }, { x: 1, y: 0 }, 5);
    expect(line.p1).toEqual({ x: 5, y: 10 });
    expect(line.p2).toEqual({ x: 15, y: 10 });
  });

  it('buildCenteredGuideline works with a non-axis-aligned unit direction', () => {
    const cos = Math.SQRT1_2;
    const sin = Math.SQRT1_2;
    const line = buildCenteredGuideline({ x: 0, y: 0 }, { x: cos, y: sin }, 2);
    expect(line.p1.x).toBeCloseTo(-2 * cos, 10);
    expect(line.p1.y).toBeCloseTo(-2 * sin, 10);
    expect(line.p2.x).toBeCloseTo(2 * cos, 10);
    expect(line.p2.y).toBeCloseTo(2 * sin, 10);
  });

  it('buildExtendedGuideline pushes edgeP1 backward and edgeP2 forward along dir by extLen', () => {
    const line = buildExtendedGuideline({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 1, y: 0 }, 3);
    expect(line.p1).toEqual({ x: -3, y: 0 });
    expect(line.p2).toEqual({ x: 13, y: 0 });
  });

  it('buildExtendedGuideline with zero extLen returns the original edge endpoints', () => {
    const line = buildExtendedGuideline({ x: 1, y: 2 }, { x: 4, y: 6 }, { x: 0.6, y: 0.8 }, 0);
    expect(line.p1).toEqual({ x: 1, y: 2 });
    expect(line.p2).toEqual({ x: 4, y: 6 });
  });
});
