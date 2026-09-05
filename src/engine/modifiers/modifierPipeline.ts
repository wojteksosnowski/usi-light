import { BuildingLoop, FacadeSegment, Point2D } from '../../types/geometry';
import { BayWindowModifier, Modifier, StoryFootprint, StoryOffsetModifier, ZoneFootprint, ZoneOffsetModifier } from '../../types/modifiers';
import { miterOffsetPolygon } from '../../utils/math2d/miterOffset';
import { isPolygonCCW } from '../../utils/math2d/polygons';
import { calculateOutwardNormal } from '../../utils/math2d/vec2';
import { computeLineEquation } from '../../utils/segmentStatistics';
import { calculateBuildingFloors } from '../../utils/buildingFloorCalculator';

export interface ModifierPipelineResult {
  storyPolygons: StoryFootprint[];
  zonePolygons: ZoneFootprint[];
  segments: FacadeSegment[];
}

/**
 * Generuje wierzchołki strefy (obszaru) na podstawie bazowego obrysu i modyfikatora 'zone_offset'
 */
export function generateZonePolygon(vertices: Point2D[], distance: number): Point2D[] {
  if (!vertices || vertices.length < 3 || Math.abs(distance) < 1e-4) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }
  return miterOffsetPolygon(vertices, distance);
}

/**
 * Generuje wielokąt z dodanym wykuszem (Bay Window) na wybranej krawędzi wielokąta
 */
export function generateBayWindowPolygon(
  vertices: Point2D[],
  width: number,
  projection: number,
  targetEdgeIndex?: number,
  sideAngle: number = 45,
  positionRatio: number = 0.5
): Point2D[] {
  if (!vertices || vertices.length < 3 || Math.abs(projection) < 1e-4 || width <= 1e-3) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }

  const n = vertices.length;
  const isCCW = isPolygonCCW(vertices);

  // Wybierz krawędź docelową (wskazaną lub domyślnie najdłuższą)
  let bestEdgeIdx = 0;
  let maxEdgeLen = 0;

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (len > maxEdgeLen) {
      maxEdgeLen = len;
      bestEdgeIdx = i;
    }
  }

  const edgeIdx = targetEdgeIndex !== undefined && targetEdgeIndex >= 0 && targetEdgeIndex < n
    ? targetEdgeIndex
    : bestEdgeIdx;

  const p1 = vertices[edgeIdx];
  const p2 = vertices[(edgeIdx + 1) % n];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const edgeLen = Math.hypot(dx, dy);

  if (edgeLen < 1e-4) {
    return vertices.map((p) => ({ ...p }));
  }

  // Wektor jednostkowy wzdłuż krawędzi u = (ux, uy)
  const ux = dx / edgeLen;
  const uy = dy / edgeLen;

  // Normalna jednostkowa skierowana na zewnątrz
  const normal = calculateOutwardNormal(p1, p2, isCCW);
  const nx = normal.x;
  const ny = normal.y;

  // Obliczenie wcięcia bocznego (sideInset) w zależności od kąta nachylenia boków (90, 60, 45, 30)
  // Kąt 90: boki prostopadłe do ściany (prostokąt), sideInset = 0
  // Kąt < 90: sideInset = |projection| / tan(kąt w radianach)
  let sideInset = 0;
  if (sideAngle < 89.9) {
    const angleRad = (Math.max(15, Math.min(89, sideAngle)) * Math.PI) / 180;
    sideInset = Math.abs(projection) / Math.tan(angleRad);
  }

  // Całkowita podstawa wykuszu na krawędzi = szerokość czoła + 2 * sideInset
  // Upewniamy się, że podstawa mieści się na krawędzi (max 95% długości)
  let effWidth = width;
  let totalBaseLen = effWidth + 2 * sideInset;
  if (totalBaseLen > edgeLen * 0.95) {
    const scaleFactor = (edgeLen * 0.95) / totalBaseLen;
    effWidth *= scaleFactor;
    sideInset *= scaleFactor;
    totalBaseLen = effWidth + 2 * sideInset;
  }

  // Dostępny margines do przesuwania wzdłuż krawędzi
  const availMargin = Math.max(0, edgeLen - totalBaseLen);
  const clampedPosRatio = Math.max(0, Math.min(1, positionRatio ?? 0.5));
  const startMargin = availMargin * clampedPosRatio;

  // Punkty podziału na krawędzi bazowej
  const b1: Point2D = {
    x: p1.x + ux * startMargin,
    y: p1.y + uy * startMargin,
  };
  const b2: Point2D = {
    x: p1.x + ux * (startMargin + totalBaseLen),
    y: p1.y + uy * (startMargin + totalBaseLen),
  };

  // Punkty wysunięcia czoła wykuszu
  const w1: Point2D = {
    x: b1.x + nx * projection + ux * sideInset,
    y: b1.y + ny * projection + uy * sideInset,
  };
  const w2: Point2D = {
    x: b2.x + nx * projection - ux * sideInset,
    y: b2.y + ny * projection - uy * sideInset,
  };

  // Zbuduj nowy wielokąt wstawiając punkty wykuszu w miejsce krawędzi edgeIdx -> edgeIdx + 1
  const result: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    result.push({ ...vertices[i] });
    if (i === edgeIdx) {
      result.push(b1);
      result.push(w1);
      result.push(w2);
      result.push(b2);
    }
  }

  return result;
}


/**
 * Oblicza liczbę kondygnacji oraz wysokości spodu i wierzchu dla każdej kondygnacji
 */
export function computeStoryHeightIntervals(building: BuildingLoop): { hBottom: number; hTop: number }[] {
  const elevation = building.elevation ?? 0.0;
  const totalHeight = building.defaultHeight || 15.0;
  const firstH = building.firstFloorHeight ?? 3.5;
  const typicalH = building.typicalFloorHeight ?? 3.0;

  const floorCalc = calculateBuildingFloors(totalHeight, firstH, typicalH, elevation, building.storeysCount);
  return floorCalc.intervals.map((iv) => ({
    hBottom: iv.hBottom,
    hTop: iv.hTop,
  }));
}

/**
 * Główny potok przetwarzania modyfikatorów na budynku:
 * 1. Inicjalizuje obrysy kondygnacji (story footprints 0..K-1) z geometrii bazowej
 * 2. Nakłada po kolei aktywne modyfikatory ze stosu
 * 3. Ekstrahuje pionowe krawędzie ścian i scala współliniowe odcinki w segmenty [Hbase, Htotal]
 */
export function applyBuildingModifiers(building: BuildingLoop): ModifierPipelineResult {
  const baseVertices = building.vertices || [];
  if (baseVertices.length < 3) {
    return { storyPolygons: [], zonePolygons: [], segments: building.segments || [] };
  }

  const heightIntervals = computeStoryHeightIntervals(building);
  const K = heightIntervals.length;

  // 1. Inicjalizacja obrysów kondygnacji
  const storyFootprints: StoryFootprint[] = heightIntervals.map((interval, idx) => ({
    storyIndex: idx,
    hBottom: interval.hBottom,
    hTop: interval.hTop,
    polygon: baseVertices.map((p) => ({ ...p })),
  }));

  const activeModifiers = (building.modifiers || []).filter((m) => m.enabled);
  const zoneFootprints: ZoneFootprint[] = [];

  // 2. Aplikacja modyfikatorów
  for (const modifier of activeModifiers) {
    if (modifier.type === 'story_offset') {
      const { distance, storiesCount } = modifier as StoryOffsetModifier;
      if (Math.abs(distance) < 1e-4) continue;

      // Wyznaczenie zakresu kondygnacji
      let startIdx = 0;
      let endIdx = K - 1;

      if (storiesCount < 0) {
        // N kondygnacji od góry: np. -1 => [K-1, K-1], -2 => [K-2, K-1]
        const n = Math.abs(storiesCount);
        startIdx = Math.max(0, K - n);
        endIdx = K - 1;
      } else if (storiesCount > 0) {
        // N kondygnacji od dołu: np. +1 => [0, 0], +2 => [0, 1]
        startIdx = 0;
        endIdx = Math.min(K - 1, storiesCount - 1);
      }

      for (let s = startIdx; s <= endIdx; s++) {
        storyFootprints[s].polygon = miterOffsetPolygon(storyFootprints[s].polygon, distance);
      }
    } else if (modifier.type === 'zone_offset') {
      const zoneMod = modifier as ZoneOffsetModifier;
      const poly = generateZonePolygon(baseVertices, zoneMod.distance);
      if (poly && poly.length >= 3) {
        zoneFootprints.push({
          id: zoneMod.id,
          areaType: zoneMod.areaType || 'plot',
          distance: zoneMod.distance,
          polygon: poly,
        });
      }
    } else if (modifier.type === 'bay_window') {
      const bayMod = modifier as BayWindowModifier;
      const { width, projection, storiesCount, edgeIndex, sideAngle, positionRatio } = bayMod;
      if (Math.abs(projection) < 1e-4 || width <= 1e-3) continue;

      let startIdx = 0;
      let endIdx = K - 1;

      if (storiesCount < 0) {
        const n = Math.abs(storiesCount);
        startIdx = Math.max(0, K - n);
        endIdx = K - 1;
      } else if (storiesCount > 0) {
        startIdx = 0;
        endIdx = Math.min(K - 1, storiesCount - 1);
      } else {
        // storiesCount === 0 => cała wysokość budynku / obszar
        startIdx = 0;
        endIdx = K - 1;
      }

      for (let s = startIdx; s <= endIdx; s++) {
        storyFootprints[s].polygon = generateBayWindowPolygon(
          storyFootprints[s].polygon,
          width,
          projection,
          edgeIndex,
          sideAngle ?? 45,
          positionRatio ?? 0.5
        );
      }
    }
  }

  // 3. Ekstrakcja krawędzi pionowych ścian i scalanie w pionie
  interface RawEdge {
    p1: Point2D;
    p2: Point2D;
    hBottom: number;
    hTop: number;
    storyIndex: number;
  }

  const rawEdges: RawEdge[] = [];

  storyFootprints.forEach((sf) => {
    const poly = sf.polygon;
    const m = poly.length;
    for (let j = 0; j < m; j++) {
      rawEdges.push({
        p1: poly[j],
        p2: poly[(j + 1) % m],
        hBottom: sf.hBottom,
        hTop: sf.hTop,
        storyIndex: sf.storyIndex,
      });
    }
  });

  // Scalanie identycznych krawędzi (te same p1 i p2 w granicach tolerancji)
  interface MergedSegment {
    p1: Point2D;
    p2: Point2D;
    hBase: number;
    hTop: number;
  }

  const merged: MergedSegment[] = [];
  const TOL = 0.005; // 5mm tolerancja geometrii

  for (const edge of rawEdges) {
    const existing = merged.find(
      (m) =>
        Math.hypot(m.p1.x - edge.p1.x, m.p1.y - edge.p1.y) < TOL &&
        Math.hypot(m.p2.x - edge.p2.x, m.p2.y - edge.p2.y) < TOL
    );

    if (existing) {
      existing.hBase = Math.min(existing.hBase, edge.hBottom);
      existing.hTop = Math.max(existing.hTop, edge.hTop);
    } else {
      merged.push({
        p1: { ...edge.p1 },
        p2: { ...edge.p2 },
        hBase: edge.hBottom,
        hTop: edge.hTop,
      });
    }
  }

  // Tworzenie obiektów FacadeSegment
  const segments: FacadeSegment[] = merged.map((m, idx) => {
    const isCCW = isPolygonCCW(storyFootprints[0].polygon);
    const normal = calculateOutwardNormal(m.p1, m.p2, isCCW);
    const len = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y);

    return {
      id: `${building.id}_seg_${idx + 1}`,
      p1: m.p1,
      p2: m.p2,
      normal,
      length: len,
      angleRad: Math.atan2(m.p2.y - m.p1.y, m.p2.x - m.p1.x),
      hTop: m.hTop,
      hBase: m.hBase,
      hWindowBottom: building.hWindowBottom ?? 0.85,
      isCityCentre: building.isCityCentre ?? false,
      buildingType: building.buildingType ?? 'residential',
      lineEquation: computeLineEquation(m.p1, m.p2, normal),
    };
  });

  // Sortuj segmenty od najniższego Htop do najwyższego
  segments.sort((a, b) => a.hTop - b.hTop);

  return {
    storyPolygons: storyFootprints,
    zonePolygons: zoneFootprints,
    segments,
  };
}
