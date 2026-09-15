import { describe, it, expect } from 'vitest';
import { BuildingLoop } from '../types/geometry';
import {
  calculateSingleBuildingMetrics,
  calculateProjectTotals,
  computeGaragePlotFootprintArea,
} from './projectParameters';

function createRectBuilding(
  id: string,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  overrides: Partial<BuildingLoop> = {}
): BuildingLoop {
  return {
    id,
    name,
    layer: 'default',
    isTested: true,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 15,
    elevation: 0,
    firstFloorHeight: 3.0,
    typicalFloorHeight: 3.0,
    storeysCount: 5,
    hWindowBottom: 0.85,
    vertices: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    ...overrides,
  };
}

describe('Project Parameters Utility', () => {
  const boundary = {
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ], // 10 000 m² plot
  };

  it('calculates PUM for residential buildings with 0.7 ratio and PUMiU = PUM', () => {
    // 20m x 10m = 200 m² Pz, 5 storeys -> 1000 m² Pc
    const resBldg = createRectBuilding('b1', 'Mieszkalny 1', 10, 10, 20, 10, {
      buildingType: 'residential',
      defaultHeight: 15,
      storeysCount: 5,
    });

    const metrics = calculateSingleBuildingMetrics(resBldg, [boundary]);
    expect(metrics.pz).toBe(200);
    expect(metrics.pc).toBe(1000);
    expect(metrics.pcNadz).toBe(1000);
    expect(metrics.pcPodz).toBe(0);
    expect(metrics.pum).toBe(700); // 1000 * 0.70
    expect(metrics.pu).toBe(0);
    expect(metrics.pumiu).toBe(700);
    expect(metrics.parkingPlaces).toBe(0);
  });

  it('calculates PU for service buildings with 0.7 ratio and PUMiU = PU', () => {
    // 10m x 10m = 100 m² Pz, 4 storeys -> 400 m² Pc
    const srvBldg = createRectBuilding('b2', 'Usługowy 1', 40, 10, 10, 10, {
      buildingType: 'service',
      defaultHeight: 12,
      storeysCount: 4,
    });

    const metrics = calculateSingleBuildingMetrics(srvBldg, [boundary]);
    expect(metrics.pz).toBe(100);
    expect(metrics.pc).toBe(400);
    expect(metrics.pum).toBe(0);
    expect(metrics.pu).toBe(280); // 400 * 0.70
    expect(metrics.pumiu).toBe(280);
    expect(metrics.parkingPlaces).toBe(0);
  });

  it('calculates parking places for garages using 1 place / 32.5 m² ratio', () => {
    // 50m x 20m = 1000 m² Pz, 1 storey underground (-3m) -> 1000 m² Pc
    const garageBldg = createRectBuilding('g1', 'Garaż Podziemny', 10, 40, 50, 20, {
      buildingType: 'garage',
      defaultHeight: 3,
      elevation: -3,
      storeysCount: 1,
    });

    const metrics = calculateSingleBuildingMetrics(garageBldg, [boundary]);
    expect(metrics.pz).toBe(1000);
    expect(metrics.pcPodz).toBe(1000);
    expect(metrics.pcNadz).toBe(0);
    expect(metrics.pum).toBe(0);
    expect(metrics.pu).toBe(0);
    expect(metrics.pumiu).toBe(0);
    expect(metrics.parkingPlaces).toBeCloseTo(1000 / 32.5, 2); // ~30.77 mp
  });

  it('calculates project totals with PUM + PU = PUMiU, above/underground intensity and native ground', () => {
    const resBldg = createRectBuilding('b1', 'Mieszkalny 1', 10, 10, 20, 10, {
      buildingType: 'residential',
      storeysCount: 5,
    }); // Pz=200, Pc=1000 (nadz), PUM=700

    const srvBldg = createRectBuilding('b2', 'Usługowy 1', 40, 10, 10, 10, {
      buildingType: 'service',
      storeysCount: 4,
    }); // Pz=100, Pc=400 (nadz), PU=280

    const garageBldg = createRectBuilding('g1', 'Garaż Podziemny', 0, 0, 50, 40, {
      buildingType: 'garage',
      defaultHeight: 3,
      elevation: -3,
      storeysCount: 2,
    }); // Pz=2000 m², Pc=4000 m² (podz), parking=4000/32.5 = 123.07 mp

    const totals = calculateProjectTotals([resBldg, srvBldg, garageBldg], [boundary]);

    expect(totals.testedCount).toBe(3);
    expect(totals.plotArea).toBe(10000);
    expect(totals.totalPz).toBe(2300); // 200 + 100 + 2000
    expect(totals.totalPcNadz).toBe(1400); // 1000 + 400
    expect(totals.totalPcPodz).toBe(4000); // 4000
    expect(totals.totalPc).toBe(5400);
    expect(totals.totalPUM).toBe(700);
    expect(totals.totalPU).toBe(280);
    expect(totals.totalPUMiU).toBe(980);
    expect(totals.totalParkingPlaces).toBeCloseTo(4000 / 32.5, 2);

    // Intensywności
    expect(totals.intensityAboveground).toBeCloseTo(1400 / 10000, 4); // 0.14
    expect(totals.intensityUnderground).toBeCloseTo(4000 / 10000, 4); // 0.40
    expect(totals.intensityTotal).toBeCloseTo(5400 / 10000, 4); // 0.54

    // Grunt rodzimy: działka 10000 m² - rzut garażu 2000 m² - Pz parterów 300 m² (200 + 100 leżące wewnątrz garażu/poza)
    // Budynki mieszkalny i usługowy leżą w (10,10..30,20) i (40,10..50,20), które leżą W CAŁOŚCI wewnątrz garażu (0,0..50,40)
    // Geometric union: garage (2000 m²) covers both buildings completely -> total covered = 2000 m²
    // Grunt rodzimy = 10000 - 2000 = 8000 m²
    expect(totals.garagePlotFootprintArea).toBe(2000);
    expect(totals.nativeGroundArea).toBe(8000);
    expect(totals.nativeGroundRatio).toBe(80);
  });

  it('calculates Pz strictly from ground floor and ignores upper story overhangs', () => {
    // Ground floor story: 10m x 10m (100 m²), Upper floor story: 15m x 10m (150 m², 5m overhang)
    const buildingWithOverhang: BuildingLoop = {
      ...createRectBuilding('b_overhang', 'Budynek z nadwieszeniem', 0, 0, 10, 10, {
        defaultHeight: 6,
        storeysCount: 2,
      }),
      storyPolygons: [
        {
          storyIndex: 0,
          hBottom: 0,
          hTop: 3,
          polygon: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ], // 100 m²
        },
        {
          storyIndex: 1,
          hBottom: 3,
          hTop: 6,
          polygon: [
            { x: 0, y: 0 },
            { x: 15, y: 0 }, // 5m overhang
            { x: 15, y: 10 },
            { x: 0, y: 10 },
          ], // 150 m²
        },
      ],
    };

    const metrics = calculateSingleBuildingMetrics(buildingWithOverhang, [boundary]);
    expect(metrics.pz).toBe(100); // Only ground floor (100 m²), NOT 150 m²
    expect(metrics.pcNadz).toBe(250); // 100 + 150
    expect(metrics.pum).toBe(250 * 0.7); // 175 m²
  });

  it('deducts paved areas (areaType=paved), Pz, and garages from native ground', () => {
    // Plot: 100 x 100 = 10 000 m²
    // Building ground floor: (10, 10) to (30, 20) = 20 x 10 = 200 m²
    const bldg = createRectBuilding('b1', 'Budynek', 10, 10, 20, 10);

    // Paved area (e.g. road / parking): (40, 10) to (60, 20) = 20 x 10 = 200 m²
    const pavedArea = createRectBuilding('paved_1', 'Droga wewnętrzna', 40, 10, 20, 10, {
      category: 'boundary',
      areaType: 'paved',
      defaultHeight: 0,
      storeysCount: 0,
    });

    const totals = calculateProjectTotals([bldg, pavedArea], [boundary]);
    expect(totals.plotArea).toBe(10000);
    expect(totals.totalPz).toBe(200);
    expect(totals.pavedPlotFootprintArea).toBe(200);
    expect(totals.totalCoveredAreaOnPlot).toBe(400); // 200 Pz + 200 Utwardzenie
    expect(totals.nativeGroundArea).toBe(9600); // 10000 - 400
    expect(totals.nativeGroundRatio).toBe(96);
  });

  it('ensures paved area is NOT counted as plot area (Pdz) and correctly reduces native ground', () => {
    // Scene with 1 Plot (1000 m²) and 1 Paved area (250 m²)
    const plot = createRectBuilding('plot_1', 'Działka 1', 0, 0, 50, 20, {
      category: 'boundary',
      areaType: 'plot',
      defaultHeight: 0,
      storeysCount: 0,
    });

    const paved = createRectBuilding('paved_1', 'Plac utwardzony', 10, 5, 25, 10, {
      category: 'boundary',
      areaType: 'paved',
      defaultHeight: 0,
      storeysCount: 0,
    });

    // Even if both boundary objects were passed to activePlotBoundaries, calculateProjectTotals filters to plot
    const totals = calculateProjectTotals([paved], [plot, paved]);
    expect(totals.plotArea).toBe(1000); // NOT 1250 m²!
    expect(totals.pavedPlotFootprintArea).toBe(250);
    expect(totals.totalCoveredAreaOnPlot).toBe(250);
    expect(totals.nativeGroundArea).toBe(750); // 1000 - 250 = 750 m²
    expect(totals.nativeGroundRatio).toBe(75); // 75%
  });
});


