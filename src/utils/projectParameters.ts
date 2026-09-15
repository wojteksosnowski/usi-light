import polygonClipping from 'polygon-clipping';
import { BuildingLoop, Point2D } from '../types/geometry';
import { computePolygonArea } from './math2d/polygons';
import { computePolygonIntersectionWithBoundaries } from './math2d/boundaryIntersection';
import { calculateBuildingFloors } from './buildingFloorCalculator';

export interface SingleBuildingMetrics {
  id: string;
  name: string;
  buildingType: 'residential' | 'service' | 'garage';
  storeysCount: number;
  height: number;
  elevation: number;
  pz: number;            // Powierzchnia zabudowy parteru (m²) - bez nadwieszeń
  pcNadz: number;        // Powierzchnia całkowita nadziemna (m²)
  pcPodz: number;        // Powierzchnia całkowita podziemna (m²)
  pc: number;            // Powierzchnia całkowita łączna (m²)
  volume: number;        // Kubatura brutto (m³)
  pum: number;           // Powierzchnia użytkowa mieszkalna (~70% Pc dla mieszkalnych)
  pu: number;            // Powierzchnia użytkowa usługowa (~70% Pc dla usług)
  pumiu: number;         // Łącznie PUM + PU
  parkingPlaces: number; // Liczba miejsc postojowych dla garaży (1 mp / 32.5 m² Pc)
}

export interface ProjectParametersResult {
  testedCount: number;
  totalPz: number;                 // Powierzchnia zabudowy najniższej kondygnacji (m²)
  totalPcNadz: number;             // Pc nadziemna (m²)
  totalPcPodz: number;             // Pc podziemna (m²)
  totalPc: number;                 // Pc łączna (m²)
  totalVolume: number;             // Kubatura brutto (m³)
  totalPUM: number;                // PUM (~70% mieszk.)
  totalPU: number;                 // PU (~70% usług.)
  totalPUMiU: number;              // Łącznie PUM + PU
  totalParkingPlaces: number;      // Liczba miejsc postojowych
  plotArea: number;                // Powierzchnia działki Pdz (m²)
  plotCoverageRatio: number;       // Wskaźnik powierzchni zabudowy (%)
  intensityAboveground: number;    // I_nadz
  intensityUnderground: number;    // I_podz
  intensityTotal: number;          // I_całk
  buildingFootprintOnPlot: number; // Powierzchnia zabudowy parterów na działce (m²)
  garagePlotFootprintArea: number; // Powierzchnia rzutu garaży na działce (m²)
  pavedPlotFootprintArea: number;  // Powierzchnia utwardzona na działce (m²)
  totalCoveredAreaOnPlot: number;  // Łączna powierzchnia zajęta (Union Pz + Garaże + Utwardzenia)
  nativeGroundArea: number;        // Grunt rodzimy poza Pz, garażem i utwardzeniem (m²)
  nativeGroundRatio: number;       // % powierzchni działki
}

/**
 * Zwraca obrys najniższej kondygnacji nadziemnej / parteru dla wyznaczenia powierzchni zabudowy (Pz).
 * Zgodnie z PN-ISO 9836 nie wlicza się nadwieszeń z wyższych kondygnacji.
 */
export function getBuildingGroundFloorFootprint(bldg: BuildingLoop): { polygon: Point2D[]; holes: Point2D[][] } {
  if (bldg.storyPolygons && bldg.storyPolygons.length > 0) {
    const elev = bldg.elevation ?? 0;
    // Szukamy kondygnacji parteru (najniższa kondygnacja o hTop > elev lub storyIndex 0)
    const validStories = bldg.storyPolygons.filter(
      (s) => s.polygon && s.polygon.length >= 3 && s.hTop > elev
    );

    const groundStory =
      validStories.length > 0
        ? validStories.sort((a, b) => a.hBottom - b.hBottom)[0]
        : bldg.storyPolygons.find((s) => s.storyIndex === 0) || bldg.storyPolygons[0];

    if (groundStory && groundStory.polygon && groundStory.polygon.length >= 3) {
      return {
        polygon: groundStory.polygon,
        holes: groundStory.holes ?? [],
      };
    }
  }

  return {
    polygon: bldg.vertices || [],
    holes: bldg.holes ?? [],
  };
}

/**
 * Wylicza parametry geometryczno-powierzchniowe dla pojedynczego obiektu.
 */
export function calculateSingleBuildingMetrics(
  bldg: BuildingLoop,
  activePlotBoundaries: Array<{ vertices: Point2D[] }> = []
): SingleBuildingMetrics {
  const groundFootprint = getBuildingGroundFloorFootprint(bldg);
  const rawGroundArea =
    groundFootprint.polygon.length >= 3
      ? Math.max(
          0,
          computePolygonArea(groundFootprint.polygon) -
            groundFootprint.holes.reduce((sum, h) => sum + computePolygonArea(h), 0)
        )
      : 0;

  const pz =
    activePlotBoundaries.length > 0 && groundFootprint.polygon.length >= 3
      ? computePolygonIntersectionWithBoundaries(groundFootprint.polygon, activePlotBoundaries)
      : rawGroundArea;

  const bType = bldg.buildingType || 'residential';
  const elev = bldg.elevation ?? 0;
  const totalH = Math.max(0.5, bldg.defaultHeight || 15.0);

  let pcNadz = 0;
  let pcPodz = 0;
  let storeysCount = 1;

  if (bldg.storyPolygons && bldg.storyPolygons.length > 0) {
    storeysCount = bldg.storyPolygons.length;
    for (const story of bldg.storyPolygons) {
      if (!story.polygon || story.polygon.length < 3) continue;
      const rawStoryArea = computePolygonArea(story.polygon);
      const holesArea = (story.holes ?? []).reduce((sum, h) => sum + computePolygonArea(h), 0);
      const netStoryArea = Math.max(0, rawStoryArea - holesArea);

      const storyArea =
        activePlotBoundaries.length > 0
          ? computePolygonIntersectionWithBoundaries(story.polygon, activePlotBoundaries)
          : netStoryArea;

      if (story.hTop <= 0 || (story.hBottom < 0 && story.hTop <= 0.01)) {
        pcPodz += storyArea;
      } else {
        pcNadz += storyArea;
      }
    }
  } else {
    const floorCalc = calculateBuildingFloors(
      totalH,
      bldg.firstFloorHeight,
      bldg.typicalFloorHeight,
      elev,
      bldg.storeysCount
    );
    storeysCount = floorCalc.storeysCount;

    if (bType === 'garage' && elev + totalH <= 0.01) {
      pcPodz = pz * storeysCount;
      pcNadz = 0;
    } else if (elev < 0) {
      for (const interval of floorCalc.intervals) {
        if (interval.hTop <= 0) {
          pcPodz += pz;
        } else {
          pcNadz += pz;
        }
      }
    } else {
      pcNadz = pz * storeysCount;
      pcPodz = 0;
    }
  }

  const pc = pcNadz + pcPodz;
  const volume = pz * totalH;

  let pum = 0;
  let pu = 0;
  let parkingPlaces = 0;

  if (bType === 'residential') {
    pum = pcNadz * 0.70;
  } else if (bType === 'service') {
    pu = pcNadz * 0.70;
  } else if (bType === 'garage') {
    parkingPlaces = pc / 32.5;
  }

  const pumiu = pum + pu;

  return {
    id: bldg.id,
    name: bldg.name,
    buildingType: bType,
    storeysCount,
    height: totalH,
    elevation: elev,
    pz,
    pcNadz,
    pcPodz,
    pc,
    volume,
    pum,
    pu,
    pumiu,
    parkingPlaces,
  };
}

/**
 * Pomocnicza funkcja licząca pole przecięcia unii wielokątów z działkami.
 */
function computeUnionIntersectionArea(
  inputPolygons: Point2D[][],
  boundaryPolygons: Point2D[][]
): number {
  if (inputPolygons.length === 0 || boundaryPolygons.length === 0) {
    return 0;
  }

  try {
    const subjectPolys: [number, number][][][] = [];
    for (const poly of inputPolygons) {
      if (!poly || poly.length < 3) continue;
      const ring: [number, number][] = poly.map((p) => [p.x, p.y]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      subjectPolys.push([ring]);
    }

    if (subjectPolys.length === 0) return 0;

    const subjectUnion =
      subjectPolys.length === 1
        ? subjectPolys[0]
        : polygonClipping.union(subjectPolys[0], ...subjectPolys.slice(1));

    const clipPolys: [number, number][][][] = [];
    for (const bVerts of boundaryPolygons) {
      if (!bVerts || bVerts.length < 3) continue;
      const ring: [number, number][] = bVerts.map((p) => [p.x, p.y]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      clipPolys.push([ring]);
    }

    if (clipPolys.length === 0) return 0;

    const boundariesUnion =
      clipPolys.length === 1
        ? clipPolys[0]
        : polygonClipping.union(clipPolys[0], ...clipPolys.slice(1));

    const intersection = polygonClipping.intersection(subjectUnion, boundariesUnion);

    let totalArea = 0;
    for (const polygon of intersection) {
      if (!Array.isArray(polygon) || polygon.length === 0) continue;
      const outerRing = polygon[0];
      totalArea += computePolygonArea(outerRing.map(([x, y]) => ({ x, y })));

      for (let i = 1; i < polygon.length; i++) {
        const holeRing = polygon[i];
        totalArea -= computePolygonArea(holeRing.map(([x, y]) => ({ x, y })));
      }
    }

    return Math.max(0, totalArea);
  } catch {
    return 0;
  }
}

/**
 * Oblicza sumaryczną powierzchnię rzutu garaży leżącą na terenie działek badanych.
 */
export function computeGaragePlotFootprintArea(
  garageBuildings: BuildingLoop[],
  activePlotBoundaries: Array<{ vertices: Point2D[] }>
): number {
  const garagePolys = garageBuildings
    .filter((b) => b.vertices && b.vertices.length >= 3 && b.category !== 'boundary' && b.isIncluded !== false)
    .map((b) => b.vertices);

  const boundaryPolys = activePlotBoundaries
    .filter((b) => b.vertices && b.vertices.length >= 3)
    .map((b) => b.vertices);

  return computeUnionIntersectionArea(garagePolys, boundaryPolys);
}

/**
 * Oblicza pełne zestawienie wskaźników projektu wraz ze ścisłą Pz, utwardzeniami i gruntem rodzimym.
 */
export function calculateProjectTotals(
  buildings: BuildingLoop[],
  activePlotBoundaries: Array<{ vertices: Point2D[] }> = []
): ProjectParametersResult {
  const testedBuildings = buildings.filter(
    (b) => b.isTested && b.category !== 'boundary' && b.isIncluded !== false && b.vertices && b.vertices.length >= 3
  );

  const pavedAreas = buildings.filter(
    (b) => b.category === 'boundary' && b.areaType === 'paved' && b.isIncluded !== false && b.vertices && b.vertices.length >= 3
  );

  const plotBoundaries = activePlotBoundaries.filter(
    (b) => (!('areaType' in b) || (b as any).areaType === 'plot' || !(b as any).areaType) && b.vertices && b.vertices.length >= 3
  );

  const boundaryPolys = (plotBoundaries.length > 0 ? plotBoundaries : activePlotBoundaries)
    .filter((b) => b.vertices && b.vertices.length >= 3)
    .map((b) => b.vertices);

  const plotArea = (plotBoundaries.length > 0 ? plotBoundaries : activePlotBoundaries).reduce(
    (sum, b) => sum + (b.vertices && b.vertices.length >= 3 ? computePolygonArea(b.vertices) : 0),
    0
  );

  let totalPz = 0;
  let totalPcNadz = 0;
  let totalPcPodz = 0;
  let totalVolume = 0;
  let totalPUM = 0;
  let totalPU = 0;
  let totalParkingPlaces = 0;

  const groundFloorPolys: Point2D[][] = [];
  const garagePolys: Point2D[][] = [];
  const pavedPolys: Point2D[][] = pavedAreas.map((p) => p.vertices);

  for (const b of testedBuildings) {
    const m = calculateSingleBuildingMetrics(b, activePlotBoundaries);
    totalPz += m.pz;
    totalPcNadz += m.pcNadz;
    totalPcPodz += m.pcPodz;
    totalVolume += m.volume;
    totalPUM += m.pum;
    totalPU += m.pu;
    totalParkingPlaces += m.parkingPlaces;

    const groundFootprint = getBuildingGroundFloorFootprint(b);
    if (groundFootprint.polygon.length >= 3 && b.buildingType !== 'garage') {
      groundFloorPolys.push(groundFootprint.polygon);
    }

    if (b.buildingType === 'garage' || (b.elevation ?? 0) < 0) {
      garagePolys.push(b.vertices);
    }
  }

  const totalPc = totalPcNadz + totalPcPodz;
  const totalPUMiU = totalPUM + totalPU;

  const plotCoverageRatio = plotArea > 0 ? (totalPz / plotArea) * 100 : 0;
  const intensityAboveground = plotArea > 0 ? totalPcNadz / plotArea : 0;
  const intensityUnderground = plotArea > 0 ? totalPcPodz / plotArea : 0;
  const intensityTotal = plotArea > 0 ? totalPc / plotArea : 0;

  const buildingFootprintOnPlot = computeUnionIntersectionArea(groundFloorPolys, boundaryPolys);
  const garagePlotFootprintArea = computeUnionIntersectionArea(garagePolys, boundaryPolys);
  const pavedPlotFootprintArea = computeUnionIntersectionArea(pavedPolys, boundaryPolys);

  // Łączna powierzchnia zajęta (Union: Pz parterów, Garaże, Powierzchnie utwardzone)
  const allCoveredPolys = [...groundFloorPolys, ...garagePolys, ...pavedPolys];
  const totalCoveredAreaOnPlot = computeUnionIntersectionArea(allCoveredPolys, boundaryPolys);

  const nativeGroundArea = plotArea > 0 ? Math.max(0, plotArea - totalCoveredAreaOnPlot) : 0;
  const nativeGroundRatio = plotArea > 0 ? (nativeGroundArea / plotArea) * 100 : 0;

  return {
    testedCount: testedBuildings.length,
    totalPz,
    totalPcNadz,
    totalPcPodz,
    totalPc,
    totalVolume,
    totalPUM,
    totalPU,
    totalPUMiU,
    totalParkingPlaces,
    plotArea,
    plotCoverageRatio,
    intensityAboveground,
    intensityUnderground,
    intensityTotal,
    buildingFootprintOnPlot,
    garagePlotFootprintArea,
    pavedPlotFootprintArea,
    totalCoveredAreaOnPlot,
    nativeGroundArea,
    nativeGroundRatio,
  };
}
