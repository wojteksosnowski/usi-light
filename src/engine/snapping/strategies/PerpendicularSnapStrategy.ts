import { Point2D } from '../../../types/geometry';
import { projectPointToLine } from '../../../utils/lineBufferEngine';
import { distance } from '../../../utils/math2d';
import { SnapContext, SnapResult, SnapStrategy, SnapGuideLine, computeClampedWorldTolerance, computeCategoryAffinityBonus } from '../types';
import { resolveCandidateEdges, findSnapFromAll, screenDistance } from './strategyHelpers';

// Maksymalny dopuszczalny zasięg rzutu na PRZEDŁUŻENIE (poza rzeczywistym odcinkiem), jako
// wielokrotność długości krawędzi, z sensownym minimum/maksimum w metrach. Zapobiega sytuacji,
// w której odległa, niepowiązana ściana "widmowo" przechwytuje kursor swoim nośnikiem prostej.
const MAX_EXTENSION_FACTOR = 0.5;
const MIN_MAX_EXTENSION_METERS = 1.5;
const MAX_MAX_EXTENSION_METERS = 8.0;

/**
 * PerpendicularSnapStrategy - Wykrywa punkt rzutu prostopadłego z punktu bazowego
 * rysowania (originPoint) na krawędź obiektu.
 * Priorytet 35 (pomiędzy Intersection a Nearest Edge).
 */
export class PerpendicularSnapStrategy implements SnapStrategy {
  readonly name = 'PerpendicularSnapStrategy';
  readonly priority = 35; // Wysoki priorytet dla rzutów prostopadłych z aktywnego punktu bazowego

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    return findSnapFromAll(this, point, context);
  }

  findAllSnaps(point: Point2D, context: SnapContext): SnapResult[] {
    if (!context.isOsnapActive) return [];
    if (!context.originPoint) return [];

    const origin = context.originPoint;
    const { worldRadius: snapRadiusWorld, thresholdPx } = computeClampedWorldTolerance(point, context);

    // Ograniczenie przestrzenne kandydatów: zamiast pełnego skanu całej sceny (co pozwalało
    // odległym, niepowiązanym ścianom "widmowo" przechwytywać kursor swoim nośnikiem prostej —
    // patrz "Prostopadły do przedłużenia" false-positive), rozważamy tylko krawędzie leżące
    // blisko kursora LUB blisko punktu bazowego origin (bo rzut liczony jest z origin na krawędź,
    // ale musi też wypaść blisko kursora, więc obie okolice są istotne).
    const candidateEdges = resolveCandidateEdges(
      context,
      Math.min(point.x, origin.x) - snapRadiusWorld,
      Math.min(point.y, origin.y) - snapRadiusWorld,
      Math.max(point.x, origin.x) + snapRadiusWorld,
      Math.max(point.y, origin.y) + snapRadiusWorld
    );

    if (candidateEdges.length === 0) return [];

    const results: SnapResult[] = [];

    for (const edge of candidateEdges) {
      // Oblicz rzut prostopadły punktu bazowego origin na prostą krawędzi
      const proj = projectPointToLine(origin, edge);
      const perpPt = proj.projectedPoint;

      // Sprawdź czy kursor myszy znajduje się blisko rzutu prostopadłego
      const distPx = screenDistance(context, perpPt);

      if (distPx <= thresholdPx) {
        const isOnSegment = proj.isOnSegment;
        const d1 = distance(edge.p1, perpPt);
        const d2 = distance(edge.p2, perpPt);

        if (!isOnSegment) {
          // Twardy limit zasięgu przedłużenia: odrzucamy rzuty wypadające dalece poza
          // rzeczywisty odcinek (patrz stałe MAX_EXTENSION_* powyżej) — bez tego dowolnie
          // odległy nośnik prostej mógł "widmowo" przechwycić kursor.
          const extensionDist = Math.min(d1, d2);
          const maxExtension = Math.min(
            MAX_MAX_EXTENSION_METERS,
            Math.max(MIN_MAX_EXTENSION_METERS, edge.length * MAX_EXTENSION_FACTOR)
          );
          if (extensionDist > maxExtension) continue;
        }

        let effDist = distPx;
        // Istotna kara za rzut na przedłużenie względem rzutu na rzeczywisty odcinek —
        // podniesiona z dawnych +1.5px, by nie przegrywał w globalnym d_eff wyłącznie przez
        // przypadkową bliskość kursora do nośnika dalekiej, niepowiązanej ściany.
        if (!isOnSegment) {
          effDist += 6.0;
        }

        const catBonus = computeCategoryAffinityBonus(edge.category, context.activeCategory, context.categoryAffinityWeights);
        effDist -= catBonus;
        effDist = Math.max(0, effDist);

        const displayName = edge.objectName || edge.objectId;

        const guideLines: SnapGuideLine[] = [
          { p1: origin, p2: perpPt, type: 'perpendicular' },
          { p1: edge.p1, p2: edge.p2, type: 'perpendicular' },
        ];

        if (!isOnSegment) {
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
