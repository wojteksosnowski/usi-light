import RBush from 'rbush';
import { CachedLineEquation } from '../../utils/lineBufferEngine';
import { PerfMonitor } from '../perf/PerfMonitor';

interface IndexedEdgeItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  edge: CachedLineEquation;
}

/**
 * Indeks przestrzenny (rbush) nad buforem krawędzi, współdzielony przez strategie snappingu.
 * Przebudowywany tylko gdy zmieni się referencja lineBuffer (czyli przy realnej zmianie geometrii),
 * nie przy każdym ruchu myszy.
 */
export class SpatialLineIndex {
  private tree = new RBush<IndexedEdgeItem>();
  private lastLineBuffer: CachedLineEquation[] | null = null;

  public rebuildIfStale(lineBuffer: CachedLineEquation[]): void {
    if (lineBuffer === this.lastLineBuffer) return;

    const rebuildStart = performance.now();
    const items: IndexedEdgeItem[] = lineBuffer.map((edge) => ({
      minX: Math.min(edge.p1.x, edge.p2.x),
      minY: Math.min(edge.p1.y, edge.p2.y),
      maxX: Math.max(edge.p1.x, edge.p2.x),
      maxY: Math.max(edge.p1.y, edge.p2.y),
      edge,
    }));

    this.tree.clear();
    this.tree.load(items);
    this.lastLineBuffer = lineBuffer;

    PerfMonitor.mark('spatialIndex.rebuild', performance.now() - rebuildStart);
    PerfMonitor.count('spatialIndex.rebuildCount');
  }

  public queryBBox(minX: number, minY: number, maxX: number, maxY: number): CachedLineEquation[] {
    const results = this.tree.search({ minX, minY, maxX, maxY });
    return results.map((item) => item.edge);
  }
}
