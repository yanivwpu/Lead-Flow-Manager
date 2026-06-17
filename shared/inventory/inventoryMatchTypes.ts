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
  /** Verified direct-share URL — present on every Copilot match. */
  shareUrl: z.string().url().optional(),
  directShareAllowed: z.boolean().optional(),
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

export const inventoryMatchProfileSnapshotSchema = z.object({
  priceMax: z.number().nullable(),
  priceMin: z.number().nullable(),
  pool: z.boolean().nullable(),
  bedsMin: z.number().nullable(),
  bedsMax: z.number().nullable().optional(),
  propertyTypes: z.array(z.string()),
  areas: z.array(z.string()),
  hardRequirePool: z.boolean(),
  transactionIntent: z.string(),
});

export type InventoryMatchProfileSnapshot = z.infer<typeof inventoryMatchProfileSnapshotSchema>;

export const inventoryMatchFunnelExcludedSampleSchema = z.object({
  listingId: z.string(),
  providerListingId: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  priceCents: z.number().nullable(),
  beds: z.number().nullable(),
  propertyType: z.string().nullable(),
  propertySubtype: z.string().nullable().optional(),
  resolvedType: z.string().nullable(),
  listingTransactionType: z.string().nullable().optional(),
  poolDetected: z.boolean(),
  directShareAllowed: z.boolean().optional(),
  exclusionReason: z.string().nullable(),
  matched: z.boolean(),
  score: z.number().nullable(),
});

export type InventoryMatchFunnelExcludedSample = z.infer<
  typeof inventoryMatchFunnelExcludedSampleSchema
>;

export const inventoryMatchFunnelStepSchema = z.object({
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export type InventoryMatchFunnelStep = z.infer<typeof inventoryMatchFunnelStepSchema>;

export const inventoryAgentShareExclusionCountsSchema = z.object({
  inactive: z.number().int().nonnegative(),
  missingInternetDisplay: z.number().int().nonnegative(),
  missingAttribution: z.number().int().nonnegative(),
});

export type InventoryAgentShareExclusionCounts = z.infer<
  typeof inventoryAgentShareExclusionCountsSchema
>;

export const inventoryMatchDiagnosticsSchema = z.object({
  activeInventoryCount: z.number().int().nonnegative(),
  /** Active/coming_soon rows that pass the MLS direct-share gate (Copilot pool). */
  agentShareEligibleCount: z.number().int().nonnegative().optional(),
  agentShareExclusions: inventoryAgentShareExclusionCountsSchema.optional(),
  listingsScored: z.number().int().nonnegative(),
  matchesReturned: z.number().int().nonnegative(),
  totalQualifyingMatches: z.number().int().nonnegative().optional(),
  matchingFetchLimit: z.number().int().nonnegative().optional(),
  inventoryCapTruncated: z.boolean().optional(),
  funnelSteps: z.array(inventoryMatchFunnelStepSchema).optional(),
  dataQuality: z.record(z.string(), z.number().int().nonnegative()).optional(),
  exclusionByReason: z.record(z.string(), z.number().int().nonnegative()).optional(),
  persistedProfileSnapshot: inventoryMatchProfileSnapshotSchema.optional(),
  funnelExcludedSamples: z.array(inventoryMatchFunnelExcludedSampleSchema).optional(),
  lastMatchRunAt: z.string().datetime(),
  lastMatchingError: z.string().nullable(),
  noMatchSummary: z.string().nullable().optional(),
  exclusionSummary: z.string().nullable().optional(),
  excludedSamples: z.array(inventoryMatchExcludedListingSchema).optional(),
  activeFilterSummary: z.string().nullable().optional(),
  /** Temporary build marker — confirms deployed diagnostics code version. */
  debugBuildMarker: z.string().optional(),
  buyerMatchingTraceId: z.string().optional(),
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
  buyerMatchingTraceId: z.string().optional(),
});

export type InventoryMatchesResponse = z.infer<typeof inventoryMatchesResponseSchema>;

/** Reserved for Phase 3+ automation / messaging hooks. */
export type InventoryMatchActionContext = {
  contactId: string;
  userId: string;
  matches: InventoryMatchResult[];
  triggeredAt: string;
};
