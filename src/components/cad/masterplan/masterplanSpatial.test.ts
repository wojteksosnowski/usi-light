import { describe, it, expect } from 'vitest';
import { clusterTiersByShadowOverlap, boundsOverlap, tierFootprintBounds } from './masterplanSpatial';
import { getMasterplanSolarAngles, MasterplanStoryTier } from './masterplanGeometry';

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
});
