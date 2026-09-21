import { Point2D } from '../../../types/geometry';
import { CachedLineEquation, intersectLines, projectPointToLine } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult, SnapStrategy, computeClampedWorldTolerance, computeCategoryAffinityBonus } from '../types';
import { filterCandidateLines } from './snapExclusionUtils';

/**
 * IntersectionSnapStrategy - Wykrywa punkty przecięcia rzeczywistego i pozornego
 * pomiędzy krawędziami obiektów w scenie.
 * Priorytet 20 (Wysoki, bezpośrednio po wierzchołkach).
 */
export class IntersectionSnapStrategy implements SnapStrategy {
  readonly name = 'IntersectionSnapStrategy';
  readonly priority = 20; // Wysoki priorytet - punkt przecięcia dwóch geometrii

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    const snaps = this.findAllSnaps(point, context);
    return snaps.length > 0 ? snaps[0] : null;
  }

  findAllSnaps(point: Point2D, context: SnapContext): SnapResult[] {
    if (!context.isOsnapActive) return [];
    if (context.activeSnapTypes && context.activeSnapTypes.intersection === false) return [];

    const { worldRadius, thresholdPx } = computeClampedWorldTolerance(point, context);

    let candidateEdges: CachedLineEquation[];
    if (context.spatialIndex) {
      const queried = context.spatialIndex.queryBBox(
        point.x - worldRadius,
        point.y - worldRadius,
        point.x + worldRadius,
        point.y + worldRadius
      );
      candidateEdges = filterCandidateLines(queried, context);
    } else {
      candidateEdges = filterCandidateLines(context.lineBuffer, context);
    }

    const n = candidateEdges.length;
    if (n < 2) return [];

    const results: SnapResult[] = [];
    const seenPoints: Point2D[] = [];

    for (let i = 0; i < n; i++) {
      const e1 = candidateEdges[i];
      for (let j = i + 1; j < n; j++) {
        const e2 = candidateEdges[j];
        if (e1.id === e2.id) continue;

        const intPt = intersectLines(e1, e2);
        if (!intPt) continue;

        // Sprawdź czy punkt leży w promieniu poszukiwania w świecie
        if (Math.hypot(intPt.x - point.x, intPt.y - point.y) > worldRadius) continue;

        // Sprawdź czy punkt leży w pobliżu obu segmentów (dozwolone drobne przedłużenie)
        const proj1 = projectPointToLine(intPt, e1);
        const proj2 = projectPointToLine(intPt, e2);
        const extTolerance = worldRadius * 0.5;

        const onE1 = proj1.t >= -extTolerance && proj1.t <= e1.length + extTolerance;
        const onE2 = proj2.t >= -extTolerance && proj2.t <= e2.length + extTolerance;
        if (!onE1 || !onE2) continue;

        const s = context.worldToScreen(intPt.x, intPt.y);
        const distPx = Math.hypot(context.mouseScreen.sx - s.sx, context.mouseScreen.sy - s.sy);

        if (distPx <= thresholdPx) {
          // Deduplikacja bardzo bliskich przecięć
          const isDuplicate = seenPoints.some((p) => Math.hypot(p.x - intPt.x, p.y - intPt.y) < 1e-3);
          if (isDuplicate) continue;
          seenPoints.push(intPt);

          let effDist = distPx;
          const catBonus1 = computeCategoryAffinityBonus(e1.category, context.activeCategory, context.categoryAffinityWeights);
          const catBonus2 = computeCategoryAffinityBonus(e2.category, context.activeCategory, context.categoryAffinityWeights);
          effDist -= (catBonus1 + catBonus2) * 0.5;
          effDist = Math.max(0, effDist);

          const name1 = e1.objectName || e1.objectId;
          const name2 = e2.objectName || e2.objectId;

          results.push({
            point: { ...intPt },
            snapped: true,
            type: 'intersection',
            label: 'Przecięcie (Intersection)',
            description: `Przecięcie krawędzi (${name1} ✕ ${name2})`,
            screenDistancePx: distPx,
            sourcePoint: intPt,
            sourceBuildingId: e1.objectId,
            sourceCategory: e1.category,
            sourceName: e1.objectName,
            cachedEdge: e1,
            guideLines: [
              { p1: e1.p1, p2: e1.p2, type: 'intersection' },
              { p1: e2.p1, p2: e2.p2, type: 'intersection' },
            ],
            metadata: {
              effDistPx: effDist,
              intersectedEdges: [e1, e2],
            },
          });
        }
      }
    }

    results.sort((a, b) => ((a.metadata?.effDistPx as number) ?? (a.screenDistancePx ?? 0)) - ((b.metadata?.effDistPx as number) ?? (b.screenDistancePx ?? 0)));
    return results;
  }
}
