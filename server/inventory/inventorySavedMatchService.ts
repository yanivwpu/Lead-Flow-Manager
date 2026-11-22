import { isInventoryContactEligible } from "./inventoryContactEligibility";
import { canUseInventoryConnector } from "./inventoryGate";
import {
  listSavedListingIdsForContact,
  listSavedMatchRecordsForContact,
  saveContactInventoryMatch,
  unsaveContactInventoryMatch,
} from "./inventorySavedMatchDb";
import { markOpportunitySavedForListing } from "./inventoryOpportunityDb";
import { getInventoryListing } from "./inventoryDb";
import { inventoryListingToMatchInput } from "./inventoryMatchingService";
import { normalizeListingCompliance } from "@shared/inventory/inventoryListingCompliance";
import { canDirectShareListing, isCopilotAgentShareListing, canShowPublicStreetAddress } from "@shared/inventory/publicListingPublication";
import type { InventoryMatchResult } from "@shared/inventory/inventoryMatchTypes";
import { pickPrimaryPhotoUrl } from "@shared/inventory/listingViewUrl";
import { storage } from "../storage";

export async function getSavedListingIdsForContact(
  contactId: string,
  userId: string,
): Promise<string[] | null> {
  const contact = await storage.getContact(contactId);
  if (!contact || contact.userId !== userId) return null;
  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok || !(await isInventoryContactEligible(contact))) return [];
  return listSavedListingIdsForContact(userId, contactId);
}

export async function saveListingMatchForContact(
  contactId: string,
  userId: string,
  body: { listingId: string; score: number; reasons: string[] },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const contact = await storage.getContact(contactId);
  if (!contact) return { ok: false, status: 404, error: "Contact not found" };
  if (contact.userId !== userId) return { ok: false, status: 403, error: "Forbidden" };

  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) return { ok: false, status: gate.reason === "feature_disabled" ? 404 : 403, error: "Inventory connector unavailable" };

  if (!(await isInventoryContactEligible(contact))) return { ok: false, status: 403, error: "Contact has no verified property intent" };

  const listing = await getInventoryListing(userId, body.listingId);
  if (!listing) return { ok: false, status: 404, error: "Listing not found" };

  await saveContactInventoryMatch({
    userId,
    contactId,
    listingId: body.listingId,
    matchScore: body.score,
    matchReasons: body.reasons.slice(0, 8),
  });

  await markOpportunitySavedForListing(userId, contactId, body.listingId);

  return { ok: true };
}

export async function unsaveListingMatchForContact(
  contactId: string,
  userId: string,
  listingId: string,
): Promise<{ ok: true; removed: boolean } | { ok: false; status: number; error: string }> {
  const contact = await storage.getContact(contactId);
  if (!contact) return { ok: false, status: 404, error: "Contact not found" };
  if (contact.userId !== userId) return { ok: false, status: 403, error: "Forbidden" };

  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) return { ok: false, status: gate.reason === "feature_disabled" ? 404 : 403, error: "Inventory connector unavailable" };

  const removed = await unsaveContactInventoryMatch(userId, contactId, listingId);
  return { ok: true, removed };
}

export async function getSavedListingMatchesForContact(
  contactId: string,
  userId: string,
): Promise<
  | { ok: true; matches: InventoryMatchResult[]; totalSaved: number; unavailable: number }
  | { ok: false; status: number; error: string }
> {
  const contact = await storage.getContact(contactId);
  if (!contact) return { ok: false, status: 404, error: "Contact not found" };
  if (contact.userId !== userId) return { ok: false, status: 403, error: "Forbidden" };
  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) {
    return { ok: false, status: gate.reason === "feature_disabled" ? 404 : 403, error: "Inventory connector unavailable" };
  }
  if (!(await isInventoryContactEligible(contact))) {
    return { ok: false, status: 403, error: "Contact has no verified property intent" };
  }

  const rows = await listSavedMatchRecordsForContact(userId, contactId);
  const matches: InventoryMatchResult[] = [];
  // Bound the DB work for large shortlists while retaining saved order.
  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = await Promise.all(rows.slice(offset, offset + 10).map(async (saved) => {
      const listing = await getInventoryListing(userId, saved.listingId);
      if (!listing) return null;
      const compliance = normalizeListingCompliance(listing.listingCompliance);
      if (!isCopilotAgentShareListing({ status: listing.status, listingCompliance: compliance }) ||
          !canDirectShareListing({ status: listing.status, listingCompliance: compliance })) return null;
      const l = inventoryListingToMatchInput(listing);
      const reasons = Array.isArray(saved.matchReasons)
        ? saved.matchReasons.filter((v): v is string => typeof v === "string").slice(0, 8) : [];
      return {
        listingId: listing.id,
        providerListingId: listing.providerListingId,
        score: Math.min(100, Math.max(0, saved.matchScore ?? 0)),
        reasons,
        listing: {
          id: listing.id,
          providerListingId: listing.providerListingId,
          status: listing.status,
          city: listing.city,
          state: listing.state,
          addressLine1: canShowPublicStreetAddress(compliance) ? listing.addressLine1 : null,
          priceCents: listing.priceCents,
          beds: l.beds,
          baths: l.baths,
          propertyType: listing.propertyType,
          listingUrl: listing.listingUrl,
          thumbnailUrl: canShowPublicStreetAddress(compliance) ? pickPrimaryPhotoUrl(l.photos) : null,
        },
      } satisfies InventoryMatchResult;
    }));
    matches.push(...batch.filter((r): r is InventoryMatchResult => r != null));
  }
  return { ok: true, matches, totalSaved: rows.length, unavailable: rows.length - matches.length };
}
