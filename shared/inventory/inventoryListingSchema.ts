import { z } from "zod";
import { inventoryProviderSchema } from "./inventoryProviderSchema";

export const inventoryListingStatusSchema = z.enum([
  "active",
  "inactive",
  "pending",
  "sold",
  "off_market",
]);

export type InventoryListingStatus = z.infer<typeof inventoryListingStatusSchema>;

export const inventoryPhotoSchema = z.object({
  url: z.string().url(),
  order: z.number().int().optional(),
  caption: z.string().optional(),
});

export type InventoryPhoto = z.infer<typeof inventoryPhotoSchema>;

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
  description: z.string().optional(),
  features: z.array(z.string()),
  photos: z.array(inventoryPhotoSchema),
  listingUrl: z.string().url().nullable().optional(),
  sourceUpdatedAt: z.string().datetime().optional(),
});

export type NormalizedInventoryListing = z.infer<typeof normalizedInventoryListingSchema>;

export const mlsGridSourceConfigSchema = z.object({
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
