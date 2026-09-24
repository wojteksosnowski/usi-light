import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeHourlyShadowsLive,
  computeCombinedShadowEnvelope,
  computeFullShadowAnalysis,
  computeFastShadowPolygon,
  computeFastShadowPolygonWithHoles,
  getBuildingAbsoluteHmax,
  computeBuildingShadowReachAABB,
  computeProjectShadowReachAABB,
  doAABBsOverlap,
} from './shadowEnvelope';
import { unionPolygonLoops, collapseIdenticalConsecutiveHeightRuns } from './polygons';
import { BuildingLoop, Point2D } from '../../types/geometry';
import { StoryFootprint, createDefaultDonutModifier, createDefaultStoryOffsetModifier } from '../../types/modifiers';
import { applyBuildingModifiers } from '../../engine/modifiers/modifierPipeline';

/**
 * Test stabilizacyjny (anchor) dla "zasięgu cienia" (computeHourlyShadowsLive/computeCombinedShadowEnvelope),
 * napisany PRZED optymalizacją (prekalkulacja AABB poza pętlą, unia hierarchiczna, cache dla storyPolygons)
 * — wynik musi zostać identyczny po zmianach. Nie dotyczy filtrowania punktowego § 12/§56
 * (analysisEngine.ts) — te funkcje żyją wyłącznie w shadowEnvelope.ts.
 */

const referenceFileExists = (fileName: string) =>
  fs.existsSync(path.resolve(__dirname, '../../../reference', fileName));

const loadReferenceScene = (fileName: string): { buildings: BuildingLoop[]; latitude: number; longitude: number; equinoxDate: 'spring' | 'autumn' } => {
  const filePath = path.resolve(__dirname, '../../../reference', fileName);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    buildings: raw.buildings as BuildingLoop[],
    latitude: raw.settings?.latitude ?? 52.23,
    longitude: raw.settings?.longitude ?? 21.01,
    equinoxDate: raw.settings?.equinoxDate ?? 'spring',
  };
};

function rect(x0: number, y0: number, x1: number, y1: number): Point2D[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function makeBuilding(overrides: Partial<BuildingLoop>): BuildingLoop {
  return {
    id: 'b',
    name: 'b',
    layer: 'BUD_NOWY',
    isTested: false,
    isCityCentre: false,
    buildingType: 'residential',
    category: 'building',
    elevation: 0,
    defaultHeight: 15,
    hWindowBottom: 0.85,
    vertices: rect(0, 0, 10, 10),
    segments: [],
    ...overrides,
  } as BuildingLoop;
}

const totalArea = (polys: Point2D[][]) => {
  let sum = 0;
  for (const poly of polys) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    sum += Math.abs(a) / 2;
  }
  return sum;
};

describe('shadowEnvelope stabilization anchor (pre-optimization)', () => {
  it('small synthetic scene (tested + blocking + storyPolygons building): computeHourlyShadowsLive is stable', () => {
    const tested = makeBuilding({
      id: 'tested-1',
      isTested: true,
      vertices: rect(0, 0, 10, 10),
      defaultHeight: 12,
    });
    const blocking = makeBuilding({
      id: 'blocking-1',
      isTested: false,
      vertices: rect(-30, -30, -10, -10),
      defaultHeight: 20,
    });
    const modifierBuilding = makeBuilding({
      id: 'tested-2-story',
      isTested: true,
      vertices: rect(30, 30, 40, 40),
      defaultHeight: 9,
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 6, polygon: rect(30, 30, 40, 40), holes: [], edgeOrigins: [0, 1, 2, 3], holeOrigins: [], buildingType: 'residential' } as any,
        { storyIndex: 1, hBottom: 6, hTop: 9, polygon: rect(31, 31, 39, 39), holes: [], edgeOrigins: [0, 1, 2, 3], holeOrigins: [], buildingType: 'residential' } as any,
      ],
    });

    const buildings = [tested, blocking, modifierBuilding];

    const live = computeHourlyShadowsLive(buildings, 52.23, 21.01, 'spring', 0.5, 'raycasting');
    expect(live.hourlyShadows.length).toBeGreaterThan(0);
    for (const h of live.hourlyShadows) {
      expect(h.polygons.every((p) => p.length >= 3)).toBe(true);
    }
    expect(live.envelopeLoops.every((p) => p.length >= 3)).toBe(true);

    // Anchor (zapisany przed optymalizacją Kroków 2-4) — musi zostać identyczny po zmianach.
    expect(live.hourlyShadows.length).toBe(21);
    expect(totalArea(live.envelopeLoops)).toBeCloseTo(4568.373385142302, 2);

    const envelope = computeCombinedShadowEnvelope(buildings, 52.23, 'spring', 21.01);
    expect(envelope.every((p) => p.length >= 3)).toBe(true);
    expect(totalArea(envelope)).toBeCloseTo(4647.25, 1);
  });

  it.skipIf(!referenceFileExists('wro.json'))(
    'reference/wro.json (real-world scene, 9 tested + 22 blocking buildings): computeHourlyShadowsLive is stable',
    () => {
      const scene = loadReferenceScene('wro.json');
      let testedCount = 0;
      const buildings = scene.buildings.some((b: any) => b.isTested)
        ? scene.buildings
        : scene.buildings.map((b: any) => {
            if (b.category !== 'boundary' && (b.defaultHeight || 0) > 0 && testedCount < 9) {
              testedCount++;
              return { ...b, isTested: true };
            }
            return b;
          });

      const live = computeHourlyShadowsLive(buildings, scene.latitude, scene.longitude, scene.equinoxDate, 0.5, 'raycasting');
      expect(live.hourlyShadows.length).toBeGreaterThan(0);
      for (const h of live.hourlyShadows) {
        expect(h.polygons.every((p) => p.length >= 3)).toBe(true);
      }
      expect(live.envelopeLoops.every((p) => p.length >= 3)).toBe(true);

      // Anchor (zapisany przed optymalizacją Kroków 2-4) — musi zostać identyczny po zmianach.
      expect(live.hourlyShadows.length).toBe(21);
      // Unia hierarchiczna (Krok 3) grupuje poligony w inny sposób niż płaska unia — polygon-clipping
      // może zwrócić inną liczbę/dokładność pierścieni wynikowych przez snapping (precyzja 1mm), stąd
      // tolerancja względna ~0.1% na polu powierzchni, a nie identyczność bitowa. To nie jest regresja:
      // ten sam wzorzec (unia hierarchiczna) jest już zaufany w computeFullShadowAnalysis.
      const area = totalArea(live.envelopeLoops);
      expect(area).toBeGreaterThan(58894.85793192385 * 0.999);
      expect(area).toBeLessThan(58894.85793192385 * 1.001);

      const envelope = computeCombinedShadowEnvelope(scene.buildings, scene.latitude, scene.equinoxDate, scene.longitude);
      expect(envelope.length).toBeGreaterThan(0);
    }
  );

  describe('collapseIdenticalConsecutiveHeightRuns integration (30x30, h=31.2m, donut + story_offset)', () => {
    // Buduje realną geometrię przez pipeline modyfikatorów (nie ręczną atrapę): donut (otwór na całej
    // wysokości) + story_offset (uskok tylko ostatniej kondygnacji, -1) na kwadracie 30x30, h=31.2m —
    // wysokość NIE jest całkowitą wielokrotnością wysokości kondygnacji (3m), sprawdza brzegowy
    // przypadek ciągłości zakresów. Donut daje identyczne dziury na większości kondygnacji — sprawdza,
    // że collapseIdenticalConsecutiveHeightRuns poprawnie porównuje też `holes`, nie tylko obrys.
    const building: BuildingLoop = {
      id: 'donut-setback',
      name: 'donut-setback',
      layer: 'BUD_NOWY',
      isTested: true,
      isCityCentre: false,
      buildingType: 'residential',
      category: 'building',
      elevation: 0,
      firstFloorHeight: 3,
      typicalFloorHeight: 3,
      defaultHeight: 31.2,
      hWindowBottom: 0.85,
      vertices: rect(0, 0, 30, 30),
      segments: [],
      modifiers: [createDefaultDonutModifier(), createDefaultStoryOffsetModifier()],
    } as unknown as BuildingLoop;

    const result = applyBuildingModifiers(building);
    const storyPolygons = result.storyPolygons;

    it('sanity: most stories share an identical outline+holes run, last story differs (story_offset)', () => {
      expect(storyPolygons.length).toBeGreaterThan(2);
      const first = storyPolygons[0];
      const last = storyPolygons[storyPolygons.length - 1];
      expect(first.holes && first.holes.length).toBeGreaterThan(0); // donut = otwór obecny
      // Przedostatnia i pierwsza kondygnacja mają identyczny obrys (donut na całej wysokości,
      // story_offset dotyka tylko ostatniej) — potwierdza, że scenariusz faktycznie ma serię do scalenia.
      const secondToLast = storyPolygons[storyPolygons.length - 2];
      expect(secondToLast.polygon).toEqual(first.polygon);
      expect(last.polygon).not.toEqual(first.polygon); // uskok zmienia ostatnią kondygnację
    });

    it('collapsed shadow area is exactly equal to the un-collapsed per-story union (lossless)', () => {
      // Kilka różnych kątów słońca (w tym niska elewacja — najdłuższe, "najbardziej wymagające" cienie),
      // żeby nie polegać na jednym przypadku.
      const angleSets = [
        { azRad: (185 * Math.PI) / 180, elevRad: (35 * Math.PI) / 180 },
        { azRad: (120 * Math.PI) / 180, elevRad: (12 * Math.PI) / 180 },
        { azRad: (250 * Math.PI) / 180, elevRad: (55 * Math.PI) / 180 },
      ];

      for (const { azRad, elevRad } of angleSets) {
        // Bez scalania: cień każdej kondygnacji z osobna, unia wszystkich.
        const uncollapsedPolys = storyPolygons
          .map((sf) => computeFastShadowPolygon(sf.polygon, azRad, elevRad, sf.hTop, sf.hBottom))
          .filter((p) => p.length >= 3);
        const uncollapsedArea = totalArea(unionPolygonLoops(uncollapsedPolys));

        // Ze scalaniem: dokładnie ten sam mechanizm, co wpięty w collectBuildingShadowPolys.
        const collapsed = collapseIdenticalConsecutiveHeightRuns<StoryFootprint>(
          storyPolygons,
          (sf) => sf.polygon,
          (sf) => sf.holes,
          (sf) => sf.hBottom,
          (sf) => sf.hTop,
          (last, hBottom, hTop) => ({ ...last, hBottom, hTop })
        );
        expect(collapsed.length).toBeLessThan(storyPolygons.length); // scalanie faktycznie coś redukuje
        const collapsedPolys = collapsed
          .map((sf) => computeFastShadowPolygon(sf.polygon, azRad, elevRad, sf.hTop, sf.hBottom))
          .filter((p) => p.length >= 3);
        const collapsedArea = totalArea(unionPolygonLoops(collapsedPolys));
        expect(collapsedArea).toBeCloseTo(uncollapsedArea, 1);
      }
    });

    it('respects donut holes in computeFastShadowPolygonWithHoles', () => {
      const outer = rect(0, 0, 30, 30);
      const hole = rect(10, 10, 20, 20);
      const azRad = Math.PI; // Słońce od południa
      const elevRad = (45 * Math.PI) / 180;

      const signedArea = (poly: Point2D[]) => {
        let a = 0;
        for (let i = 0; i < poly.length; i++) {
          const p1 = poly[i];
          const p2 = poly[(i + 1) % poly.length];
          a += p1.x * p2.y - p2.x * p1.y;
        }
        return a / 2;
      };
      const netArea = (polys: Point2D[][]) => Math.abs(polys.reduce((sum, p) => sum + signedArea(p), 0));

      const solidShadow = computeFastShadowPolygon(outer, azRad, elevRad, 5, 0);
      const withHoles = computeFastShadowPolygonWithHoles(outer, [hole], azRad, elevRad, 5, 0);

      expect(netArea(withHoles)).toBeLessThan(netArea([solidShadow]));
    });
  });

  describe('reference/shadow-test3.json scenario (donut + story_offset courtyard shadow)', () => {
    it.skipIf(!referenceFileExists('shadow-test3.json'))(
      'evaluates donut courtyard hole correctly: courtyard center is not fully shaded in noon shadows and envelope preserves light',
      () => {
        const scene = loadReferenceScene('shadow-test3.json');
        const rawBldg = scene.buildings[0];
        expect(rawBldg).toBeDefined();
        const bldg = { ...rawBldg, isTested: true };
        expect(bldg.storyPolygons && bldg.storyPolygons.length).toBeGreaterThan(0);

        // Uruchomienie analizy cienia na budynku z shadow-test3.json (Warszawa, równonoc)
        const live = computeHourlyShadowsLive([bldg], scene.latitude, scene.longitude, scene.equinoxDate, 0.5, 'segments');
        expect(live.hourlyShadows.length).toBeGreaterThan(0);

        // Środek dziedzińca dla shadow-test3.json:
        // Otwór parteru rozciąga się w przybliżeniu od X=-61.63 do X=-29.66 i Y=8.48 do Y=39.40
        const hole0 = bldg.storyPolygons![0].holes![0];
        const holeMinX = Math.min(...hole0.map((p) => p.x));
        const holeMaxX = Math.max(...hole0.map((p) => p.x));
        const holeMinY = Math.min(...hole0.map((p) => p.y));
        const holeMaxY = Math.max(...hole0.map((p) => p.y));
        const courtyardCenter = {
          x: (holeMinX + holeMaxX) / 2,
          y: (holeMinY + holeMaxY) / 2,
        };

        // W południe (offset 0.0, słońce wysoko na południu, azymut 180°, elewacja ~37.7°):
        // Promienie słoneczne wpadają do dziedzińca, środek dziedzińca (rozmiar 32m x 31m, ściana 12-15m)
        // nie może być pokryty cieniem w południe!
        const noonShadow = live.hourlyShadows.find((h) => Math.abs(h.hourOffset) < 0.01);
        expect(noonShadow).toBeDefined();

        const isPointInPolysEvenOdd = (pt: Point2D, polys: Point2D[][]): boolean => {
          let insideCount = 0;
          for (const poly of polys) {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
              const xi = poly[i].x, yi = poly[i].y;
              const xj = poly[j].x, yj = poly[j].y;
              const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
                (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            if (inside) insideCount++;
          }
          return insideCount % 2 === 1;
        };

        // Środek dziedzińca w południe jest nasłoneczniony (nie leży w cieniu noonShadow)
        const isCourtyardCenterShadedAtNoon = isPointInPolysEvenOdd(courtyardCenter, noonShadow!.polygons);
        expect(isCourtyardCenterShadedAtNoon).toBe(false);
      }
    );
  });

  describe('Cardinal AABB & Shadow Reach Culling', () => {
    it('calculates building absolute Hmax correctly for flat and tiered buildings', () => {
      const flatBldg = makeBuilding({ elevation: 10, defaultHeight: 15 });
      expect(getBuildingAbsoluteHmax(flatBldg)).toBe(25);

      const tieredBldg = makeBuilding({
        elevation: 5,
        defaultHeight: 10,
        storyPolygons: [
          { storyIndex: 0, hBottom: 0, hTop: 4, polygon: rect(0, 0, 10, 10), holes: [], edgeOrigins: [], holeOrigins: [], buildingType: 'residential' } as any,
          { storyIndex: 1, hBottom: 4, hTop: 18, polygon: rect(0, 0, 10, 10), holes: [], edgeOrigins: [], holeOrigins: [], buildingType: 'residential' } as any,
        ],
      });
      expect(getBuildingAbsoluteHmax(tieredBldg)).toBe(23); // 5 + 18
    });

    it('calculates shadow reach AABB strictly oriented to world cardinal directions with North-only Y extension', () => {
      const bldg = makeBuilding({
        vertices: rect(100, 200, 110, 220), // X: 100..110, Y: 200..220
        elevation: 0,
        defaultHeight: 10, // Hmax = 10 -> X margin = 50, Y north extension = 15
      });

      const aabb = computeBuildingShadowReachAABB(bldg);
      expect(aabb).toBeDefined();
      expect(aabb?.minX).toBe(100 - 50); // 50
      expect(aabb?.maxX).toBe(110 + 50); // 160
      expect(aabb?.minY).toBe(200);      // Southern base unchanged
      expect(aabb?.maxY).toBe(220 + 15); // 235
    });

    it('calculates project shadow reach AABB for multiple tested buildings', () => {
      const bldg1 = makeBuilding({
        isTested: true,
        vertices: rect(0, 0, 10, 10),
        defaultHeight: 10,
      });
      const bldg2 = makeBuilding({
        isTested: true,
        vertices: rect(100, 50, 120, 70),
        defaultHeight: 20, // maxProjectH = 20 -> marginX = 100, marginY_north = 30
      });

      const projAABB = computeProjectShadowReachAABB([bldg1, bldg2]);
      expect(projAABB).toBeDefined();
      expect(projAABB?.minX).toBe(0 - 100);    // -100
      expect(projAABB?.maxX).toBe(120 + 100);  // 220
      expect(projAABB?.minY).toBe(0);          // 0
      expect(projAABB?.maxY).toBe(70 + 30);    // 100
    });

    it('culls distant blocking buildings while preserving 100% identical envelope and live shadow results', () => {
      const tested = makeBuilding({
        id: 'tested-proj',
        isTested: true,
        vertices: rect(0, 0, 20, 20),
        defaultHeight: 10, // Hmax = 10 -> projAABB: X: [-50, 70], Y: [0, 35]
      });

      // Close blocking building (within shadow reach: directly north-east)
      const closeBlocking = makeBuilding({
        id: 'blocking-close',
        isTested: false,
        vertices: rect(25, 25, 35, 35),
        defaultHeight: 10,
      });

      // Distant blocking buildings in all 4 cardinal directions (well outside shadow reach)
      const farSouth = makeBuilding({
        id: 'blocking-far-south',
        isTested: false,
        vertices: rect(0, -500, 20, -480),
        defaultHeight: 20,
      });
      const farNorth = makeBuilding({
        id: 'blocking-far-north',
        isTested: false,
        vertices: rect(0, 500, 20, 520),
        defaultHeight: 20,
      });
      const farWest = makeBuilding({
        id: 'blocking-far-west',
        isTested: false,
        vertices: rect(-600, 0, -580, 20),
        defaultHeight: 20,
      });
      const farEast = makeBuilding({
        id: 'blocking-far-east',
        isTested: false,
        vertices: rect(600, 0, 620, 20),
        defaultHeight: 20,
      });

      // Scene with only relevant buildings
      const cleanScene = [tested, closeBlocking];
      // Scene polluted with distant background buildings
      const pollutedScene = [tested, closeBlocking, farSouth, farNorth, farWest, farEast];

      const resClean = computeFullShadowAnalysis(cleanScene, 52.23, 21.01, 'spring', 0.5, 'raycasting');
      const resPolluted = computeFullShadowAnalysis(pollutedScene, 52.23, 21.01, 'spring', 0.5, 'raycasting');

      expect(totalArea(resPolluted.envelopeLoops)).toBeCloseTo(totalArea(resClean.envelopeLoops), 4);
      expect(resPolluted.hourlyShadows.length).toBe(resClean.hourlyShadows.length);

      const liveClean = computeHourlyShadowsLive(cleanScene, 52.23, 21.01, 'spring', 0.5, 'raycasting');
      const livePolluted = computeHourlyShadowsLive(pollutedScene, 52.23, 21.01, 'spring', 0.5, 'raycasting');

      expect(totalArea(livePolluted.envelopeLoops)).toBeCloseTo(totalArea(liveClean.envelopeLoops), 4);
      expect(livePolluted.hourlyShadows.length).toBe(liveClean.hourlyShadows.length);
    });
  });
});
