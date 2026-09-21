import { Point2D } from '../../../types/geometry';
import { CachedLineEquation } from '../../../utils/lineBufferEngine';
import { SnapContext, SnapResult } from '../types';
import { filterCandidateLines } from './snapExclusionUtils';

/**
 * Rozstrzyga listę kandydackich krawędzi dla danego bbox: gdy dostępny jest spatialIndex,
 * zapytanie ograniczone do bbox + filtr wykluczeń; w przeciwnym razie liniowy skan całego
 * lineBuffer + ten sam filtr (kompatybilność wsteczna, patrz SnapContext.spatialIndex).
 */
export function resolveCandidateEdges(
  context: SnapContext,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): CachedLineEquation[] {
  if (context.spatialIndex) {
    const queried = context.spatialIndex.queryBBox(minX, minY, maxX, maxY);
    return filterCandidateLines(queried, context);
  }
  return filterCandidateLines(context.lineBuffer, context);
}

/**
 * Odległość ekranowa (px) między kursorem a punktem świata, przez context.worldToScreen.
 * Konsoliduje powtórzony wzorzec Math.hypot(mouseScreen - worldToScreen(p)) używany
 * w każdej strategii OSNAP oraz w OtrackManager/DirectionSnapStrategy.
 */
export function screenDistance(context: SnapContext, worldPoint: Point2D): number {
  const s = context.worldToScreen(worldPoint.x, worldPoint.y);
  return Math.hypot(context.mouseScreen.sx - s.sx, context.mouseScreen.sy - s.sy);
}

/**
 * Odejmuje bonus histerezy (context.hysteresisBonusPx, domyślnie 3.5px) od effDist, gdy
 * previousSnapResult istnieje i spełnia predykat `matches` przekazany przez wołającą strategię.
 * Warunek "matches" jest CELOWO różny między strategiami (np. Vertex dopuszcza identyczny punkt
 * LUB tego samego objectId; Edge/Extension wymaga tylko tego samego objectId, ale tylko gdy
 * poprzedni typ to 'edge'/'extension') — patrz strategies/hysteresisVertexVsEdge.test.ts, który
 * dokumentuje i chroni tę rozbieżność. Nie ujednolicać bez świadomej decyzji.
 */
export function computeHysteresisAdjustedDist(
  effDist: number,
  context: SnapContext,
  matches: (prev: SnapResult) => boolean
): number {
  if (context.previousSnapResult && matches(context.previousSnapResult)) {
    const bonus = context.hysteresisBonusPx ?? 3.5;
    return effDist - bonus;
  }
  return effDist;
}

/**
 * `findSnap()` boilerplate współdzielony przez wszystkie strategie OSNAP: pierwszy (najlepszy,
 * bo findAllSnaps sortuje po effDistPx) kandydat z findAllSnaps, lub null gdy brak.
 */
export function findSnapFromAll(
  strategy: { findAllSnaps(point: Point2D, context: SnapContext): SnapResult[] },
  point: Point2D,
  context: SnapContext
): SnapResult | null {
  const snaps = strategy.findAllSnaps(point, context);
  return snaps.length > 0 ? snaps[0] : null;
}

/**
 * Bonus odległościowy (px, odejmowany od effDist) łączący preferencję hover/selected (-2.0px
 * gdy krawędź należy do aktualnie podświetlonego/zaznaczonego obiektu) z bonusem powinowactwa
 * kategorii (computeCategoryAffinityBonus). Używany przez Vertex/Edge (jedyne strategie, które
 * mają hover/selected bonus); Intersection/Perpendicular wołają computeCategoryAffinityBonus
 * bezpośrednio, bo nie mają komponentu hover/selected.
 */
export function computeCategoryAndHoverBonus(
  edge: CachedLineEquation,
  context: SnapContext,
  categoryBonus: number
): number {
  let bonus = categoryBonus;
  if (edge.objectId && (edge.objectId === context.hoveredBuildingId || edge.objectId === context.selectedBuildingId)) {
    bonus += 2.0;
  }
  return bonus;
}
