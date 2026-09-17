import { Point2D } from '../../../types/geometry';
import { CachedLineEquation } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy, computeClampedWorldTolerance, computeCategoryAffinityBonus } from '../types';

export class MidpointSnapStrategy implements SnapStrategy {
  readonly name = 'MidpointSnapStrategy';
  readonly priority = 30; // Wysoki priorytet - dyskretny punkt środka krawędzi

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    const snaps = this.findAllSnaps(point, context);
    return snaps.length > 0 ? snaps[0] : null;
  }

  findAllSnaps(point: Point2D, context: SnapContext): SnapResult[] {
    if (!context.isOsnapActive) return [];
    if (context.activeSnapTypes && context.activeSnapTypes.midpoint === false) return [];

    const { worldRadius: snapRadiusWorld, thresholdPx } = computeClampedWorldTolerance(point, context, 12);
    const minEdgeLength = context.minEdgeLengthMeters ?? 0.05;

    let candidateEdges: CachedLineEquation[];
    if (context.spatialIndex) {
      candidateEdges = context.spatialIndex.queryBBox(
        point.x - snapRadiusWorld,
        point.y - snapRadiusWorld,
        point.x + snapRadiusWorld,
        point.y + snapRadiusWorld
      );
      if (context.excludeBuildingId) {
        candidateEdges = candidateEdges.filter((e) => e.objectId !== context.excludeBuildingId);
      }
    } else {
      candidateEdges = context.excludeBuildingId
        ? context.lineBuffer.filter((e) => e.objectId !== context.excludeBuildingId)
        : context.lineBuffer;
    }
    const activeEdges = candidateEdges.filter((e) => e.length >= minEdgeLength);

    if (activeEdges.length === 0) return [];

    const midpointsList: { point: Point2D; edge: CachedLineEquation }[] = [];
    for (const edge of activeEdges) {
      const midX = (edge.p1.x + edge.p2.x) / 2;
      const midY = (edge.p1.y + edge.p2.y) / 2;

      if (
        Math.abs(point.x - midX) <= snapRadiusWorld &&
        Math.abs(point.y - midY) <= snapRadiusWorld
      ) {
        midpointsList.push({ point: { x: midX, y: midY }, edge });
      }
    }

    const results: SnapResult[] = [];
    const seenKeys = new Set<string>();
    const hysteresisBonus = context.hysteresisBonusPx ?? 3.5;

    for (const item of midpointsList) {
      const s = context.worldToScreen(item.point.x, item.point.y);
      const distPx = Math.hypot(context.mouseScreen.sx - s.sx, context.mouseScreen.sy - s.sy);

      if (distPx <= thresholdPx) {
        const key = `${item.point.x.toFixed(4)}_${item.point.y.toFixed(4)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        let effDist = distPx;
        if (
          item.edge.objectId &&
          (item.edge.objectId === context.hoveredBuildingId || item.edge.objectId === context.selectedBuildingId)
        ) {
          effDist -= 2.0;
        }

        const catBonus = computeCategoryAffinityBonus(
          item.edge.category,
          context.activeCategory,
          context.categoryAffinityWeights
        );
        effDist -= catBonus;

        if (context.previousSnapResult && context.previousSnapResult.type === 'midpoint') {
          const prevPt = context.previousSnapResult.point;
          if (
            Math.hypot(prevPt.x - item.point.x, prevPt.y - item.point.y) < 1e-3 ||
            context.previousSnapResult.sourceBuildingId === item.edge.objectId
          ) {
            effDist -= hysteresisBonus;
          }
        }

        effDist = Math.max(0, effDist);
        const displayName = item.edge.objectName || item.edge.objectId;
        results.push({
          point: { ...item.point },
          snapped: true,
          type: 'midpoint',
          label: 'Środek odcinka (Midpoint)',
          description: `Środek krawędzi (${displayName})`,
          screenDistancePx: distPx,
          sourcePoint: item.point,
          sourceBuildingId: item.edge.objectId,
          sourceCategory: item.edge.category,
          sourceName: item.edge.objectName,
          sourceEdgeIndex: item.edge.edgeIndex,
          cachedEdge: item.edge,
          metadata: { effDistPx: effDist },
        });
      }
    }

    results.sort((a, b) => ((a.metadata?.effDistPx as number) ?? 0) - ((b.metadata?.effDistPx as number) ?? 0));
    return results;
  }
}
