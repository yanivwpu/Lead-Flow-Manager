import type { InventoryListing } from "@shared/schema";
import type { InventoryMatchesResponse, InventoryMatchResult } from "@shared/inventory/inventoryMatchTypes";
import {
  extractBuyerMatchCriteria,
  rankInventoryMatches,
  type MatchListingInput,
} from "@shared/inventory/inventoryMatchScoring";
import { readBuyerPreferenceProfile } from "../buyerPreferenceService";
import { storage } from "../storage";
import { canUseInventoryConnector } from "./inventoryGate";
import { countActiveListingsForUser, fetchActiveListingsForMatching } from "./inventoryDb";

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
    description: row.description,
    features: parseFeatures(row.features),
    listingUrl: row.listingUrl,
    photos: parsePhotos(row.photos),
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

  const profile = readBuyerPreferenceProfile(contact);
  const criteria = extractBuyerMatchCriteria(profile);

  if (!criteria.hasAnyCriteria) {
    return {
      eligible: true,
      reason: "no_buyer_preferences",
      profileStatus: profile.profileStatus,
      inventoryCount: await countActiveListingsForUser(userId),
      matchCount: 0,
      matches: [],
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
    };
  }

  const rows = await fetchActiveListingsForMatching(userId);
  const inputs = rows.map(inventoryListingToMatchInput);
  const ranked = rankInventoryMatches(inputs, criteria, 10);
  const matches = ranked.map(toPublicMatch);

  return {
    eligible: true,
    reason: matches.length > 0 ? "ok" : "no_matches",
    profileStatus: profile.profileStatus,
    inventoryCount,
    matchCount: matches.length,
    matches,
  };
}

/** Phase 3+ hook: same ranking pipeline for automations / AI recommendations. */
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
