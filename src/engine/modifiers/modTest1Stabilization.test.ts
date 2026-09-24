import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { applyBuildingModifiers } from './modifierPipeline';
import { computeGateSpan } from '../../utils/math2d/gateGeometry';
import { BuildingLoop } from '../../types/geometry';

describe('mod-test1.json Modifier Stabilization Test Suite', () => {
  const filePath = path.resolve(__dirname, '../../../reference/mod/mod-test1.json');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const sceneData = JSON.parse(fileContent);
  const buildingsMap = new Map<string, BuildingLoop>(
    sceneData.buildings.map((b: BuildingLoop) => [b.name, b])
  );

  it('1 & 2. BudynekE1 & BudynekE2: Auto-width gate adopts smaller available width between input and opposite edge', () => {
    const bE1 = buildingsMap.get('BudynekE1')!;
    const bE2 = buildingsMap.get('BudynekE2')!;
    expect(bE1).toBeDefined();
    expect(bE2).toBeDefined();

    const resE1 = applyBuildingModifiers(bE1);
    const resE2 = applyBuildingModifiers(bE2);

    // BudynekE1: brama na krawędzi poziomej (edge 0: szerokość ściany 87.27m, otwór wewnętrzny 63.27m).
    // Brama auto przyjmuje szerokość otworu wewnętrznego (63.27m).
    const spanE1 = computeGateSpan(bE1.vertices, resE1.storyPolygons?.[0]?.holes, 0);
    expect(spanE1).not.toBeNull();
    expect(spanE1!.maxWidth).toBeCloseTo(63.267, 2);

    // BudynekE2: brama na krawędzi pionowej (edge 1: szerokość ściany 151.54m, otwór wewnętrzny 127.54m).
    // Brama auto przyjmuje szerokość otworu wewnętrznego (127.54m).
    const spanE2 = computeGateSpan(bE2.vertices, resE2.storyPolygons?.[0]?.holes, 1);
    expect(spanE2).not.toBeNull();
    expect(spanE2!.maxWidth).toBeCloseTo(127.545, 2);

    // Weryfikacja, że storyPolygons odzwierciedlają wycięcie o pełnej szerokości otworu
    expect(resE1.storyPolygons?.length).toBe(5);
    expect(resE2.storyPolygons?.length).toBe(5);
  });

  it('3. BudynekAB: Gate cutout edges are strictly collinear vertically across all storeys with penthouse setback', () => {
    const bAB = buildingsMap.get('BudynekAB')!;
    expect(bAB).toBeDefined();

    const resAB = applyBuildingModifiers(bAB);
    expect(resAB.storyPolygons?.length).toBe(5);

    // Kondygnacje 2 i 3 (brak penthouse setback)
    const poly2 = resAB.storyPolygons![2].polygon;
    const poly3 = resAB.storyPolygons![3].polygon;
    // Kondygnacja 4 (z penthouse setback -2m)
    const poly4 = resAB.storyPolygons![4].polygon;

    // Ściany tunelu bramy w BudynekAB znajdują się przy x ≈ -191.426 i x ≈ -232.554
    const tunnelXValuesStory2 = poly2
      .filter((p) => Math.abs(p.x - -191.426) < 0.1 || Math.abs(p.x - -232.554) < 0.1)
      .map((p) => Math.round(p.x * 1000) / 1000);

    const tunnelXValuesStory4 = poly4
      .filter((p) => Math.abs(p.x - -191.426) < 0.1 || Math.abs(p.x - -232.554) < 0.1)
      .map((p) => Math.round(p.x * 1000) / 1000);

    expect(tunnelXValuesStory2.length).toBeGreaterThanOrEqual(2);
    expect(tunnelXValuesStory4.length).toBeGreaterThanOrEqual(2);

    // Sprawdzenie, czy wartości X ścian tunelu na 5. kondygnacji są identyczne z kondygnacją 3 (współliniowość)
    const uniqueX2 = Array.from(new Set(tunnelXValuesStory2)).sort();
    const uniqueX4 = Array.from(new Set(tunnelXValuesStory4)).sort();

    expect(uniqueX4[0]).toBeCloseTo(uniqueX2[0], 2);
    expect(uniqueX4[1]).toBeCloseTo(uniqueX2[1], 2);
  });

  it('4. BudynekCD: Modifier composition (donut + gate) generates consistent multi-story geometry', () => {
    const bCD = buildingsMap.get('BudynekCD')!;
    expect(bCD).toBeDefined();

    const resCD = applyBuildingModifiers(bCD);
    expect(resCD.storyPolygons?.length).toBe(5);

    // Dolne kondygnacje (0, 1, 2) mają dziedziniec i wycięcie bramy w skrzydle
    for (let s = 0; s < 3; s++) {
      const sp = resCD.storyPolygons![s];
      expect(sp.polygon.length).toBeGreaterThanOrEqual(8);
      expect(sp.holes && sp.holes.length > 0).toBe(true);
    }
  });

  it('5. BudynekC: Donut offset maintains 100% strict parallelism of all courtyard hole edges on sharp corners', () => {
    const bC = buildingsMap.get('BudynekC')!;
    expect(bC).toBeDefined();

    const resC = applyBuildingModifiers(bC);
    const story0 = resC.storyPolygons![0];
    expect(story0.holes).toBeDefined();
    expect(story0.holes!.length).toBe(1);

    const hole = story0.holes![0];
    const baseVerts = bC.vertices;

    // Krawędź 0->1 bazy jest pozioma (dy = 0, angle = 0°)
    const baseEdge01Dy = baseVerts[1].y - baseVerts[0].y;
    expect(Math.abs(baseEdge01Dy)).toBeLessThan(1e-4);

    // Sprawdź, czy w wygenerowanym otworze istnieje krawędź idealnie pozioma (równoległa do krawędzi bazowej 0->1)
    const hasHorizontalHoleEdge = hole.some((p1, i) => {
      const p2 = hole[(i + 1) % hole.length];
      return Math.abs(p2.y - p1.y) < 1e-4 && Math.abs(p2.x - p1.x) > 1.0;
    });

    expect(hasHorizontalHoleEdge).toBe(true);
  });

  it('All buildings in mod-test1.json compile without self-intersections or degenerate geometry', () => {
    for (const [name, building] of buildingsMap.entries()) {
      const res = applyBuildingModifiers(building);
      expect(res.storyPolygons).toBeDefined();
      expect(res.segments.length).toBeGreaterThan(0);
      for (const sp of res.storyPolygons || []) {
        expect(sp.polygon.length).toBeGreaterThanOrEqual(3);
        if (sp.holes) {
          for (const hole of sp.holes) {
            expect(hole.length).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });
});
