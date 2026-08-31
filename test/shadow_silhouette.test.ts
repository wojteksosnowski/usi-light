import { describe, it, expect } from 'vitest';
import {
  getShadowOffsetVector,
  extractSilhouetteEdges,
  computeFastShadowPolygon,
  computeFullShadowAnalysis,
} from '../src/utils/math2d';
import { BuildingLoop, Point2D } from '../src/types/geometry';
import { runFullAnalysis } from '../src/engine/analysisEngine';

describe('Shadow Silhouette & Fast Shadow Polygon Analysis', () => {
  const squareCCW: Point2D[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  const squareCW: Point2D[] = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
  ];

  describe('getShadowOffsetVector', () => {
    it('returns zero vector for non-positive elevation or height', () => {
      expect(getShadowOffsetVector(0, 0, 10)).toEqual({ x: 0, y: 0 });
      expect(getShadowOffsetVector(0, Math.PI / 4, 0)).toEqual({ x: 0, y: 0 });
      expect(getShadowOffsetVector(0, -0.1, 10)).toEqual({ x: 0, y: 0 });
    });

    it('calculates correct shadow offset vector for South sun (Azimuth = 180 deg / PI)', () => {
      // Sun from South (azimuth = PI) -> Shadow points North (dy > 0, dx = 0)
      const elev = Math.PI / 4; // 45 deg -> tan(elev) = 1
      const height = 10;
      const offset = getShadowOffsetVector(Math.PI, elev, height);

      expect(offset.x).toBeCloseTo(0, 4);
      expect(offset.y).toBeCloseTo(10, 4); // Shadow points North (y > 0)
    });

    it('calculates correct shadow offset vector for East sun (Azimuth = 90 deg / PI/2)', () => {
      // Sun from East (azimuth = PI/2) -> Shadow points West (dx < 0, dy = 0)
      const elev = Math.PI / 4; // 45 deg
      const height = 10;
      const offset = getShadowOffsetVector(Math.PI / 2, elev, height);

      expect(offset.x).toBeCloseTo(-10, 4); // Shadow points West (x < 0)
      expect(offset.y).toBeCloseTo(0, 4);
    });
  });

  describe('extractSilhouetteEdges', () => {
    it('extracts illuminated edges for CCW polygon with sun from South', () => {
      // Light traveling North: sunRayDir = (0, 1)
      const sunRayDir = { x: 0, y: 1 };
      const edges = extractSilhouetteEdges(squareCCW, sunRayDir);

      // In CCW square:
      // Edge (0,0)->(10,0): normal is (0, -1). dot(norm, sunRayDir) = -1 < 0 -> Illuminated!
      // Edge (10,0)->(10,10): normal is (1, 0). dot = 0 -> not < 0
      // Edge (10,10)->(0,10): normal is (0, 1). dot = 1 > 0 -> backface
      // Edge (0,10)->(0,0): normal is (-1, 0). dot = 0 -> not < 0
      expect(edges.length).toBe(1);
      expect(edges[0].p1).toEqual({ x: 0, y: 0 });
      expect(edges[0].p2).toEqual({ x: 10, y: 0 });
    });

    it('extracts illuminated edges for CW polygon with sun from South', () => {
      const sunRayDir = { x: 0, y: 1 };
      const edges = extractSilhouetteEdges(squareCW, sunRayDir);

      // In CW square:
      // Edge (10,0)->(0,0): normal is (0, -1). dot = -1 < 0 -> Illuminated!
      expect(edges.length).toBe(1);
      expect(edges[0].p1).toEqual({ x: 10, y: 0 });
      expect(edges[0].p2).toEqual({ x: 0, y: 0 });
    });
  });

  describe('computeFastShadowPolygon', () => {
    it('generates a closed hull polygon extending in the shadow direction', () => {
      // Sun from South at 45 deg elevation, building height = 10m
      const shadowPoly = computeFastShadowPolygon(squareCCW, Math.PI, Math.PI / 4, 10);

      expect(shadowPoly.length).toBeGreaterThanOrEqual(4);
      // Check that maximum Y of shadow hull is around 20 (base top 10 + shadow offset 10)
      const maxY = Math.max(...shadowPoly.map((p) => p.y));
      expect(maxY).toBeCloseTo(20, 1);
      const minY = Math.min(...shadowPoly.map((p) => p.y));
      expect(minY).toBeCloseTo(0, 1);
    });
  });

  describe('computeFullShadowAnalysis & Hourly Shadows', () => {
    const testBuilding: BuildingLoop = {
      id: 'bldg-1',
      name: 'Budynek Testowy',
      layer: 'Domyślna (0)',
      isTested: true,
      isIncluded: true,
      isCityCentre: false,
      buildingType: 'residential',
      defaultHeight: 15,
      hWindowBottom: 0.85,
      vertices: squareCCW,
      segments: [
        {
          id: 'seg-1',
          p1: squareCCW[0],
          p2: squareCCW[1],
          normal: { x: 0, y: -1 },
          length: 10,
          angleRad: 0,
          hTop: 15,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential',
        },
        {
          id: 'seg-2',
          p1: squareCCW[1],
          p2: squareCCW[2],
          normal: { x: 1, y: 0 },
          length: 10,
          angleRad: Math.PI / 2,
          hTop: 15,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential',
        },
        {
          id: 'seg-3',
          p1: squareCCW[2],
          p2: squareCCW[3],
          normal: { x: 0, y: 1 },
          length: 10,
          angleRad: Math.PI,
          hTop: 15,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential',
        },
        {
          id: 'seg-4',
          p1: squareCCW[3],
          p2: squareCCW[0],
          normal: { x: -1, y: 0 },
          length: 10,
          angleRad: -Math.PI / 2,
          hTop: 15,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential',
        },
      ],
      isClockwise: false,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    it('computes building shadow envelope and hourly shadow contours for +-5h boundary hours', () => {
      const result = computeFullShadowAnalysis([testBuilding], 52.23, 21.01, 'spring');

      expect(result.envelopeLoops.length).toBeGreaterThan(0);
      expect(result.hourlyShadows.length).toBe(2);
      expect(result.calculationTimeMs).toBeGreaterThanOrEqual(0);

      const offsets = result.hourlyShadows.map((h) => h.hourOffset);
      expect(offsets).toEqual([-5, 5]);
    });

    it('integrates shadow analysis in runFullAnalysis and measures shadowEnvelopeMs', () => {
      const batch = runFullAnalysis([testBuilding], {
        latitude: 52.23,
        longitude: 21.01,
        isCityCentreDefault: false,
        samplingInterval: 2.0,
        equinoxDate: 'spring',
      });

      expect(batch.shadowAnalysis).toBeDefined();
      expect(batch.shadowEnvelopeMs).toBeGreaterThanOrEqual(0);
      expect(batch.totalAnalysisMs).toBeGreaterThan(0);
      expect(batch.shadowAnalysis!.envelopeLoops.length).toBeGreaterThan(0);
    });
  });
});
