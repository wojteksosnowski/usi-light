import { Point2D } from '../../../types/geometry';
import { CachedLineEquation } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy } from '../types';

export class MidpointSnapStrategy implements SnapStrategy {
  readonly name = 'MidpointSnapStrategy';
  readonly priority = 20; // Wysoki priorytet - dyskretny punkt środka krawędzi

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    if (!context.isOsnapActive) return null;
    if (context.activeSnapTypes && context.activeSnapTypes.midpoint === false) return null;

    const thresholdPx = context.thresholdPx ?? 12;
    const minEdgeLength = context.minEdgeLengthMeters ?? 0.05;

    const activeEdges = (
      context.excludeBuildingId
        ? context.lineBuffer.filter((e) => e.objectId !== context.excludeBuildingId)
        : context.lineBuffer
    ).filter((e) => e.length >= minEdgeLength);

    if (activeEdges.length === 0) return null;

    const sRef = context.worldToScreen(point.x + 1, point.y);
    const pxPerMeter = Math.hypot(sRef.sx - context.mouseScreen.sx, sRef.sy - context.mouseScreen.sy) || 20;
    const snapRadiusWorld = (thresholdPx * 2) / pxPerMeter + 0.5;

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

    let best: { edge: CachedLineEquation; point: Point2D; distPx: number; effDistPx: number } | null = null;
    let minEffDist = thresholdPx;
    const hysteresisBonus = context.hysteresisBonusPx ?? 3.5;

    for (const item of midpointsList) {
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
        type: 'midpoint',
        label: 'Środek odcinka (Midpoint)',
        description: `Środek krawędzi (${best.edge.objectId})`,
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
