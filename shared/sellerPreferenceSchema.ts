import { z } from "zod";
import { preferenceFieldSchema, type PreferenceField } from "./buyerPreferenceSchema";

export const SELLER_PREFERENCE_SCHEMA_VERSION = 1 as const;

export const sellerPropertyTypeSchema = z.enum([
  "house",
  "condo",
  "townhouse",
  "multi_family",
  "land",
  "other",
]);

export const sellerTimelineSchema = z.enum([
  "asap",
  "30d",
  "60_90d",
  "browsing",
  "unknown",
]);

export const sellerOccupancySchema = z.enum([
  "owner_occupied",
  "tenant_occupied",
  "vacant",
  "unknown",
]);

export const sellerConditionSchema = z.enum([
  "move_in_ready",
  "needs_work",
  "unknown",
]);

export const sellerPreferenceProfileSchema = z
  .object({
    schemaVersion: z.literal(SELLER_PREFERENCE_SCHEMA_VERSION),
    profileStatus: z.enum(["empty", "partial", "ready"]).default("empty"),
    lastExtractedAt: z.string().optional(),
    lastInboundAt: z.string().optional(),
    lastSellerIntent: z.string().optional(),
    propertyAddress: preferenceFieldSchema(z.string()).optional(),
    city: preferenceFieldSchema(z.string()).optional(),
    propertyType: preferenceFieldSchema(sellerPropertyTypeSchema).optional(),
    beds: preferenceFieldSchema(z.number()).optional(),
    baths: preferenceFieldSchema(z.number()).optional(),
    sqft: preferenceFieldSchema(z.number()).optional(),
    timeline: preferenceFieldSchema(sellerTimelineSchema).optional(),
    reasonForSelling: preferenceFieldSchema(z.string()).optional(),
    estimatedValue: preferenceFieldSchema(z.number()).optional(),
    desiredPrice: preferenceFieldSchema(z.number()).optional(),
    mortgageBalanceKnown: preferenceFieldSchema(z.boolean()).optional(),
    occupancyStatus: preferenceFieldSchema(sellerOccupancySchema).optional(),
    condition: preferenceFieldSchema(sellerConditionSchema).optional(),
  })
  .strict();

export type SellerPreferenceProfile = z.infer<typeof sellerPreferenceProfileSchema>;
export type SellerPropertyType = z.infer<typeof sellerPropertyTypeSchema>;
export type SellerTimeline = z.infer<typeof sellerTimelineSchema>;

export function emptySellerPreferenceProfile(): SellerPreferenceProfile {
  return { schemaVersion: SELLER_PREFERENCE_SCHEMA_VERSION, profileStatus: "empty" };
}

export function normalizeSellerPreferenceProfile(raw: unknown): SellerPreferenceProfile {
  const parsed = sellerPreferenceProfileSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (raw && typeof raw === "object" && (raw as { schemaVersion?: number }).schemaVersion === 1) {
    return { ...emptySellerPreferenceProfile(), ...(raw as object), schemaVersion: 1 } as SellerPreferenceProfile;
  }
  return emptySellerPreferenceProfile();
}

export function sellerProfileHasData(profile: SellerPreferenceProfile): boolean {
  const keys = Object.keys(profile).filter(
    (k) => !["schemaVersion", "profileStatus", "lastExtractedAt", "lastInboundAt", "lastSellerIntent"].includes(k),
  );
  return keys.length > 0;
}

export type { PreferenceField };
