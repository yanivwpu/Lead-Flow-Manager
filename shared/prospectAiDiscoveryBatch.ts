/**
 * Pure helpers for Prospect AI Discover batch persistence / restore.
 * No DB I/O — unit-testable.
 */

export const PROSPECT_AI_DISCOVERY_STATUS_DISCARDED = "discarded";
export const PROSPECT_AI_DISCOVERY_STATUS_COMPLETED = "completed";

export type DiscoverySearchLike = {
  id: string;
  status?: string | null;
  createdAt?: Date | string | null;
};

/**
 * Newest-first searches: return the first non-discarded search that still has unsent results.
 */
export function selectActiveUnsentDiscoverySearch<T extends DiscoverySearchLike>(
  searchesNewestFirst: readonly T[],
  unsentCountBySearchId: ReadonlyMap<string, number>,
): T | null {
  for (const search of searchesNewestFirst) {
    if (String(search.status || "").toLowerCase() === PROSPECT_AI_DISCOVERY_STATUS_DISCARDED) {
      continue;
    }
    if ((unsentCountBySearchId.get(search.id) || 0) > 0) return search;
  }
  return null;
}
