import { Point2D } from '../../types/geometry';
import { SnapContext, SnapResult, SnapStrategy } from './types';
import { VertexSnapStrategy } from './strategies/VertexSnapStrategy';
import { MidpointSnapStrategy } from './strategies/MidpointSnapStrategy';
import { EdgeSnapStrategy } from './strategies/EdgeSnapStrategy';
import { DirectionSnapStrategy } from './strategies/DirectionSnapStrategy';
import { GridSnapStrategy } from './strategies/GridSnapStrategy';

/**
 * SnapCoordinator - Centralny punkt wejścia podsystemu Snappingu.
 * Zarządza łańcuchem strategii i deleguje wyszukiwanie snapów wg priorytetów.
 */
export class SnapCoordinator {
  private strategies: SnapStrategy[] = [];

  constructor(customStrategies?: SnapStrategy[]) {
    if (customStrategies !== undefined) {
      this.strategies = [...customStrategies];
      this.sortStrategies();
    } else {
      this.registerDefaultStrategies();
    }
  }

  private registerDefaultStrategies(): void {
    this.strategies = [
      new VertexSnapStrategy(),
      new MidpointSnapStrategy(),
      new EdgeSnapStrategy(),
      new DirectionSnapStrategy(),
      new GridSnapStrategy(),
    ];
    this.sortStrategies();
  }

  public registerStrategy(strategy: SnapStrategy): void {
    this.strategies.push(strategy);
    this.sortStrategies();
  }

  public unregisterStrategy(strategyName: string): void {
    this.strategies = this.strategies.filter((s) => s.name !== strategyName);
  }

  public getStrategies(): readonly SnapStrategy[] {
    return this.strategies;
  }

  private sortStrategies(): void {
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Główna metoda ewaluacji punktu w zadanym kontekście snappingu.
   */
  public evaluate(point: Point2D, context: SnapContext): SnapResult {
    for (const strategy of this.strategies) {
      const result = strategy.findSnap(point, context);
      if (result && result.snapped) {
        return result;
      }
    }

    return {
      point: { ...point },
      snapped: false,
      type: 'none',
    };
  }
}

/**
 * Adapter ułatwiający bezpośrednią integrację z CadCanvas (OsnapSnapResult)
 */
export function evaluateOsnapSnapWithCoordinator(
  coordinator: SnapCoordinator,
  options: {
    mouseWorld: Point2D;
    lineBuffer: import('../../utils/lineBufferEngine').CachedLineEquation[];
    worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
    screenSnapThresholdPx?: number;
    excludeBuildingId?: string;
    hoveredBuildingId?: string;
    selectedBuildingId?: string;
    previousSnapResult?: import('./types').OsnapSnapResult | null;
  }
): import('./types').OsnapSnapResult | null {
  const mouseScreen = options.worldToScreen(options.mouseWorld.x, options.mouseWorld.y);
  const snapRes = coordinator.evaluate(options.mouseWorld, {
    mouseWorld: options.mouseWorld,
    mouseScreen,
    worldToScreen: options.worldToScreen,
    screenToWorld: () => ({ wx: 0, wy: 0 }),
    buildings: [],
    lineBuffer: options.lineBuffer,
    isOsnapActive: true,
    isDirectionSnappingActive: false,
    thresholdPx: options.screenSnapThresholdPx ?? 14,
    excludeBuildingId: options.excludeBuildingId,
    hoveredBuildingId: options.hoveredBuildingId,
    selectedBuildingId: options.selectedBuildingId,
  });

  if (!snapRes.snapped || snapRes.type === 'none' || snapRes.type === 'grid' || snapRes.type === 'direction') {
    return null;
  }

  const osnapType = snapRes.type === 'vertex'
    ? 'endpoint'
    : snapRes.type === 'midpoint'
    ? 'midpoint'
    : snapRes.type === 'extension'
    ? 'extension'
    : 'nearest';

  return {
    priority: snapRes.type === 'vertex' ? 1 : snapRes.type === 'midpoint' ? 2 : 5,
    type: osnapType,
    snappedPoint: snapRes.point,
    screenDistancePx: snapRes.screenDistancePx ?? 0,
    label: snapRes.label ?? 'OSNAP',
    description: snapRes.description ?? '',
    sourcePoint: snapRes.sourcePoint,
    sourceBuildingId: snapRes.sourceBuildingId,
    sourceEdgeIndex: snapRes.sourceEdgeIndex,
    cachedEdge: snapRes.cachedEdge,
    rayLine: snapRes.guideLines && snapRes.guideLines.length > 0 ? { p1: snapRes.guideLines[0].p1, p2: snapRes.guideLines[0].p2 } : undefined,
  };
}
