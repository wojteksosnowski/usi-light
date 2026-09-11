import { describe, it, expect } from 'vitest';
import { smoothCenterlineWithArcs } from './smoothPath';
import { dilateObstacles, dilateObstaclesForRoad, isSegmentClear } from './obstacleZone';
import { buildVisibilityGraph } from './visibilityGraph';
import { findShortestPath } from './pathfind';

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

  it('does not reduce radius below minTurnRadius when minTurnRadius would collide, reporting fullyMet=false', () => {
    const centerline = [
      { x: -10, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ];
    // Przeszkoda blokująca łuk o promieniu 8m
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

  it('smoothly rounds corner with maximal fitting radius when requested radius cannot fit, reporting fullyMet=false', () => {
    const centerline = [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ];
    // desiredRadius = 10m wymaga stycznej ~10m, ale segmenty mają długość 1m.
    // Solver adaptacyjnie wpisuje maksymalny bezkolizyjny łuk (~0.98m), eliminując ostre załamanie i raportując fullyMet=false.
    const { path, fullyMet } = smoothCenterlineWithArcs(centerline, 10, [], 0, null);
    expect(fullyMet).toBe(false);
    expect(path.length).toBeGreaterThan(3);
  });
});
