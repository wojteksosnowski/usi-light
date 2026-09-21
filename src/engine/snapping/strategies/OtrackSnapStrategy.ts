import { Point2D } from '../../../types/geometry';
import { SnapContext, SnapResult, SnapStrategy } from '../types';
import { OtrackManager } from '../OtrackManager';
import { VertexSnapStrategy } from './VertexSnapStrategy';

/**
 * OtrackSnapStrategy - Adapter integrujący OtrackManager (akwizycja punktów przez Hover Dwell
 * i generowanie promieni śledzenia biegunowego) jako pełnoprawną strategię SnapCoordinator.
 *
 * Stan (zdobyte kotwice / dwell) jest trzymany wewnątrz instancji OtrackManager, która musi
 * przetrwać między klatkami (kolejnymi wywołaniami findSnap) — dlatego ta strategia jest
 * stateful i powinna być tworzona raz na cały cykl życia SnapCoordinator (nie per-klatka).
 *
 * Priorytet 55 (pomiędzy Edge a Direction) ma znaczenie wyłącznie dla kolejności iteracji —
 * o zwycięskim kandydacie decyduje globalne porównanie d_eff w SnapCoordinator.evaluate().
 */
export class OtrackSnapStrategy implements SnapStrategy {
  readonly name = 'OtrackSnapStrategy';
  readonly priority = 55;

  private readonly manager: OtrackManager;
  private readonly vertexProbe = new VertexSnapStrategy();

  constructor(manager = new OtrackManager()) {
    this.manager = manager;
  }

  public getManager(): OtrackManager {
    return this.manager;
  }

  findSnap(point: Point2D, context: SnapContext): SnapResult | null {
    if (!context.isOsnapActive || !context.isDirectionSnappingActive) return null;

    // Akwizycja punktów kotwiczących: wykorzystujemy istniejące dopasowanie wierzchołka
    // (VertexSnapStrategy) jako detektor "kursor spoczywa nad wierzchołkiem", zamiast
    // duplikować logikę hit-testu geometrii.
    const hoveredVertex = this.vertexProbe.findSnap(point, context);
    this.manager.updateDwell(
      hoveredVertex?.snapped ? hoveredVertex.point : null,
      context.mouseScreen,
      hoveredVertex?.sourceBuildingId,
      performance.now()
    );

    const result = this.manager.evaluateOtrackSnap(point, context);
    if (!result || !result.snapped) return null;

    return {
      ...result,
      metadata: { ...result.metadata, effDistPx: result.screenDistancePx ?? 0 },
    };
  }
}
