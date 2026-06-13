import type { InventoryListing } from "@shared/schema";
import type { InventoryMatchesResponse, InventoryMatchResult } from "@shared/inventory/inventoryMatchTypes";
import {
  buildDbInventoryMatchDiagnostics,
  buildInventoryMatchDiagnostics,
} from "@shared/inventory/inventoryMatchDiagnostics";
import { formatInventoryMatchSummaryForAi } from "@shared/inventory/inventoryMatchDisplay";
import {
  buildPersistedProfileSnapshotForDiagnostics,
  describeActiveSearchFilters,
} from "@shared/buyerSearchCommandDebug";
import {
  extractBuyerMatchCriteria,
  rankInventoryMatches,
  buildMatchFunnelSummary,
  countExclusionReasons,
  countQualifyingInventoryMatches,
  auditBuySearchMatchFunnel,
  summarizeExclusionCounts,
  type MatchListingInput,
} from "@shared/inventory/inventoryMatchScoring";
import { readBuyerPreferenceProfile, loadPersistedBuyerPreferenceProfile } from "../buyerPreferenceService";
import { storage } from "../storage";
import { canUseInventoryConnector } from "./inventoryGate";
import { countActiveListingsForUser, fetchActiveListingsForMatching, resolveMatchingListingLimitForUser } from "./inventoryDb";
import { listSavedListingIdsForContact } from "./inventorySavedMatchDb";

function parseNumericField(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

function parseFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name: unknown }).name);
      }
      return null;
    })
    .filter((s): s is string => !!s && s.trim().length > 0);
}

function parsePhotos(raw: unknown): MatchListingInput["photos"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { url?: unknown; order?: unknown };
      if (typeof row.url !== "string" || !row.url.startsWith("http")) return null;
      return {
        url: row.url,
        order: typeof row.order === "number" ? row.order : idx,
      };
    })
    .filter(Boolean) as MatchListingInput["photos"];
}

function parseListingDetails(raw: unknown): MatchListingInput["listingDetails"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: NonNullable<MatchListingInput["listingDetails"]> = {};
  if (typeof o.parkingGarage === "string") out.parkingGarage = o.parkingGarage;
  if (typeof o.waterfront === "boolean") out.waterfront = o.waterfront;
  if (typeof o.pool === "boolean") out.pool = o.pool;
  if (o.view === "string") out.view = o.view;
  if (o.listingTransactionType === "sale" || o.listingTransactionType === "rent") {
    out.listingTransactionType = o.listingTransactionType;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function inventoryListingToMatchInput(row: InventoryListing): MatchListingInput {
  return {
    id: row.id,
    providerListingId: row.providerListingId,
    status: row.status,
    priceCents: row.priceCents,
    city: row.city,
    state: row.state,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    zip: row.zip,
    beds: parseNumericField(row.beds),
    baths: parseNumericField(row.baths),
    propertyType: row.propertyType,
    propertySubtype: row.propertySubtype ?? null,
    squareFeet: row.squareFeet != null ? Number(row.squareFeet) : null,
    yearBuilt: row.yearBuilt != null ? Number(row.yearBuilt) : null,
    hoaFeeCents: row.hoaFeeCents != null ? Number(row.hoaFeeCents) : null,
    listingDetails: parseListingDetails(row.listingDetails),
    description: row.description,
    features: parseFeatures(row.features),
    listingUrl: row.listingUrl,
    photos: parsePhotos(row.photos),
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
  };
}

function toPublicMatch(scored: ReturnType<typeof rankInventoryMatches>[number]): InventoryMatchResult {
  const listing = scored.listing;
  const sortedPhotos = [...listing.photos].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  return {
    listingId: scored.listingId,
    providerListingId: scored.providerListingId,
    score: scored.score,
    reasons: scored.reasons,
    listing: {
      id: listing.id,
      providerListingId: listing.providerListingId,
      status: listing.status,
      city: listing.city,
      state: listing.state,
      addressLine1: listing.addressLine1,
      priceCents: listing.priceCents,
      beds: listing.beds,
      baths: listing.baths,
      propertyType: listing.propertyType,
      listingUrl: listing.listingUrl,
      thumbnailUrl: sortedPhotos[0]?.url ?? null,
    },
  };
}

export async function findMatchingListingsForContact(
  contactId: string,
  userId: string,
): Promise<InventoryMatchesResponse & { httpStatus?: number }> {
  const contact = await storage.getContact(contactId);
  if (!contact) {
    return {
      eligible: false,
      reason: "contact_not_found",
      matchCount: 0,
      matches: [],
      httpStatus: 404,
    };
  }
  if (contact.userId !== userId) {
    return {
      eligible: false,
      reason: "forbidden",
      matchCount: 0,
      matches: [],
      httpStatus: 403,
    };
  }

  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) {
    return {
      eligible: false,
      reason: gate.reason,
      matchCount: 0,
      matches: [],
    };
  }

  const savedListingIds = await listSavedListingIdsForContact(userId, contactId);
  const profile =
    (await loadPersistedBuyerPreferenceProfile(contactId)) ??
    readBuyerPreferenceProfile(contact);
  const criteria = extractBuyerMatchCriteria(profile);
  const activeFilterSummary = describeActiveSearchFilters(profile, criteria);

  if (!criteria.hasAnyCriteria) {
    const inventoryCount = await countActiveListingsForUser(userId);
    return {
      eligible: true,
      reason: "no_buyer_preferences",
      profileStatus: profile.profileStatus,
      inventoryCount,
      matchCount: 0,
      matches: [],
      savedListingIds,
      diagnostics: buildInventoryMatchDiagnostics({
        activeInventoryCount: inventoryCount,
        listingsScored: 0,
        matchesReturned: 0,
        persistedProfileSnapshot: buildPersistedProfileSnapshotForDiagnostics(profile, criteria),
        activeFilterSummary,
      }),
    };
  }

  const inventoryCount = await countActiveListingsForUser(userId);
  if (inventoryCount === 0) {
    return {
      eligible: true,
      reason: "no_active_inventory",
      profileStatus: profile.profileStatus,
      inventoryCount: 0,
      matchCount: 0,
      matches: [],
      savedListingIds,
      diagnostics: buildInventoryMatchDiagnostics({
        activeInventoryCount: 0,
        listingsScored: 0,
        matchesReturned: 0,
      }),
    };
  }

  let matchingLimit = 1000;
  let rows;
  try {
    matchingLimit = await resolveMatchingListingLimitForUser(userId);
    rows = await fetchActiveListingsForMatching(userId, matchingLimit);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[inventory-matches] fetchActiveListingsForMatching failed", {
      userId,
      contactId,
      message,
    });
    return {
      eligible: false,
      reason: "listing_fetch_failed",
      profileStatus: profile.profileStatus,
      inventoryCount,
      matchCount: 0,
      matches: [],
      savedListingIds,
      error: message,
      diagnostics: buildInventoryMatchDiagnostics({
        activeInventoryCount: inventoryCount,
        listingsScored: 0,
        matchesReturned: 0,
        lastMatchingError: message,
      }),
    };
  }

  const inputs = rows.map(inventoryListingToMatchInput);
  const totalMatchCount = countQualifyingInventoryMatches(inputs, criteria);
  const ranked = rankInventoryMatches(inputs, criteria, 10);
  const matches = ranked.map(toPublicMatch);
  const funnel = auditBuySearchMatchFunnel(inputs, criteria, { rankLimit: 10, sampleLimit: 20 });
  const profileSnapshot = buildPersistedProfileSnapshotForDiagnostics(profile, criteria);

  const exclusionCounts = inputs.length > 0 ? countExclusionReasons(inputs, criteria) : new Map();
  const exclusionSummary =
    exclusionCounts.size > 0 ? summarizeExclusionCounts(exclusionCounts) : null;
  const noMatchSummary =
    inputs.length > 0
      ? buildMatchFunnelSummary(inputs.length, totalMatchCount, exclusionCounts)
      : inventoryCount === 0
        ? "No active listings in synced inventory."
        : null;

  const diagnostics = buildDbInventoryMatchDiagnostics({
    activeInventoryCount: inventoryCount,
    rowsLoadedForScoring: inputs.length,
    matchesReturned: matches.length,
    totalQualifyingMatches: totalMatchCount,
    matchingFetchLimit: matchingLimit,
    funnel,
    persistedProfileSnapshot: profileSnapshot,
    activeFilterSummary,
    exclusionSummary,
    noMatchSummary,
  });

  console.info("[inventory-match-funnel]", {
    contactId,
    userId,
    matchCount: totalMatchCount,
    returned: matches.length,
    rowsLoaded: inputs.length,
    activeInventory: inventoryCount,
    matchingLimit,
    profileSnapshot,
    funnelSteps: funnel.steps,
    topExclusions: Object.entries(funnel.exclusionByReason)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  });

  return {
    eligible: true,
    reason: matches.length > 0 ? "ok" : "no_matches",
    profileStatus: profile.profileStatus,
    inventoryCount,
    matchCount: totalMatchCount,
    matches,
    savedListingIds,
    diagnostics,
  };
}

/** Inventory context for AI Brain suggest-reply when matches exist. */
export async function getInventoryMatchSummaryForContact(
  contactId: string,
  userId: string,
  options?: { qualificationLevel?: "low" | "medium" | "high" },
): Promise<string> {
  const result = await findMatchingListingsForContact(contactId, userId);
  if (!result.eligible) return "";

  const contact = await storage.getContact(contactId);
  const persistedProfile = await loadPersistedBuyerPreferenceProfile(contactId);
  const buyerAreas = persistedProfile
    ? extractBuyerMatchCriteria(persistedProfile).areas
    : contact
      ? extractBuyerMatchCriteria(readBuyerPreferenceProfile(contact)).areas
      : [];

  const level = options?.qualificationLevel ?? "medium";
  if (level !== "high" && result.matchCount <= 0) return "";

  return formatInventoryMatchSummaryForAi({
    matchCount: result.matchCount,
    matches: result.matches,
    buyerAreas,
    qualificationLevel: level,
  });
}

/** Phase 4+ hook: same ranking pipeline for automations / AI recommendations. */
export async function findMatchingListingsForContactActionContext(
  contactId: string,
  userId: string,
) {
  const result = await findMatchingListingsForContact(contactId, userId);
  return {
    ...result,
    actionContext: {
      contactId,
      userId,
      matches: result.matches,
      triggeredAt: new Date().toISOString(),
    },
  };
}
