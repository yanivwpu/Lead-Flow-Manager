import { z } from "zod";
import { inventoryMatchListingSummarySchema } from "./inventoryMatchTypes";

export const syncAlertStatusSchema = z.enum(["new", "existing", "price_changed"]);
export type SyncAlertStatus = z.infer<typeof syncAlertStatusSchema>;

export const inventoryOpportunityTypeSchema = z.enum(["new_listing", "price_reduced"]);
export type InventoryOpportunityType = z.infer<typeof inventoryOpportunityTypeSchema>;

export const inventoryOpportunityStatusSchema = z.enum(["new", "viewed", "saved", "dismissed"]);
export type InventoryOpportunityStatus = z.infer<typeof inventoryOpportunityStatusSchema>;

export const inventoryOpportunityResultSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  opportunityType: inventoryOpportunityTypeSchema,
  score: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  headline: z.string(),
  priceReductionLabel: z.string().nullable(),
  previousPriceCents: z.number().nullable(),
  currentPriceCents: z.number().nullable(),
  discoveredAt: z.string(),
  status: inventoryOpportunityStatusSchema,
  listing: inventoryMatchListingSummarySchema,
});

export type InventoryOpportunityResult = z.infer<typeof inventoryOpportunityResultSchema>;

export const inventoryOpportunitiesResponseSchema = z.object({
  eligible: z.boolean(),
  reason: z.string(),
  opportunityCount: z.number().int().nonnegative(),
  opportunities: z.array(inventoryOpportunityResultSchema),
});

export type InventoryOpportunitiesResponse = z.infer<typeof inventoryOpportunitiesResponseSchema>;

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  condo: "Condo",
  house: "House",
  townhouse: "Townhouse",
  multi_family: "Multi-family",
  land: "Land",
};

export function formatPropertyTypeLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  if (PROPERTY_TYPE_LABELS[key]) return PROPERTY_TYPE_LABELS[key];
  if (key.includes("condo")) return "Condo";
  if (key.includes("townhouse") || key.includes("town_house")) return "Townhouse";
  if (key.includes("house") || key.includes("single")) return "House";
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatPriceReductionLabel(deltaCents: number): string {
  const dollars = Math.round(deltaCents / 100);
  return `Price reduced $${dollars.toLocaleString("en-US")}`;
}

export function buildOpportunityHeadline(
  opportunityType: InventoryOpportunityType,
  listing: { city: string | null; propertyType: string | null },
): string {
  if (opportunityType === "price_reduced") return "Price Reduced";
  const city = listing.city?.trim();
  const propertyLabel = formatPropertyTypeLabel(listing.propertyType);
  if (city && propertyLabel) return `New ${city} ${propertyLabel}`;
  if (city) return `New ${city} Listing`;
  if (propertyLabel) return `New ${propertyLabel}`;
  return "New Listing";
}
