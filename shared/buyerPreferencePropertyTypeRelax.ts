import type { BuyerPreferenceExtractionPatch, BuyerPreferenceProfile } from "./buyerPreferenceSchema";
import { heuristicPatchFromInboundText } from "./buyerPreferenceExtractionNormalize";

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
  /\b(sfh|single[\s-]?family(?:\s+home)?|condo(?:minium)?s?|townhouse|town[\s-]?house|multi[\s-]?family|land|apartments?)\b/i;

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
  if (!inboundText.trim() || !detectShowMeAllPropertyTypeRelaxation(inboundText)) return;

  const heuristic = heuristicPatchFromInboundText(inboundText);
  if (heuristic.propertyTypes) {
    patch.propertyTypes = heuristic.propertyTypes;
  }
  if (heuristic.priceMin && heuristic.priceMax) {
    patch.priceMin = heuristic.priceMin;
    patch.priceMax = heuristic.priceMax;
  }
  if (heuristic.bedsMin) patch.bedsMin = heuristic.bedsMin;
  if (heuristic.bathsMin) patch.bathsMin = heuristic.bathsMin;
  if (heuristic.targetAreas) patch.targetAreas = heuristic.targetAreas;
}
