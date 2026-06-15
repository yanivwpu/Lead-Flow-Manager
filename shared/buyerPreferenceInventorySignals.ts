/**
 * Inventory-related buyer message signals — fast-path extraction (Phase A).
 */

import { detectShowMeAllPropertyTypeRelaxation } from "./buyerPreferencePropertyTypeRelax";

const PROPERTY_TYPE_SIGNAL_RE =
  /\b(sfh|single[\s-]?family(?:\s+home)?|condo(?:minium)?s?|apartments?|townhouse|town[\s-]?house|multi[\s-]?family|houses?|homes?|land)\b/i;

/** Common typo: "apparent" → apartment in listing-search context. */
const REAL_ESTATE_APPARENT_RE =
  /\bapparent\b/i;

const REAL_ESTATE_SEARCH_CONTEXT_RE =
  /\b(for\s+sale|for\s+rent|show\s+me|looking\s+for|find\s+me|\d+\s*\/\s*\d+)/i;

const TRANSACTION_INTENT_SIGNAL_RE =
  /\b(for\s+sale|for\s+rent|rental|rentals?|lease|leasing|buy(?:ing)?|purchase)\b/i;

const STRONG_BUDGET_SIGNAL_RE =
  /\$\s*[\d,.]+|\bbudget\b|\bbetween\s+\d|\d+\s*-\s*\d+\s+dollars?|\d+\s+dollars?\b|\b(?:up\s+to|under|max)\s+[\d,.]+\s*(?:k|m|mil|million)?/i;

const LOCATION_SIGNAL_RE =
  /\b(?:in|near|around)\s+[a-z][a-z\s]{1,40}\b|\b(?:east|west|north|south)\s+of\b|\b(?:federal|us\s*1|highway|hwy|boulevard|blvd)\b/i;

const POOL_SIGNAL_RE = /\bpool\b/i;
const WATERFRONT_SIGNAL_RE = /\bwaterfront\b/i;
const BED_SIGNAL_RE = /\b\d+\s*[- ]?\s*bed|\b\d+\s*\/\s*\d+/i;
const BED_CORRECTION_SIGNAL_RE =
  /\b(too big|too many bed|instead|only|is better|show me\s+\d+\s*\/\s*\d+)/i;
const BATH_SIGNAL_RE = /\b\d+(?:\.\d+)?\s*[- ]?\s*bath/i;
const BUDGET_SIGNAL_RE =
  /\$\s*[\d,.]+|\bbudget\b|\bbetween\s+\d|\d+\s*-\s*\d+\s+dollars?|\d+\s+dollars?\b|\b(?:up\s+to|under)\s+[\d,.]+\s*(?:k|m|mil|million)?/i;

/** Property type mention including real-estate-context "apparent" typo. */
export function hasPropertyTypeSignalInMessage(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (PROPERTY_TYPE_SIGNAL_RE.test(t)) return true;
  return REAL_ESTATE_APPARENT_RE.test(t) && REAL_ESTATE_SEARCH_CONTEXT_RE.test(t);
}

/** True when inbound text looks like a listing search / criteria change. */
export function hasInventoryPreferenceSignals(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 8) return false;
  return (
    hasPropertyTypeSignalInMessage(t) ||
    LOCATION_SIGNAL_RE.test(t) ||
    POOL_SIGNAL_RE.test(t) ||
    WATERFRONT_SIGNAL_RE.test(t) ||
    BED_SIGNAL_RE.test(t) ||
    BED_CORRECTION_SIGNAL_RE.test(t) ||
    BATH_SIGNAL_RE.test(t) ||
    BUDGET_SIGNAL_RE.test(t) ||
    TRANSACTION_INTENT_SIGNAL_RE.test(t)
  );
}

/**
 * Strong structured search — sync persist on inbound (skip async LLM/debounce).
 * Requires intent + criteria, or budget paired with beds/type.
 */
export function hasStrongStructuredSearchSignals(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 8 || !hasInventoryPreferenceSignals(t)) return false;

  const hasIntent = TRANSACTION_INTENT_SIGNAL_RE.test(t);
  const hasBudget = STRONG_BUDGET_SIGNAL_RE.test(t);
  const hasBeds = BED_SIGNAL_RE.test(t) || BED_CORRECTION_SIGNAL_RE.test(t);
  const hasType = hasPropertyTypeSignalInMessage(t);
  const hasArea = LOCATION_SIGNAL_RE.test(t);
  const hasAmenity =
    POOL_SIGNAL_RE.test(t) || WATERFRONT_SIGNAL_RE.test(t) || /\bhoa\b/i.test(t);

  const criteriaCount = [hasBudget, hasBeds, hasType, hasArea, hasAmenity].filter(Boolean).length;
  if (hasIntent && criteriaCount >= 1) return true;
  if (hasBudget && (hasBeds || hasType)) return true;
  if (criteriaCount >= 2 && (hasBeds || hasBudget)) return true;
  return false;
}

export type PreferenceArrayReplaceKey = "propertyTypes" | "targetAreas";

/** When inbound explicitly states type or area, replace arrays instead of union-merge. */
export function detectPreferenceArrayReplacements(text: string): PreferenceArrayReplaceKey[] {
  const t = (text || "").trim();
  if (!t) return [];
  const out: PreferenceArrayReplaceKey[] = [];
  if (PROPERTY_TYPE_SIGNAL_RE.test(t)) out.push("propertyTypes");
  if (detectShowMeAllPropertyTypeRelaxation(t)) out.push("propertyTypes");
  if (hasPropertyTypeSignalInMessage(t)) out.push("propertyTypes");
  if (detectShowMeAllPropertyTypeRelaxation(t)) out.push("propertyTypes");
  if (LOCATION_SIGNAL_RE.test(t)) out.push("targetAreas");
  if (/\banywhere\b/i.test(t)) out.push("targetAreas");
  return [...new Set(out)];
}

export function logBuyerPreferenceFastPath(
  event: "preference_change_detected" | "profile_updated" | "inventory_refresh_triggered",
  payload: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      tag: "[BuyerPreference:FastPath]",
      event,
      ...payload,
    }),
  );
}
