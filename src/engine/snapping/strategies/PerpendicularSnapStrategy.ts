import { Point2D } from '../../../types/geometry';
import { CachedLineEquation, projectPointToLine } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy, SnapGuideLine, computeClampedWorldTolerance, computeCategoryAffinityBonus } from '../types';
import { filterCandidateLines } from './snapExclusionUtils';

/**
 * PerpendicularSnapStrategy - Wykrywa punkt rzutu prostopadłego z punktu bazowego
 * rysowania (originPoint) na krawędź obiektu.
 * Priorytet 35 (pomiędzy Midpoint a Nearest Edge).
 */
export class PerpendicularSnapStrategy implements SnapStrategy {
  readonly name = 'PerpendicularSnapStrategy';
  readonly priority = 35; // Wysoki priorytet dla rzutów prostopadłych z aktywnego punktu bazowego

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    const snaps = this.findAllSnaps(point, context);
    return snaps.length > 0 ? snaps[0] : null;
  }

  findAllSnaps(point: Point2D, context: SnapContext): SnapResult[] {
    if (!context.isOsnapActive) return [];
    if (context.activeSnapTypes && context.activeSnapTypes.perpendicular === false) return [];
    if (!context.originPoint) return [];

    const origin = context.originPoint;
    const { thresholdPx } = computeClampedWorldTolerance(point, context, 12);

    const candidateEdges = filterCandidateLines(context.lineBuffer, context);

    if (candidateEdges.length === 0) return [];

    const results: SnapResult[] = [];

    for (const edge of candidateEdges) {
      // Oblicz rzut prostopadły punktu bazowego origin na prostą krawędzi
      const proj = projectPointToLine(origin, edge);
      const perpPt = proj.projectedPoint;

      // Sprawdź czy kursor myszy znajduje się blisko rzutu prostopadłego
      const sPerp = context.worldToScreen(perpPt.x, perpPt.y);
      const distPx = Math.hypot(context.mouseScreen.sx - sPerp.sx, context.mouseScreen.sy - sPerp.sy);

      if (distPx <= thresholdPx) {
        let effDist = distPx;
        // Lekki bonus dla rzutu leżącego bezpośrednio na odcinku względem rzutu na przedłużeniu
        if (!proj.isOnSegment) {
          effDist += 1.5;
        }

        const catBonus = computeCategoryAffinityBonus(edge.category, context.activeCategory, context.categoryAffinityWeights);
        effDist -= catBonus;
        effDist = Math.max(0, effDist);

        const displayName = edge.objectName || edge.objectId;
        const isOnSegment = proj.isOnSegment;

        const guideLines: SnapGuideLine[] = [
          { p1: origin, p2: perpPt, type: 'perpendicular' },
          { p1: edge.p1, p2: edge.p2, type: 'perpendicular' },
        ];

        if (!isOnSegment) {
          const d1 = Math.hypot(edge.p1.x - perpPt.x, edge.p1.y - perpPt.y);
          const d2 = Math.hypot(edge.p2.x - perpPt.x, edge.p2.y - perpPt.y);
          const nearP = d1 < d2 ? edge.p1 : edge.p2;
          guideLines.push({ p1: nearP, p2: perpPt, type: 'extension' });
        }

        results.push({
          point: { ...perpPt },
          snapped: true,
          type: 'perpendicular',
          label: isOnSegment ? 'Prostopadły (Perpendicular)' : 'Prostopadły do przedłużenia',
          description: isOnSegment ? `Rzut prostopadły na krawędź (${displayName})` : `Rzut prostopadły na prostą krawędzi (${displayName})`,
          screenDistancePx: distPx,
          sourcePoint: perpPt,
          sourceBuildingId: edge.objectId,
          sourceCategory: edge.category,
          sourceName: edge.objectName,
          sourceEdgeIndex: edge.edgeIndex,
          cachedEdge: edge,
          guideLines,
          metadata: {
            effDistPx: effDist,
            originPoint: origin,
            targetEdge: edge,
            isOnSegment,
          },
        });
      }
    }

    results.sort((a, b) => ((a.metadata?.effDistPx as number) ?? (a.screenDistancePx ?? 0)) - ((b.metadata?.effDistPx as number) ?? (b.screenDistancePx ?? 0)));
    return results;
  }
}
