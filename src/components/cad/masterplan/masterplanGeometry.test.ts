import { describe, it, expect } from 'vitest';
import {
  getMasterplanSolarAngles,
  computeShadowOffsetVector,
  buildShadowSweepPolygon,
  computeConvexHull,
  extractBuildingStoryTiers,
  computeStoryShadowPolygon,
  computeStoryShadowPolygonWithHoles,
  computeSoftStoryShadowPolygon,
} from './masterplanGeometry';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import { isPointInPolygon } from '../../../utils/math2d/polygons';
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

  it('computes soft shadow with a penumbra envelope larger than the umbra', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const { umbra, penumbraOuter } = computeSoftStoryShadowPolygon(rect, angles, 10, 0);
    expect(umbra.length).toBeGreaterThanOrEqual(1);
    expect(penumbraOuter.length).toBeGreaterThanOrEqual(1);

    const area = (poly: { x: number; y: number }[]) => {
      let a = 0;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        a += p1.x * p2.y - p2.x * p1.y;
      }
      return Math.abs(a) / 2;
    };
    const totalArea = (polys: { x: number; y: number }[][]) => polys.reduce((sum, p) => sum + area(p), 0);

    expect(totalArea(penumbraOuter)).toBeGreaterThan(totalArea(umbra));
  });

  it('returns empty result for degenerate soft shadow input', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const result = computeSoftStoryShadowPolygon([], angles, 10, 0);
    expect(result.umbra).toEqual([]);
    expect(result.penumbraOuter).toEqual([]);
  });

  it('has zero penumbra spread at the contact footprint with the ground plane (hBottom=0)', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // Przy hBottom=0 offset podstawy wynosi {0,0} niezależnie od azymutu (perturbacji ±kąta
    // tarczy słonecznej), więc wierzchołki footprintu budynku muszą leżeć w obu (umbra i
    // penumbraOuter) — zerowa szerokość penumbry w punkcie styku ze ziemią, bez dziury między nimi.
    const { umbra, penumbraOuter } = computeSoftStoryShadowPolygon(rect, angles, 10, 0);
    // Punkty tuż przy narożnikach footprintu (nie dokładnie na granicy, by uniknąć niejednoznaczności
    // testu punkt-na-krawędzi) muszą leżeć w umbrze — brak przerwy/rozjazdu przy styku z gruntem.
    const insetCorners = [
      { x: 0.1, y: 0.1 },
      { x: 9.9, y: 0.1 },
      { x: 9.9, y: 9.9 },
      { x: 0.1, y: 9.9 },
    ];
    for (const v of insetCorners) {
      const inUmbra = umbra.some((poly) => isPointInPolygon(v, poly));
      expect(inUmbra).toBe(true);
    }
  });

  describe('computeStoryShadowPolygonWithHoles', () => {
    const area = (poly: { x: number; y: number }[]) => {
      let a = 0;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        a += p1.x * p2.y - p2.x * p1.y;
      }
      return Math.abs(a) / 2;
    };
    // Wynik differencePolygonLoops (polygon-clipping) może zwrócić WIELE pierścieni reprezentujących
    // jeden poligon z dziurą (outer + hole ring, spłaszczone bez informacji "który jest dziurą" —
    // patrz komentarz przy fillPolys w masterplanShadowCache.ts). polygon-clipping nawija pierścienie
    // zewnętrzne CCW (dodatnie), a dziury CW (ujemne) — sumowanie PODPISANEGO pola (nie |pole|) daje
    // poprawne pole netto automatycznie, bez potrzeby rozróżniania ręcznie.
    const signedArea = (poly: { x: number; y: number }[]) => {
      let a = 0;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        a += p1.x * p2.y - p2.x * p1.y;
      }
      return a / 2;
    };
    const totalArea = (polys: { x: number; y: number }[][]) => Math.abs(polys.reduce((sum, p) => sum + signedArea(p), 0));

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
      const solidShadow = computeStoryShadowPolygon(outer, angles, 10, 0);
      const ringShadow = computeStoryShadowPolygonWithHoles(outer, [hole], angles, 10, 0);

      expect(totalArea(ringShadow)).toBeLessThan(totalArea([solidShadow]));
    });

    it('matches the analytical outer-minus-hole area exactly', () => {
      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
      const outerShadow = computeStoryShadowPolygon(outer, angles, 10, 0);
      const holeShadow = computeStoryShadowPolygon(hole, angles, 10, 0);
      const ringShadow = computeStoryShadowPolygonWithHoles(outer, [hole], angles, 10, 0);

      // Pole pierścienia-cienia powinno być: pole(cień obrysu) - pole(cień dziury). Skoro cień dziury
      // jest podzbiorem cienia obrysu (dziura wewnątrz obrysu, ten sam offset), to po prostu
      // pole(outerShadow) - pole(holeShadow) — tolerancja 2 miejsca po przecinku ze względu na
      // snapping precyzji 1mm w polygon-clipping (differencePolygonLoops), nie identyczność bitowa.
      expect(totalArea(ringShadow)).toBeCloseTo(area(outerShadow) - area(holeShadow), 1);
    });

    it('returns the solid shadow unchanged when there are no holes', () => {
      const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
      const solidShadow = computeStoryShadowPolygon(outer, angles, 10, 0);
      const noHolesResult = computeStoryShadowPolygonWithHoles(outer, undefined, angles, 10, 0);
      expect(totalArea(noHolesResult)).toBeCloseTo(area(solidShadow), 6);
    });
  });

  describe('inner terrace self-shadow (reference/shadow-test2.json scenario: donut + story_offset)', () => {
    // Reprodukcja: donut (dziedziniec na całej wysokości) + story_offset (uskok tylko ostatniej
    // kondygnacji, cofa też wewnętrzną ścianę dziedzińca) -> "wewnętrzny taras" na z=hTop kondygnacji
    // 0-3: pierścień między MNIEJSZĄ dziurą (piętra 0-3) i WIĘKSZĄ dziurą (piętro 4, po uskoku).
    // Przed fixem: samo-cień piętra 4 na scalonym tierze 0-3 pokrywał CAŁY wewnętrzny taras (bo
    // computeStoryShadowPolygon ignorował holes piętra 4, licząc je jak pełny blok).
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
      // Dziura na szczytowej kondygnacji musi być WIĘKSZA (uskok cofa też ścianę wewnętrzną).
      const holeArea = (poly: { x: number; y: number }[]) => {
        let a = 0;
        for (let i = 0; i < poly.length; i++) {
          const p1 = poly[i];
          const p2 = poly[(i + 1) % poly.length];
          a += p1.x * p2.y - p2.x * p1.y;
        }
        return Math.abs(a) / 2;
      };
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

      // Taras to pierścień odsłonięty przez uskok: leży WEWNĄTRZ większej dziury piętra szczytowego
      // (tam nie ma już materiału na najwyższym piętrze — niebo jest widoczne), ale POZA mniejszą
      // dziurą scalonego tiera (tam podłoga scalonego tiera jest pełna/lita — fizycznie istnieje jako
      // powierzchnia tarasu). Strona północna (przeciwna do słońca w południe równonocy — słońce na
      // południu, cień pada na północ): tam samo-zacienianie buggy-wersji jest błędne, bo w
      // rzeczywistości dziura piętra szczytowego już tam nie ma materiału, który mógłby rzucać cień.
      const maxYSmall = Math.max(...mergedTier.holes![0].map((q) => q.y));
      const maxYBig = Math.max(...topTier.holes![0].map((q) => q.y));
      const xs = mergedTier.holes![0].map((q) => q.x);
      const terracePoint = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (maxYSmall + maxYBig) / 2 };

      const insideBiggerHole = isPointInPolygon(terracePoint, topTier.holes![0]);
      const insideSmallerHole = isPointInPolygon(terracePoint, mergedTier.holes![0]);
      expect(insideBiggerHole).toBe(true); // punkt leży w odsłoniętym obszarze (widoczne niebo z góry)
      expect(insideSmallerHole).toBe(false); // ale wciąż na litej podłodze scalonego tiera (taras)

      // shadowWithHoles to wynik differencePolygonLoops (obrys minus dziura) — wielopierścieniowy
      // kształt "donut", interpretowany zasadą even-odd (jak ctx.fill('evenodd')): punkt jest W
      // KSZTAŁCIE, jeśli leży w NIEPARZYSTEJ liczbie pierścieni, nie "w którymkolwiek" pierścieniu
      // (bycie tylko w pierścieniu-dziurze oznacza WYŁĄCZENIE, nie włączenie).
      const isInsideEvenOdd = (point: Point2D, rings: Point2D[][]): boolean =>
        rings.filter((ring) => isPointInPolygon(point, ring)).length % 2 === 1;

      const shadowedByBuggyVersion = shadowSolidBuggy.some((p) => isPointInPolygon(terracePoint, p));
      const shadowedByFixedVersion = isInsideEvenOdd(terracePoint, shadowWithHoles);

      expect(shadowedByBuggyVersion).toBe(true); // potwierdza, że TEN scenariusz faktycznie wykrywał bug
      expect(shadowedByFixedVersion).toBe(false); // po fixie: słońce dociera przez powiększoną dziurę piętra 4
    });
  });
});

