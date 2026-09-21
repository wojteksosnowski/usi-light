import { Point2D } from '../../../types/geometry';
import { CachedLineEquation, projectPointToLine } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy, computeClampedWorldTolerance, computeCategoryAffinityBonus } from '../types';
import { filterCandidateLines } from './snapExclusionUtils';

export class EdgeSnapStrategy implements SnapStrategy {
  readonly name = 'EdgeSnapStrategy';
  readonly priority = 50; // Niższy priorytet niż punkty charakterystyczne

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    const snaps = this.findAllSnaps(point, context);
    return snaps.length > 0 ? snaps[0] : null;
  }

  findAllSnaps(point: Point2D, context: SnapContext): SnapResult[] {
    if (!context.isOsnapActive) return [];

    const allowNearest = !context.activeSnapTypes || context.activeSnapTypes.nearest !== false;
    const allowExtension = !context.activeSnapTypes || context.activeSnapTypes.extension !== false;
    if (!allowNearest && !allowExtension) return [];

    const { worldRadius: snapRadiusWorld, thresholdPx } = computeClampedWorldTolerance(point, context, 12);

    let candidateEdges: CachedLineEquation[];
    if (context.spatialIndex) {
      const queried = context.spatialIndex.queryBBox(
        point.x - snapRadiusWorld,
        point.y - snapRadiusWorld,
        point.x + snapRadiusWorld,
        point.y + snapRadiusWorld
      );
      candidateEdges = filterCandidateLines(queried, context);
    } else {
      candidateEdges = filterCandidateLines(context.lineBuffer, context);
    }

    if (candidateEdges.length === 0) return [];

    const results: SnapResult[] = [];
    const hysteresisBonus = context.hysteresisBonusPx ?? 3.5;

    for (const edge of candidateEdges) {
      if (context.excludeSegmentIndices && context.excludeBuildingId === edge.objectId) {
        if (context.excludeSegmentIndices.includes(edge.edgeIndex)) continue;
      }

      const proj = projectPointToLine(point, edge);
      const sProj = context.worldToScreen(proj.projectedPoint.x, proj.projectedPoint.y);
      const distPx = Math.hypot(context.mouseScreen.sx - sProj.sx, context.mouseScreen.sy - sProj.sy);

      if (distPx <= thresholdPx) {
        if (proj.isOnSegment && !allowNearest) continue;
        if (!proj.isOnSegment && !allowExtension) continue;

        // Jeśli kursor jest w pobliżu wierzchołków lub środka tej krawędzi (strefa ±8px),
        // ustępujemy pierwszeństwa dyskretnym punktom charakterystycznym (Vertex/Midpoint)
        if (proj.isOnSegment && allowNearest) {
          const sP1 = context.worldToScreen(edge.p1.x, edge.p1.y);
          const sP2 = context.worldToScreen(edge.p2.x, edge.p2.y);
          const sMid = context.worldToScreen((edge.p1.x + edge.p2.x) / 2, (edge.p1.y + edge.p2.y) / 2);
          const dP1 = Math.hypot(context.mouseScreen.sx - sP1.sx, context.mouseScreen.sy - sP1.sy);
          const dP2 = Math.hypot(context.mouseScreen.sx - sP2.sx, context.mouseScreen.sy - sP2.sy);
          const dMid = Math.hypot(context.mouseScreen.sx - sMid.sx, context.mouseScreen.sy - sMid.sy);

          if (dP1 <= 8.0 || dP2 <= 8.0 || dMid <= 8.0) {
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

        const catBonus = computeCategoryAffinityBonus(
          edge.category,
          context.activeCategory,
          context.categoryAffinityWeights
        );
        effDist -= catBonus;

        if (
          context.previousSnapResult &&
          (context.previousSnapResult.type === 'edge' || context.previousSnapResult.type === 'extension')
        ) {
          if (context.previousSnapResult.sourceBuildingId === edge.objectId) {
            effDist -= hysteresisBonus;
          }
        }

        effDist = Math.max(0, effDist);

        const guideExtLength = 50;
        const guideLines = isExt
          ? [
              {
                p1: {
                  x: edge.p1.x - guideExtLength * edge.uX,
                  y: edge.p1.y - guideExtLength * edge.uY,
                },
                p2: {
                  x: edge.p2.x + guideExtLength * edge.uX,
                  y: edge.p2.y + guideExtLength * edge.uY,
                },
                type: 'extension' as const,
                isStatistical: false,
              },
            ]
          : undefined;

        const displayName = edge.objectName || edge.objectId;
        const lengthOverDistance = edge.length / Math.max(distPx, 1e-6);
        results.push({
          point: { ...proj.projectedPoint },
          snapped: true,
          type: isExt ? 'extension' : 'edge',
          label: isExt ? 'Przedłużenie (Extension)' : 'Punkt na krawędzi (Nearest)',
          description: isExt
            ? `Przedłużenie krawędzi (${displayName})`
            : `Rzut na krawędź (${displayName})`,
          screenDistancePx: distPx,
          sourceBuildingId: edge.objectId,
          sourceCategory: edge.category,
          sourceName: edge.objectName,
          sourceEdgeIndex: edge.edgeIndex,
          cachedEdge: edge,
          guideLines,
          metadata: { effDistPx: effDist, lengthOverDistance },
        });
      }
    }

    // Filtr górnoprzepustowy: odrzuca dolne 20% kandydatów wg length/distance (te same
    // dwie wielkości, które napędzają computeEdgeScore w SnapCoordinator), żeby małe
    // i odległe krawędzie nie zaśmiecały dalszego scoringu. Pomijany przy małej liczbie
    // kandydatów, gdzie percentyl nie ma sensu i mógłby wyzerować wynik.
    const MIN_CANDIDATES_FOR_CUTOFF = 5;
    let filtered = results;
    if (results.length >= MIN_CANDIDATES_FOR_CUTOFF) {
      const sortedMetrics = results.map((r) => r.metadata!.lengthOverDistance as number).sort((a, b) => a - b);
      const cutoffIndex = Math.floor(0.2 * sortedMetrics.length);
      const cutoff = sortedMetrics[cutoffIndex];
      filtered = results.filter((r) => (r.metadata!.lengthOverDistance as number) >= cutoff);
    }

    filtered.sort((a, b) => ((a.metadata?.effDistPx as number) ?? 0) - ((b.metadata?.effDistPx as number) ?? 0));
    return filtered;
  }
}
