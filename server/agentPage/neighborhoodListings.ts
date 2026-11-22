import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import {
  aiBusinessKnowledge, inventoryListings, type InventoryListing,
} from "@shared/schema";
import { MATCHABLE_INVENTORY_STATUSES } from "@shared/inventory/inventoryListingSchema";
import { normalizeListingCompliance } from "@shared/inventory/inventoryListingCompliance";
import { canResolveIndexedPublicListing } from "@shared/inventory/publicListingPublication";
import { isProductionDevSeedGuardEnabled } from "@shared/inventory/inventoryDevSeedGuard";
import type { AgentPageListingCard } from "@shared/agent/agentPageTypes";
import {
  coordinateWithinNeighborhood,
} from "@shared/agent/neighborhoodListingGeo";
import { inventoryListingToAgentPageCard } from "./agentPageListingCard";
import { resolveNeighborhoodBoundary } from "./neighborhoodBoundaryService";

export const NEIGHBORHOOD_LISTING_MAX_PER_TYPE = 9;
export const NEIGHBORHOOD_LISTING_MAX_CANDIDATES = 3000;
// A cancelled feed must not market old inventory as presently available.
export const NEIGHBORHOOD_PUBLIC_FRESHNESS_DAYS = 14;

export type NeighborhoodListingResult = {
  boundaryStatus: "verified" | "unsupported" | "unmatched" | "unavailable";
  boundarySource: string | null;
  mode: "public" | "owner_preview";
  sale: AgentPageListingCard[];
  rent: AgentPageListingCard[];
  hasOlderMatchingInventory: boolean;
};

export async function findNeighborhoodListings(input: {
  userId: string;
  neighborhood: { name: string; city: string; state: string };
  appOrigin: string;
  /** Allows historic examples only in private, authenticated owner previews. */
  ownerPreview?: boolean;
}): Promise<NeighborhoodListingResult> {
  const mode = input.ownerPreview ? "owner_preview" : "public";
  const empty = (boundaryStatus: NeighborhoodListingResult["boundaryStatus"],
    boundarySource: string | null = null): NeighborhoodListingResult =>
    ({ boundaryStatus, boundarySource, mode, sale: [], rent: [], hasOlderMatchingInventory: false });

  const boundary = await resolveNeighborhoodBoundary(input.neighborhood);
  if (boundary.status !== "verified") return empty(boundary.status);

  const [settings] = await db.select({
    enabled: aiBusinessKnowledge.publishListingsPublicly,
  }).from(aiBusinessKnowledge).where(eq(aiBusinessKnowledge.userId, input.userId)).limit(1);

  if (!settings?.enabled) return empty("verified", boundary.source);

  const cutoff = new Date(Date.now() - NEIGHBORHOOD_PUBLIC_FRESHNESS_DAYS * 86400000);
  const conditions = [
    eq(inventoryListings.userId, input.userId),
    eq(inventoryListings.publishPublicly, true),
    inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
    gte(inventoryListings.latitude, boundary.bounds.minLat),
    lte(inventoryListings.latitude, boundary.bounds.maxLat),
    gte(inventoryListings.longitude, boundary.bounds.minLon),
    lte(inventoryListings.longitude, boundary.bounds.maxLon),
  ];
  if (isProductionDevSeedGuardEnabled()) {
    conditions.push(sql`${inventoryListings.providerListingId} not like 'dev-seed-%'`);
  }

  const rows = await db.select().from(inventoryListings)
    .where(and(...conditions))
    .orderBy(desc(inventoryListings.syncedAt), desc(inventoryListings.id))
    .limit(NEIGHBORHOOD_LISTING_MAX_CANDIDATES);

  const sale: AgentPageListingCard[] = [];
  const rent: AgentPageListingCard[] = [];
  let hasOlderMatchingInventory = false;

  for (const row of rows) {
    if (!coordinateWithinNeighborhood(row.latitude, row.longitude, boundary.geometry)) continue;
    const listing = {
      ...row, listingCompliance: normalizeListingCompliance(row.listingCompliance),
    } satisfies InventoryListing;
    if (!canResolveIndexedPublicListing({
      workspacePublishListingsPublicly: true,
      listingPublishPublicly: listing.publishPublicly,
      status: listing.status,
      listingCompliance: listing.listingCompliance,
    })) continue;
    if (listing.syncedAt < cutoff && !input.ownerPreview) {
      hasOlderMatchingInventory = true;
      continue;
    }
    if (listing.syncedAt < cutoff) hasOlderMatchingInventory = true;
    const card = inventoryListingToAgentPageCard(listing, input.appOrigin);
    if (card.listingLabel === "FOR RENT") {
      if (rent.length < NEIGHBORHOOD_LISTING_MAX_PER_TYPE) rent.push(card);
    } else if (card.listingLabel === "FOR SALE") {
      if (sale.length < NEIGHBORHOOD_LISTING_MAX_PER_TYPE) sale.push(card);
    }
    if (sale.length >= NEIGHBORHOOD_LISTING_MAX_PER_TYPE &&
        rent.length >= NEIGHBORHOOD_LISTING_MAX_PER_TYPE) break;
  }
  return {
    boundaryStatus: "verified", boundarySource: boundary.source, mode,
    sale, rent, hasOlderMatchingInventory,
  };
}
