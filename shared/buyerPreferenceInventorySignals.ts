/**
 * Inventory-related buyer message signals — fast-path extraction (Phase A).
 */

import { detectShowMeAllPropertyTypeRelaxation } from "./buyerPreferencePropertyTypeRelax";

const PROPERTY_TYPE_SIGNAL_RE =
  /\b(sfh|single[\s-]?family(?:\s+home)?|condo(?:minium)?s?|townhouse|town[\s-]?house|multi[\s-]?family|houses?|homes?|land)\b/i;

const LOCATION_SIGNAL_RE =
  /\b(?:in|near|around)\s+[a-z][a-z\s]{1,40}\b|\b(?:east|west|north|south)\s+of\b|\b(?:federal|us\s*1|highway|hwy|boulevard|blvd)\b/i;

const POOL_SIGNAL_RE = /\bpool\b/i;
const WATERFRONT_SIGNAL_RE = /\bwaterfront\b/i;
const BED_SIGNAL_RE = /\b\d+\s*[- ]?\s*bed|\b\d+\s*\/\s*\d+/i;
const BED_CORRECTION_SIGNAL_RE =
  /\b(too big|too many bed|instead|only|is better|show me\s+\d+\s*\/\s*\d+)/i;
const BATH_SIGNAL_RE = /\b\d+(?:\.\d+)?\s*[- ]?\s*bath/i;
const BUDGET_SIGNAL_RE = /\$\s*[\d,.]+|\bbudget\b/i;

/** True when inbound text looks like a listing search / criteria change. */
export function hasInventoryPreferenceSignals(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 8) return false;
  return (
    PROPERTY_TYPE_SIGNAL_RE.test(t) ||
    LOCATION_SIGNAL_RE.test(t) ||
    POOL_SIGNAL_RE.test(t) ||
    WATERFRONT_SIGNAL_RE.test(t) ||
    BED_SIGNAL_RE.test(t) ||
    BED_CORRECTION_SIGNAL_RE.test(t) ||
    BATH_SIGNAL_RE.test(t) ||
    BUDGET_SIGNAL_RE.test(t)
  );
}

export type PreferenceArrayReplaceKey = "propertyTypes" | "targetAreas";

/** When inbound explicitly states type or area, replace arrays instead of union-merge. */
export function detectPreferenceArrayReplacements(text: string): PreferenceArrayReplaceKey[] {
  const t = (text || "").trim();
  if (!t) return [];
  const out: PreferenceArrayReplaceKey[] = [];
  if (PROPERTY_TYPE_SIGNAL_RE.test(t)) out.push("propertyTypes");
  if (detectShowMeAllPropertyTypeRelaxation(t)) out.push("propertyTypes");
  if (LOCATION_SIGNAL_RE.test(t)) out.push("targetAreas");
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
