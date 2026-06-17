/**
 * Buyer preference field tiers — drives replacement clearing and chip display.
 *
 * A) Hard search filters — affect matching; cleared on full replacement when unmentioned.
 * B) Soft preferences — lifestyle/area-specific; cleared when unmentioned or conflicting.
 * C) Buyer metadata — timeline, financing; preserved across searches, not matching gates.
 */
import type { BuyerPreferenceExtractionPatch, BuyerPreferenceProfile } from "./buyerPreferenceSchema";

/** Scalar fields that gate inventory matching. */
export const HARD_SEARCH_FILTER_KEYS = [
  "bedsMin",
  "bedsMax",
  "bathsMin",
  "pool",
  "waterfront",
  "modernStyle",
  "gatedCommunity",
  "investmentIntent",
  "lowHoa",
  "walkability",
  "schoolPriority",
  "parking",
  "petFriendly",
  "shortTermRentalAllowed",
] as const;

/** Array / geo fields that define the active search footprint. */
export const HARD_SEARCH_ARRAY_KEYS = ["targetAreas", "propertyTypes", "geoConstraints"] as const;

/** Lifestyle / area-specific prefs — not hard inventory gates but should not survive unrelated replacements. */
export const SOFT_PREFERENCE_SCALAR_KEYS = ["modernStyle", "walkability", "investmentIntent"] as const;

/** Profile keys preserved as buyer metadata (not active search chips). */
export const BUYER_METADATA_KEYS = ["timeline", "financingStatus"] as const;

/** Pseudo-areas stored in targetAreas that are proximity intents, not city names. */
export const AREA_SPECIFIC_SOFT_AREA_RE =
  /\b(close to beach|near beach|walking distance to beach|beach(?:front)? proximity|old pompano)\b/i;

/** Must-have tokens that are soft / area-specific when not re-mentioned. */
export const SOFT_MUST_HAVE_RE =
  /\b(beach|walkable|walkability|quiet|move[\s-]?in[\s-]?ready|invest(?:ment)?|hoa|low hoa|no hoa|ocean view|water view)\b/i;

export function isAreaSpecificSoftArea(area: string): boolean {
  return AREA_SPECIFIC_SOFT_AREA_RE.test(area.trim());
}

export function isHardSearchFilterKey(key: string): boolean {
  return (HARD_SEARCH_FILTER_KEYS as readonly string[]).includes(key);
}

export function isBuyerMetadataKey(key: string): boolean {
  return (BUYER_METADATA_KEYS as readonly string[]).includes(key);
}

/** Strip soft must-haves / deal-breakers not supported by the replacement message. */
export function filterSoftMustHaves(
  mustHaves: { value?: string[] } | undefined,
): string[] | undefined {
  if (!mustHaves?.value?.length) return undefined;
  const filtered = mustHaves.value
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((raw) => !SOFT_MUST_HAVE_RE.test(raw) && !/\b(pool|waterfront|ocean view)\b/i.test(raw));
  return filtered.length ? filtered : undefined;
}

/**
 * On full replacement, drop stale soft areas from profile when new cities are specified.
 * Cities from the incoming patch are preserved; soft proximity prefs live in mustHaves.
 */
export function clearStaleSoftAreas(
  profile: BuyerPreferenceProfile,
  patch: BuyerPreferenceExtractionPatch,
): void {
  const incomingAreas = (patch.targetAreas?.value ?? []).filter(
    (a) => !isAreaSpecificSoftArea(String(a)),
  );
  const hasIncomingCity = incomingAreas.length > 0;
  if (!hasIncomingCity) return;

  if (profile.targetAreas?.value?.length) {
    const kept = profile.targetAreas.value.filter((a) => {
      const s = String(a).trim();
      if (!s || isAreaSpecificSoftArea(s)) return false;
      return incomingAreas.some((inc) => inc.toLowerCase() === s.toLowerCase());
    });
    if (kept.length > 0) {
      profile.targetAreas = { ...profile.targetAreas, value: kept };
    } else {
      delete profile.targetAreas;
    }
  }

  if (patch.geoConstraints === undefined && patch.mustHaves === undefined && patch.geoPreferences === undefined && profile.geoConstraints) {
    delete profile.geoConstraints;
  }

  if (patch.geoPreferences === undefined && profile.geoPreferences?.value?.length) {
    delete profile.geoPreferences;
  }
}
