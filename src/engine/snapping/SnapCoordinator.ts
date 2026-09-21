import { Point2D } from '../../types/geometry';
import { SnapContext, SnapResult, SnapStrategy, ActiveSnapState, SNAP_TYPE_WEIGHTS, SnapEngineConfig, DEFAULT_SNAP_ENGINE_CONFIG, computeEdgeScore, computeClampedWorldTolerance } from './types';
import { VertexSnapStrategy } from './strategies/VertexSnapStrategy';
import { IntersectionSnapStrategy } from './strategies/IntersectionSnapStrategy';
import { PerpendicularSnapStrategy } from './strategies/PerpendicularSnapStrategy';
import { EdgeSnapStrategy } from './strategies/EdgeSnapStrategy';
import { DirectionSnapStrategy } from './strategies/DirectionSnapStrategy';
import { OtrackSnapStrategy } from './strategies/OtrackSnapStrategy';
import { GridSnapStrategy } from './strategies/GridSnapStrategy';
import { SpatialLineIndex } from './SpatialLineIndex';
import { PerfMonitor } from '../perf/PerfMonitor';

/**
 * Wyznacza dEff kandydata `target` tak, jakby kursor znajdował się w punkcie `cursorPoint`
 * zamiast rzeczywistej pozycji myszy — użyteczne do testu punktu stałego (fixed-point).
 */
const OSNAP_PRIORITY_MAP: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
  vertex: 1,
  intersection: 2,
  otrack_intersection: 2,
  perpendicular: 4,
  edge: 5,
  extension: 5,
  otrack_ray: 6,
};

function mapSnapTypeToOsnapType(type: SnapResult['type']): import('./types').OsnapSnapType {
  switch (type) {
    case 'vertex':
      return 'endpoint';
    case 'intersection':
    case 'otrack_intersection':
      return 'otrack_intersection';
    case 'perpendicular':
      return 'perpendicular';
    case 'extension':
      return 'extension';
    case 'otrack_ray':
      return 'otrack_ray';
    default:
      return 'nearest';
  }
}

function computeDEffFrom(
  cursorPoint: Point2D,
  target: SnapResult,
  edgeScore: number,
  context: SnapContext
): number {
  const cursorScreen = context.worldToScreen(cursorPoint.x, cursorPoint.y);
  const targetScreen = context.worldToScreen(target.point.x, target.point.y);
  const distPx = Math.hypot(cursorScreen.sx - targetScreen.sx, cursorScreen.sy - targetScreen.sy);
  const weight = (context.config?.typeWeights ?? SNAP_TYPE_WEIGHTS)[target.type] ?? 0.5;
  return distPx / Math.max(1e-6, weight * edgeScore);
}

/**
 * Test zbieżności punktu stałego (spec §4, "Idempotent Fixed-Point"): dla każdego kandydata
 * w kolejności malejącej jakości sprawdza, czy pozostałby globalnym zwycięzcą, gdyby kursor
 * znalazł się dokładnie w jego punkcie. Zwraca pierwszego zbieżnego kandydata, a gdy żaden nie
 * jest zbieżny — null (wołający ma wtedy zachować surową pozycję kursora, zgodnie ze spec).
 */
function selectFixedPointCandidate(
  scoredResults: { result: SnapResult; dEff: number; edgeScore: number }[],
  context: SnapContext
): SnapResult | null {
  for (let i = 0; i < scoredResults.length; i++) {
    const candidate = scoredResults[i];
    let winnerIdx = 0;
    let winnerDEff = Infinity;
    for (let j = 0; j < scoredResults.length; j++) {
      const dEff = computeDEffFrom(candidate.result.point, scoredResults[j].result, scoredResults[j].edgeScore, context);
      if (dEff < winnerDEff) {
        winnerDEff = dEff;
        winnerIdx = j;
      }
    }
    if (winnerIdx === i) return candidate.result;
  }
  return null;
}

/**
 * SnapCoordinator - Centralny punkt wejścia podsystemu Snappingu.
 * Zarządza łańcuchem strategii (1..7), dwuetapową histerezą (Sticky Snap),
 * indeksem przestrzennym oraz cyklicznym przełączaniem kandydatów (Tab).
 */
export class SnapCoordinator {
  private strategies: SnapStrategy[] = [];
  private spatialIndex = new SpatialLineIndex();
  private activeSnapState: ActiveSnapState | null = null;
  private readonly config: SnapEngineConfig;

  constructor(customStrategies?: SnapStrategy[], config?: Partial<SnapEngineConfig>) {
    this.config = { ...DEFAULT_SNAP_ENGINE_CONFIG, ...config };
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
      new PerpendicularSnapStrategy(), // Priorytet 35
      new EdgeSnapStrategy(), // Priorytet 40
      new OtrackSnapStrategy(), // Priorytet 55 (akwizycja Hover Dwell + promienie śledzenia)
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

  /**
   * Zapewnia świeży indeks przestrzenny (rbush) dla podanego bufora linii i go zwraca —
   * do użytku poza `evaluate()`, np. przez objectDragSnap.ts przy przeciąganiu obiektów,
   * by uniknąć osobnego, zduplikowanego indeksu rbush per drag-session.
   */
  public ensureSpatialIndex(lineBuffer: SnapContext['lineBuffer']): SpatialLineIndex {
    this.spatialIndex.rebuildIfStale(lineBuffer);
    return this.spatialIndex;
  }

  public getStrategies(): readonly SnapStrategy[] {
    return this.strategies;
  }

  public clearStickySnap(): void {
    this.activeSnapState = null;
  }

  /** Czyści zdobyte kotwice OTRACK (Hover Dwell), np. po zakończeniu/anulowaniu rysowania. */
  public clearOtrackAnchors(): void {
    const otrack = this.strategies.find((s): s is OtrackSnapStrategy => s instanceof OtrackSnapStrategy);
    otrack?.getManager().clearAnchors();
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
    const contextWithIndex: SnapContext = { ...context, spatialIndex: this.spatialIndex, config: this.config };

    const captureRadiusPx = context.thresholdPx ?? 12;
    const releaseRadiusPx = captureRadiusPx * 1.5;

    // DEV-only: wymuś obliczenie kandydatów HPF od razu, niezależnie od tego, którą ścieżką
    // (sticky / candidate-cycling / scoring / brak dopasowania) zakończy się ta ewaluacja —
    // inaczej debugEdgeHpfCandidates nigdy nie dotrze do UI, gdy wygrywa sticky snap lub gdy
    // żadna strategia nie znajdzie dopasowania.
    if (context.debugCollectEdgeHpf) {
      const edgeStrategy = this.strategies.find((s): s is EdgeSnapStrategy => s instanceof EdgeSnapStrategy);
      edgeStrategy?.findAllSnaps(point, contextWithIndex);
    }
    const withDebug = <T extends SnapResult>(result: T): T =>
      contextWithIndex.debugEdgeHpfCandidates
        ? { ...result, debugEdgeHpfCandidates: contextWithIndex.debugEdgeHpfCandidates }
        : result;

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
          return withDebug({
            ...this.activeSnapState.candidate,
            screenDistancePx: distFromActivePx,
          });
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
        return withDebug({
          ...selected,
          metadata: { ...selected.metadata, candidateCount: allCandidates.length },
        });
      }
    }

    // 3. Zbierz najlepszego kandydata z każdej strategii i wybierz globalne minimum d_eff
    // d_eff = distancePx / (SNAP_TYPE_WEIGHTS[type] * EdgeScore(krawędź)) — porównywalne między WSZYSTKIMI
    // typami snapu, zamiast sztywnej hierarchii priorytetów strategii (priority-tier winner-takes-all).
    const { worldRadius: apertureWorld } = computeClampedWorldTolerance(point, context);

    const scoredResults: { result: SnapResult; dEff: number; edgeScore: number }[] = [];
    for (const strategy of this.strategies) {
      const result = PerfMonitor.time(`snap.strategy.${strategy.name}`, () =>
        strategy.findSnap(point, contextWithIndex)
      );
      if (result && result.snapped) {
        const distPx = (result.metadata?.effDistPx as number | undefined) ?? result.screenDistancePx ?? 0;
        const edge = result.cachedEdge;
        const edgeScore = edge
          ? computeEdgeScore(
              edge.length,
              Math.hypot(point.x - result.point.x, point.y - result.point.y),
              apertureWorld,
              edge.category,
              context.activeCategory,
              this.config.projectRadius
            )
          : 1;
        const weight = this.config.typeWeights[result.type] ?? 0.5;
        const dEff = distPx / Math.max(1e-6, weight * edgeScore);
        scoredResults.push({ result, dEff, edgeScore });
      }
    }

    scoredResults.sort((a, b) => a.dEff - b.dEff);

    // Fixed-point/idempotency test (spec §4): potwierdza, że gdyby kursor znalazł się
    // dokładnie w punkcie zwycięzcy, ten sam kandydat nadal wygrałby globalne porównanie
    // d_eff. Chroni to przed drżeniem (jitter) między dwoma niemal pokrywającymi się węzłami
    // różnych typów (np. vertex vs. edge w tym samym miejscu) — w typowym przypadku zwycięzca
    // zbiega trywialnie (odległość do siebie samego = 0), więc koszt dodatkowy jest pomijalny.
    let primaryResult: SnapResult | null = selectFixedPointCandidate(scoredResults, contextWithIndex);
    let secondaryResult: SnapResult | null = null;
    if (primaryResult) {
      for (let i = 1; i < scoredResults.length; i++) {
        const candidate = scoredResults[i].result;
        const isSameSource =
          candidate.sourceBuildingId &&
          candidate.sourceBuildingId === primaryResult.sourceBuildingId &&
          candidate.sourceEdgeIndex === primaryResult.sourceEdgeIndex;
        if (!isSameSource && candidate.type !== primaryResult.type) {
          secondaryResult = candidate;
          break;
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

      // Zapisz stan do automatu histerezy jeśli to snap dyskretny (Vertex / Intersection / Perpendicular)
      if (['vertex', 'intersection', 'perpendicular'].includes(primaryResult.type)) {
        this.activeSnapState = {
          candidate: primaryResult,
          screenPos: { ...context.mouseScreen },
          captureRadiusPx,
          releaseRadiusPx,
          acquiredAt: performance.now(),
        };
      }
      PerfMonitor.mark('snap.evaluate.total', performance.now() - evalStart);
      return withDebug(primaryResult);
    }

    // Brak dopasowania — zerowanie stanu
    this.activeSnapState = null;
    PerfMonitor.mark('snap.evaluate.total', performance.now() - evalStart);
    return withDebug({
      point: { ...point },
      snapped: false,
      type: 'none',
    });
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
    /** DEV-only: gdy true, zbiera surowych kandydatów krawędzi (przed/po filtrze HPF) do podglądu debugowego. */
    debug?: boolean;
  }
): { osnap: import('./types').OsnapSnapResult | null; debugEdgeHpfCandidates?: { point: Point2D; passed: boolean }[] } {
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
    debugCollectEdgeHpf: options.debug,
  });

  const debugEdgeHpfCandidates = snapRes.debugEdgeHpfCandidates;

  if (!snapRes.snapped || snapRes.type === 'none' || snapRes.type === 'grid' || snapRes.type === 'direction') {
    return { osnap: null, debugEdgeHpfCandidates };
  }

  const osnapType = mapSnapTypeToOsnapType(snapRes.type);

  let secondaryOsnap: import('./types').OsnapSnapResult | undefined = undefined;
  if (snapRes.secondarySnap && snapRes.secondarySnap.snapped) {
    const sec = snapRes.secondarySnap;
    const secType = mapSnapTypeToOsnapType(sec.type);
    secondaryOsnap = {
      priority: OSNAP_PRIORITY_MAP[sec.type] ?? 5,
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
    osnap: {
      priority: OSNAP_PRIORITY_MAP[snapRes.type] ?? 5,
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
      debugEdgeHpfCandidates,
    },
    debugEdgeHpfCandidates,
  };
}
