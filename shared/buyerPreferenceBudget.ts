import type { BuyerPreferenceProfile } from "./buyerPreferenceSchema";

function isUpToBudgetEvidence(evidence: string | undefined): boolean {
  return !!evidence && /\bup\s+to\b/i.test(evidence);
}

function isBudgetRangeEvidence(evidence: string | undefined): boolean {
  return !!evidence && /budget range|between|range in message/i.test(evidence);
}

/** Cap-only budgets (up to $X) must not set a matching floor. */
export function normalizeCapOnlyBudgetProfile(profile: BuyerPreferenceProfile): BuyerPreferenceProfile {
  const min = profile.priceMin?.value;
  const max = profile.priceMax?.value;
  const maxEvidence = profile.priceMax?.evidence;
  const minEvidence = profile.priceMin?.evidence;

  const capOnly =
    max != null &&
    (min == null ||
      min === max ||
      isUpToBudgetEvidence(maxEvidence) ||
      (min === max && !isBudgetRangeEvidence(minEvidence) && !isBudgetRangeEvidence(maxEvidence)));

  if (!capOnly) return profile;

  const next = { ...profile };
  delete next.priceMin;
  return next;
}

export function resolveMatchingBudgetBounds(profile: BuyerPreferenceProfile): {
  priceMin: number | null;
  priceMax: number | null;
} {
  const normalized = normalizeCapOnlyBudgetProfile(profile);
  const min = normalized.priceMin?.value ?? null;
  const max = normalized.priceMax?.value ?? null;
  if (min != null && max != null && min === max && !isBudgetRangeEvidence(normalized.priceMin?.evidence)) {
    return { priceMin: null, priceMax: max };
  }
  return {
    priceMin: typeof min === "number" ? min : null,
    priceMax: typeof max === "number" ? max : null,
  };
}
