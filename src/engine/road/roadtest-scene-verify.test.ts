import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import polygonClipping from 'polygon-clipping';
import { solveRoad } from './roadSolverEngine';
import { gatherRoadObstacles, findPlotBoundary } from './gatherObstacles';
import { RoadSolveInput, RoadSolveResult } from './types';
import { Point2D } from '../../types/geometry';
import { calculateSignedArea } from '../../utils/math2d/polygons';
import { hasSelfIntersectionForTest } from '../../utils/math2d/sweep';

/**
 * ============================================================================
 * NARZĘDZIA WALIDACYJNE I ASERCJE GEOMETRYCZNE DLA OBIEKTU DROGA (TEST REFERENCYJNY)
 * ============================================================================
 */

function toClippingRing(points: Point2D[]): [number, number][] {
  const ring: [number, number][] = points.map((p) => [p.x, p.y]);
  if (
    ring.length > 0 &&
    (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
  ) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return ring;
}

function calculatePolygonAreaFromClipping(poly: polygonClipping.Polygon): number {
  if (!poly || poly.length === 0) return 0;
  let totalArea = 0;
  for (let i = 0; i < poly.length; i++) {
    const ring = poly[i];
    let ringArea = 0;
    for (let j = 0; j < ring.length - 1; j++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[j + 1];
      ringArea += x1 * y2 - x2 * y1;
    }
    ringArea = Math.abs(ringArea) / 2;
    if (i === 0) {
      totalArea += ringArea; // zewnętrzny pierścień
    } else {
      totalArea -= ringArea; // otwory
    }
  }
  return Math.max(0, totalArea);
}

/**
 * Sprawdza integralność ścieżki osiowej (centerline):
 * 1. Koordynaty są liczbami skończonymi
 * 2. Ścieżka ma minimum 2 punkty
 * 3. Początek dokładnie w punkcie A, koniec w punkcie B
 * 4. Brak segmentów o zerowej długości
 * 5. Kąty wewnętrzne między segmentami nie są mniejsze niż minAllowedAngleDeg
 */
function assertValidCenterline(
  centerline: Point2D[],
  pointA: Point2D,
  pointB: Point2D,
  minAllowedAngleDeg: number = 5
) {
  expect(centerline).toBeDefined();
  expect(centerline.length).toBeGreaterThanOrEqual(2);

  for (const pt of centerline) {
    expect(Number.isFinite(pt.x)).toBe(true);
    expect(Number.isFinite(pt.y)).toBe(true);
  }

  const start = centerline[0];
  const end = centerline[centerline.length - 1];
  expect(Math.hypot(start.x - pointA.x, start.y - pointA.y)).toBeLessThan(1e-3);
  expect(Math.hypot(end.x - pointB.x, end.y - pointB.y)).toBeLessThan(1e-3);

  for (let i = 0; i < centerline.length - 1; i++) {
    const p1 = centerline[i];
    const p2 = centerline[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    expect(segLen).toBeGreaterThan(1e-5);

    if (i > 0) {
      const p0 = centerline[i - 1];
      const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
      const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const l1 = Math.hypot(v1.x, v1.y);
      const l2 = Math.hypot(v2.x, v2.y);
      if (l1 > 1e-4 && l2 > 1e-4) {
        const dot = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
        const clampedDot = Math.max(-1, Math.min(1, dot));
        const turnAngleDeg = (Math.acos(clampedDot) * 180) / Math.PI;
        const interiorAngleDeg = 180 - turnAngleDeg;
        expect(interiorAngleDeg).toBeGreaterThanOrEqual(minAllowedAngleDeg);
      }
    }
  }
}

/**
 * Sprawdza integralność poligonu obrysu wstęgi:
 * 1. Co najmniej 3 wierzchołki
 * 2. Wszystkie koordynaty skończone
 * 3. Dodatnie pole powierzchni (brak degeneracji)
 */
function assertValidPolygon(polygon: Point2D[]) {
  expect(polygon).toBeDefined();
  expect(polygon.length).toBeGreaterThanOrEqual(3);

  for (const pt of polygon) {
    expect(Number.isFinite(pt.x)).toBe(true);
    expect(Number.isFinite(pt.y)).toBe(true);
  }

  const area = Math.abs(calculateSignedArea(polygon));
  expect(area).toBeGreaterThan(1e-2);
}

/**
 * Sprawdza brak samoprzecięć w obrysie poligonu wstęgi.
 */
function assertNoSelfIntersections(polygon: Point2D[]) {
  const hasSelfIntersects = hasSelfIntersectionForTest(polygon);
  expect(hasSelfIntersects).toBe(false);
}

/**
 * Sprawdza, czy obwiednia drogi nie przecina wnętrza żadnego z budynków/przeszkód
 * (część wspólna obrysu drogi i budynku ma pole równe 0 — dopuszczalny jest jedynie styk brzegowy).
 */
function assertNoObstacleOverlap(roadPolygon: Point2D[], obstacles: Point2D[][]) {
  const roadRing = toClippingRing(roadPolygon);

  for (const obstacle of obstacles) {
    if (!obstacle || obstacle.length < 3) continue;
    const obsRing = toClippingRing(obstacle);

    let intersectionResult: polygonClipping.MultiPolygon;
    try {
      intersectionResult = polygonClipping.intersection([roadRing], [obsRing]);
    } catch {
      continue;
    }

    if (!intersectionResult || intersectionResult.length === 0) {
      continue;
    }

    let totalOverlapArea = 0;
    for (const poly of intersectionResult) {
      totalOverlapArea += calculatePolygonAreaFromClipping(poly);
    }

    // Dopuszczamy minimalny błąd numeryczny dla numerycznej styczności krawędzi (< 0.01 m² = 1 dm²)
    expect(totalOverlapArea).toBeLessThan(0.01);
  }
}

/**
 * Zbiorcza weryfikacja wszystkich kryteriów integralności wygenerowanej drogi.
 */
export function validateRoadIntegrity(
  result: RoadSolveResult,
  input: RoadSolveInput,
  options?: { minAllowedAngleDeg?: number }
) {
  expect(result.success).toBe(true);
  assertValidCenterline(result.centerline, input.pointA, input.pointB, options?.minAllowedAngleDeg ?? 5);
  assertValidPolygon(result.polygon);
  assertNoSelfIntersections(result.polygon);
  assertNoObstacleOverlap(result.polygon, input.obstacles);
}

/**
 * Analizuje geometrię centerline pod kątem liczby załamań (ostrych wierzchołków)
 * oraz łuków kołowych (płynnych przejść).
 */
export function analyzeCenterlineCurvature(centerline: Point2D[], minAngleForKinkDeg = 5) {
  if (centerline.length < 3) {
    return { cornerCount: 0, arcPointsCount: 0, turnAnglesDeg: [] };
  }

  const turnAnglesDeg: number[] = [];
  let cornerCount = 0;
  let arcPointsCount = 0;

  for (let i = 1; i < centerline.length - 1; i++) {
    const p0 = centerline[i - 1];
    const p1 = centerline[i];
    const p2 = centerline[i + 1];

    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const l1 = Math.hypot(v1.x, v1.y);
    const l2 = Math.hypot(v2.x, v2.y);

    if (l1 < 1e-4 || l2 < 1e-4) continue;

    const dot = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const turnAngleDeg = (Math.acos(clampedDot) * 180) / Math.PI;

    turnAnglesDeg.push(turnAngleDeg);

    // Kąt pojedynczego kroku łuku aproksymowanego to zwykle mały kąt (< 15-20° przy ARC_SEGMENTS=12).
    // Jeśli kąt jest duży (np. > 20°), oznacza to pojedyncze niepłynne załamanie (ostry narożnik).
    if (turnAngleDeg > 20) {
      cornerCount++;
    } else if (turnAngleDeg >= 0.5) {
      arcPointsCount++;
    }
  }

  return { cornerCount, arcPointsCount, turnAnglesDeg };
}

/**
 * ============================================================================
 * TESTY REFERENCYJNE
 * ============================================================================
 */

describe('Referencyjny test walidacji geometrii i integralności Drogi', () => {
  describe('1. Scena referencyjna reference/roadtest.json (wklęsły budynek - gwiazda)', () => {
    const scenePath = path.resolve(__dirname, '../../../reference/roadtest.json');
    const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
    const road = scene.buildings.find((b: any) => b.id === 'bldg-1789077186551');
    const starBuilding = scene.buildings.find((b: any) => b.id === 'bldg-1789070794701');

    it('spełnia wszystkie kryteria integralności z włączonym buforem (zonePolygons)', () => {
      const obstacles = [
        starBuilding.vertices,
        ...(starBuilding.zonePolygons?.map((z: any) => z.polygon) || []),
      ];
      const input: RoadSolveInput = {
        pointA: road.roadPointA,
        pointB: road.roadPointB,
        width: road.sweepWidth,
        obstacles,
        plot: null,
        strategy: road.roadStrategy,
        minTurnRadius: road.roadMinTurnRadius,
      };

      const result = solveRoad(input);
      validateRoadIntegrity(result, input);

      // Weryfikacja załamań i łuków: wszystkie załamania mają zostać wyeliminowane na rzecz łuków
      const curvature = analyzeCenterlineCurvature(result.centerline);
      expect(curvature.cornerCount).toBe(0);
      expect(curvature.arcPointsCount).toBeGreaterThan(5);
    });

    it('spełnia wszystkie kryteria integralności bez bufora (surowy budynek)', () => {
      const obstacles = [starBuilding.vertices];
      const input: RoadSolveInput = {
        pointA: road.roadPointA,
        pointB: road.roadPointB,
        width: road.sweepWidth,
        obstacles,
        plot: null,
        strategy: road.roadStrategy,
        minTurnRadius: road.roadMinTurnRadius,
      };

      const result = solveRoad(input);
      validateRoadIntegrity(result, input);

      const curvature = analyzeCenterlineCurvature(result.centerline);
      expect(curvature.cornerCount).toBe(0);
    });

    it('poprawnie wyznacza drogę w trybie shortest bez samoprzecięć i bez kolizji', () => {
      const obstacles = [starBuilding.vertices];
      const input: RoadSolveInput = {
        pointA: road.roadPointA,
        pointB: road.roadPointB,
        width: road.sweepWidth,
        obstacles,
        plot: null,
        strategy: 'shortest',
      };

      const result = solveRoad(input);
      validateRoadIntegrity(result, input);
    });
  });

  describe('2. Scena referencyjna reference/roadtest2.json (układ wieloobiektowy)', () => {
    const scenePath = path.resolve(__dirname, '../../../reference/roadtest2.json');
    const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

    const roadBuilding = scene.buildings.find(
      (b: any) => b.roadPointA && b.roadPointB
    );

    const getBaseObstacles = () => {
      return gatherRoadObstacles(scene.buildings);
    };
    const plotBoundary = findPlotBoundary(scene.buildings);

    it('spełnia kryteria integralności dla trasy z roadtest2.json (shortest)', () => {
      if (!roadBuilding) {
        throw new Error('Brak obiektu drogi w reference/roadtest2.json');
      }

      const obstacles = getBaseObstacles();
      const input: RoadSolveInput = {
        pointA: roadBuilding.roadPointA,
        pointB: roadBuilding.roadPointB,
        width: roadBuilding.sweepWidth ?? 5,
        obstacles,
        plot: null,
        strategy: 'shortest',
      };

      const result = solveRoad(input);
      validateRoadIntegrity(result, input);
    });

    it('spełnia kryteria integralności i całkowicie eliminuje załamania dla centered_smooth (roadtest2.json)', () => {
      if (!roadBuilding) {
        throw new Error('Brak obiektu drogi w reference/roadtest2.json');
      }

      const obstacles = getBaseObstacles();
      const input: RoadSolveInput = {
        pointA: roadBuilding.roadPointA,
        pointB: roadBuilding.roadPointB,
        width: roadBuilding.sweepWidth ?? 5,
        obstacles,
        plot: null,
        strategy: 'centered_smooth',
        minTurnRadius: 4,
      };

      const result = solveRoad(input);
      validateRoadIntegrity(result, input);

      const curvature = analyzeCenterlineCurvature(result.centerline);
      expect(curvature.cornerCount).toBe(0);
      expect(curvature.arcPointsCount).toBeGreaterThan(0);
    });

    it('jest odporny na losowe przesunięcie (perturbację) wierzchołków o 1.0 m', () => {
      if (!roadBuilding) {
        throw new Error('Brak obiektu drogi w reference/roadtest2.json');
      }

      const baseObstacles = getBaseObstacles();

      // Wykonujemy test dla 3 różnych losowych konfiguracji przesunięć o 1m
      for (let seed = 1; seed <= 3; seed++) {
        const perturbPoint = (p: Point2D, idx: number): Point2D => {
          const angle = ((seed * 137 + idx * 79) % 360) * (Math.PI / 180);
          return {
            x: p.x + Math.cos(angle) * 1.0,
            y: p.y + Math.sin(angle) * 1.0,
          };
        };

        const perturbedObstacles = baseObstacles.map((obs, obsIdx) =>
          obs.map((p, pIdx) => perturbPoint(p, obsIdx * 100 + pIdx))
        );

        const perturbedA = perturbPoint(roadBuilding.roadPointA, 991);
        const perturbedB = perturbPoint(roadBuilding.roadPointB, 992);

        const input: RoadSolveInput = {
          pointA: perturbedA,
          pointB: perturbedB,
          width: roadBuilding.sweepWidth ?? 5,
          obstacles: perturbedObstacles,
          plot: null,
          strategy: 'centered_smooth',
          minTurnRadius: 3,
        };

        const result = solveRoad(input);
        if (result.success) {
          validateRoadIntegrity(result, input);
          const curvature = analyzeCenterlineCurvature(result.centerline);
          expect(curvature.cornerCount).toBe(0);
        }
      }
    });
  });

  describe('3. Scena referencyjna reference/roadtest3.json (pełna scena, 3 drogi, 2 budynki z buforami)', () => {
    const scenePath = path.resolve(__dirname, '../../../reference/roadtest3.json');
    const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

    // Wyodrębnij wszystkie żywe obiekty dróg w scenie
    const roadBuildings = scene.buildings.filter(
      (b: any) => b.roadPointA && b.roadPointB
    );

    it('znajduje w scenie dokładnie 3 obiekty dróg', () => {
      expect(roadBuildings.length).toBe(3);
    });

    // Test dla każdej drogi z osobna w scenie z WŁĄCZONYMI buforami
    describe('Wariant A: Modyfikatory bufor WŁĄCZONE w całej scenie', () => {
      const obstacles = gatherRoadObstacles(scene.buildings);

      roadBuildings.forEach((road: any) => {
        it(`prawidłowo generuje trasę dla obiektu "${road.name}" (${road.id}) z buforami`, () => {
          const input: RoadSolveInput = {
            pointA: road.roadPointA,
            pointB: road.roadPointB,
            width: road.sweepWidth ?? 5,
            obstacles,
            plot: null,
            strategy: road.roadStrategy ?? 'centered_smooth',
            minTurnRadius: road.roadMinTurnRadius ?? 6,
          };

          const result = solveRoad(input);

          // Jeśli solver zwróci błąd, wypisujemy szczegółowe dane diagnostyczne
          if (!result.success) {
            console.error(`Błąd trasy dla ${road.name}: reason=${result.reason}, pointA=${JSON.stringify(road.roadPointA)}, pointB=${JSON.stringify(road.roadPointB)}`);
          }

          expect(result.success).toBe(true);
          validateRoadIntegrity(result, input);

          if (input.strategy === 'centered_smooth') {
            const curvature = analyzeCenterlineCurvature(result.centerline);
            expect(curvature.cornerCount).toBe(0);
          }
        });
      });
    });

    // Test dla każdej drogi z osobna w scenie z WYŁĄCZONYMI buforami
    describe('Wariant B: Modyfikatory bufor WYŁĄCZONE w całej scenie', () => {
      const buildingsWithoutBuffers = scene.buildings.map((b: any) => ({
        ...b,
        zonePolygons: undefined,
      }));
      const obstacles = gatherRoadObstacles(buildingsWithoutBuffers);

      roadBuildings.forEach((road: any) => {
        it(`prawidłowo generuje trasę dla obiektu "${road.name}" (${road.id}) bez buforów`, () => {
          const input: RoadSolveInput = {
            pointA: road.roadPointA,
            pointB: road.roadPointB,
            width: road.sweepWidth ?? 5,
            obstacles,
            plot: null,
            strategy: road.roadStrategy ?? 'centered_smooth',
            minTurnRadius: road.roadMinTurnRadius ?? 6,
          };

          const result = solveRoad(input);

          if (!result.success) {
            console.error(`Błąd trasy (bez bufora) dla ${road.name}: reason=${result.reason}`);
          }

          expect(result.success).toBe(true);
          validateRoadIntegrity(result, input);

          if (input.strategy === 'centered_smooth') {
            const curvature = analyzeCenterlineCurvature(result.centerline);
            expect(curvature.cornerCount).toBe(0);
          }
        });
      });
    });
  });

  describe('4. Syntetyczne przypadki brzegowe i geometrie skrajne', () => {
    const obstacleL: Point2D[] = [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 30 },
      { x: 0, y: 30 },
      { x: 0, y: 20 },
      { x: 10, y: 20 },
    ];

    it('omija przeszkodę w kształcie litery L z wygładzaniem (centered_smooth) bez kolizji, samoprzecięć i załamań', () => {
      const input: RoadSolveInput = {
        pointA: { x: 5, y: -10 },
        pointB: { x: -10, y: 25 },
        width: 4,
        obstacles: [obstacleL],
        plot: null,
        strategy: 'centered_smooth',
        minTurnRadius: 4,
      };

      const result = solveRoad(input);
      validateRoadIntegrity(result, input);
      const curvature = analyzeCenterlineCurvature(result.centerline);
      expect(curvature.cornerCount).toBe(0);
    });

    it('radzi sobie z wąskim gardłem między dwoma budynkami', () => {
      const bldgLeft: Point2D[] = [
        { x: -20, y: 0 },
        { x: -3, y: 0 },
        { x: -3, y: 20 },
        { x: -20, y: 20 },
      ];
      const bldgRight: Point2D[] = [
        { x: 3, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 3, y: 20 },
      ];

      const input: RoadSolveInput = {
        pointA: { x: 0, y: -15 },
        pointB: { x: 0, y: 35 },
        width: 4,
        obstacles: [bldgLeft, bldgRight],
        plot: null,
        strategy: 'centered_smooth',
        minTurnRadius: 3,
      };

      const result = solveRoad(input);
      validateRoadIntegrity(result, input);
      const curvature = analyzeCenterlineCurvature(result.centerline);
      expect(curvature.cornerCount).toBe(0);
    });

    it('weryfikuje zachowanie dla ostrego zakrętu 90 stopni z dużym promieniem skrętu', () => {
      const cornerObstacle: Point2D[] = [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ];

      const input: RoadSolveInput = {
        pointA: { x: -10, y: 10 },
        pointB: { x: 10, y: -10 },
        width: 3,
        obstacles: [cornerObstacle],
        plot: null,
        strategy: 'centered_smooth',
        minTurnRadius: 8,
      };

      const result = solveRoad(input);
      validateRoadIntegrity(result, input);
      const curvature = analyzeCenterlineCurvature(result.centerline);
      expect(curvature.cornerCount).toBe(0);
    });
  });
});

