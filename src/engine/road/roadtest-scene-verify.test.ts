import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { solveRoad } from './roadSolverEngine';
import { hasSelfIntersectionForTest } from '../../utils/math2d/sweep';

// Regresja dla reference/roadtest.json: droga wokół wklęsłego (gwiazdowego) budynku
// wygenerowana przy roadStrategy "centered_smooth" nie może samoprzecinać się —
// ani gdy modyfikator zone_offset (bufor) obiektu przeszkody jest włączony, ani wyłączony
// (wyłączenie zmienia tylko zestaw przeszkód widziany przez solver, patrz gatherObstacles.ts).
const scenePath = path.resolve(__dirname, '../../../reference/roadtest.json');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

const road = scene.buildings.find((b: any) => b.id === 'bldg-1789077186551');
const starBuilding = scene.buildings.find((b: any) => b.id === 'bldg-1789070794701');

describe('roadtest.json scene reproduction', () => {
  it('produces a non-self-intersecting outline with the buffer (zonePolygons) present', () => {
    const obstacles = [starBuilding.vertices, ...(starBuilding.zonePolygons?.map((z: any) => z.polygon) || [])];
    const result = solveRoad({
      pointA: road.roadPointA,
      pointB: road.roadPointB,
      width: road.sweepWidth,
      obstacles,
      plot: null,
      strategy: road.roadStrategy,
      minTurnRadius: road.roadMinTurnRadius,
    });
    expect(result.success).toBe(true);
    expect(hasSelfIntersectionForTest(result.polygon)).toBe(false);
    // Węzły grafu widoczności leżą na granicy przeszkody — bez prawdziwego (odległościowego)
    // testu kolizji fillet w takich narożnikach zawsze fałszywie "koliduje" i nie generuje
    // żadnych punktów łuku; to asercja na to, że faktycznie powstają łuki, nie surowe naroża.
    expect(result.centerline.length).toBeGreaterThan(5);
  });

  it('produces a non-self-intersecting outline WITHOUT the buffer (modifier disabled)', () => {
    const obstacles = [starBuilding.vertices];
    const result = solveRoad({
      pointA: road.roadPointA,
      pointB: road.roadPointB,
      width: road.sweepWidth,
      obstacles,
      plot: null,
      strategy: road.roadStrategy,
      minTurnRadius: road.roadMinTurnRadius,
    });
    expect(result.success).toBe(true);
    expect(hasSelfIntersectionForTest(result.polygon)).toBe(false);
  });
});
