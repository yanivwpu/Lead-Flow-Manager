import { z } from "zod";
import { inventoryProviderSchema } from "./inventoryProviderSchema";
import { inventorySyncScopeFieldsSchema } from "./reso/resoSyncScope";

export const inventoryListingStatusSchema = z.enum([
  "active",
  "coming_soon",
  "inactive",
  "pending",
  "sold",
  "off_market",
]);

export type InventoryListingStatus = z.infer<typeof inventoryListingStatusSchema>;

/** Statuses eligible for AI lead matching and opportunity alerts. */
export const MATCHABLE_INVENTORY_STATUSES = ["active", "coming_soon"] as const;

export function isMatchableInventoryStatus(status: InventoryListingStatus): boolean {
  return status === "active" || status === "coming_soon";
}

export const inventoryPhotoSchema = z.object({
  url: z.string().url(),
  order: z.number().int().optional(),
  caption: z.string().optional(),
});

export type InventoryPhoto = z.infer<typeof inventoryPhotoSchema>;

/** Optional RESO-derived fields for public listing flyer (stored as listing_details jsonb). */
export const inventoryListingDetailsSchema = z.object({
  parkingGarage: z.string().optional(),
  waterfront: z.boolean().optional(),
  pool: z.boolean().optional(),
  view: z.string().optional(),
});

export type InventoryListingDetails = z.infer<typeof inventoryListingDetailsSchema>;

export const normalizedInventoryListingSchema = z.object({
  provider: inventoryProviderSchema,
  providerListingId: z.string().min(1),
  status: inventoryListingStatusSchema,
  priceCents: z.number().int().nonnegative().nullable(),
  currency: z.string().default("USD"),
  address: z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
  }),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  beds: z.number().nullable(),
  baths: z.number().nullable(),
  propertyType: z.string().nullable(),
  propertySubtype: z.string().nullable().optional(),
  squareFeet: z.number().int().positive().nullable().optional(),
  yearBuilt: z.number().int().nullable().optional(),
  hoaFeeCents: z.number().int().nonnegative().nullable().optional(),
  listingDetails: inventoryListingDetailsSchema.optional(),
  description: z.string().optional(),
  features: z.array(z.string()),
  photos: z.array(inventoryPhotoSchema),
  listingUrl: z.string().url().nullable().optional(),
  sourceUpdatedAt: z.string().datetime().optional(),
});

export type NormalizedInventoryListing = z.infer<typeof normalizedInventoryListingSchema>;

export const mlsGridSourceConfigSchema = inventorySyncScopeFieldsSchema.extend({
  originatingSystemName: z.string().min(1),
  /** OData filter fragment after OriginatingSystemName (optional extra AND clauses). */
  additionalFilter: z.string().optional(),
  expandMedia: z.boolean().default(true),
  /** True after the first full MlgCanView import completes. */
  initialImportComplete: z.boolean().optional(),
  /** Greatest ModificationTimestamp received from MLS Grid (incremental cursor). */
  maxModificationTimestamp: z.string().optional(),
  lastReconciliationAt: z.string().optional(),
  lastSuccessfulSyncAt: z.string().optional(),
  lastFailedSyncAt: z.string().optional(),
});

export type MlsGridSourceConfig = z.infer<typeof mlsGridSourceConfigSchema>;

export const mlsGridCredentialsSchema = z.object({
  accessToken: z.string().min(1),
});

export type MlsGridCredentials = z.infer<typeof mlsGridCredentialsSchema>;

/** Trestle source config — shares RESO sync cursor fields with MLS Grid. */
export const trestleSourceConfigSchema = inventorySyncScopeFieldsSchema.extend({
  originatingSystemName: z.string().min(1),
  additionalFilter: z.string().optional(),
  expandMedia: z.boolean().default(true),
  initialImportComplete: z.boolean().optional(),
  maxModificationTimestamp: z.string().optional(),
  lastReconciliationAt: z.string().optional(),
  lastSuccessfulSyncAt: z.string().optional(),
  lastFailedSyncAt: z.string().optional(),
});

export type TrestleSourceConfig = z.infer<typeof trestleSourceConfigSchema>;

export const trestleCredentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export type TrestleCredentials = z.infer<typeof trestleCredentialsSchema>;

/** Bridge Interactive source config — dataset + shared RESO sync cursor fields. */
export const bridgeInteractiveSourceConfigSchema = inventorySyncScopeFieldsSchema.extend({
  datasetId: z.string().min(1),
  additionalFilter: z.string().optional(),
  /** When false, omit embedded Media from Property payloads via $unselect. */
  expandMedia: z.boolean().default(true),
  initialImportComplete: z.boolean().optional(),
  maxModificationTimestamp: z.string().optional(),
  lastReconciliationAt: z.string().optional(),
  lastSuccessfulSyncAt: z.string().optional(),
  lastFailedSyncAt: z.string().optional(),
});

export type BridgeInteractiveSourceConfig = z.infer<typeof bridgeInteractiveSourceConfigSchema>;

export const bridgeInteractiveCredentialsSchema = z.object({
  serverToken: z.string().min(1),
});

export type BridgeInteractiveCredentials = z.infer<typeof bridgeInteractiveCredentialsSchema>;
