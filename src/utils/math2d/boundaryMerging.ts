import { BuildingLoop, Point2D } from '../../types/geometry';
import { unionPolygonLoops } from './polygons';

const ADJACENCY_TOLERANCE = 0.01; // 1cm - styczność wierzchołków/krawędzi

export interface BoundarySharedEdge {
  edge: [Point2D, Point2D];
  buildingIds: [string, string];
}

export interface BoundaryMergeGroup {
  buildingIds: string[];
  mergedVertices: Point2D[];
  sharedEdges: BoundarySharedEdge[];
  areaType: 'plot' | 'playground';
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distPointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * abx, y: a.y + t * aby });
}

/** Sprawdza czy dwa poligony stykają się (wierzchołek na wierzchołku lub wierzchołek na krawędzi) w zadanej tolerancji. */
function polygonsAreAdjacent(v1: Point2D[], v2: Point2D[], tolerance: number): boolean {
  const n1 = v1.length;
  const n2 = v2.length;
  for (let i = 0; i < n1; i++) {
    const p1 = v1[i];
    for (let j = 0; j < n2; j++) {
      const p2 = v2[j];
      if (dist(p1, p2) < tolerance) return true;
    }
  }
  for (let i = 0; i < n1; i++) {
    const a = v1[i];
    for (let j = 0; j < n2; j++) {
      const q1 = v2[j];
      const q2 = v2[(j + 1) % n2];
      if (distPointToSegment(a, q1, q2) < tolerance) return true;
    }
  }
  for (let j = 0; j < n2; j++) {
    const b = v2[j];
    for (let i = 0; i < n1; i++) {
      const p1 = v1[i];
      const p2 = v1[(i + 1) % n1];
      if (distPointToSegment(b, p1, p2) < tolerance) return true;
    }
  }
  return false;
}

function edgesAreCoincident(p1: Point2D, p2: Point2D, q1: Point2D, q2: Point2D, tolerance: number): boolean {
  const forward = dist(p1, q1) < tolerance && dist(p2, q2) < tolerance;
  const reversed = dist(p1, q2) < tolerance && dist(p2, q1) < tolerance;
  return forward || reversed;
}

function findSharedEdges(a: BuildingLoop, b: BuildingLoop, tolerance: number): BoundarySharedEdge[] {
  const shared: BoundarySharedEdge[] = [];
  const v1 = a.vertices;
  const v2 = b.vertices;
  for (let i = 0; i < v1.length; i++) {
    const e1p1 = v1[i];
    const e1p2 = v1[(i + 1) % v1.length];
    for (let j = 0; j < v2.length; j++) {
      const e2p1 = v2[j];
      const e2p2 = v2[(j + 1) % v2.length];
      if (edgesAreCoincident(e1p1, e1p2, e2p1, e2p2, tolerance)) {
        shared.push({ edge: [e1p1, e1p2], buildingIds: [a.id, b.id] });
      }
    }
  }
  return shared;
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(x: number, y: number): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px !== py) this.parent[px] = py;
  }
}

/**
 * Wykrywa grupy stykających się obiektów category='boundary' będących "obiektem badanym"
 * (isTested === true) - granice z isTested !== true nigdy nie są łączone, niezależnie od
 * stykania się z sąsiadami. Grupa jest zwracana tylko gdy wszystkie obiekty w niej mają
 * ten sam areaType - w przeciwnym razie renderer ma zastosować fallback (rysowanie osobno),
 * więc niejednorodne grupy są pomijane.
 */
export function detectBoundaryMergeGroups(buildings: BuildingLoop[]): BoundaryMergeGroup[] {
  const boundaries = buildings.filter(
    (b) => b.category === 'boundary' && b.isTested === true && Array.isArray(b.vertices) && b.vertices.length >= 3
  );
  if (boundaries.length < 2) return [];

  const uf = new UnionFind(boundaries.length);
  for (let i = 0; i < boundaries.length; i++) {
    for (let j = i + 1; j < boundaries.length; j++) {
      if (polygonsAreAdjacent(boundaries[i].vertices, boundaries[j].vertices, ADJACENCY_TOLERANCE)) {
        uf.union(i, j);
      }
    }
  }

  const groupsByRoot = new Map<number, number[]>();
  for (let i = 0; i < boundaries.length; i++) {
    const root = uf.find(i);
    if (!groupsByRoot.has(root)) groupsByRoot.set(root, []);
    groupsByRoot.get(root)!.push(i);
  }

  const result: BoundaryMergeGroup[] = [];
  for (const indices of groupsByRoot.values()) {
    if (indices.length < 2) continue;

    const members = indices.map((i) => boundaries[i]);
    const areaTypes = new Set(members.map((b) => b.areaType ?? 'plot'));
    if (areaTypes.size !== 1) continue; // niejednorodny areaType -> fallback per-building

    const polygons = members.map((b) => b.vertices);
    const unioned = unionPolygonLoops(polygons);
    if (unioned.length !== 1) continue; // np. rozłączne komponenty po union -> fallback

    const sharedEdges: BoundarySharedEdge[] = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        sharedEdges.push(...findSharedEdges(members[i], members[j], ADJACENCY_TOLERANCE));
      }
    }

    result.push({
      buildingIds: members.map((b) => b.id),
      mergedVertices: unioned[0],
      sharedEdges,
      areaType: [...areaTypes][0] as 'plot' | 'playground',
    });
  }

  return result;
}
