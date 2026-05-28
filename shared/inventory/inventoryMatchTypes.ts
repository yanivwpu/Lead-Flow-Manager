import { z } from "zod";

export const inventoryMatchListingSummarySchema = z.object({
  id: z.string(),
  providerListingId: z.string(),
  status: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  addressLine1: z.string().nullable(),
  priceCents: z.number().nullable(),
  beds: z.number().nullable(),
  baths: z.number().nullable(),
  propertyType: z.string().nullable(),
  listingUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});

export type InventoryMatchListingSummary = z.infer<typeof inventoryMatchListingSummarySchema>;

export const inventoryMatchResultSchema = z.object({
  listingId: z.string(),
  providerListingId: z.string(),
  score: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  listing: inventoryMatchListingSummarySchema,
});

export type InventoryMatchResult = z.infer<typeof inventoryMatchResultSchema>;

export const inventoryMatchesResponseSchema = z.object({
  eligible: z.boolean(),
  reason: z.string(),
  profileStatus: z.string().optional(),
  inventoryCount: z.number().int().nonnegative().optional(),
  matchCount: z.number().int().nonnegative(),
  matches: z.array(inventoryMatchResultSchema),
});

export type InventoryMatchesResponse = z.infer<typeof inventoryMatchesResponseSchema>;

/** Reserved for Phase 3+ automation / messaging hooks. */
export type InventoryMatchActionContext = {
  contactId: string;
  userId: string;
  matches: InventoryMatchResult[];
  triggeredAt: string;
};
