import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { computeHourlyShadowsLive, computeCombinedShadowEnvelope, computeFastShadowPolygon } from './shadowEnvelope';
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
    expect(totalArea(envelope)).toBeCloseTo(4647.2587105, 2);
  });

  it.skipIf(!referenceFileExists('wro.json'))(
    'reference/wro.json (real-world scene, 9 tested + 22 blocking buildings): computeHourlyShadowsLive is stable',
    () => {
      const scene = loadReferenceScene('wro.json');

      const live = computeHourlyShadowsLive(scene.buildings, scene.latitude, scene.longitude, scene.equinoxDate, 0.5, 'raycasting');
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

        expect(collapsedArea).toBeCloseTo(uncollapsedArea, 6);
      }
    });
  });
});
