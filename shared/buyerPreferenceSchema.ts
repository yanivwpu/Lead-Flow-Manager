import { z } from "zod";

export const BUYER_PREFERENCE_SCHEMA_VERSION = 1 as const;

export const preferenceSourceSchema = z.enum(["explicit", "inferred"]);
export type PreferenceSource = z.infer<typeof preferenceSourceSchema>;

export const preferenceFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z
    .object({
      value: valueSchema,
      source: preferenceSourceSchema,
      confidence: z.number().min(0).max(1),
      updatedAt: z.string(),
      evidence: z.string().max(200).optional(),
      conversationId: z.string().optional(),
      messageId: z.string().optional(),
    })
    .strict();

export type PreferenceField<T> = {
  value: T;
  source: PreferenceSource;
  confidence: number;
  updatedAt: string;
  evidence?: string;
  conversationId?: string;
  messageId?: string;
};

export const propertyTypeSchema = z.enum([
  "condo",
  "house",
  "townhouse",
  "multi_family",
  "land",
]);

export const financingStatusSchema = z.enum([
  "cash",
  "pre_approved",
  "exploring",
  "unknown",
]);

export const timelinePreferenceSchema = z.enum([
  "asap",
  "30d",
  "60_90d",
  "browsing",
  "unknown",
]);

export const buyerGeoConstraintSchema = z.object({
  referenceId: z.string().min(1),
  side: z.enum(["east", "west", "north", "south"]),
  cityContext: z.string().optional(),
});

export type BuyerGeoConstraint = z.infer<typeof buyerGeoConstraintSchema>;

export const buyerPreferenceProfileSchema = z
  .object({
    schemaVersion: z.literal(BUYER_PREFERENCE_SCHEMA_VERSION),
    profileStatus: z.enum(["empty", "partial", "ready"]).default("empty"),
    lastExtractedAt: z.string().optional(),
    lastInboundAt: z.string().optional(),
    targetAreas: preferenceFieldSchema(z.array(z.string())).optional(),
    priceMin: preferenceFieldSchema(z.number()).optional(),
    priceMax: preferenceFieldSchema(z.number()).optional(),
    bedsMin: preferenceFieldSchema(z.number()).optional(),
    bathsMin: preferenceFieldSchema(z.number()).optional(),
    propertyTypes: preferenceFieldSchema(z.array(propertyTypeSchema)).optional(),
    investmentIntent: preferenceFieldSchema(z.boolean()).optional(),
    waterfront: preferenceFieldSchema(z.boolean()).optional(),
    pool: preferenceFieldSchema(z.boolean()).optional(),
    gatedCommunity: preferenceFieldSchema(z.boolean()).optional(),
    parking: preferenceFieldSchema(z.boolean()).optional(),
    petFriendly: preferenceFieldSchema(z.boolean()).optional(),
    shortTermRentalAllowed: preferenceFieldSchema(z.boolean()).optional(),
    modernStyle: preferenceFieldSchema(z.boolean()).optional(),
    lowHoa: preferenceFieldSchema(z.boolean()).optional(),
    walkability: preferenceFieldSchema(z.boolean()).optional(),
    schoolPriority: preferenceFieldSchema(z.boolean()).optional(),
    timeline: preferenceFieldSchema(timelinePreferenceSchema).optional(),
    financingStatus: preferenceFieldSchema(financingStatusSchema).optional(),
    mustHaves: preferenceFieldSchema(z.array(z.string())).optional(),
    dealBreakers: preferenceFieldSchema(z.array(z.string())).optional(),
    geoConstraints: preferenceFieldSchema(z.array(buyerGeoConstraintSchema)).optional(),
  })
  .strict();

export type BuyerPreferenceProfile = z.infer<typeof buyerPreferenceProfileSchema>;

export const buyerPreferenceExtractionPatchSchema = buyerPreferenceProfileSchema
  .omit({
    schemaVersion: true,
    profileStatus: true,
    lastExtractedAt: true,
    lastInboundAt: true,
  })
  .partial()
  .strict();

export type BuyerPreferenceExtractionPatch = z.infer<typeof buyerPreferenceExtractionPatchSchema>;

export function emptyBuyerPreferenceProfile(): BuyerPreferenceProfile {
  return {
    schemaVersion: BUYER_PREFERENCE_SCHEMA_VERSION,
    profileStatus: "empty",
  };
}

export function normalizeBuyerPreferenceProfile(raw: unknown): BuyerPreferenceProfile {
  if (!raw || typeof raw !== "object") return emptyBuyerPreferenceProfile();
  const parsed = buyerPreferenceProfileSchema.safeParse(raw);
  if (parsed.success) {
    return { ...parsed.data, profileStatus: deriveProfileStatus(parsed.data) };
  }
  return emptyBuyerPreferenceProfile();
}

function fieldActive<T>(f: PreferenceField<T> | undefined, minConfidence = 0.5): boolean {
  return !!f && f.confidence >= minConfidence;
}

export function deriveProfileStatus(profile: BuyerPreferenceProfile): BuyerPreferenceProfile["profileStatus"] {
  const hasArea = fieldActive(profile.targetAreas);
  const hasPrice = fieldActive(profile.priceMin) || fieldActive(profile.priceMax);
  const hasType = fieldActive(profile.propertyTypes);
  const importantCount = [
    fieldActive(profile.bedsMin),
    fieldActive(profile.timeline),
    fieldActive(profile.financingStatus),
    fieldActive(profile.mustHaves),
  ].filter(Boolean).length;

  const critical = [hasArea, hasPrice, hasType].filter(Boolean).length;
  if (critical >= 2 && importantCount >= 1) return "ready";
  if (critical >= 1 || importantCount >= 1 || fieldActive(profile.pool) || fieldActive(profile.waterfront)) {
    return "partial";
  }
  const anyField =
    critical > 0 ||
    importantCount > 0 ||
    [
      profile.investmentIntent,
      profile.gatedCommunity,
      profile.parking,
      profile.petFriendly,
      profile.modernStyle,
      profile.lowHoa,
      profile.walkability,
      profile.schoolPriority,
      profile.shortTermRentalAllowed,
      profile.dealBreakers,
    ].some((f) => fieldActive(f));
  return anyField ? "partial" : "empty";
}
