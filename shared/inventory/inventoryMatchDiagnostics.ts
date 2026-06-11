import type { InventoryMatchDiagnostics, InventoryMatchExcludedListing } from "./inventoryMatchTypes";

export function buildInventoryMatchDiagnostics(input: {
  activeInventoryCount: number;
  listingsScored: number;
  matchesReturned: number;
  lastMatchingError?: string | null;
  lastMatchRunAt?: string;
  noMatchSummary?: string | null;
  exclusionSummary?: string | null;
  excludedSamples?: InventoryMatchExcludedListing[];
}): InventoryMatchDiagnostics {
  return {
    activeInventoryCount: input.activeInventoryCount,
    listingsScored: input.listingsScored,
    matchesReturned: input.matchesReturned,
    lastMatchRunAt: input.lastMatchRunAt ?? new Date().toISOString(),
    lastMatchingError: input.lastMatchingError ?? null,
    noMatchSummary: input.noMatchSummary ?? null,
    exclusionSummary: input.exclusionSummary ?? null,
    excludedSamples: input.excludedSamples,
  };
}

export function formatInventoryMatchRunTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
