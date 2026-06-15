/**
 * Infer rental transaction intent from message + extracted patch (no explicit "rent" required).
 */
import type { BuyerPreferenceExtractionPatch, BuyerPreferenceProfile } from "./buyerPreferenceSchema";

export function isPlausibleRentBudgetAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 400 && n <= 50_000;
}

export function isPlausibleSaleBudgetAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 10_000;
}

export function hasRentBudgetInPatch(patch: BuyerPreferenceExtractionPatch): boolean {
  const min = patch.priceMin?.value;
  const max = patch.priceMax?.value;
  if (typeof min === "number" && isPlausibleRentBudgetAmount(min)) return true;
  if (typeof max === "number" && isPlausibleRentBudgetAmount(max)) return true;
  return false;
}

const EXPLICIT_RENT_RE =
  /\b(rent|rentals?|renting|lease|leasing|for\s+rent|tenant|\/mo|per\s+month|monthly)\b/i;

/** Infer rent intent from apartment/lease cues + monthly-dollar budget range. */
export function inferRentIntentFromMessage(
  text: string,
  patch: BuyerPreferenceExtractionPatch,
): boolean {
  const lower = (text || "").toLowerCase();
  if (EXPLICIT_RENT_RE.test(lower)) return true;
  if (/\b(apartments?|for\s+lease)\b/i.test(lower) && hasRentBudgetInPatch(patch)) return true;
  if (hasRentBudgetInPatch(patch) && /\b(dollars|\/mo|per\s+month|monthly)\b/i.test(lower)) {
    return true;
  }
  if (
    /\b(apartments?)\b/i.test(lower) &&
    hasRentBudgetInPatch(patch) &&
    /\bbetween\b/i.test(lower)
  ) {
    return true;
  }
  return false;
}

export function isRentIntentEvidence(evidence: string | undefined): boolean {
  return (
    !!evidence &&
    /rent intent|for rent|lease|rental|inferred from apartment|monthly budget|apartment and monthly/i.test(
      evidence,
    )
  );
}

export function profileLooksLikeBuySearch(profile: BuyerPreferenceProfile): boolean {
  if (profile.transactionIntent?.value === "buy") return true;
  if (typeof profile.priceMax?.value === "number" && isPlausibleSaleBudgetAmount(profile.priceMax.value)) {
    return true;
  }
  if (typeof profile.priceMin?.value === "number" && isPlausibleSaleBudgetAmount(profile.priceMin.value)) {
    return true;
  }
  return false;
}

/** Prior buy/sale profile → incoming rental search (apartment + $2k–$2.5k, etc.). */
export function isBuyToRentPivot(
  current: BuyerPreferenceProfile | undefined,
  patch: BuyerPreferenceExtractionPatch,
  text: string,
): boolean {
  if (!current || !profileLooksLikeBuySearch(current)) return false;

  const rentIncoming =
    patch.transactionIntent?.value === "rent" || inferRentIntentFromMessage(text, patch);
  if (!rentIncoming) return false;

  return (
    hasRentBudgetInPatch(patch) ||
    /\b(apartments?|lease|renting|for\s+lease)\b/i.test(text.toLowerCase())
  );
}

export function isBuyToRentPivotReplacement(
  text: string,
  patch: BuyerPreferenceExtractionPatch,
  current?: BuyerPreferenceProfile,
): boolean {
  if (!current || !isBuyToRentPivot(current, patch, text)) return false;
  return (
    hasRentBudgetInPatch(patch) ||
    patch.bedsMin != null ||
    (patch.propertyTypes?.value?.length ?? 0) > 0 ||
    /\banywhere\b/i.test(text)
  );
}

export function hasSaleBudgetInPatch(patch: BuyerPreferenceExtractionPatch): boolean {
  const min = patch.priceMin?.value;
  const max = patch.priceMax?.value;
  if (typeof min === "number" && isPlausibleSaleBudgetAmount(min)) return true;
  if (typeof max === "number" && isPlausibleSaleBudgetAmount(max)) return true;
  return false;
}

/** Prior rental profile → incoming purchase search (SFH + $1M, homes for sale, etc.). */
export function isRentToBuyPivot(
  current: BuyerPreferenceProfile | undefined,
  patch: BuyerPreferenceExtractionPatch,
  text: string,
): boolean {
  if (!current || current.transactionIntent?.value !== "rent") return false;
  if (patch.transactionIntent?.value === "rent" || inferRentIntentFromMessage(text, patch)) {
    return false;
  }
  const buyIncoming =
    patch.transactionIntent?.value === "buy" ||
    hasSaleBudgetInPatch(patch) ||
    /\b(homes?\s+for\s+sale|for\s+sale|buy(?:ing)?|purchase|cash buyer)\b/i.test(text);
  return buyIncoming;
}

export function isRentToBuyPivotReplacement(
  text: string,
  patch: BuyerPreferenceExtractionPatch,
  current?: BuyerPreferenceProfile,
): boolean {
  if (!current || !isRentToBuyPivot(current, patch, text)) return false;
  return (
    hasSaleBudgetInPatch(patch) ||
    (patch.propertyTypes?.value?.length ?? 0) > 0 ||
    (patch.targetAreas?.value?.length ?? 0) > 0 ||
    /\b(show\s+me|looking\s+for)\b/i.test(text)
  );
}

export function messageClearsAreaFilters(text: string): boolean {
  return /\banywhere\b/i.test(text);
}
