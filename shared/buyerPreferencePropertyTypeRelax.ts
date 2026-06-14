import type { BuyerPreferenceExtractionPatch, BuyerPreferenceProfile } from "./buyerPreferenceSchema";
import { applyInboundSearchCommandOverrides } from "./buyerSearchCommand";

/** Residential rental types — excludes land and commercial. */
export const RESIDENTIAL_RENTAL_PROPERTY_TYPES = [
  "house",
  "condo",
  "townhouse",
  "multi_family",
] as const;

export type ResidentialRentalPropertyType = (typeof RESIDENTIAL_RENTAL_PROPERTY_TYPES)[number];

export const SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE = "show me all — relax property type";

const EXPLICIT_PROPERTY_TYPE_RE =
  /\b(sfh|single[\s-]?family(?:\s+home)?|condo(?:minium)?s?|townhouse|town[\s-]?house|multi[\s-]?family|land|apartments?|homes?\s+for\s+sale)\b/i;

export { EXPLICIT_PROPERTY_TYPE_RE };

export function isExplicitPropertyTypeEvidence(evidence: string | undefined): boolean {
  return !!evidence && /property type in message/i.test(evidence);
}

export function hasExplicitPropertyTypeConstraint(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (detectShowMeAllPropertyTypeRelaxation(t)) return false;
  return EXPLICIT_PROPERTY_TYPE_RE.test(t);
}

const SHOW_ME_ALL_RELAX_RE =
  /\b(?:show\s*(?:me\s+)?all|see\s+all|all\s+the\s+\d)\b/i;

export function isShowMeAllPropertyRelaxEvidence(evidence: string | undefined): boolean {
  return !!evidence && /show me all.*relax property type/i.test(evidence);
}

/**
 * "Show me all the 3/2 in Pompano…" broadens property type only — not beds/budget/area.
 * Skipped when the message names a specific property type (e.g. "all condos").
 */
export function detectShowMeAllPropertyTypeRelaxation(text: string): boolean {
  const t = (text || "").trim();
  if (!t || !SHOW_ME_ALL_RELAX_RE.test(t)) return false;
  if (EXPLICIT_PROPERTY_TYPE_RE.test(t)) return false;
  return true;
}

export function stripSfhFromMustHaves(profile: BuyerPreferenceProfile): void {
  if (!profile.mustHaves?.value?.length) return;
  const filtered = profile.mustHaves.value
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((raw) => {
      const lower = raw.toLowerCase();
      return !/\bsfh\b/.test(lower) && !/\bsingle[\s-]?family\b/.test(lower);
    });
  if (filtered.length > 0) {
    profile.mustHaves = { ...profile.mustHaves, value: filtered };
  } else {
    delete profile.mustHaves;
  }
}

/**
 * After LLM extraction, re-apply show-me-all heuristic so async LLM cannot narrow
 * propertyTypes back to house-only from earlier conversation context.
 */
export function applyShowMeAllInboundOverride(
  patch: BuyerPreferenceExtractionPatch,
  inboundText: string,
): void {
  applyInboundSearchCommandOverrides(patch, inboundText);
}

export function applyExplicitPropertyTypeInboundOverride(
  patch: BuyerPreferenceExtractionPatch,
  inboundText: string,
): void {
  applyInboundSearchCommandOverrides(patch, inboundText);
}
