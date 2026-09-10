import { describe, it, expect } from 'vitest';
import { smoothCenterlineWithArcs } from './smoothPath';

describe('smoothCenterlineWithArcs', () => {
  it('leaves a straight 2-point line untouched', () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const { path, fullyMet } = smoothCenterlineWithArcs(line, 3, [], 0, null);
    expect(path).toEqual(line);
    expect(fullyMet).toBe(true);
  });

  it('replaces a sharp 90° corner with a tangent arc of the requested radius', () => {
    const centerline = [
      { x: -10, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ];
    const { path, fullyMet } = smoothCenterlineWithArcs(centerline, 3, [], 0, null);
    expect(fullyMet).toBe(true);
    expect(path.length).toBeGreaterThan(3);

    // Wszystkie punkty łuku powinny leżeć w odległości ~promienia od środka okręgu
    // wpisanego w kąt (środek na dwusiecznej, w tym przypadku (-3,3) dla r=3).
    const center = { x: -3, y: 3 };
    const arcPoints = path.slice(1, -1);
    for (const p of arcPoints) {
      const d = Math.hypot(p.x - center.x, p.y - center.y);
      expect(d).toBeCloseTo(3, 1);
    }
  });

  it('shrinks the radius (not skips it silently) when the full radius would collide', () => {
    const centerline = [
      { x: -10, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ];
    // Przeszkoda tuż przy narożniku, blokująca duży łuk ale nie mały.
    const obstacle = [
      [
        { x: -1, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 11 },
        { x: -1, y: 11 },
      ],
    ];
    const { path, fullyMet } = smoothCenterlineWithArcs(centerline, 8, obstacle, 0, null);
    expect(path.length).toBeGreaterThan(0);
    expect(fullyMet).toBe(false);
  });

  it('caps tangent length so arcs on short adjacent segments do not overlap the endpoints', () => {
    const centerline = [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ];
    const { path } = smoothCenterlineWithArcs(centerline, 10, [], 0, null);
    // Punkt startowy łuku nie może wyjść poza segment wejściowy.
    const firstArcPoint = path[1];
    expect(firstArcPoint.x).toBeGreaterThanOrEqual(-1 - 1e-6);
  });
});
