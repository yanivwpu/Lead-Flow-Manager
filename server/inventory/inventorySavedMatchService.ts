import { canUseInventoryConnector } from "./inventoryGate";
import {
  listSavedListingIdsForContact,
  saveContactInventoryMatch,
  unsaveContactInventoryMatch,
} from "./inventorySavedMatchDb";
import { markOpportunitySavedForListing } from "./inventoryOpportunityDb";
import { getInventoryListing } from "./inventoryDb";
import { storage } from "../storage";

export async function getSavedListingIdsForContact(
  contactId: string,
  userId: string,
): Promise<string[] | null> {
  const contact = await storage.getContact(contactId);
  if (!contact || contact.userId !== userId) return null;
  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) return [];
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
