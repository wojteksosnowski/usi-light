import { describe, it, expect } from 'vitest';
import { solveRoad } from './roadSolverEngine';

// Wierzchołki budynku z reference/roadtest.json — wklęsły ośmiokąt (kształt gwiazdy) który
// zgłoszono jako scenę, na której solver "nie radzi sobie". Ten test sprawdza szeroki zestaw
// punktów A/B i szerokości drogi wokół tej konkretnej geometrii.
const starObstacle = [
  { x: -37.99064245607801, y: 4.42666059639005 },
  { x: 0.09075409986242988, y: 42.50805715233054 },
  { x: 42.41479134292217, y: 0.1840199092707575 },
  { x: 4.333394786981721, y: -37.89737664666971 },
  { x: -4.151886587256875, y: -29.412095272431124 },
  { x: 25.444228594445104, y: 0.1840199092707575 },
  { x: 0.09075409986242988, y: 25.53749440385335 },
  { x: -29.50536108183943, y: -4.058620777848532 },
];

describe('solveRoad on reference/roadtest.json obstacle', () => {
  it('finds a valid path for a wide sweep of A/B points and widths', () => {
    const pts: { x: number; y: number }[] = [];
    for (const r of [20, 45, 70]) {
      for (let ang = 0; ang < 360; ang += 30) {
        const rad = (ang * Math.PI) / 180;
        pts.push({ x: r * Math.cos(rad), y: r * Math.sin(rad) });
      }
    }

    for (const width of [2, 5, 8]) {
      for (const a of pts) {
        for (const b of pts) {
          if (Math.hypot(a.x - b.x, a.y - b.y) < 5) continue;
          const result = solveRoad({ pointA: a, pointB: b, width, obstacles: [starObstacle], plot: null });
          if (result.reason === 'point_blocked') continue;
          expect(result.success).toBe(true);
          expect(result.polygon.length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
