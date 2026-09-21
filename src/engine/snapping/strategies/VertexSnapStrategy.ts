import { Point2D } from '../../../types/geometry';
import { CachedLineEquation } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy, computeClampedWorldTolerance, computeCategoryAffinityBonus } from '../types';
import { resolveCandidateEdges, computeHysteresisAdjustedDist, findSnapFromAll, screenDistance, computeCategoryAndHoverBonus } from './strategyHelpers';

export class VertexSnapStrategy implements SnapStrategy {
  readonly name = 'VertexSnapStrategy';
  readonly priority = 10; // Najwyższy priorytet - dyskretne punkty charakterystyczne

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    return findSnapFromAll(this, point, context);
  }

  findAllSnaps(point: Point2D, context: SnapContext): SnapResult[] {
    if (!context.isOsnapActive) return [];

    const { worldRadius: snapRadiusWorld, thresholdPx } = computeClampedWorldTolerance(point, context);

    const candidateEdges = resolveCandidateEdges(
      context,
      point.x - snapRadiusWorld,
      point.y - snapRadiusWorld,
      point.x + snapRadiusWorld,
      point.y + snapRadiusWorld
    );

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

    for (const item of endpointsList) {
      const distPx = screenDistance(context, item.point);

      if (distPx <= thresholdPx) {
        const key = `${item.point.x.toFixed(4)}_${item.point.y.toFixed(4)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        // Bonus pierwszeństwa dla kategorii obiektu (np. edycja działki faworyzuje działki)
        const catBonus = computeCategoryAffinityBonus(
          item.edge.category,
          context.activeCategory,
          context.categoryAffinityWeights
        );
        let effDist = distPx - computeCategoryAndHoverBonus(item.edge, context, catBonus);

        effDist = computeHysteresisAdjustedDist(
          effDist,
          context,
          (prev) =>
            prev.type === 'vertex' &&
            (Math.hypot(prev.point.x - item.point.x, prev.point.y - item.point.y) < 1e-3 ||
              prev.sourceBuildingId === item.edge.objectId)
        );

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
