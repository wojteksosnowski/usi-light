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
  if (context.excludeBuildingId) {
    if (line.objectId === context.excludeBuildingId) return true;
    if (line.objectId.startsWith(`${context.excludeBuildingId}_`) || line.objectId.startsWith(`${context.excludeBuildingId}-`)) {
      return true;
    }
  }

  if (context.excludeBuildingIds && context.excludeBuildingIds.length > 0) {
    for (const exId of context.excludeBuildingIds) {
      if (line.objectId === exId) return true;
      if (line.objectId.startsWith(`${exId}_`) || line.objectId.startsWith(`${exId}-`)) {
        return true;
      }
    }
  }

  return false;
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
