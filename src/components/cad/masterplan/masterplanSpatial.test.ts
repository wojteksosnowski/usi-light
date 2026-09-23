import { describe, it, expect } from 'vitest';
import {
  clusterTiersByShadowOverlap,
  boundsOverlap,
  tierFootprintBounds,
  viewportWorldBounds,
  cullBuildingsByViewport,
  polygonsWithHolesBounds,
} from './masterplanSpatial';
import { getMasterplanSolarAngles, MasterplanStoryTier } from './masterplanGeometry';
import { BuildingLoop } from '@/types/geometry';
import { PolygonWithHoles } from '@/utils/math2d/polygons';

function makeBuilding(id: string, x: number, y: number, size = 10, defaultHeight = 10): BuildingLoop {
  return {
    id,
    defaultHeight,
    vertices: [
      { x, y },
      { x: x + size, y },
      { x: x + size, y: y + size },
      { x, y: y + size },
    ],
  } as unknown as BuildingLoop;
}

/** screenToWorld tożsamościowy (brak pan/zoom/rotacji) dla testów viewportWorldBounds. */
function identityScreenToWorld(sx: number, sy: number): { wx: number; wy: number } {
  return { wx: sx, wy: sy };
}

function makeTier(id: string, x: number, y: number, size = 10, hTop = 10): MasterplanStoryTier {
  return {
    buildingId: id,
    storyIndex: 0,
    polygon: [
      { x, y },
      { x: x + size, y },
      { x: x + size, y: y + size },
      { x, y: y + size },
    ],
    hBottom: 0,
    hTop,
    isProposed: false,
    isSelected: false,
    isHovered: false,
  };
}

describe('masterplanSpatial', () => {
  const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);

  it('groups two adjacent tiers into a single cluster', () => {
    const tiers = [makeTier('a', 0, 0), makeTier('b', 9, 0)]; // nakładające się footprinty
    const clusters = clusterTiersByShadowOverlap(tiers, angles);
    expect(clusters.length).toBe(1);
    expect(clusters[0].length).toBe(2);
  });

  it('keeps two far-apart tiers in separate clusters', () => {
    const tiers = [makeTier('a', 0, 0), makeTier('b', 100000, 100000)];
    const clusters = clusterTiersByShadowOverlap(tiers, angles);
    expect(clusters.length).toBe(2);
  });

  it('returns a single-element cluster for one tier', () => {
    const clusters = clusterTiersByShadowOverlap([makeTier('a', 0, 0)], angles);
    expect(clusters.length).toBe(1);
    expect(clusters[0].length).toBe(1);
  });

  it('returns no clusters for an empty tier list', () => {
    expect(clusterTiersByShadowOverlap([], angles)).toEqual([]);
  });

  it('boundsOverlap detects overlapping and non-overlapping boxes', () => {
    const a = tierFootprintBounds(makeTier('a', 0, 0));
    const b = tierFootprintBounds(makeTier('b', 5, 5));
    const c = tierFootprintBounds(makeTier('c', 1000, 1000));
    expect(boundsOverlap(a, b)).toBe(true);
    expect(boundsOverlap(a, c)).toBe(false);
  });

  describe('viewportWorldBounds', () => {
    it('derives world bounds from canvas corners with default 20% margin', () => {
      const bounds = viewportWorldBounds({ width: 100, height: 50, screenToWorld: identityScreenToWorld });
      // Rozmiar bazowy 100x50, margines 20% w każdą stronę: -20..120 (x), -10..60 (y)
      expect(bounds.minX).toBeCloseTo(-20);
      expect(bounds.maxX).toBeCloseTo(120);
      expect(bounds.minY).toBeCloseTo(-10);
      expect(bounds.maxY).toBeCloseTo(60);
    });

    it('supports a custom margin ratio', () => {
      const bounds = viewportWorldBounds({ width: 100, height: 100, screenToWorld: identityScreenToWorld }, 0);
      expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    });

    it('accounts for rotation by transforming all 4 corners, not just 2', () => {
      // Obrót o 45 stopni: rogi canvasu 0..100 rozciągają się na przekątną w świecie
      const rotate45 = (sx: number, sy: number) => {
        const cx = 50;
        const cy = 50;
        const dx = sx - cx;
        const dy = sy - cy;
        const cos = Math.SQRT1_2;
        const sin = Math.SQRT1_2;
        return { wx: cx + dx * cos - dy * sin, wy: cy + dx * sin + dy * cos };
      };
      const bounds = viewportWorldBounds({ width: 100, height: 100, screenToWorld: rotate45 }, 0);
      // Obrócony kwadrat 100x100 ma przekątną ~141.4 -> bounding box szerszy niż oryginalny kwadrat
      expect(bounds.maxX - bounds.minX).toBeGreaterThan(100);
      expect(bounds.maxY - bounds.minY).toBeGreaterThan(100);
    });
  });

  describe('polygonsWithHolesBounds', () => {
    it('computes AABB across outer rings of multiple polygons', () => {
      const polys: PolygonWithHoles[] = [
        { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], holes: [] },
        { outer: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 20, y: 30 }], holes: [] },
      ];
      expect(polygonsWithHolesBounds(polys)).toEqual({ minX: 0, minY: 0, maxX: 30, maxY: 30 });
    });

    it('returns null for an empty list', () => {
      expect(polygonsWithHolesBounds([])).toBeNull();
    });
  });

  describe('cullBuildingsByViewport', () => {
    it('keeps a building whose footprint is inside the viewport', () => {
      const bldg = makeBuilding('a', 0, 0, 10, 10);
      const viewport = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
      const result = cullBuildingsByViewport([bldg], viewport, angles);
      expect(result).toEqual([bldg]);
    });

    it('drops a building whose footprint and estimated shadow reach are both outside the viewport', () => {
      const bldg = makeBuilding('a', 100000, 100000, 10, 10);
      const viewport = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
      const result = cullBuildingsByViewport([bldg], viewport, angles);
      expect(result).toEqual([]);
    });

    it('keeps a building outside the viewport whose estimated shadow reaches into it', () => {
      // Budynek tuż poza granicą viewportu na lewo, ale wystarczająco wysoki, by jego cień (na
      // południe od słońca w południe, czyli +Y w układzie CAD) sięgał do wnętrza viewportu.
      const tallBldg = makeBuilding('tall', -60, 0, 5, 500);
      const viewport = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
      const result = cullBuildingsByViewport([tallBldg], viewport, angles);
      expect(result).toEqual([tallBldg]);
    });

    it('does not cull a building with degenerate/missing geometry (no AABB)', () => {
      const degenerate = { id: 'x', defaultHeight: 10, vertices: [] } as unknown as BuildingLoop;
      const viewport = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
      const result = cullBuildingsByViewport([degenerate], viewport, angles);
      expect(result).toEqual([degenerate]);
    });

    it('prefers a tighter cached shadow AABB over the conservative height-based estimate', () => {
      // Budynek daleko poza viewportem i poza szacowanym zasięgiem cienia estymaty wysokościowej,
      // ale z "cache'owanym" (podanym przez wywołującego) dokładnym cieniem, który już NIE sięga
      // do viewportu -> powinien zostać odrzucony tak samo jak bez cache'u.
      const bldg = makeBuilding('a', 100000, 100000, 10, 500);
      const viewport = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
      const cachedBounds = { minX: 99990, minY: 99990, maxX: 100020, maxY: 100020 };
      const result = cullBuildingsByViewport([bldg], viewport, angles, () => cachedBounds);
      expect(result).toEqual([]);
    });
  });

  describe('Ground shadow cache and Canonical Precomputed Geometry', () => {
    it('returns identical cached shadow render result across repeated calls for same scene tiers', async () => {
      const { getCachedGroundShadowSamples } = await import('./masterplanShadowCache');
      const tiers = [makeTier('b1', 0, 0, 20, 15), makeTier('b2', 30, 0, 20, 15)];
      const samples = [{ color: 'rgba(0,0,0,0.2)', offsetMin: 0 }];

      const res1 = getCachedGroundShadowSamples(tiers, samples, 52.23, 21.01, 'spring', 12.0);
      const res2 = getCachedGroundShadowSamples(tiers, samples, 52.23, 21.01, 'spring', 12.0);

      // Must be same reference (instant O(1) cache hit)
      expect(res1).toBe(res2);
      expect(res1.samples.length).toBeGreaterThan(0);
    });

    it('precomputes labelInfo in GeometryCompiler.bakeBuilding', async () => {
      const { GeometryCompiler } = await import('@/engine/compiler/GeometryCompiler');
      const bldg = makeBuilding('test-lbl', 10, 20, 30, 15);
      const compiled = GeometryCompiler.bakeBuilding(bldg);

      expect(compiled.representation2D.labelInfo).toBeDefined();
      expect(compiled.representation2D.labelInfo?.labelAnchor).toBeDefined();
      expect(typeof compiled.representation2D.labelInfo?.dominantAngleRad).toBe('number');
      expect(compiled.representation2D.labelInfo?.spanX).toBeGreaterThanOrEqual(30);
      expect(compiled.representation2D.labelInfo?.spanY).toBeGreaterThanOrEqual(30);
    });

    it('filters out label candidates outside viewport bounds', async () => {
      const { buildMasterplanLabelCandidates } = await import('./masterplanLabels');
      const inViewBldg = makeBuilding('in-view', 10, 10, 50, 15);
      const outOfViewBldg = makeBuilding('out-of-view', 1000, 1000, 50, 15);
      const viewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

      const candidates = buildMasterplanLabelCandidates(
        [inViewBldg, outOfViewBldg],
        (x, y) => ({ sx: x, sy: y }),
        1,
        null,
        null,
        null,
        0,
        viewport
      );

      expect(candidates.some((c) => c.id === 'in-view')).toBe(true);
      expect(candidates.some((c) => c.id === 'out-of-view')).toBe(false);
    });
  });
});

