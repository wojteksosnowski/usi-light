import { describe, it, expect } from 'vitest';
import {
  getMasterplanSolarAngles,
  computeShadowOffsetVector,
  buildShadowSweepPolygon,
  computeConvexHull,
  extractBuildingStoryTiers,
  computeStoryShadowPolygon,
  computeStoryShadowPolygonWithHoles,
  computeSoftShadowEnvelopeWithHoles,
} from './masterplanGeometry';
import { getCachedGroundShadowSamples } from './masterplanShadowCache';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import {
  isPointInPolygon,
  isPointInPolygonWithHoles,
  intersectionPolygonLoops,
  calculateSignedArea,
} from '../../../utils/math2d/polygons';
import { applyBuildingModifiers } from '../../../engine/modifiers/modifierPipeline';
import { createDefaultDonutModifier, createDefaultStoryOffsetModifier } from '../../../types/modifiers';

describe('masterplanGeometry', () => {
  it('calculates valid solar angles for equinox at noon', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    expect(angles.elevationDeg).toBeGreaterThan(0);
    expect(angles.elevationDeg).toBeLessThanOrEqual(90);
    expect(angles.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(angles.azimuthDeg).toBeLessThanOrEqual(360);
    expect(Number.isFinite(angles.sunVector.x)).toBe(true);
    expect(Number.isFinite(angles.sunVector.y)).toBe(true);
  });

  it('calculates solar angles correctly for Linijka method', () => {
    // Linijka at noon (12:00) gives azimuth 180°
    const anglesNoon = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0, 'segments');
    expect(anglesNoon.azimuthDeg).toBeCloseTo(180, 1);
    expect(anglesNoon.sunVector.y).toBeCloseTo(1, 1); // Shadow cast north (+Y in CAD)

    // Linijka morning (10:00 -> -2h) and afternoon (14:00 -> +2h)
    const anglesMorning = getMasterplanSolarAngles(52.23, 21.01, 'spring', 10.0, 0, 'linijka');
    const anglesAfternoon = getMasterplanSolarAngles(52.23, 21.01, 'spring', 14.0, 0, 'linijka');
    expect(anglesMorning.azimuthDeg).toBeLessThan(180);
    expect(anglesAfternoon.azimuthDeg).toBeGreaterThan(180);
  });

  it('computes positive shadow offset vector length for positive deltaH', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const offset = computeShadowOffsetVector(15.0, angles);
    expect(offset.length).toBeGreaterThan(0);
    expect(Number.isFinite(offset.dx)).toBe(true);
    expect(Number.isFinite(offset.dy)).toBe(true);
  });

  it('computes 0 offset for non-positive deltaH', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const offset = computeShadowOffsetVector(0, angles);
    expect(offset.length).toBe(0);
    expect(offset.dx).toBe(0);
    expect(offset.dy).toBe(0);
  });

  it('builds a valid sweep polygon for rectangle vertices', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const offset = { dx: 5, dy: 5, length: Math.hypot(5, 5) };
    const sweep = buildShadowSweepPolygon(vertices, offset);
    expect(sweep.length).toBeGreaterThanOrEqual(4);
  });

  it('computes convex hull correctly', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // Punkt wewnętrzny
    ];
    const hull = computeConvexHull(points);
    expect(hull.length).toBe(4);
  });

  it('extracts building story tiers from building with storyPolygons (modifiers)', () => {
    const bldg = {
      id: 'b1',
      name: 'Budynek 1',
      layer: 'Bariery',
      isCityCentre: false,
      buildingType: 'residential',
      category: 'building',
      defaultHeight: 12,
      isTested: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 15 },
        { x: 0, y: 15 },
      ],
      segments: [],
      storyPolygons: [
        {
          storyIndex: 0,
          hBottom: 0,
          hTop: 6,
          polygon: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 15 },
            { x: 0, y: 15 },
          ],
        },
        {
          storyIndex: 1,
          hBottom: 6,
          hTop: 12,
          polygon: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 15 },
            { x: 0, y: 15 },
          ],
        },
      ],
    };

    const tiers = extractBuildingStoryTiers(bldg as unknown as BuildingLoop, 'b1');
    expect(tiers.length).toBe(2);
    expect(tiers[0].hTop).toBe(6);
    expect(tiers[0].hBottom).toBe(0);
    expect(tiers[0].isSelected).toBe(true);
    expect(tiers[0].isProposed).toBe(true);

    expect(tiers[1].hTop).toBe(12);
    expect(tiers[1].hBottom).toBe(6);
    expect(tiers[1].polygon.length).toBe(4);
  });

  it('computes accurate story shadow polygon for convex and concave polygons', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const shadow = computeStoryShadowPolygon(rect, angles, 10, 0);
    expect(shadow.length).toBeGreaterThanOrEqual(4);

    // Self-shading deltaH calculation (e.g. higher floor 6m above lower floor)
    const upperStoryShadow = computeStoryShadowPolygon(rect, angles, 6, 0);
    expect(upperStoryShadow.length).toBeGreaterThanOrEqual(4);
  });

  it('caches identical (geometry, height, angle) calls — returns the same array reference', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 20, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 30 },
      { x: 20, y: 30 },
    ];

    const first = computeStoryShadowPolygon(rect, angles, 8, 0);
    const second = computeStoryShadowPolygon(rect, angles, 8, 0);
    expect(second).toBe(first); // cache hit: sama referencja, nie tylko równe dane

    // Inna geometria (przesunięty poligon) nie może trafić w ten sam wpis cache.
    const movedRect = rect.map((p) => ({ x: p.x + 5, y: p.y }));
    const third = computeStoryShadowPolygon(movedRect, angles, 8, 0);
    expect(third).not.toBe(first);
    expect(third).not.toEqual(first);
  });

  it('computes soft shadow envelope with penumbra as a superset of the umbra', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const { umbra, penumbra } = computeSoftShadowEnvelopeWithHoles(rect, undefined, angles, 10, 0);
    expect(umbra.length).toBe(1);
    expect(penumbra.length).toBeGreaterThanOrEqual(1);

    const area = (poly: { x: number; y: number }[]) => Math.abs(calculateSignedArea(poly));
    const umbraArea = area(umbra[0].outer);
    const penumbraArea = penumbra.reduce((sum, p) => sum + area(p.outer), 0);
    expect(umbraArea).toBeGreaterThan(0);
    // Penumbra to umbra + tarcze słońca wokół wierzchołków dachu — musi być ściśle większa (nadzbiór).
    expect(penumbraArea).toBeGreaterThan(umbraArea);
  });

  it('returns empty result for degenerate soft shadow input', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const result = computeSoftShadowEnvelopeWithHoles([], undefined, angles, 10, 0);
    expect(result.umbra).toEqual([]);
    expect(result.penumbra).toEqual([]);
  });

  it('penumbra fully contains the umbra footprint at the ground contact corners (hBottom=0)', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const { umbra, penumbra } = computeSoftShadowEnvelopeWithHoles(rect, undefined, angles, 10, 0);
    const insetCorners = [
      { x: 0.1, y: 0.1 },
      { x: 9.9, y: 0.1 },
      { x: 9.9, y: 9.9 },
      { x: 0.1, y: 9.9 },
    ];
    for (const v of insetCorners) {
      expect(umbra.some((p) => isPointInPolygon(v, p.outer))).toBe(true);
      expect(penumbra.some((p) => isPointInPolygon(v, p.outer))).toBe(true);
    }
  });

  it('generates distinct (non-identical) umbra and penumbra for a building with a hole (donut modifier)', () => {
    // Regresja: bug polegał na kolizji klucza cache dla ścieżki z dziurami, przez co
    // penumbra była identyczna z umbrą (zero widocznego półcienia) dla budynków typu "donut".
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const outer = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    const hole = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ];

    const { umbra, penumbra } = computeSoftShadowEnvelopeWithHoles(outer, [hole], angles, 10, 0);
    expect(umbra.length).toBeGreaterThan(0);
    expect(penumbra.length).toBeGreaterThan(0);

    const area = (poly: { x: number; y: number }[]) => Math.abs(calculateSignedArea(poly));
    const pwhArea = (pwh: { outer: { x: number; y: number }[]; holes?: { x: number; y: number }[][] }) => {
      let a = area(pwh.outer);
      if (pwh.holes) for (const h of pwh.holes) a -= area(h);
      return Math.max(0, a);
    };
    const umbraArea = umbra.reduce((sum, p) => sum + pwhArea(p), 0);
    const penumbraArea = penumbra.reduce((sum, p) => sum + pwhArea(p), 0);
    expect(penumbraArea).toBeGreaterThan(umbraArea);
  });

  describe('computeStoryShadowPolygonWithHoles', () => {
    const area = (poly: { x: number; y: number }[]) => Math.abs(calculateSignedArea(poly));
    const pwhArea = (pwh: { outer: { x: number; y: number }[]; holes?: { x: number; y: number }[][] }) => {
      let a = area(pwh.outer);
      if (pwh.holes) {
        for (const h of pwh.holes) {
          a -= area(h);
        }
      }
      return Math.max(0, a);
    };
    const totalAreaPwh = (polys: { outer: { x: number; y: number }[]; holes?: { x: number; y: number }[][] }[]) =>
      polys.reduce((sum, p) => sum + pwhArea(p), 0);

    const outer = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    const hole = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ];

    it('produces a smaller shadow area than the solid-outer shadow (the hole actually removes material)', () => {
      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
      const solidShadow = computeStoryShadowPolygon(outer, angles, 5, 0);
      const ringShadow = computeStoryShadowPolygonWithHoles(outer, [hole], angles, 5, 0);

      expect(totalAreaPwh(ringShadow)).toBeLessThan(area(solidShadow));
    });

    it('matches the analytical outer-minus-aperture area exactly', () => {
      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
      const outerShadow = computeStoryShadowPolygon(outer, angles, 5, 0);
      const ringShadow = computeStoryShadowPolygonWithHoles(outer, [hole], angles, 5, 0);

      const topOffset = computeShadowOffsetVector(5, angles);
      const shiftedHole = hole.map((p) => ({ x: p.x + topOffset.dx, y: p.y + topOffset.dy }));
      const [expectedAperture] = intersectionPolygonLoops([hole], [shiftedHole]);
      const expectedApertureArea = expectedAperture ? area(expectedAperture) : 0;

      expect(totalAreaPwh(ringShadow)).toBeCloseTo(area(outerShadow) - expectedApertureArea, 1);
    });

    it('shades the southern part of the courtyard and illuminates the northern part without leaks', () => {
      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
      // Przy hTop = 5m, długość cienia wynosi ok. 6.25m.
      // Ściana południowa (y=5) rzuca cień do y ≈ 11.25m w dziedzińcu o wymiarze y ∈ [5, 15].
      const ringShadow = computeStoryShadowPolygonWithHoles(outer, [hole], angles, 5, 0);

      // Punkt w południowej części dziedzińca (x=10, y=7 < 11.25) leży W CIENIU:
      const southCourtyardPoint = { x: 10, y: 7 };
      // Punkt w północnej części dziedzińca (x=10, y=14 > 11.25) pod otworem nieba jest OŚWIETLONY (poza cieniem):
      const northCourtyardPoint = { x: 10, y: 14 };
      // Punkt na zewnątrz za ścianą północną (x=10, y=22) leży w litym cieniu ściany północnej (brak prześwitów):
      const northOutsidePoint = { x: 10, y: 22 };

      expect(isPointInPolygonWithHoles(southCourtyardPoint, ringShadow)).toBe(true);
      expect(isPointInPolygonWithHoles(northCourtyardPoint, ringShadow)).toBe(false);
      expect(isPointInPolygonWithHoles(northOutsidePoint, ringShadow)).toBe(true);
    });

    it('returns the solid shadow unchanged when there are no holes', () => {
      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
      const solidShadow = computeStoryShadowPolygon(outer, angles, 10, 0);
      const noHolesResult = computeStoryShadowPolygonWithHoles(outer, undefined, angles, 10, 0);
      expect(totalAreaPwh(noHolesResult)).toBeCloseTo(area(solidShadow), 6);
    });
  });

  describe('inner terrace self-shadow (reference/shadow-test2.json scenario: donut + story_offset)', () => {
    const building: BuildingLoop = {
      id: 'inner-terrace',
      name: 'inner-terrace',
      layer: 'BUD_NOWY',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      category: 'building',
      elevation: 0,
      firstFloorHeight: 3,
      typicalFloorHeight: 3,
      defaultHeight: 15,
      hWindowBottom: 0.85,
      vertices: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ],
      segments: [],
      modifiers: [createDefaultDonutModifier(), createDefaultStoryOffsetModifier()],
    } as unknown as BuildingLoop;

    const result = applyBuildingModifiers(building);
    const buildingWithStories = { ...building, storyPolygons: result.storyPolygons };
    const tiers = extractBuildingStoryTiers(buildingWithStories as BuildingLoop);

    it('sanity: story_offset also retreats the inner (hole) wall, growing the courtyard on the top story', () => {
      const mergedTier = tiers.find((t) => t.hBottom === 0);
      const topTier = tiers[tiers.length - 1];
      expect(mergedTier?.holes?.[0]).toBeTruthy();
      expect(topTier.holes?.[0]).toBeTruthy();
      const holeArea = (poly: { x: number; y: number }[]) => Math.abs(calculateSignedArea(poly));
      expect(holeArea(topTier.holes![0])).toBeGreaterThan(holeArea(mergedTier!.holes![0]));
    });

    it('self-shadow of the top story onto the merged tier does not cover the entire inner terrace', () => {
      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
      const mergedTier = tiers.find((t) => t.hBottom === 0)!;
      const topTier = tiers[tiers.length - 1];
      const deltaHTop = topTier.hTop - mergedTier.hTop;
      const deltaHBase = Math.max(0, topTier.hBottom - mergedTier.hTop);

      const shadowWithHoles = computeStoryShadowPolygonWithHoles(topTier.polygon, topTier.holes, angles, deltaHTop, deltaHBase);
      const shadowSolidBuggy = [computeStoryShadowPolygon(topTier.polygon, angles, deltaHTop, deltaHBase)];

      const maxYSmall = Math.max(...mergedTier.holes![0].map((q) => q.y));
      const maxYBig = Math.max(...topTier.holes![0].map((q) => q.y));
      const xs = mergedTier.holes![0].map((q) => q.x);
      const terracePoint = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (maxYSmall + maxYBig) / 2 };

      const insideBiggerHole = isPointInPolygon(terracePoint, topTier.holes![0]);
      const insideSmallerHole = isPointInPolygon(terracePoint, mergedTier.holes![0]);
      expect(insideBiggerHole).toBe(true);
      expect(insideSmallerHole).toBe(false);

      const shadowedByBuggyVersion = shadowSolidBuggy.some((p) => isPointInPolygon(terracePoint, p));
      const shadowedByFixedVersion = isPointInPolygonWithHoles(terracePoint, shadowWithHoles);

      expect(shadowedByBuggyVersion).toBe(true);
      expect(shadowedByFixedVersion).toBe(false);
    });
  });

  describe('donut courtyard ground shadow in Masterplan (reference/shadow-test3.json scenario)', () => {
    it('does not fill the entire courtyard with ground shadow at noon equinox', () => {
      const bldg: BuildingLoop = {
        id: 'donut-bldg',
        name: 'donut-bldg',
        layer: 'BUD_NOWY',
        isTested: true,
        isCityCentre: false,
        buildingType: 'residential',
        category: 'building',
        elevation: 0,
        firstFloorHeight: 3,
        typicalFloorHeight: 3,
        defaultHeight: 15,
        hWindowBottom: 0.85,
        vertices: [
          { x: -17.66, y: 51.40 },
          { x: -17.66, y: -3.51 },
          { x: -73.63, y: -3.51 },
          { x: -73.63, y: 51.40 },
        ],
        segments: [],
        modifiers: [createDefaultDonutModifier(), createDefaultStoryOffsetModifier()],
      } as unknown as BuildingLoop;

      const result = applyBuildingModifiers(bldg);
      const buildingWithStories = { ...bldg, storyPolygons: result.storyPolygons };
      const tiers = extractBuildingStoryTiers(buildingWithStories as BuildingLoop);

      const samples = [
        { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
      ];

      const shadowResult = getCachedGroundShadowSamples(
        'legacy',
        tiers,
        samples,
        52.23,
        21.01,
        'spring',
        12.0
      );

      expect(shadowResult.algorithm).toBe('legacy');
      if (shadowResult.algorithm === 'legacy') {
        const pwhList = shadowResult.samples[0].polys;
        // Dziedziniec rozciąga się w x ∈ [-61.63, -29.66], y ∈ [8.48, 39.40].
        const midX = (-61.63 - 29.66) / 2; // -45.65m

        const isCoveredByShadow = (pt: Point2D): boolean => {
          for (const pwh of pwhList) {
            if (isPointInPolygon(pt, pwh.outer)) {
              const inHole = pwh.holes?.some((h) => isPointInPolygon(pt, h)) ?? false;
              if (!inHole) return true;
            }
          }
          return false;
        };

        // Ściana południowa dziedzińca (y=8.48) o wysokości 15m rzuca cień do y ≈ 27.2m.
        // Południowa część dziedzińca (y=15 < 27.2m) leży w cieniu rzucanym przez ścianę południową:
        const southCourtyardPt = { x: midX, y: 15.0 };
        expect(isCoveredByShadow(southCourtyardPt)).toBe(true);

        // Północna część dziedzińca (y=34 > 27.2m) jest bezpośrednio oświetlona promieniami słońca:
        const northCourtyardPt = { x: midX, y: 34.0 };
        expect(isCoveredByShadow(northCourtyardPt)).toBe(false);
      }
    });
  });
});

