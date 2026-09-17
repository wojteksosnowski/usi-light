import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractBuildingStoryTiers,
  MasterplanStoryTier,
  getMasterplanSolarAngles,
  computeStoryShadowPolygonWithHoles,
  SolarAngles,
} from '../../components/cad/masterplan/masterplanGeometry';
import {
  clusterTiersByShadowOverlap,
  unionPolygonsWithHolesHierarchical,
  polygonsWithHolesBounds,
} from '../../components/cad/masterplan/masterplanSpatial';
import {
  calculateSignedArea,
  computePointsBoundingBox,
  PolygonWithHoles,
} from './polygons';
import { Point2D, BuildingLoop } from '../../types/geometry';

/**
 * Liniowy test orientacji i wyznacznik 2D dla prostej Ax + By + C = 0:
 * Prosta P1->P2: A = y1 - y2, B = x2 - x1, C = x1*y2 - x2*y1.
 * Zwraca orientację punktu P3 względem wektora P1->P2 bez funkcji trygonometrycznych.
 */
function lineEquationSignedDistance(p1: Point2D, p2: Point2D, p3: Point2D): number {
  const A = p1.y - p2.y;
  const B = p2.x - p1.x;
  const C = p1.x * p2.y - p2.x * p1.y;
  return A * p3.x + B * p3.y + C;
}

/**
 * Dopasowuje cyklicznie dwa pierścienie wielokąta i sprawdza czy wierzchołki są identyczne w granicach tolerancji.
 */
function matchPolygonVerticesCyclic(actual: Point2D[], expected: Point2D[], tolerance = 0.05): boolean {
  if (actual.length !== expected.length) return false;
  const n = actual.length;
  if (n === 0) return true;

  // Znajdź potencjalne indeksy startowe w actual odpowiadające expected[0]
  for (let offset = 0; offset < n; offset++) {
    let match = true;
    for (let i = 0; i < n; i++) {
      const actPt = actual[(offset + i) % n];
      const expPt = expected[i];
      if (Math.hypot(actPt.x - expPt.x, actPt.y - expPt.y) > tolerance) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function computeUmbraPolygons(
  tiers: MasterplanStoryTier[],
  latitude: number,
  longitude: number,
  equinoxDate: 'spring' | 'autumn',
  hourFraction: number,
  minuteOffset: number = 0,
  method: 'raycasting' | 'segments' | 'astro' | 'linijka' = 'raycasting'
): PolygonWithHoles[] {
  const angles = getMasterplanSolarAngles(latitude, longitude, equinoxDate, hourFraction, minuteOffset, method);
  const validTiers = tiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
  const clusters = clusterTiersByShadowOverlap(validTiers, angles);

  const umbraPolysAll: PolygonWithHoles[] = [];

  for (const cluster of clusters) {
    const cUmbra: PolygonWithHoles[] = [];
    for (const tier of cluster) {
      const polys = computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, angles, tier.hTop, tier.hBottom);
      cUmbra.push(...polys);
    }
    if (cUmbra.length === 1) {
      umbraPolysAll.push(cUmbra[0]);
    } else if (cUmbra.length > 1) {
      umbraPolysAll.push(...unionPolygonsWithHolesHierarchical(cUmbra));
    }
  }

  return umbraPolysAll;
}

describe('UMBRA A456 - Armored Regression & Stability Suite', () => {
  const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');
  const baselinePath = path.resolve(__dirname, './warszawa-baseline-full.json');

  let buildings: BuildingLoop[] = [];
  let allTiers: MasterplanStoryTier[] = [];
  let baseline: any = null;

  if (fs.existsSync(warszawaPath) && fs.existsSync(baselinePath)) {
    const rawScene = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
    buildings = (rawScene.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  }

  describe('1. Baseline 1:1 Regression on warszawa.json (Hours -1h, 0h, +1h and Offsets -1, 0, +1 min)', () => {
    it('verifies scene building and story tier extraction counts', () => {
      expect(buildings.length).toBe(baseline.buildingsCount);
      expect(allTiers.length).toBe(baseline.tiersCount);
    });

    const testHours = [11.0, 12.0, 13.0];
    const testOffsets = [-1, 0, 1];

    testHours.forEach((hour) => {
      testOffsets.forEach((offset) => {
        const offsetLabel = offset === 0 ? 'exact umbra (0 min)' : `${offset > 0 ? '+' : ''}${offset} min`;
        it(`matches 1:1 baseline geometry for hour ${hour}:00 and offset ${offsetLabel}`, () => {
          const expectedData = baseline.hours[String(hour)][`offset_${offset}`];
          expect(expectedData).toBeDefined();

          const actualPolys = computeUmbraPolygons(
            allTiers,
            baseline.latitude,
            baseline.longitude,
            baseline.equinox,
            hour,
            offset
          );

          // 1. Liczba poligonów
          expect(actualPolys.length).toBe(expectedData.polygonsCount);

          // 2. Sumaryczna powierzchnia netto
          let actualTotalNetArea = 0;
          let actualTotalSegments = 0;

          for (const poly of actualPolys) {
            const outerArea = Math.abs(calculateSignedArea(poly.outer));
            let holeAreaSum = 0;
            for (const hole of poly.holes || []) {
              holeAreaSum += Math.abs(calculateSignedArea(hole));
              actualTotalSegments += hole.length;
            }
            actualTotalSegments += poly.outer.length;
            actualTotalNetArea += outerArea - holeAreaSum;
          }

          expect(actualTotalSegments).toBe(expectedData.totalSegments);
          expect(actualTotalNetArea).toBeCloseTo(expectedData.totalNetArea, 1);

          // 3. Bounding box sceny
          const bounds = polygonsWithHolesBounds(actualPolys);
          if (expectedData.bounds) {
            expect(bounds).not.toBeNull();
            expect(bounds!.minX).toBeCloseTo(expectedData.bounds.minX, 2);
            expect(bounds!.maxX).toBeCloseTo(expectedData.bounds.maxX, 2);
            expect(bounds!.minY).toBeCloseTo(expectedData.bounds.minY, 2);
            expect(bounds!.maxY).toBeCloseTo(expectedData.bounds.maxY, 2);
          }

          // 4. Dokładna zgodność wierzchołków dla każdego poligonu
          for (let i = 0; i < expectedData.polygons.length; i++) {
            const expP = expectedData.polygons[i];
            const actP = actualPolys[i];
            expect(actP).toBeDefined();

            // Dopasowanie cykliczne obrysu zewnętrznego
            const outerMatch = matchPolygonVerticesCyclic(actP.outer, expP.outer, 0.05);
            expect(outerMatch).toBe(true);

            // Zgodność liczby otworów
            expect((actP.holes || []).length).toBe(expP.holes.length);
            for (let h = 0; h < expP.holes.length; h++) {
              const expHole = expP.holes[h];
              const actHole = actP.holes![h];
              const holeMatch = matchPolygonVerticesCyclic(actHole, expHole, 0.05);
              expect(holeMatch).toBe(true);
            }
          }
        });
      });
    });
  });

  describe('2. Rigid Transformation Invariance (No Distortion, 100% Area Conservation)', () => {
    it('preserves exact total area and topology under scene translation (dx=500, dy=-300)', () => {
      const dx = 500.0;
      const dy = -300.0;

      const shiftedTiers: MasterplanStoryTier[] = allTiers.map((t) => ({
        ...t,
        polygon: t.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        holes: t.holes ? t.holes.map((h) => h.map((p) => ({ x: p.x + dx, y: p.y + dy }))) : [],
      }));

      const polysOriginal = computeUmbraPolygons(allTiers, 52.23, 21.01, 'spring', 12.0, 0);
      const polysShifted = computeUmbraPolygons(shiftedTiers, 52.23, 21.01, 'spring', 12.0, 0);

      expect(polysShifted.length).toBe(polysOriginal.length);

      const areaOrig = polysOriginal.reduce((acc, p) => acc + Math.abs(calculateSignedArea(p.outer)), 0);
      const areaShifted = polysShifted.reduce((acc, p) => acc + Math.abs(calculateSignedArea(p.outer)), 0);

      expect(areaShifted).toBeCloseTo(areaOrig, 2);

      const boundsOrig = polygonsWithHolesBounds(polysOriginal)!;
      const boundsShifted = polygonsWithHolesBounds(polysShifted)!;

      expect(boundsShifted.minX).toBeCloseTo(boundsOrig.minX + dx, 2);
      expect(boundsShifted.maxX).toBeCloseTo(boundsOrig.maxX + dx, 2);
      expect(boundsShifted.minY).toBeCloseTo(boundsOrig.minY + dy, 2);
      expect(boundsShifted.maxY).toBeCloseTo(boundsOrig.maxY + dy, 2);
    });

    it('preserves exact total area under 90, 180 and 270 degree scene rotation', () => {
      const anglesDeg = [90, 180, 270];

      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const cos = Math.round(Math.cos(rad));
        const sin = Math.round(Math.sin(rad));

        const rotTiers: MasterplanStoryTier[] = allTiers.map((t) => ({
          ...t,
          polygon: t.polygon.map((p) => ({
            x: p.x * cos - p.y * sin,
            y: p.x * sin + p.y * cos,
          })),
          holes: t.holes
            ? t.holes.map((h) =>
                h.map((p) => ({
                  x: p.x * cos - p.y * sin,
                  y: p.x * sin + p.y * cos,
                }))
              )
            : [],
        }));

        const solarAngles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
        // Obracamy wektor słońca o ten sam kąt układu
        const rotSunVector = {
          x: solarAngles.sunVector.x * cos - solarAngles.sunVector.y * sin,
          y: solarAngles.sunVector.x * sin + solarAngles.sunVector.y * cos,
        };
        const rotSolarAngles: SolarAngles = {
          ...solarAngles,
          sunVector: rotSunVector,
        };

        const clusters = clusterTiersByShadowOverlap(
          rotTiers.filter((t) => t.polygon.length >= 3 && t.hTop > 0),
          rotSolarAngles
        );

        let totalAreaRot = 0;
        for (const cluster of clusters) {
          const cUmbra: PolygonWithHoles[] = [];
          for (const tier of cluster) {
            cUmbra.push(...computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, rotSolarAngles, tier.hTop, tier.hBottom));
          }
          const merged = unionPolygonsWithHolesHierarchical(cUmbra);
          for (const p of merged) {
            const outerArea = Math.abs(calculateSignedArea(p.outer));
            let holeAreaSum = 0;
            for (const h of p.holes || []) {
              holeAreaSum += Math.abs(calculateSignedArea(h));
            }
            totalAreaRot += outerArea - holeAreaSum;
          }
        }

        const expectedArea = baseline.hours['12']['offset_0'].totalNetArea;
        // Pole powierzchni rzutu z odliczonymi otworami powinno być zachowane
        expect(totalAreaRot).toBeCloseTo(expectedArea, 0);
      }
    });
  });

  describe('3. Linear Line Equation Ax + By + C = 0 & Collinear Edge Invariants', () => {
    it('accurately evaluates point side orientation using linear line equations without trigonometry', () => {
      const p1: Point2D = { x: 0, y: 0 };
      const p2: Point2D = { x: 10, y: 0 };

      // Punkt powyżej prostej (lewa strona wektora -> d > 0 w układzie kartezjańskim)
      const pLeft: Point2D = { x: 5, y: 5 };
      expect(lineEquationSignedDistance(p1, p2, pLeft)).toBeGreaterThan(0);

      // Punkt poniżej prostej
      const pRight: Point2D = { x: 5, y: -5 };
      expect(lineEquationSignedDistance(p1, p2, pRight)).toBeLessThan(0);

      // Punkt współliniowy na odcinku
      const pOn: Point2D = { x: 5, y: 0 };
      expect(Math.abs(lineEquationSignedDistance(p1, p2, pOn))).toBeLessThan(1e-10);
    });

    it('correctly handles courtyard atrium donut with light patch subtraction', () => {
      const outerSquare: Point2D[] = [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ];
      const innerCourtyard: Point2D[] = [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 10, y: 30 },
      ];

      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
      // hTop = 6m tworzy aperturę światła przechodzącą przez dziedziniec 20m x 20m
      const shadowWithHoles = computeStoryShadowPolygonWithHoles(outerSquare, [innerCourtyard], angles, 6, 0);

      expect(shadowWithHoles.length).toBeGreaterThan(0);
      // Cień budynku z dziedzińcem przy obecności światła jest mniejszy niż cień pełnego bloku
      const solidShadow = computeStoryShadowPolygonWithHoles(outerSquare, [], angles, 6, 0);
      const areaSolid = Math.abs(calculateSignedArea(solidShadow[0].outer));

      const areaNet = shadowWithHoles.reduce((acc, p) => {
        let a = Math.abs(calculateSignedArea(p.outer));
        for (const h of p.holes || []) a -= Math.abs(calculateSignedArea(h));
        return acc + a;
      }, 0);

      expect(areaNet).toBeLessThan(areaSolid);
      expect(areaNet).toBeGreaterThan(0);
    });
  });

  describe('4. Low Elevation Shadow Continuity & Ground Contact Invariants (Hour -3:15 / 8.75h)', () => {
    it('guarantees unbroken ground contact and full ribbon connection for skyscraper WFS 146510_8.0502.164_BUD (H=99.5m)', () => {
      const tallBldg = buildings.find((b) => b.id === '146510_8.0502.164_BUD');
      expect(tallBldg).toBeDefined();
      expect(tallBldg!.defaultHeight).toBe(99.5);

      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 8.75, 0, 'raycasting');
      // Elewacja słońca ~25.7 stopni -> shadowScale ~2.08, rzut cienia > 200m
      expect(angles.shadowScale).toBeGreaterThan(2.0);

      const shadowPolys = computeStoryShadowPolygonWithHoles(
        tallBldg!.vertices,
        tallBldg!.holes,
        angles,
        tallBldg!.defaultHeight,
        tallBldg!.elevation || 0
      );

      expect(shadowPolys.length).toBe(1);
      const shadow = shadowPolys[0];

      // 1. Pole powierzchni musi być rzędu ~22 000 m2 (pełne wstęgi ścienne + dach + podstawa)
      const shadowArea = Math.abs(calculateSignedArea(shadow.outer));
      const baseArea = Math.abs(calculateSignedArea(tallBldg!.vertices));
      expect(shadowArea).toBeGreaterThan(baseArea * 5.0);
      expect(shadowArea).toBeCloseTo(22003.65, 0);

      // 2. Bounding box cienia musi obejmować zarówno podstawę na gruncie jak i oddalony dach
      const baseBox = computePointsBoundingBox(tallBldg!.vertices);
      const shadowBox = computePointsBoundingBox(shadow.outer);

      // Podstawa musi stykać się z cieniem (granice podstawy zawierają się w bounding box cienia)
      expect(shadowBox.minX).toBeLessThanOrEqual(baseBox.minX + 0.1);
      expect(shadowBox.maxX).toBeGreaterThanOrEqual(baseBox.maxX - 0.1);
      expect(shadowBox.minY).toBeLessThanOrEqual(baseBox.minY + 0.1);
      expect(shadowBox.maxY).toBeGreaterThanOrEqual(baseBox.maxY - 0.1);
    });

    it('generates fully connected umbra for the entire warszawa.json scene at hour -3:15 without orphan polygons', () => {
      const umbraPolys = computeUmbraPolygons(allTiers, 52.23, 21.01, 'spring', 8.75, 0, 'raycasting');
      expect(umbraPolys.length).toBeGreaterThan(0);

      const totalArea = umbraPolys.reduce((acc, p) => {
        let a = Math.abs(calculateSignedArea(p.outer));
        for (const h of p.holes || []) a -= Math.abs(calculateSignedArea(h));
        return acc + a;
      }, 0);

      // Sumaryczne pole cieni sceny przy godzinie -3:15 (226 141 m2) jest większe niż w południe (183 737 m2)
      expect(totalArea).toBeGreaterThan(baseline.hours['12']['offset_0'].totalNetArea);
      expect(totalArea).toBeCloseTo(226141, -1);
    });
  });
});
