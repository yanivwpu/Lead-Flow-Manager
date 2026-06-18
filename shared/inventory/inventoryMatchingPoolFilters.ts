import type { BuyerMatchCriteria, MatchListingInput } from "./inventoryMatchScoring";
import { passesMatchingPoolHardGates } from "./inventoryMatchScoring";

export type MatchingPoolSelectionResult<T> = {
  selected: T[];
  dbCandidatesAfterHardFilters: number;
  cappedAfterHardFilters: boolean;
};

/** Profile fields we can safely push into SQL before the scoring cap. */
export function profileHasDbPoolHardFilters(criteria: BuyerMatchCriteria): boolean {
  return (
    criteria.transactionIntent === "rent" ||
    criteria.transactionIntent === "buy" ||
    criteria.areas.length > 0 ||
    criteria.priceMin != null ||
    criteria.priceMax != null ||
    criteria.propertyTypes.length > 0 ||
    criteria.bedsMin != null ||
    criteria.bedsMax != null ||
    criteria.bathsMin != null ||
    criteria.sqftMin != null ||
    criteria.sqftMax != null ||
    criteria.hardRequirePool ||
    criteria.hardRequireWaterfront ||
    criteria.geoConstraints.length > 0
  );
}

/** In-memory hard-gate pass — mirrors scoring gates after coarse SQL prefilter. */
export function refineMatchingPoolCandidates<T extends MatchListingInput>(
  listings: T[],
  criteria: BuyerMatchCriteria,
): T[] {
  if (!profileHasDbPoolHardFilters(criteria)) return listings;
  return listings.filter((listing) => passesMatchingPoolHardGates(listing, criteria));
}

function syncedAtMs(listing: { syncedAt?: Date | string | null }): number {
  const raw = listing.syncedAt;
  if (raw == null) return 0;
  const ms = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Apply hard filters first, then newest-synced cap — correct matching pool selection. */
export function selectMatchingPoolCandidates<T extends MatchListingInput & { syncedAt?: Date | string | null }>(
  listings: T[],
  criteria: BuyerMatchCriteria,
  limit: number,
): MatchingPoolSelectionResult<T> {
  const filtered = refineMatchingPoolCandidates(listings, criteria);
  const dbCandidatesAfterHardFilters = filtered.length;
  const sorted = [...filtered].sort((a, b) => syncedAtMs(b) - syncedAtMs(a));
  const cappedAfterHardFilters = dbCandidatesAfterHardFilters > limit;
  return {
    selected: sorted.slice(0, limit),
    dbCandidatesAfterHardFilters,
    cappedAfterHardFilters,
  };
}

/** Legacy bug: newest-synced cap before profile hard filters. */
export function legacySelectNewestSyncedPool<T extends { syncedAt?: Date | string | null }>(
  listings: T[],
  limit: number,
): T[] {
  return [...listings].sort((a, b) => syncedAtMs(b) - syncedAtMs(a)).slice(0, limit);
}
