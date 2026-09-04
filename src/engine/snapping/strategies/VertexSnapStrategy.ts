import { Point2D } from '../../../types/geometry';
import { CachedLineEquation } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy } from '../types';

export class VertexSnapStrategy implements SnapStrategy {
  readonly name = 'VertexSnapStrategy';
  readonly priority = 10; // Najwyższy priorytet - dyskretne punkty charakterystyczne

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    if (!context.isOsnapActive) return null;
    if (context.activeSnapTypes && context.activeSnapTypes.vertex === false) return null;

    const thresholdPx = context.thresholdPx ?? 12;
    const activeEdges = context.excludeBuildingId
      ? context.lineBuffer.filter((e) => e.objectId !== context.excludeBuildingId)
      : context.lineBuffer;

    if (activeEdges.length === 0) return null;

    // Przeliczenie promienia w świecie dla szybkiego AABB culling
    const sRef = context.worldToScreen(point.x + 1, point.y);
    const pxPerMeter = Math.hypot(sRef.sx - context.mouseScreen.sx, sRef.sy - context.mouseScreen.sy) || 20;
    const snapRadiusWorld = (thresholdPx * 2) / pxPerMeter + 0.5;

    const endpointsList: { point: Point2D; edge: CachedLineEquation }[] = [];
    for (const edge of activeEdges) {
      const minX = Math.min(edge.p1.x, edge.p2.x) - snapRadiusWorld;
      const maxX = Math.max(edge.p1.x, edge.p2.x) + snapRadiusWorld;
      const minY = Math.min(edge.p1.y, edge.p2.y) - snapRadiusWorld;
      const maxY = Math.max(edge.p1.y, edge.p2.y) + snapRadiusWorld;

      if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
        endpointsList.push({ point: edge.p1, edge });
        endpointsList.push({ point: edge.p2, edge });
      }
    }

    let best: { edge: CachedLineEquation; point: Point2D; distPx: number; effDistPx: number } | null = null;
    let minEffDist = thresholdPx;

    const hysteresisBonus = context.hysteresisBonusPx ?? 3.5;

    for (const item of endpointsList) {
      const s = context.worldToScreen(item.point.x, item.point.y);
      const distPx = Math.hypot(context.mouseScreen.sx - s.sx, context.mouseScreen.sy - s.sy);

      if (distPx <= thresholdPx) {
        let effDist = distPx;
        if (
          item.edge.objectId &&
          (item.edge.objectId === context.hoveredBuildingId || item.edge.objectId === context.selectedBuildingId)
        ) {
          effDist -= 2.0;
        }

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
        if (effDist <= minEffDist) {
          minEffDist = effDist;
          best = { edge: item.edge, point: item.point, distPx, effDistPx: effDist };
        }
      }
    }

    if (best) {
      return {
        point: { ...best.point },
        snapped: true,
        type: 'vertex',
        label: 'Wierzchołek (Endpoint)',
        description: `Wierzchołek obiektu (${best.edge.objectId})`,
        screenDistancePx: best.distPx,
        sourcePoint: best.point,
        sourceBuildingId: best.edge.objectId,
        sourceEdgeIndex: best.edge.edgeIndex,
        cachedEdge: best.edge,
      };
    }

    return null;
  }
}
