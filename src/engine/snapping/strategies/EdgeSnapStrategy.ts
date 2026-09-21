import { Point2D } from '../../../types/geometry';
import { projectPointToLine } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy, computeClampedWorldTolerance, computeCategoryAffinityBonus, computeEdgeScore } from '../types';
import { resolveCandidateEdges, computeHysteresisAdjustedDist, findSnapFromAll, screenDistance, computeCategoryAndHoverBonus } from './strategyHelpers';
import { buildExtendedGuideline } from '../guidelineUtils';

export class EdgeSnapStrategy implements SnapStrategy {
  readonly name = 'EdgeSnapStrategy';
  readonly priority = 50; // Niższy priorytet niż punkty charakterystyczne

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

    const results: SnapResult[] = [];

    for (const edge of candidateEdges) {
      if (context.excludeSegmentIndices && context.excludeBuildingId === edge.objectId) {
        if (context.excludeSegmentIndices.includes(edge.edgeIndex)) continue;
      }

      const proj = projectPointToLine(point, edge);
      const distPx = screenDistance(context, proj.projectedPoint);

      if (distPx <= thresholdPx) {
        // Jeśli kursor jest w pobliżu wierzchołków tej krawędzi (strefa ±8px),
        // ustępujemy pierwszeństwa dyskretnym punktom charakterystycznym (Vertex)
        if (proj.isOnSegment) {
          const sP1 = context.worldToScreen(edge.p1.x, edge.p1.y);
          const sP2 = context.worldToScreen(edge.p2.x, edge.p2.y);
          const dP1 = Math.hypot(context.mouseScreen.sx - sP1.sx, context.mouseScreen.sy - sP1.sy);
          const dP2 = Math.hypot(context.mouseScreen.sx - sP2.sx, context.mouseScreen.sy - sP2.sy);

          if (dP1 <= 8.0 || dP2 <= 8.0) {
            continue;
          }
        }

        const isExt = !proj.isOnSegment;
        const priorityPenalty = isExt ? 0.0 : 4.0; // Kara odległościowa dla ciągłej krawędzi

        const catBonus = computeCategoryAffinityBonus(
          edge.category,
          context.activeCategory,
          context.categoryAffinityWeights
        );
        let effDist = distPx + priorityPenalty - computeCategoryAndHoverBonus(edge, context, catBonus);

        effDist = computeHysteresisAdjustedDist(
          effDist,
          context,
          (prev) => (prev.type === 'edge' || prev.type === 'extension') && prev.sourceBuildingId === edge.objectId
        );

        effDist = Math.max(0, effDist);

        const guideExtLength = 50;
        const guideLines = isExt
          ? [
              {
                ...buildExtendedGuideline(edge.p1, edge.p2, { x: edge.uX, y: edge.uY }, guideExtLength),
                type: 'extension' as const,
                isStatistical: false,
              },
            ]
          : undefined;

        const displayName = edge.objectName || edge.objectId;
        const worldDist = Math.hypot(point.x - proj.projectedPoint.x, point.y - proj.projectedPoint.y);
        const edgeScore = computeEdgeScore(
          edge.length,
          worldDist,
          snapRadiusWorld,
          edge.category,
          context.activeCategory,
          context.config?.projectRadius ?? 50,
          context.categoryAffinityWeights
        );
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
          metadata: { effDistPx: effDist, edgeScore },
        });
      }
    }

    // SNAPfiltr (spec Faza 1): odrzuca dolne 50% kandydatów węzłów SNAP wg tego samego
    // multiplikatywnego Score_edge = computeEdgeScore(...), który napędza końcowy ranking
    // d_eff w SnapCoordinator — pruning i scoring są teraz spójne. Pomijany przy małej
    // liczbie kandydatów, gdzie percentyl nie ma sensu i mógłby wyzerować wynik.
    // Filtr niezależny od OTROfiltra w src/utils/segmentStatistics.ts (ten działa na statystyce
    // segmentów fasad dla wyznaczenia kierunku dominującego OTRACK — inny algorytm, inne dane wejściowe).
    const MIN_CANDIDATES_FOR_CUTOFF = 5;
    let filtered = results;
    if (results.length >= MIN_CANDIDATES_FOR_CUTOFF) {
      const sortedScores = results.map((r) => r.metadata!.edgeScore as number).sort((a, b) => a - b);
      const cutoffIndex = Math.floor(0.5 * sortedScores.length);
      const cutoff = sortedScores[cutoffIndex];
      filtered = results.filter((r) => (r.metadata!.edgeScore as number) >= cutoff);
    }

    // DEV-only: podgląd wyników SNAPfiltra (które kandydaty przeszły/odrzucone), zbierany tylko
    // gdy debugCollectEdgeHpf jest true (patrz EdgeSnapStrategy.medianPruning.test.ts).
    if (context.debugCollectEdgeHpf) {
      const passedSet = new Set(filtered);
      context.debugEdgeHpfCandidates = results.map((r) => ({ point: r.point, passed: passedSet.has(r) }));
    }

    filtered.sort((a, b) => ((a.metadata?.effDistPx as number) ?? 0) - ((b.metadata?.effDistPx as number) ?? 0));
    return filtered;
  }
}
