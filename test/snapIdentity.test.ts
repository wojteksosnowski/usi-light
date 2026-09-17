import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BuildingLoop, Point2D } from '../src/types/geometry';
import {
  buildLineBufferFromBuildings,
  translateLineBuffer,
  rotateLineBuffer,
  distancePointToLine,
  CachedLineEquation,
} from '../src/utils/lineBufferEngine';
import { analyzeSegmentsStatistics } from '../src/utils/segmentStatistics';

describe('Snap & Geometry Identity (Invariance) Tests - Warszawa Dataset', () => {
  const filePath = path.resolve('C:/py/usi-light/reference/warszawa.json');
  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const buildings: BuildingLoop[] = rawData.buildings;

  it('verifies dataset loaded with buildings', () => {
    expect(buildings.length).toBeGreaterThan(50);
  });

  it('Identity Test 1: Translation Invariance of Line Equations and Distances', () => {
    const testBldg = buildings.find((b) => b.vertices && b.vertices.length >= 4) || buildings[0];
    expect(testBldg).toBeDefined();

    const lineBufferMap = buildLineBufferFromBuildings([testBldg]);
    const originalBuffer = lineBufferMap.get(testBldg.id) || [];
    expect(originalBuffer.length).toBeGreaterThan(0);

    const dx = 125.45;
    const dy = -84.32;
    const translatedBuffer = translateLineBuffer(originalBuffer, dx, dy);

    expect(translatedBuffer.length).toBe(originalBuffer.length);

    for (let i = 0; i < originalBuffer.length; i++) {
      const orig = originalBuffer[i];
      const trans = translatedBuffer[i];

      // A i B musza byc scisle identyczne (wektor normalny nie zmienia sie przy translacji)
      expect(trans.A).toBeCloseTo(orig.A, 6);
      expect(trans.B).toBeCloseTo(orig.B, 6);
      expect(trans.angle).toBeCloseTo(orig.angle, 6);

      // C_new = C - (A*dx + B*dy)
      const expectedC = orig.C - (orig.A * dx + orig.B * dy);
      expect(trans.C).toBeCloseTo(expectedC, 6);

      // Sprawdzenie tozsamosci odleglosci dowolnego punktu P: d(P + Delta, Line') == d(P, Line)
      const samplePoint: Point2D = { x: orig.p1.x + 3.5, y: orig.p1.y - 2.1 };
      const transPoint: Point2D = { x: samplePoint.x + dx, y: samplePoint.y + dy };

      const distOrig = distancePointToLine(samplePoint, orig);
      const distTrans = distancePointToLine(transPoint, trans);
      expect(distTrans).toBeCloseTo(distOrig, 5);
    }
  });

  it('Identity Test 2: Rotation Invariance of Line Equations and Distances', () => {
    const testBldg = buildings.find((b) => b.vertices && b.vertices.length >= 4) || buildings[0];
    const lineBufferMap = buildLineBufferFromBuildings([testBldg]);
    const originalBuffer = lineBufferMap.get(testBldg.id) || [];

    const pivot: Point2D = { x: testBldg.vertices[0].x, y: testBldg.vertices[0].y };
    const deltaAngleRad = Math.PI / 4; // 45 stopni
    const rotatedBuffer = rotateLineBuffer(originalBuffer, pivot, deltaAngleRad);

    expect(rotatedBuffer.length).toBe(originalBuffer.length);

    const cosA = Math.cos(deltaAngleRad);
    const sinA = Math.sin(deltaAngleRad);

    for (let i = 0; i < originalBuffer.length; i++) {
      const orig = originalBuffer[i];
      const rot = rotatedBuffer[i];

      // Dlugosc krawedzi musi byc tozsama
      expect(rot.length).toBeCloseTo(orig.length, 5);

      // Wektor normalny obrocony o deltaAngleRad
      const expectedA = cosA * orig.A - sinA * orig.B;
      const expectedB = sinA * orig.A + cosA * orig.B;
      expect(rot.A).toBeCloseTo(expectedA, 5);
      expect(rot.B).toBeCloseTo(expectedB, 5);

      // Odleglosc obroconego punktu P_rot od rotowanej prostej musi byc identyczna z d(P, orig)
      const testP: Point2D = { x: orig.p1.x + 1.2, y: orig.p1.y + 2.8 };
      const pRot: Point2D = {
        x: pivot.x + ((testP.x - pivot.x) * cosA - (testP.y - pivot.y) * sinA),
        y: pivot.y + ((testP.x - pivot.x) * sinA + (testP.y - pivot.y) * cosA),
      };

      const distOrig = distancePointToLine(testP, orig);
      const distRot = distancePointToLine(pRot, rot);
      expect(distRot).toBeCloseTo(distOrig, 5);
    }
  });

  it('Identity Test 3: Orthogonal Dominant Axis Rotation Invariance (90 deg)', () => {
    const statsOrig = analyzeSegmentsStatistics(buildings);
    expect(statsOrig.dominantDirections.length).toBeGreaterThan(0);
    const origDom = statsOrig.dominantDirections[0];

    // Obrot wszystkich budynkow o 90 stopni
    const rotatedBuildings: BuildingLoop[] = buildings.map((b) => ({
      ...b,
      segments: b.segments.map((s) => ({
        ...s,
        p1: { x: -s.p1.y, y: s.p1.x },
        p2: { x: -s.p2.y, y: s.p2.x },
        normal: { x: -s.normal.y, y: s.normal.x },
      })),
    }));

    const statsRot = analyzeSegmentsStatistics(rotatedBuildings);
    expect(statsRot.dominantDirections.length).toBeGreaterThan(0);
    const rotDom = statsRot.dominantDirections[0];

    // Oczekiwany kat przesuniety o 90 stopni modulo 90
    const expectedAngle = (origDom.angleDeg + 90) % 180;
    const diff = Math.min(
      Math.abs(rotDom.angleDeg - expectedAngle),
      Math.abs(rotDom.orthogonalDeg - expectedAngle)
    );
    expect(diff).toBeLessThanOrEqual(2.0);
  });
});
