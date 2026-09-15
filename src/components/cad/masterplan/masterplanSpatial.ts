import { computePointsBoundingBox } from '@/utils/math2d/polygons';
import { SolarAngles, MasterplanStoryTier, computeShadowOffsetVector } from './masterplanGeometry';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function tierFootprintBounds(tier: MasterplanStoryTier): Bounds {
  const { minX, maxX, minY, maxY } = computePointsBoundingBox(tier.polygon);
  return { minX, minY, maxX, maxY };
}

export function extendBoundsByOffset(b: Bounds, dx: number, dy: number): Bounds {
  return {
    minX: Math.min(b.minX, b.minX + dx),
    maxX: Math.max(b.maxX, b.maxX + dx),
    minY: Math.min(b.minY, b.minY + dy),
    maxY: Math.max(b.maxY, b.maxY + dy),
  };
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

/**
 * Rozszerzone AABB "zasięgu cienia" tiera: footprint + przesunięcie o wektor cienia dla `hTop`
 * (z 5% marginesem bezpieczeństwa — pokrywa niewielką różnicę azymutu między próbkami penumbry).
 * Wzorem `blockingWithAABB` w shadowEnvelope.ts:364-375.
 */
export function tierShadowReachBounds(tier: MasterplanStoryTier, angles: SolarAngles): Bounds {
  const footprint = tierFootprintBounds(tier);
  const offset = computeShadowOffsetVector(tier.hTop, angles);
  return extendBoundsByOffset(footprint, offset.dx * 1.05, offset.dy * 1.05);
}

/**
 * Grupuje tiery na przestrzennie niezależne klastry (Union-Find po nachodzeniu rozszerzonych AABB
 * zasięgu cienia) — tiery w różnych klastrach nigdy się nie przecinają, więc unię/przecięcie można
 * liczyć per-klaster niezależnie, zamiast jedną kosztowną operacją na całej scenie (patrz
 * masterplanShadowCache.ts). Redukuje N wchodzące do sweep-line polygon-clipping.
 */
export function clusterTiersByShadowOverlap(
  tiers: MasterplanStoryTier[],
  angles: SolarAngles
): MasterplanStoryTier[][] {
  const n = tiers.length;
  if (n === 0) return [];
  if (n === 1) return [tiers];

  const bounds = tiers.map((t) => tierShadowReachBounds(t, angles));

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (boundsOverlap(bounds[i], bounds[j])) union(i, j);
    }
  }

  const groups = new Map<number, MasterplanStoryTier[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let group = groups.get(root);
    if (!group) {
      group = [];
      groups.set(root, group);
    }
    group.push(tiers[i]);
  }
  return [...groups.values()];
}
