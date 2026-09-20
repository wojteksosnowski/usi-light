import { Point2D } from '../../types/geometry';
import { SnapContext, SnapResult, SnapStrategy, ActiveSnapState } from './types';
import { VertexSnapStrategy } from './strategies/VertexSnapStrategy';
import { IntersectionSnapStrategy } from './strategies/IntersectionSnapStrategy';
import { MidpointSnapStrategy } from './strategies/MidpointSnapStrategy';
import { PerpendicularSnapStrategy } from './strategies/PerpendicularSnapStrategy';
import { EdgeSnapStrategy } from './strategies/EdgeSnapStrategy';
import { DirectionSnapStrategy } from './strategies/DirectionSnapStrategy';
import { GridSnapStrategy } from './strategies/GridSnapStrategy';
import { SpatialLineIndex } from './SpatialLineIndex';
import { PerfMonitor } from '../perf/PerfMonitor';

/**
 * SnapCoordinator - Centralny punkt wejścia podsystemu Snappingu.
 * Zarządza łańcuchem strategii (1..7), dwuetapową histerezą (Sticky Snap),
 * indeksem przestrzennym oraz cyklicznym przełączaniem kandydatów (Tab).
 */
export class SnapCoordinator {
  private strategies: SnapStrategy[] = [];
  private spatialIndex = new SpatialLineIndex();
  private activeSnapState: ActiveSnapState | null = null;

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
      new VertexSnapStrategy(), // Priorytet 10
      new IntersectionSnapStrategy(), // Priorytet 20
      new MidpointSnapStrategy(), // Priorytet 30
      new PerpendicularSnapStrategy(), // Priorytet 35
      new EdgeSnapStrategy(), // Priorytet 40
      new DirectionSnapStrategy(), // Priorytet 60
      new GridSnapStrategy(), // Priorytet 80
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

  public clearStickySnap(): void {
    this.activeSnapState = null;
  }

  private sortStrategies(): void {
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Główna metoda ewaluacji punktu w zadanym kontekście snappingu.
   */
  public evaluate(point: Point2D, context: SnapContext): SnapResult {
    const evalStart = performance.now();
    this.spatialIndex.rebuildIfStale(context.lineBuffer);
    const contextWithIndex: SnapContext = { ...context, spatialIndex: this.spatialIndex };

    const captureRadiusPx = context.thresholdPx ?? 12;
    const releaseRadiusPx = captureRadiusPx * 1.5;

    // 1. Sprawdzenie dwuetapowej histerezy (Sticky Snap State)
    if (this.activeSnapState && context.isOsnapActive) {
      const activeScreen = context.worldToScreen(this.activeSnapState.candidate.point.x, this.activeSnapState.candidate.point.y);
      const distFromActivePx = Math.hypot(
        context.mouseScreen.sx - activeScreen.sx,
        context.mouseScreen.sy - activeScreen.sy
      );

      // Jeśli kursor znajduje się w promieniu podtrzymania (releaseRadius), utrzymujemy dotychczasowy snap
      if (distFromActivePx < releaseRadiusPx) {
        // Upewnij się, że obiekt nie został usunięty lub wykluczony
        const srcBldg = this.activeSnapState.candidate.sourceBuildingId;
        const isExcluded = srcBldg && (
          srcBldg === context.excludeBuildingId ||
          (context.excludeBuildingIds && context.excludeBuildingIds.includes(srcBldg))
        );
        if (!isExcluded) {
          PerfMonitor.mark('snap.evaluate.sticky', performance.now() - evalStart);
          return {
            ...this.activeSnapState.candidate,
            screenDistancePx: distFromActivePx,
          };
        }
      } else {
        // Kursor opuścił strefę podtrzymania
        this.activeSnapState = null;
      }
    }

    // 2. Jeśli wymagane jest przełączanie kandydatów (Candidate Cycling z Tab)
    if (typeof context.candidateIndex === 'number' && context.candidateIndex > 0) {
      const allCandidates: SnapResult[] = [];
      for (const strategy of this.strategies) {
        if (strategy.findAllSnaps) {
          const snaps = strategy.findAllSnaps(point, contextWithIndex);
          allCandidates.push(...snaps);
        } else {
          const snap = strategy.findSnap(point, contextWithIndex);
          if (snap && snap.snapped) allCandidates.push(snap);
        }
      }

      if (allCandidates.length > 0) {
        const selected = allCandidates[context.candidateIndex % allCandidates.length];
        this.activeSnapState = {
          candidate: selected,
          screenPos: { ...context.mouseScreen },
          captureRadiusPx,
          releaseRadiusPx,
          acquiredAt: performance.now(),
        };
        PerfMonitor.mark('snap.evaluate.total', performance.now() - evalStart);
        return {
          ...selected,
          metadata: { ...selected.metadata, candidateCount: allCandidates.length },
        };
      }
    }

    // 3. Standardowy przebieg łańcucha strategii wg priorytetów 1..7 (z wykrywaniem relacji wtórnej Dual-Snap)
    let primaryResult: SnapResult | null = null;
    let secondaryResult: SnapResult | null = null;

    for (const strategy of this.strategies) {
      const result = PerfMonitor.time(`snap.strategy.${strategy.name}`, () =>
        strategy.findSnap(point, contextWithIndex)
      );
      if (result && result.snapped) {
        if (!primaryResult) {
          primaryResult = result;
        } else if (!secondaryResult) {
          const isSameSource =
            result.sourceBuildingId &&
            result.sourceBuildingId === primaryResult.sourceBuildingId &&
            result.sourceEdgeIndex === primaryResult.sourceEdgeIndex;
          if (!isSameSource && result.type !== primaryResult.type) {
            secondaryResult = result;
            break;
          }
        }
      }
    }

    if (primaryResult) {
      if (secondaryResult) {
        primaryResult = {
          ...primaryResult,
          secondarySnap: secondaryResult,
          secondaryGuideLines: secondaryResult.guideLines,
        };
      }

      // Zapisz stan do automatu histerezy jeśli to snap dyskretny (Vertex / Intersection / Midpoint / Perpendicular)
      if (['vertex', 'intersection', 'midpoint', 'perpendicular'].includes(primaryResult.type)) {
        this.activeSnapState = {
          candidate: primaryResult,
          screenPos: { ...context.mouseScreen },
          captureRadiusPx,
          releaseRadiusPx,
          acquiredAt: performance.now(),
        };
      }
      PerfMonitor.mark('snap.evaluate.total', performance.now() - evalStart);
      return primaryResult;
    }

    // Brak dopasowania — zerowanie stanu
    this.activeSnapState = null;
    PerfMonitor.mark('snap.evaluate.total', performance.now() - evalStart);
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
    excludeBuildingIds?: string[];
    hoveredBuildingId?: string;
    selectedBuildingId?: string;
    activeCategory?: import('../../types/geometry').ObjectCategory;
    categoryAffinityWeights?: Partial<Record<import('../../types/geometry').ObjectCategory, number>>;
    previousSnapResult?: import('./types').OsnapSnapResult | null;
    originPoint?: Point2D | null;
    candidateIndex?: number;
    activeSnapTypes?: Partial<Record<import('./types').SnapType, boolean>>;
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
    originPoint: options.originPoint,
    candidateIndex: options.candidateIndex,
    thresholdPx: options.screenSnapThresholdPx ?? 14,
    excludeBuildingId: options.excludeBuildingId,
    excludeBuildingIds: options.excludeBuildingIds,
    hoveredBuildingId: options.hoveredBuildingId,
    selectedBuildingId: options.selectedBuildingId,
    activeCategory: options.activeCategory,
    categoryAffinityWeights: options.categoryAffinityWeights,
    activeSnapTypes: options.activeSnapTypes,
  });

  if (!snapRes.snapped || snapRes.type === 'none' || snapRes.type === 'grid' || snapRes.type === 'direction') {
    return null;
  }

  const osnapType: import('./types').OsnapSnapType = snapRes.type === 'vertex'
    ? 'endpoint'
    : snapRes.type === 'intersection' || snapRes.type === 'otrack_intersection'
    ? 'otrack_intersection'
    : snapRes.type === 'midpoint'
    ? 'midpoint'
    : snapRes.type === 'perpendicular'
    ? 'perpendicular'
    : snapRes.type === 'extension'
    ? 'extension'
    : snapRes.type === 'otrack_ray'
    ? 'otrack_ray'
    : 'nearest';

  const priorityMap: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
    vertex: 1,
    intersection: 2,
    otrack_intersection: 2,
    midpoint: 3,
    perpendicular: 4,
    edge: 5,
    extension: 5,
    otrack_ray: 6,
  };

  let secondaryOsnap: import('./types').OsnapSnapResult | undefined = undefined;
  if (snapRes.secondarySnap && snapRes.secondarySnap.snapped) {
    const sec = snapRes.secondarySnap;
    const secType: import('./types').OsnapSnapType = sec.type === 'vertex'
      ? 'endpoint'
      : sec.type === 'intersection' || sec.type === 'otrack_intersection'
      ? 'otrack_intersection'
      : sec.type === 'midpoint'
      ? 'midpoint'
      : sec.type === 'perpendicular'
      ? 'perpendicular'
      : sec.type === 'extension'
      ? 'extension'
      : sec.type === 'otrack_ray'
      ? 'otrack_ray'
      : 'nearest';
    secondaryOsnap = {
      priority: priorityMap[sec.type] ?? 5,
      type: secType,
      snappedPoint: sec.point,
      screenDistancePx: sec.screenDistancePx ?? 0,
      label: sec.label ?? 'OSNAP',
      description: sec.description ?? '',
      sourcePoint: sec.sourcePoint,
      sourceBuildingId: sec.sourceBuildingId,
      sourceCategory: sec.sourceCategory,
      sourceName: sec.sourceName,
      sourceEdgeIndex: sec.sourceEdgeIndex,
      cachedEdge: sec.cachedEdge,
      rayLine: sec.guideLines && sec.guideLines.length > 0 ? { p1: sec.guideLines[0].p1, p2: sec.guideLines[0].p2 } : undefined,
    };
  }

  return {
    priority: priorityMap[snapRes.type] ?? 5,
    type: osnapType,
    snappedPoint: snapRes.point,
    screenDistancePx: snapRes.screenDistancePx ?? 0,
    label: snapRes.label ?? 'OSNAP',
    description: snapRes.description ?? '',
    sourcePoint: snapRes.sourcePoint,
    sourceBuildingId: snapRes.sourceBuildingId,
    sourceCategory: snapRes.sourceCategory,
    sourceName: snapRes.sourceName,
    sourceEdgeIndex: snapRes.sourceEdgeIndex,
    cachedEdge: snapRes.cachedEdge,
    rayLine: snapRes.guideLines && snapRes.guideLines.length > 0 ? { p1: snapRes.guideLines[0].p1, p2: snapRes.guideLines[0].p2 } : undefined,
    activeRays: snapRes.activeRays,
    intersectingAnchors: snapRes.intersectingAnchors,
    secondarySnap: secondaryOsnap,
    secondaryRayLine: secondaryOsnap?.rayLine,
    secondaryType: secondaryOsnap?.type,
  };
}
