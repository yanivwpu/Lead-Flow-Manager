import type {
  InventoryAgentShareExclusionCounts,
  InventoryMatchDiagnostics,
  InventoryMatchExcludedListing,
  InventoryMatchFunnelExcludedSample,
  InventoryMatchProfileSnapshot,
} from "./inventoryMatchTypes";
import type { BuyInventoryFunnelAudit } from "./inventoryMatchScoring";
import { INVENTORY_DIAGNOSTICS_BUILD_MARKER } from "./inventoryDiagnosticsBuild";

export function buildInventoryMatchDiagnostics(input: {
  activeInventoryCount: number;
  agentShareEligibleCount?: number;
  agentShareExclusions?: InventoryAgentShareExclusionCounts;
  listingsScored: number;
  matchesReturned: number;
  totalQualifyingMatches?: number;
  matchingFetchLimit?: number;
  inventoryCapTruncated?: boolean;
  funnelSteps?: Array<{ label: string; count: number }>;
  dataQuality?: Record<string, number>;
  exclusionByReason?: Record<string, number>;
  persistedProfileSnapshot?: InventoryMatchProfileSnapshot;
  funnelExcludedSamples?: InventoryMatchFunnelExcludedSample[];
  lastMatchingError?: string | null;
  lastMatchRunAt?: string;
  noMatchSummary?: string | null;
  exclusionSummary?: string | null;
  excludedSamples?: InventoryMatchExcludedListing[];
  activeFilterSummary?: string | null;
  debugBuildMarker?: string;
}): InventoryMatchDiagnostics {
  return {
    activeInventoryCount: input.activeInventoryCount,
    agentShareEligibleCount: input.agentShareEligibleCount,
    agentShareExclusions: input.agentShareExclusions,
    listingsScored: input.listingsScored,
    matchesReturned: input.matchesReturned,
    totalQualifyingMatches: input.totalQualifyingMatches,
    matchingFetchLimit: input.matchingFetchLimit,
    inventoryCapTruncated: input.inventoryCapTruncated,
    funnelSteps: input.funnelSteps,
    dataQuality: input.dataQuality,
    exclusionByReason: input.exclusionByReason,
    persistedProfileSnapshot: input.persistedProfileSnapshot,
    funnelExcludedSamples: input.funnelExcludedSamples,
    lastMatchRunAt: input.lastMatchRunAt ?? new Date().toISOString(),
    lastMatchingError: input.lastMatchingError ?? null,
    noMatchSummary: input.noMatchSummary ?? null,
    exclusionSummary: input.exclusionSummary ?? null,
    excludedSamples: input.excludedSamples,
    activeFilterSummary: input.activeFilterSummary ?? null,
    debugBuildMarker: input.debugBuildMarker ?? INVENTORY_DIAGNOSTICS_BUILD_MARKER,
  };
}

/** Map live DB funnel audit into API diagnostics (same rows as findMatchingListingsForContact). */
export function buildDbInventoryMatchDiagnostics(input: {
  activeInventoryCount: number;
  agentShareEligibleCount: number;
  agentShareExclusions: InventoryAgentShareExclusionCounts;
  rowsLoadedForScoring: number;
  matchesReturned: number;
  totalQualifyingMatches: number;
  matchingFetchLimit: number;
  funnel: BuyInventoryFunnelAudit;
  persistedProfileSnapshot: InventoryMatchProfileSnapshot;
  activeFilterSummary?: string | null;
  exclusionSummary?: string | null;
  noMatchSummary?: string | null;
  lastMatchingError?: string | null;
}): InventoryMatchDiagnostics {
  const inventoryCapTruncated =
    input.rowsLoadedForScoring < input.agentShareEligibleCount &&
    input.rowsLoadedForScoring >= input.matchingFetchLimit;

  const funnelExcludedSamples: InventoryMatchFunnelExcludedSample[] =
    input.funnel.excludedSamples.map((s) => ({
      listingId: s.listingId,
      providerListingId: s.providerListingId,
      address: s.address,
      city: s.city,
      priceCents: s.priceCents,
      beds: s.beds,
      propertyType: s.propertyType,
      propertySubtype: s.propertySubtype ?? null,
      resolvedType: s.resolvedType,
      listingTransactionType: s.listingTransactionType ?? null,
      poolDetected: s.poolDetected,
      exclusionReason: s.exclusionReason,
      matched: s.matched,
      score: s.score,
    }));

  const excludedSamples: InventoryMatchExcludedListing[] = funnelExcludedSamples
    .filter((s) => !s.matched && s.exclusionReason)
    .map((s) => ({
      listingId: s.listingId,
      providerListingId: s.providerListingId,
      city: s.city,
      priceCents: s.priceCents,
      beds: s.beds,
      baths: null,
      squareFeet: null,
      reason: s.exclusionReason ?? "excluded",
    }));

  return buildInventoryMatchDiagnostics({
    activeInventoryCount: input.activeInventoryCount,
    agentShareEligibleCount: input.agentShareEligibleCount,
    agentShareExclusions: input.agentShareExclusions,
    listingsScored: input.rowsLoadedForScoring,
    matchesReturned: input.matchesReturned,
    totalQualifyingMatches: input.totalQualifyingMatches,
    matchingFetchLimit: input.matchingFetchLimit,
    inventoryCapTruncated,
    funnelSteps: input.funnel.steps,
    dataQuality: input.funnel.dataQuality,
    exclusionByReason: input.funnel.exclusionByReason,
    persistedProfileSnapshot: input.persistedProfileSnapshot,
    funnelExcludedSamples,
    excludedSamples,
    activeFilterSummary: input.activeFilterSummary,
    exclusionSummary: input.exclusionSummary,
    noMatchSummary: input.noMatchSummary,
    lastMatchingError: input.lastMatchingError,
  });
}

export function formatFunnelExcludedSampleLine(sample: InventoryMatchFunnelExcludedSample): string {
  const price =
    sample.priceCents != null
      ? `$${Math.round(sample.priceCents / 100).toLocaleString("en-US")}`
      : "—";
  const type = sample.resolvedType ?? sample.propertyType ?? "—";
  const rawSub = sample.propertySubtype ?? "—";
  const txn = sample.listingTransactionType ?? "—";
  const reason =
    sample.exclusionReason ?? (sample.matched ? `MATCH score=${sample.score}` : "unknown");
  const tag = sample.matched ? "MATCH" : "EXCL";
  return `${tag} ${sample.providerListingId} · ${sample.address ?? sample.city ?? "—"} · ${price} · ${sample.beds ?? "?"}bd · resolved=${type} rawSub=${rawSub} txn=${txn} · pool=${sample.poolDetected ? "yes" : "no"} · ${reason}`;
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
