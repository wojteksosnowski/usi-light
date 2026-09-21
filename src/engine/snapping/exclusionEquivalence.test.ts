import { describe, it, expect } from 'vitest';
import { isIdExcluded, isLineExcluded, filterCandidateLines } from './strategies/snapExclusionUtils';
import { SnapContext } from './types';
import { createCachedLineEquation, CachedLineEquation } from '../../utils/lineBufferEngine';

/**
 * Charakteryzuje 3 miejsca, w których silnik odpowiada na pytanie "czy ta krawędź/id
 * jest wykluczona?", zanim jakakolwiek konsolidacja (Faza B3 planu refaktoru) je dotknie:
 *
 *  a) 4 strategie OSNAP (Vertex/Intersection/Perpendicular/Edge) -> filterCandidateLines/isLineExcluded,
 *     zasilane z context.excludeBuildingId + context.excludeBuildingIds.
 *  b) objectDragSnap.ts -> lokalny `isExcludedEdge = (e) => isIdExcluded(e.objectId, excludedSet)`,
 *     gdzie excludedSet = new Set(excludeBuildingIds) + movingBuildingId/buildingId.
 *  c) DirectionSnapStrategy.ts -> lokalny `isBldgExcluded = (id) => isIdExcluded(id, excludedSet)`,
 *     gdzie excludedSet = new Set(excludeBuildingIds) + excludeBuildingId.
 *
 * WAŻNE ODKRYCIE (koryguje założenie planu): (b) i (c) już dziś wywołują dokładnie tę samą
 * funkcję `isIdExcluded` ze snapExclusionUtils.ts — różnią się tylko SPOSOBEM budowania
 * `excludedSet` (z osobnych pól opcji/kontekstu), nie logiką dopasowania. Jedyna realna
 * rozbieżność leży między (a) (isLineExcluded, które czyta bezpośrednio z SnapContext) i
 * (b)/(c) (manualne Set + isIdExcluded). Ten test dowodzi, że mimo różnych wejść dają one
 * TEN SAM wynik dla tych samych efektywnych zbiorów wykluczeń — bezpieczna podstawa pod
 * konsolidację API w Fazie B3.
 */
describe('exclusion filtering equivalence across the 3 call sites', () => {
  const makeLine = (id: string, objectId: string): CachedLineEquation =>
    createCachedLineEquation(id, objectId, 0, { x: 0, y: 0 }, { x: 1, y: 0 });

  const cases: { objectId: string; excludeBuildingId?: string; excludeBuildingIds?: string[] }[] = [
    { objectId: 'bldg-a', excludeBuildingId: 'bldg-a' },
    { objectId: 'bldg-a_zone_0', excludeBuildingId: 'bldg-a' },
    { objectId: 'bldg-a-edge-1', excludeBuildingId: 'bldg-a' },
    { objectId: 'bldg-b', excludeBuildingId: 'bldg-a' },
    { objectId: 'bldg-c', excludeBuildingIds: ['bldg-a', 'bldg-c'] },
    { objectId: 'bldg-d', excludeBuildingId: 'bldg-x', excludeBuildingIds: ['bldg-y'] },
    { objectId: 'bldg-a', excludeBuildingId: undefined, excludeBuildingIds: undefined },
  ];

  it.each(cases)(
    'objectId=%s excludeBuildingId=%s excludeBuildingIds=%s',
    ({ objectId, excludeBuildingId, excludeBuildingIds }) => {
      const line = makeLine(`${objectId}-edge`, objectId);

      // (a) OSNAP strategies path
      const ctx: SnapContext = {
        mouseWorld: { x: 0, y: 0 },
        mouseScreen: { sx: 0, sy: 0 },
        worldToScreen: (wx, wy) => ({ sx: wx, sy: wy }),
        screenToWorld: (sx, sy) => ({ wx: sx, wy: sy }),
        buildings: [],
        lineBuffer: [],
        isOsnapActive: true,
        isDirectionSnappingActive: false,
        excludeBuildingId,
        excludeBuildingIds,
      };
      const aResult = isLineExcluded(line, ctx);
      const aFiltered = filterCandidateLines([line], ctx).length === 0;

      // (b) objectDragSnap.ts-style: excludedSet built from excludeBuildingIds + excludeBuildingId
      const excludedSetB = new Set<string>(excludeBuildingIds || []);
      if (excludeBuildingId) excludedSetB.add(excludeBuildingId);
      const bResult = isIdExcluded(line.objectId, excludedSetB);

      // (c) DirectionSnapStrategy.ts-style: identical construction pattern
      const excludedSetC = new Set<string>(excludeBuildingIds || []);
      if (excludeBuildingId) excludedSetC.add(excludeBuildingId);
      const cResult = isIdExcluded(line.objectId, excludedSetC);

      expect(aResult).toBe(bResult);
      expect(aResult).toBe(cResult);
      expect(aFiltered).toBe(aResult);
    }
  );
});
