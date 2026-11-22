import type { InventoryMatchesResponse } from "@shared/inventory/inventoryMatchTypes";

/** Infinite match pages append below existing results instead of replacing them. */
export function nextMatchPageOffset(
  pages: ReadonlyArray<Pick<InventoryMatchesResponse, "matches" | "matchCount">>,
): number | undefined {
  if (!pages.length) return undefined;
  const nextOffset = pages.length * 10;
  const latest = pages[pages.length - 1];
  // Backend page offsets must advance by the requested size even if an MLS
  // permission gate removed one of the candidate cards after ranking.
  if (!latest.matches.length || nextOffset >= pages[0].matchCount) return undefined;
  return nextOffset;
}

/** Keep stable cards when a listing appears in adjacent pages after a re-rank. */
export function uniqueInventoryMatchPages(
  pages: ReadonlyArray<Pick<InventoryMatchesResponse, "matches">>,
): InventoryMatchesResponse["matches"] {
  const seen = new Set<string>();
  return pages.flatMap((p) => p.matches.filter((m) => {
    if (seen.has(m.listingId)) return false;
    seen.add(m.listingId);
    return true;
  }));
}
