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

export const inventoryMatchExcludedListingSchema = z.object({
  listingId: z.string(),
  providerListingId: z.string(),
  city: z.string().nullable(),
  priceCents: z.number().nullable(),
  beds: z.number().nullable(),
  baths: z.number().nullable(),
  squareFeet: z.number().nullable(),
  reason: z.string(),
});

export type InventoryMatchExcludedListing = z.infer<typeof inventoryMatchExcludedListingSchema>;

export const inventoryMatchDiagnosticsSchema = z.object({
  activeInventoryCount: z.number().int().nonnegative(),
  listingsScored: z.number().int().nonnegative(),
  matchesReturned: z.number().int().nonnegative(),
  lastMatchRunAt: z.string().datetime(),
  lastMatchingError: z.string().nullable(),
  noMatchSummary: z.string().nullable().optional(),
  exclusionSummary: z.string().nullable().optional(),
  excludedSamples: z.array(inventoryMatchExcludedListingSchema).optional(),
});

export type InventoryMatchDiagnostics = z.infer<typeof inventoryMatchDiagnosticsSchema>;

export const inventoryMatchesResponseSchema = z.object({
  eligible: z.boolean(),
  reason: z.string(),
  profileStatus: z.string().optional(),
  inventoryCount: z.number().int().nonnegative().optional(),
  matchCount: z.number().int().nonnegative(),
  matches: z.array(inventoryMatchResultSchema),
  savedListingIds: z.array(z.string()).optional(),
  diagnostics: inventoryMatchDiagnosticsSchema.optional(),
  error: z.string().optional(),
});

export type InventoryMatchesResponse = z.infer<typeof inventoryMatchesResponseSchema>;

/** Reserved for Phase 3+ automation / messaging hooks. */
export type InventoryMatchActionContext = {
  contactId: string;
  userId: string;
  matches: InventoryMatchResult[];
  triggeredAt: string;
};
