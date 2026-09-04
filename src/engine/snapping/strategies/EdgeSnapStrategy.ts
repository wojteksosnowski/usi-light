import { Point2D } from '../../../types/geometry';
import { CachedLineEquation, projectPointToLine } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy } from '../types';

export class EdgeSnapStrategy implements SnapStrategy {
  readonly name = 'EdgeSnapStrategy';
  readonly priority = 40; // Niższy niż punkty dyskretne, wyższy niż kierunek i siatka

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    if (!context.isOsnapActive) return null;

    const allowNearest = context.activeSnapTypes ? context.activeSnapTypes.edge !== false : true;
    const allowExtension = context.activeSnapTypes ? context.activeSnapTypes.extension !== false : true;
    if (!allowNearest && !allowExtension) return null;

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

    let best: {
      edge: CachedLineEquation;
      point: Point2D;
      distPx: number;
      effDistPx: number;
      isOnSegment: boolean;
      t: number;
    } | null = null;

    let minEffDist = thresholdPx;
    const hysteresisBonus = context.hysteresisBonusPx ?? 3.5;

    for (const edge of activeEdges) {
      const signedLineDist = edge.A * point.x + edge.B * point.y + edge.C;
      if (Math.abs(signedLineDist) > snapRadiusWorld) continue;

      const proj = projectPointToLine(point, edge);
      const sProj = context.worldToScreen(proj.projectedPoint.x, proj.projectedPoint.y);
      const distPx = Math.hypot(context.mouseScreen.sx - sProj.sx, context.mouseScreen.sy - sProj.sy);

      if (distPx <= thresholdPx) {
        if (proj.isOnSegment && !allowNearest) continue;
        if (!proj.isOnSegment && !allowExtension) continue;

        // Jeśli kursor jest w pobliżu wierzchołków lub środka tej krawędzi,
        // ustępujemy pierwszeństwa dyskretnym punktom charakterystycznym (Vertex/Midpoint)
        if (proj.isOnSegment && allowNearest) {
          const sP1 = context.worldToScreen(edge.p1.x, edge.p1.y);
          const sP2 = context.worldToScreen(edge.p2.x, edge.p2.y);
          const sMid = context.worldToScreen((edge.p1.x + edge.p2.x) / 2, (edge.p1.y + edge.p2.y) / 2);
          const dP1 = Math.hypot(context.mouseScreen.sx - sP1.sx, context.mouseScreen.sy - sP1.sy);
          const dP2 = Math.hypot(context.mouseScreen.sx - sP2.sx, context.mouseScreen.sy - sP2.sy);
          const dMid = Math.hypot(context.mouseScreen.sx - sMid.sx, context.mouseScreen.sy - sMid.sy);

          if (dP1 <= thresholdPx || dP2 <= thresholdPx || dMid <= thresholdPx) {
            continue;
          }
        }

        const isExt = !proj.isOnSegment;
        const priorityPenalty = isExt ? 0.0 : 4.0; // Kara odległościowa dla ciągłej krawędzi

        let effDist = distPx + priorityPenalty;
        if (
          edge.objectId &&
          (edge.objectId === context.hoveredBuildingId || edge.objectId === context.selectedBuildingId)
        ) {
          effDist -= 2.0;
        }

        if (
          context.previousSnapResult &&
          (context.previousSnapResult.type === 'edge' || context.previousSnapResult.type === 'extension')
        ) {
          if (context.previousSnapResult.sourceBuildingId === edge.objectId) {
            effDist -= hysteresisBonus;
          }
        }

        effDist = Math.max(0, effDist);
        if (effDist <= minEffDist) {
          minEffDist = effDist;
          best = {
            edge,
            point: proj.projectedPoint,
            distPx,
            effDistPx: effDist,
            isOnSegment: proj.isOnSegment,
            t: proj.t,
          };
        }
      }
    }

    if (best) {
      const isExt = !best.isOnSegment;
      const guideExtLength = 50;
      const guideLines = isExt
        ? [
            {
              p1: {
                x: best.edge.p1.x - guideExtLength * best.edge.uX,
                y: best.edge.p1.y - guideExtLength * best.edge.uY,
              },
              p2: {
                x: best.edge.p2.x + guideExtLength * best.edge.uX,
                y: best.edge.p2.y + guideExtLength * best.edge.uY,
              },
              type: 'extension',
              isStatistical: false,
            },
          ]
        : undefined;

      return {
        point: { ...best.point },
        snapped: true,
        type: isExt ? 'extension' : 'edge',
        label: isExt ? 'Przedłużenie (Extension)' : 'Punkt na krawędzi (Nearest)',
        description: isExt
          ? `Przedłużenie krawędzi (${best.edge.objectId})`
          : `Rzut na krawędź (${best.edge.objectId})`,
        screenDistancePx: best.distPx,
        sourceBuildingId: best.edge.objectId,
        sourceEdgeIndex: best.edge.edgeIndex,
        cachedEdge: best.edge,
        guideLines,
      };
    }

    return null;
  }
}
