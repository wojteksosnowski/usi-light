import { Point2D } from '../../../types/geometry';
import { CachedLineEquation } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy, computeClampedWorldTolerance, computeCategoryAffinityBonus } from '../types';

export class VertexSnapStrategy implements SnapStrategy {
  readonly name = 'VertexSnapStrategy';
  readonly priority = 10; // Najwyższy priorytet - dyskretne punkty charakterystyczne

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    const snaps = this.findAllSnaps(point, context);
    return snaps.length > 0 ? snaps[0] : null;
  }

  findAllSnaps(point: Point2D, context: SnapContext): SnapResult[] {
    if (!context.isOsnapActive) return [];
    if (context.activeSnapTypes && context.activeSnapTypes.vertex === false) return [];

    const { worldRadius: snapRadiusWorld, thresholdPx } = computeClampedWorldTolerance(point, context, 12);

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

    if (candidateEdges.length === 0) return [];

    const endpointsList: { point: Point2D; edge: CachedLineEquation }[] = [];
    for (const edge of candidateEdges) {
      const minX = Math.min(edge.p1.x, edge.p2.x) - snapRadiusWorld;
      const maxX = Math.max(edge.p1.x, edge.p2.x) + snapRadiusWorld;
      const minY = Math.min(edge.p1.y, edge.p2.y) - snapRadiusWorld;
      const maxY = Math.max(edge.p1.y, edge.p2.y) + snapRadiusWorld;

      if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
        endpointsList.push({ point: edge.p1, edge });
        endpointsList.push({ point: edge.p2, edge });
      }
    }

    const results: SnapResult[] = [];
    const seenKeys = new Set<string>();
    const hysteresisBonus = context.hysteresisBonusPx ?? 3.5;

    for (const item of endpointsList) {
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

        // Bonus pierwszeństwa dla kategorii obiektu (np. edycja działki faworyzuje działki)
        const catBonus = computeCategoryAffinityBonus(
          item.edge.category,
          context.activeCategory,
          context.categoryAffinityWeights
        );
        effDist -= catBonus;

        if (context.previousSnapResult && context.previousSnapResult.type === 'vertex') {
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
          type: 'vertex',
          label: 'Wierzchołek (Endpoint)',
          description: `Wierzchołek obiektu (${displayName})`,
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
