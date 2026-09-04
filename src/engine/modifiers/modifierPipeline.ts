import { BuildingLoop, FacadeSegment, Point2D } from '../../types/geometry';
import { Modifier, StoryFootprint, StoryOffsetModifier } from '../../types/modifiers';
import { miterOffsetPolygon } from '../../utils/math2d/miterOffset';
import { isPolygonCCW } from '../../utils/math2d/polygons';
import { calculateOutwardNormal } from '../../utils/math2d/vec2';
import { computeLineEquation } from '../../utils/segmentStatistics';

export interface ModifierPipelineResult {
  storyPolygons: StoryFootprint[];
  segments: FacadeSegment[];
}

/**
 * Oblicza liczbę kondygnacji oraz wysokości spodu i wierzchu dla każdej kondygnacji
 */
export function computeStoryHeightIntervals(building: BuildingLoop): { hBottom: number; hTop: number }[] {
  const elevation = building.elevation ?? 0.0;
  const totalHeight = building.defaultHeight || 15.0;
  const firstH = building.firstFloorHeight ?? 3.5;
  const typicalH = building.typicalFloorHeight ?? 3.0;

  let count = building.storeysCount;
  if (!count || count <= 0) {
    if (totalHeight <= firstH) {
      count = 1;
    } else {
      count = 1 + Math.max(1, Math.round((totalHeight - firstH) / typicalH));
    }
  }

  const intervals: { hBottom: number; hTop: number }[] = [];
  let currentBottom = elevation;

  for (let i = 0; i < count; i++) {
    const isFirst = i === 0;
    const isLast = i === count - 1;
    const storyH = isFirst ? firstH : typicalH;
    let nextTop = currentBottom + storyH;

    if (isLast) {
      nextTop = elevation + totalHeight;
    }

    intervals.push({
      hBottom: currentBottom,
      hTop: Math.max(currentBottom + 0.1, nextTop),
    });

    currentBottom = nextTop;
  }

  return intervals;
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
    return { storyPolygons: [], segments: building.segments || [] };
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

  return {
    storyPolygons: storyFootprints,
    segments,
  };
}
