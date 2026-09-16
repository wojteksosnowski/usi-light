import { computePointsBoundingBox, unionPolygonLoops, PolygonWithHoles, unionPolygonsWithHoles } from '@/utils/math2d/polygons';
import { SolarAngles, MasterplanStoryTier, computeShadowOffsetVector } from './masterplanGeometry';
import { BuildingLoop } from '@/types/geometry';
import { getBuildingAABB } from '@/engine/buildingGeometryCache';

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

/** AABB otaczające wszystkie zewnętrzne obrysy listy poligonów (dziury pomijamy — nie poszerzają zasięgu). */
export function polygonsWithHolesBounds(polys: PolygonWithHoles[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys) {
    for (const pt of p.outer) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Granice widocznego obszaru (viewport) we współrzędnych świata, z marginesem proporcjonalnym
 * do rozmiaru viewportu (domyślnie 20% w każdą stronę), by uniknąć "pop-in" budynków przy panowaniu.
 * Transformuje wszystkie 4 rogi canvasu (nie tylko 2 przekątne), bo widok może być obrócony.
 */
export function viewportWorldBounds(
  rc: { width: number; height: number; screenToWorld: (sx: number, sy: number) => { wx: number; wy: number } },
  marginRatio = 0.2
): Bounds {
  const corners = [
    rc.screenToWorld(0, 0),
    rc.screenToWorld(rc.width, 0),
    rc.screenToWorld(0, rc.height),
    rc.screenToWorld(rc.width, rc.height),
  ];
  let minX = corners[0].wx;
  let maxX = minX;
  let minY = corners[0].wy;
  let maxY = minY;
  for (let i = 1; i < corners.length; i++) {
    const { wx, wy } = corners[i];
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }
  const marginX = (maxX - minX) * marginRatio;
  const marginY = (maxY - minY) * marginRatio;
  return { minX: minX - marginX, maxX: maxX + marginX, minY: minY - marginY, maxY: maxY + marginY };
}

/**
 * Odsiewa budynki, których bryła i szacowany zasięg cienia nie przecinają się z viewportem —
 * tani wstępny filtr przed ekstrakcją tierów (`extractBuildingStoryTiers`), operujący na
 * cache'owanym AABB budynku (`getBuildingAABB`), nie na pełnej geometrii cienia.
 *
 * Gdy dla budynku istnieje już policzony (cache'owany) poligon cienia dla dokładnie tej pozycji
 * słońca — `getCachedShadowBounds` (dostarczone przez wywołującego, bo klucz cache zależy od
 * algorytmu/metody/daty, o których ten moduł nic nie wie) — używamy jego dokładnego AABB zamiast
 * konserwatywnej estymaty wysokościowej. Ciaśniejsza granica = więcej budynków realnie odrzuconych,
 * bez utraty dokładności (finalne rysowanie i tak korzysta z tego samego, dokładnego poligonu).
 * Bez trafienia w cache — fallback na `height * shadowScale`, zawsze nadzbiór realnego zasięgu.
 */
export function cullBuildingsByViewport(
  buildings: BuildingLoop[],
  viewport: Bounds,
  angles: SolarAngles,
  getCachedShadowBounds?: (bldg: BuildingLoop) => Bounds | null
): BuildingLoop[] {
  return buildings.filter((b) => {
    const aabb = getBuildingAABB(b);
    if (!aabb) return true; // zdegenerowana geometria: nie cullować, niech dalszy pipeline zdecyduje

    const cachedBounds = getCachedShadowBounds?.(b);
    if (cachedBounds) {
      return boundsOverlap(cachedBounds, viewport);
    }

    const offset = computeShadowOffsetVector(b.defaultHeight ?? 0, angles);
    const reach = extendBoundsByOffset(aabb, offset.dx * 1.05, offset.dy * 1.05);
    return boundsOverlap(reach, viewport);
  });
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

/**
 * Łączy wielokąty parami hierarchicznie poziom po poziomie (Hierarchical Pairwise Union),
 * drastycznie redukując złożoność obliczeniową i liczbę wierzchołków wchodzących do sweep-line.
 */
export function unionPolygonsWithHolesHierarchical(polys: PolygonWithHoles[]): PolygonWithHoles[] {
  if (polys.length === 0) return [];
  if (polys.length === 1) return polys;
  if (polys.length === 2) return unionPolygonsWithHoles(polys);

  let current = polys.map((p) => [p]);
  while (current.length > 1) {
    const next: PolygonWithHoles[][] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(unionPolygonsWithHoles([...current[i], ...current[i + 1]]));
      } else {
        next.push(current[i]);
      }
    }
    if (next.length === current.length) break;
    current = next;
  }
  return current[0] || [];
}
