import type { InventoryListing } from "@shared/schema";
import type {
  InventoryOpportunitiesResponse,
  InventoryOpportunityResult,
  InventoryOpportunityType,
} from "@shared/inventory/inventoryOpportunityTypes";
import {
  buildOpportunityHeadline,
  formatPriceReductionLabel,
} from "@shared/inventory/inventoryOpportunityTypes";
import {
  extractBuyerMatchCriteria,
  scoreListingAgainstCriteria,
} from "@shared/inventory/inventoryMatchScoring";
import { isMatchableInventoryStatus } from "@shared/inventory/inventoryListingSchema";
import { normalizeListingCompliance } from "@shared/inventory/inventoryListingCompliance";
import { isCopilotAgentShareListing } from "@shared/inventory/publicListingPublication";
import { readBuyerPreferenceProfile } from "../buyerPreferenceService";
import { storage } from "../storage";
import { canUseInventoryConnector } from "./inventoryGate";
import type { ListingUpsertResult } from "./inventoryDb";
import { fetchActiveListingsWithOpportunityAlerts, getInventoryListingsByIds } from "./inventoryDb";
import {
  inventoryListingToMatchInput,
} from "./inventoryMatchingService";
import {
  listContactInventoryOpportunities,
  patchContactInventoryOpportunityStatus,
  upsertContactInventoryOpportunity,
} from "./inventoryOpportunityDb";
import type { InventoryOpportunityStatus } from "@shared/inventory/inventoryOpportunityTypes";

const OPPORTUNITY_MIN_SCORE = 50;

export type ProcessOpportunitiesResult = {
  createdOrUpdated: number;
  skippedReason?: string;
  alertCount?: number;
};

export type ProcessOpportunitiesOptions = {
  /** Dev scripts only — bypass RGE / feature gate checks. */
  skipGate?: boolean;
};

function listingRowToUpsertResult(listing: InventoryListing): ListingUpsertResult {
  const syncAlertStatus = listing.syncAlertStatus as ListingUpsertResult["syncAlertStatus"];
  const priceReduced =
    syncAlertStatus === "price_changed" &&
    listing.previousPriceCents != null &&
    listing.priceCents != null &&
    listing.priceCents < listing.previousPriceCents;

  return {
    listingId: listing.id,
    syncAlertStatus,
    previousPriceCents: syncAlertStatus === "price_changed" ? listing.previousPriceCents : null,
    currentPriceCents: listing.priceCents,
    priceReduced,
  };
}

async function processAlertResults(
  userId: string,
  alertResults: ListingUpsertResult[],
): Promise<number> {
  const listingIds = [...new Set(alertResults.map((r) => r.listingId))];
  const listings = await getInventoryListingsByIds(userId, listingIds);
  const listingById = new Map(listings.map((l) => [l.id, l]));

  const contacts = await storage.getContacts(userId, 5000);
  const contactsWithCriteria = contacts.filter((contact) => {
    const profile = readBuyerPreferenceProfile(contact);
    const criteria = extractBuyerMatchCriteria(profile);
    return profile.profileStatus !== "empty" && criteria.hasAnyCriteria;
  });

  if (contactsWithCriteria.length === 0) return 0;

  let createdOrUpdated = 0;

  for (const alert of alertResults) {
    const listing = listingById.get(alert.listingId);
    if (!listing || !isMatchableInventoryStatus(listing.status)) continue;
    if (
      !isCopilotAgentShareListing({
        status: listing.status,
        listingCompliance: normalizeListingCompliance(listing.listingCompliance),
      })
    ) {
      continue;
    }

    const opportunityType: InventoryOpportunityType | null =
      alert.syncAlertStatus === "new"
        ? "new_listing"
        : alert.priceReduced
          ? "price_reduced"
          : null;
    if (!opportunityType) continue;

    const matchInput = inventoryListingToMatchInput(listing);

    for (const contact of contactsWithCriteria) {
      const profile = readBuyerPreferenceProfile(contact);
      const criteria = extractBuyerMatchCriteria(profile);
      const scored = scoreListingAgainstCriteria(matchInput, criteria);
      if (!scored || scored.score < OPPORTUNITY_MIN_SCORE) continue;

      const reasons = [...scored.reasons];
      if (
        opportunityType === "price_reduced" &&
        alert.previousPriceCents != null &&
        alert.currentPriceCents != null
      ) {
        const delta = alert.previousPriceCents - alert.currentPriceCents;
        if (delta > 0) {
          reasons.unshift(formatPriceReductionLabel(delta));
        }
      }

      await upsertContactInventoryOpportunity({
        userId,
        contactId: contact.id,
        listingId: listing.id,
        opportunityType,
        score: scored.score,
        reasons: reasons.slice(0, 6),
        previousPriceCents: alert.previousPriceCents,
        currentPriceCents: alert.currentPriceCents,
      });
      createdOrUpdated += 1;
    }
  }

  return createdOrUpdated;
}

function parseNumericField(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

function parsePhotos(raw: unknown): { url: string; order?: number }[] {
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
    .filter(Boolean) as { url: string; order?: number }[];
}

function listingToSummary(listing: InventoryListing) {
  const sortedPhotos = [...parsePhotos(listing.photos)].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  return {
    id: listing.id,
    providerListingId: listing.providerListingId,
    status: listing.status,
    city: listing.city,
    state: listing.state,
    addressLine1: listing.addressLine1,
    priceCents: listing.priceCents,
    beds: parseNumericField(listing.beds),
    baths: parseNumericField(listing.baths),
    propertyType: listing.propertyType,
    listingUrl: listing.listingUrl,
    thumbnailUrl: sortedPhotos[0]?.url ?? null,
  };
}

function toPublicOpportunity(
  row: Awaited<ReturnType<typeof listContactInventoryOpportunities>>[number],
  listing: InventoryListing,
): InventoryOpportunityResult {
  const opportunityType = row.opportunityType as InventoryOpportunityType;
  const summary = listingToSummary(listing);
  const priceDelta =
    row.previousPriceCents != null && row.currentPriceCents != null
      ? row.previousPriceCents - row.currentPriceCents
      : 0;
  const priceReductionLabel =
    opportunityType === "price_reduced" && priceDelta > 0
      ? formatPriceReductionLabel(priceDelta)
      : null;

  return {
    id: row.id,
    listingId: row.listingId,
    opportunityType,
    score: row.score,
    reasons: Array.isArray(row.reasons)
      ? row.reasons.filter((r): r is string => typeof r === "string")
      : [],
    headline: buildOpportunityHeadline(opportunityType, summary),
    priceReductionLabel,
    previousPriceCents: row.previousPriceCents,
    currentPriceCents: row.currentPriceCents,
    discoveredAt: row.discoveredAt?.toISOString() ?? new Date().toISOString(),
    status: row.status as InventoryOpportunityResult["status"],
    listing: summary,
  };
}

export async function processInventoryOpportunitiesAfterSync(
  userId: string,
  upsertResults: ListingUpsertResult[],
  options?: ProcessOpportunitiesOptions,
): Promise<ProcessOpportunitiesResult> {
  if (!options?.skipGate) {
    const gate = await canUseInventoryConnector(userId);
    if (!gate.ok) return { createdOrUpdated: 0, skippedReason: gate.reason };
  }

  const alertResults = upsertResults.filter(
    (r) => r.syncAlertStatus === "new" || r.priceReduced,
  );
  if (alertResults.length === 0) {
    return { createdOrUpdated: 0, alertCount: 0 };
  }

  const createdOrUpdated = await processAlertResults(userId, alertResults);
  return { createdOrUpdated, alertCount: alertResults.length };
}

/** Rebuild opportunities from persisted sync alert flags (dev repair / batch). */
export async function rebuildOpportunitiesFromSyncAlerts(
  userId: string,
  options?: ProcessOpportunitiesOptions & { sourceId?: string },
): Promise<ProcessOpportunitiesResult> {
  if (!options?.skipGate) {
    const gate = await canUseInventoryConnector(userId);
    if (!gate.ok) return { createdOrUpdated: 0, skippedReason: gate.reason };
  }

  const listings = await fetchActiveListingsWithOpportunityAlerts(userId, options?.sourceId);
  const alertResults = listings
    .map(listingRowToUpsertResult)
    .filter((r) => r.syncAlertStatus === "new" || r.priceReduced);
  if (alertResults.length === 0) {
    return { createdOrUpdated: 0, alertCount: 0 };
  }

  const createdOrUpdated = await processAlertResults(userId, alertResults);
  return { createdOrUpdated, alertCount: alertResults.length };
}

export async function findInventoryOpportunitiesForContact(
  contactId: string,
  userId: string,
): Promise<InventoryOpportunitiesResponse & { httpStatus?: number }> {
  const contact = await storage.getContact(contactId);
  if (!contact) {
    return {
      eligible: false,
      reason: "contact_not_found",
      opportunityCount: 0,
      opportunities: [],
      httpStatus: 404,
    };
  }
  if (contact.userId !== userId) {
    return {
      eligible: false,
      reason: "forbidden",
      opportunityCount: 0,
      opportunities: [],
      httpStatus: 403,
    };
  }

  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) {
    return {
      eligible: false,
      reason: gate.reason,
      opportunityCount: 0,
      opportunities: [],
    };
  }

  const profile = readBuyerPreferenceProfile(contact);
  const criteria = extractBuyerMatchCriteria(profile);
  if (!criteria.hasAnyCriteria) {
    return {
      eligible: true,
      reason: "no_buyer_preferences",
      opportunityCount: 0,
      opportunities: [],
    };
  }

  const rows = await listContactInventoryOpportunities(userId, contactId, { limit: 10 });
  if (rows.length === 0) {
    return {
      eligible: true,
      reason: "no_opportunities",
      opportunityCount: 0,
      opportunities: [],
    };
  }

  const listingIds = rows.map((r) => r.listingId);
  const listings = await getInventoryListingsByIds(userId, listingIds);
  const listingById = new Map(listings.map((l) => [l.id, l]));

  const opportunities = rows
    .map((row) => {
      const listing = listingById.get(row.listingId);
      if (!listing || !isMatchableInventoryStatus(listing.status)) return null;
      if (
        !isCopilotAgentShareListing({
          status: listing.status,
          listingCompliance: normalizeListingCompliance(listing.listingCompliance),
        })
      ) {
        return null;
      }
      return toPublicOpportunity(row, listing);
    })
    .filter(Boolean) as InventoryOpportunityResult[];

  return {
    eligible: true,
    reason: opportunities.length > 0 ? "ok" : "no_opportunities",
    opportunityCount: opportunities.length,
    opportunities,
  };
}

export async function updateInventoryOpportunityStatus(
  contactId: string,
  userId: string,
  opportunityId: string,
  status: InventoryOpportunityStatus,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const contact = await storage.getContact(contactId);
  if (!contact) return { ok: false, status: 404, error: "Contact not found" };
  if (contact.userId !== userId) return { ok: false, status: 403, error: "Forbidden" };

  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.reason === "feature_disabled" ? 404 : 403,
      error: "Inventory connector unavailable",
    };
  }

  const allowed: InventoryOpportunityStatus[] = ["viewed", "saved", "dismissed"];
  if (!allowed.includes(status)) {
    return { ok: false, status: 400, error: "Invalid status" };
  }

  const updated = await patchContactInventoryOpportunityStatus(
    userId,
    contactId,
    opportunityId,
    status,
  );
  if (!updated) return { ok: false, status: 404, error: "Opportunity not found" };

  return { ok: true };
}
