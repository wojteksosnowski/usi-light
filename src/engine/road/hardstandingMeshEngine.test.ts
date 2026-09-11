import { describe, it, expect } from 'vitest';
import { buildHardstandingMesh, computeHardstandingAreaInPlot, filletConcaveCorners } from './hardstandingMeshEngine';
import { BuildingLoop, Point2D } from '../../types/geometry';

function makeUtwardzenie(id: string, vertices: Point2D[], cornerRadius?: number): BuildingLoop {
  return {
    id,
    name: `Utwardzenie ${id}`,
    category: 'boundary',
    areaType: 'utwardzenie',
    layer: 'Bariery',
    isTested: false,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 0,
    hWindowBottom: 0,
    vertices,
    segments: [],
    roadCornerRadius: cornerRadius,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };
}

describe('hardstandingMeshEngine', () => {
  it('returns empty mesh for no hardstanding buildings', () => {
    const result = buildHardstandingMesh([]);
    expect(result.polygons).toHaveLength(0);
    expect(result.totalArea).toBe(0);
    expect(result.sourceBuildingIds).toHaveLength(0);
  });

  it('unifies two intersecting road strips into a single polygon without internal seams', () => {
    // Droga pozioma (szerokość 5m od x=0 do x=20, y od 0 do 5)
    const road1 = makeUtwardzenie('r1', [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 5 },
      { x: 0, y: 5 },
    ], 3.0);

    // Droga pionowa dołączająca (T-skrzyżowanie, szerokość 5m od x=7.5 do x=12.5, y od 5 do 20)
    const road2 = makeUtwardzenie('r2', [
      { x: 7.5, y: 5 },
      { x: 12.5, y: 5 },
      { x: 12.5, y: 20 },
      { x: 7.5, y: 20 },
    ], 3.0);

    const result = buildHardstandingMesh([road1, road2], true);

    // Po unii powstaje jeden zunifikowany wielokąt w kształcie T
    expect(result.polygons.length).toBe(1);
    expect(result.sourceBuildingIds).toContain('r1');
    expect(result.sourceBuildingIds).toContain('r2');

    // Sprawdzamy pole: 20*5 (droga 1) + 5*15 (droga 2 powyżej y=5) = 100 + 75 = 175 m²
    // Łuki wyokrąglające narożniki wklęsłe (fillet) lekko powiększają pole (wypełniają kąt wklęsły)
    expect(result.totalArea).toBeGreaterThan(170);
    expect(result.totalArea).toBeLessThan(185);

    // Sprawdzamy liczbę wierzchołków po dodaniu łuków wyokrąglających (więcej niż 8 bazowych wierzchołków litery T)
    expect(result.polygons[0].outer.length).toBeGreaterThan(8);
  });

  it('filletConcaveCorners smooths re-entrant junction corners with arcs', () => {
    // Wielokąt w kształcie litery L z jednym kątem wklęsłym na (5, 5)
    // Kolejność CCW:
    // (0,0) -> (10,0) -> (10,5) -> (5,5) -> (5,10) -> (0,10)
    const lShape: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 }, // narożnik wklęsły
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];

    const fakeBuildings = [makeUtwardzenie('l1', lShape, 2.0)];
    const filleted = filletConcaveCorners(lShape, true, fakeBuildings, 4);

    // Oryginalnie 6 wierzchołków; po wyokrągleniu wklęsłego narożnika wstawiony zostaje łuk (kilka wierzchołków)
    expect(filleted.length).toBeGreaterThan(6);

    // Żaden z punktów łuku nie powinien być identyczny z ostrym narożnikiem (5, 5)
    const exactCorner = filleted.find((p) => Math.abs(p.x - 5) < 1e-4 && Math.abs(p.y - 5) < 1e-4);
    expect(exactCorner).toBeUndefined();
  });

  it('computes hardstanding area strictly clipped to plot boundaries', () => {
    // Droga o długości 30m i szerokości 5m (pole 150m²), od x=0 do x=30
    const road = makeUtwardzenie('r1', [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 5 },
      { x: 0, y: 5 },
    ]);

    const mesh = buildHardstandingMesh([road], true);

    // Działka inwestycyjna od x=0 do x=20, y od 0 do 20 (droga wybiega 10m poza działkę!)
    const plotBoundary = {
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
    };

    const areaInPlot = computeHardstandingAreaInPlot(mesh.polygons, [plotBoundary]);

    // Wewnątrz działki mieści się odcinek drogi 20m x 5m = 100 m²
    expect(Math.round(areaInPlot)).toBe(100);
  });

  it('filletConcaveCorners smooths concave corners of internal holes (islands) in clockwise orientation', () => {
    // Otwór w kształcie litery L (wyspa wewnętrzna) zorientowany zgodnie z ruchem wskazówek zegara (CW)
    // Współrzędne CW:
    // (0, 0) -> (0, 10) -> (5, 10) -> (5, 5) -> (10, 5) -> (10, 0)
    // Z perspektywy powierzchni drogi (otaczającej tę wyspę) narożnik na (5, 5) jest narożnikiem wklęsłym skrzyżowania
    const holeLShapeCW: Point2D[] = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 5, y: 10 },
      { x: 5, y: 5 }, // wklęsły narożnik krawężnika
      { x: 10, y: 5 },
      { x: 10, y: 0 },
    ];

    const fakeBuildings = [makeUtwardzenie('h1', holeLShapeCW, 2.0)];
    const filletedHole = filletConcaveCorners(holeLShapeCW, false, fakeBuildings, 4);

    // Po wyokrągleniu wklęsłego narożnika otworu powstaje łuk (więcej wierzchołków)
    expect(filletedHole.length).toBeGreaterThan(6);

    // Żaden wierzchołek nie powinien być ostrym narożnikiem (5, 5)
    const exactCorner = filletedHole.find((p) => Math.abs(p.x - 5) < 1e-4 && Math.abs(p.y - 5) < 1e-4);
    expect(exactCorner).toBeUndefined();
  });

  it('buildHardstandingMesh generates smoothed holes when road loop encloses an L-shaped island', () => {
    // Zbudujmy pętlę drogową złożoną z 6 segmentów utwardzeń, otaczających wyspę w kształcie L
    // Zewnętrzny obrys: od (-5, -5) do (15, 15)
    // Wewnętrzna wyspa (otwór): w kształcie L w zakresie (0,0)-(10,10)
    const seg1 = makeUtwardzenie('s1', [{ x: -5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 0 }, { x: -5, y: 0 }], 2.0);
    const seg2 = makeUtwardzenie('s2', [{ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 15 }, { x: -5, y: 15 }], 2.0);
    const seg3 = makeUtwardzenie('s3', [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 15 }, { x: 0, y: 15 }], 2.0);
    const seg4 = makeUtwardzenie('s4', [{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }, { x: 5, y: 10 }], 2.0);
    const seg5 = makeUtwardzenie('s5', [{ x: 10, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 15 }, { x: 10, y: 15 }], 2.0);

    const mesh = buildHardstandingMesh([seg1, seg2, seg3, seg4, seg5], true);
    expect(mesh.polygons.length).toBe(1);
    expect(mesh.polygons[0].holes.length).toBe(1);

    const hole = mesh.polygons[0].holes[0];
    // Otwór musi posiadać wygładzony łuk na wewnętrznym skrzyżowaniu (więcej niż 6 wierzchołków bazowego L)
    expect(hole.length).toBeGreaterThan(6);
  });
});
