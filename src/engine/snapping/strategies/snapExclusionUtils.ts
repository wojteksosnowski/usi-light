import { CachedLineEquation } from '../../../utils/lineBufferEngine';
import { SnapContext } from '../types';

/**
 * Returns true if `id` matches an excluded building id exactly, or belongs to
 * one of its sub-parts / zones / group members (id prefixed with `${exId}_` or `${exId}-`).
 */
export function isIdExcluded(id: string, excludedSet: Set<string>): boolean {
  if (excludedSet.has(id)) return true;
  for (const exId of excludedSet) {
    if (id.startsWith(`${exId}_`) || id.startsWith(`${exId}-`)) return true;
  }
  return false;
}

/**
 * Returns true if the line equation's objectId belongs to an excluded building
 * or any of its sub-parts / zones / group members.
 */
export function isLineExcluded(line: CachedLineEquation, context: SnapContext): boolean {
  if (context.excludeBuildingId && line.objectId === context.excludeBuildingId) return true;

  if (!context.excludeBuildingIds || context.excludeBuildingIds.length === 0) {
    return context.excludeBuildingId ? isIdExcluded(line.objectId, new Set([context.excludeBuildingId])) : false;
  }

  const excludedSet = new Set(context.excludeBuildingIds);
  if (context.excludeBuildingId) excludedSet.add(context.excludeBuildingId);
  return isIdExcluded(line.objectId, excludedSet);
}

/**
 * Filters a list of cached line equations against all exclusion rules in the SnapContext.
 */
export function filterCandidateLines(lines: CachedLineEquation[], context: SnapContext): CachedLineEquation[] {
  if (!context.excludeBuildingId && (!context.excludeBuildingIds || context.excludeBuildingIds.length === 0)) {
    return lines;
  }
  return lines.filter((line) => !isLineExcluded(line, context));
}
