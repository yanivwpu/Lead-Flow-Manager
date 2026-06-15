/**
 * Buyer Search Command — normalize every inventory-related inbound message into a
 * structured command before merging into BuyerPreferenceProfile.
 *
 * Heuristic extraction produces the patch; this layer classifies intent and
 * defines merge policy (replace vs merge, locked fields for LLM override).
 */
import type { BuyerPreferenceExtractionPatch, BuyerPreferenceProfile } from "./buyerPreferenceSchema";
import type { PreferenceArrayReplaceKey } from "./buyerPreferenceInventorySignals";
import {
  detectPreferenceArrayReplacements,
  hasInventoryPreferenceSignals,
} from "./buyerPreferenceInventorySignals";
import {
  heuristicPatchFromInboundText,
  patchFieldCount,
} from "./buyerPreferenceExtractionNormalize";
import {
  detectShowMeAllPropertyTypeRelaxation,
  hasExplicitPropertyTypeConstraint,
  isShowMeAllPropertyRelaxEvidence,
} from "./buyerPreferencePropertyTypeRelax";
import { stripStaleHardGatesFromPatch } from "./buyerPreferenceMerge";
import {
  inferRentIntentFromMessage,
  isBuyToRentPivot,
  isBuyToRentPivotReplacement,
  isRentToBuyPivotReplacement,
  hasSaleBudgetInPatch,
  messageClearsAreaFilters,
} from "./buyerRentIntent";

export type BuyerSearchCommandKind =
  | "new_search"
  | "refine_search"
  | "narrow_search"
  | "broaden_search"
  | "correction"
  | "transaction_pivot"
  | "followup_request";

export type BuyerSearchCommand = {
  kind: BuyerSearchCommandKind;
  /** Short tags for logs/tests (e.g. sfh, rent, up_to_budget). */
  signals: string[];
  /** Heuristic patch — authoritative for lockedFields. */
  patch: BuyerPreferenceExtractionPatch;
  /** Array fields that replace (not union-merge) on the profile. */
  replaceArrayFields: PreferenceArrayReplaceKey[];
  /** LLM extraction must not override these profile keys. */
  lockedFields: (keyof BuyerPreferenceExtractionPatch)[];
  /** When true, do not mutate BuyerPreferenceProfile (e.g. "any other listings?"). */
  skipProfileUpdate: boolean;
  /** Clear pool/beds/waterfront etc. not mentioned in this message (replacement search). */
  clearUnmentionedHardGates?: boolean;
  /** Human-readable summary for matching debug / logs. */
  explanation: string;
};

/** Refinement phrases — keep prior hard gates like pool or beds. */
const REFINEMENT_CARRYOVER_RE =
  /\b(?:also|add(?:itional)?|plus|keep|still|and also|as well as|same area|including|include|must have|need(?:s)? a|need(?:s)? at least|minimum|min(?:imum)?\s+\d+\s*bed)\b/i;

const EXPLICIT_POOL_REQUIRED_RE =
  /\b(?:with pool|must have pool|pool required|needs pool|need(?:s)? a pool)\b/i;

const POOL_OPTIONAL_RE =
  /\b(with or without pool|pool optional|don'?t need (?:a )?pool|no pool required|pool not required)\b/i;

const FOLLOWUP_REQUEST_RE =
  /\b(?:any\s+other\s+listings?|other\s+listings?|more\s+listings?|what\s+else|send\s+more|anything\s+else|show\s+me\s+more|do\s+you\s+have\s+(?:any\s+)?other|got\s+anything\s+else|any\s+more\s+(?:options|homes|places|rentals|houses))\b/i;

const CORRECTION_RE =
  /\b(too big|too small|too many bed|too large|too many|instead|rather than|is better|only\s+\d+\s*\/\s*\d+)\b/i;

const RENT_INTENT_RE = /\b(rent|rentals?|renting|lease|leasing|for\s+rent|\/mo|per\s+month)\b/i;
const BUY_INTENT_RE =
  /\b(homes?\s+for\s+sale|for\s+sale|buy|buying|purchase|looking to buy|show\s+(?:me\s+)?(?:sfh|homes?|houses?|listings?))\b/i;

function mentionsPoolOptional(text: string): boolean {
  return POOL_OPTIONAL_RE.test(text);
}

function isSaleReplacementSearchMessage(
  text: string,
  patch: BuyerPreferenceExtractionPatch,
): boolean {
  const lower = (text || "").toLowerCase();
  const hasShowStyle = /\b(show\s+me|looking\s+for|find\s+me)\b/i.test(lower);
  const hasSaleBudget =
    hasSaleBudgetInPatch(patch) ||
    /\b(?:\$|up\s+to\s+).*(?:\bmil\b|million|\d{3,}\s*k)\b/i.test(lower);
  const hasType =
    (patch.propertyTypes?.value?.length ?? 0) > 0 ||
    hasExplicitPropertyTypeConstraint(text) ||
    /\b(sfh|single[\s-]?family|houses?|homes?)\b/i.test(lower);
  return hasShowStyle && hasSaleBudget && hasType && !RENT_INTENT_RE.test(lower);
}

function isRefinementCarryoverMessage(
  text: string,
  patch?: BuyerPreferenceExtractionPatch,
  current?: BuyerPreferenceProfile,
): boolean {
  if (patch && current && isBuyToRentPivot(current, patch, text)) return false;
  if (patch && current && isRentToBuyPivotReplacement(text, patch, current)) return false;
  if (patch && isSaleReplacementSearchMessage(text, patch)) return false;
  if (mentionsPoolOptional(text)) return false;
  if (EXPLICIT_POOL_REQUIRED_RE.test(text)) return true;
  return REFINEMENT_CARRYOVER_RE.test(text);
}

function hasSalePropertyTypeSignal(text: string): boolean {
  const lower = (text || "").toLowerCase();
  if (/\b(for\s+sale|homes?\s+for\s+sale)\b/i.test(lower)) return true;
  return /\b(houses?|homes?|sfh|properties|listings?)\b/i.test(lower) && /\bfor\s+sale\b/i.test(lower);
}

function hasDistinctReplacementArea(
  patch: BuyerPreferenceExtractionPatch,
  current?: BuyerPreferenceProfile,
): boolean {
  const incoming = patch.targetAreas?.value ?? [];
  const currentAreas = current?.targetAreas?.value ?? [];
  if (incoming.length === 0 || currentAreas.length === 0) return false;
  return incoming.some(
    (a) => !currentAreas.some((c) => c.toLowerCase() === a.toLowerCase()),
  );
}
export function isFullReplacementSearch(
  text: string,
  patch: BuyerPreferenceExtractionPatch,
  current?: BuyerPreferenceProfile,
): boolean {
  if (!current || !profileHasCriteria(current)) return false;
  if (isRefinementCarryoverMessage(text, patch, current)) return false;
  if (isCorrectionMessage(text)) return false;
  if (isFollowupRequestMessage(text)) return false;
  if (detectShowMeAllPropertyTypeRelaxation(text)) return false;

  const hasArea = (patch.targetAreas?.value?.length ?? 0) > 0;
  const hasType =
    (patch.propertyTypes?.value?.length ?? 0) > 0 ||
    hasExplicitPropertyTypeConstraint(text) ||
    hasSalePropertyTypeSignal(text) ||
    (/\b(sfh|single[\s-]?family)\b/i.test(text) && !RENT_INTENT_RE.test(text));
  const hasBudget = patch.priceMax?.value != null || patch.priceMin?.value != null;

  if (!hasArea || !hasType || !hasBudget) return false;

  if (isNarrowSearch(text, patch, current)) {
    const buySide =
      patch.transactionIntent?.value === "buy" ||
      (patch.transactionIntent?.value !== "rent" && current?.transactionIntent?.value === "buy") ||
      hasSaleBudgetInPatch(patch) ||
      /\b(for\s+sale|homes?\s+for\s+sale|buy(?:ing)?|purchase|cash buyer)\b/i.test(text);
    const showStyleReset = /\b(show(?:\s+me)?(?:\s+(?:sfh|homes?|houses?|listings?))?|looking for|find(?:\s+me)?)\b/i.test(
      text,
    );
    if (!buySide || !showStyleReset) return false;
  }

  return true;
}

function profileHasCriteria(profile: BuyerPreferenceProfile | undefined): boolean {
  if (!profile) return false;
  return (
    !!profile.transactionIntent ||
    !!profile.targetAreas ||
    !!profile.propertyTypes ||
    !!profile.priceMin ||
    !!profile.priceMax ||
    !!profile.bedsMin ||
    !!profile.bedsMax ||
    !!profile.bathsMin ||
    !!profile.pool ||
    !!profile.geoConstraints
  );
}

export function isFollowupRequestMessage(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (FOLLOWUP_REQUEST_RE.test(t)) return true;
  return false;
}

function isCorrectionMessage(text: string): boolean {
  return CORRECTION_RE.test((text || "").toLowerCase());
}

function detectTransactionPivot(
  text: string,
  patch: BuyerPreferenceExtractionPatch,
  current: BuyerPreferenceProfile | undefined,
): boolean {
  const incoming = patch.transactionIntent?.value;
  if (!incoming || !current?.transactionIntent?.value) {
    if (incoming === "rent" && isBuyToRentPivot(current, patch, text)) return true;
    return false;
  }
  if (incoming === current.transactionIntent.value) return false;
  const lower = text.toLowerCase();
  if (incoming === "buy" && BUY_INTENT_RE.test(lower)) return true;
  if (incoming === "rent" && (RENT_INTENT_RE.test(lower) || inferRentIntentFromMessage(text, patch))) {
    return true;
  }
  return false;
}

function isNarrowSearch(
  text: string,
  patch: BuyerPreferenceExtractionPatch,
  current: BuyerPreferenceProfile | undefined,
): boolean {
  if (hasDistinctReplacementArea(patch, current)) {
    const hasBudget = patch.priceMax?.value != null || patch.priceMin?.value != null;
    const saleSide =
      patch.transactionIntent?.value === "buy" ||
      /\b(for\s+sale|homes?\s+for\s+sale|buy(?:ing)?|purchase)\b/i.test(text);
    if (hasBudget && saleSide && hasSalePropertyTypeSignal(text)) return false;
  }

  if (hasExplicitPropertyTypeConstraint(text)) {
    const incomingTypes = patch.propertyTypes?.value ?? [];
    const currentTypes = current?.propertyTypes?.value ?? [];
    if (incomingTypes.length === 0) return false;
    if (isShowMeAllPropertyRelaxEvidence(current?.propertyTypes?.evidence)) return true;
    if (currentTypes.length > 0 && incomingTypes.length < currentTypes.length) return true;
  }

  const incomingMax = patch.priceMax?.value;
  const currentMax = current?.priceMax?.value;
  const upToEvidence = /\bup\s+to\b/i.test(patch.priceMax?.evidence || "");
  if (
    typeof incomingMax === "number" &&
    upToEvidence &&
    typeof currentMax === "number" &&
    incomingMax < currentMax
  ) {
    return true;
  }

  if (
    typeof incomingMax === "number" &&
    upToEvidence &&
    (current?.priceMin?.value != null || isShowMeAllPropertyRelaxEvidence(current?.propertyTypes?.evidence))
  ) {
    return true;
  }

  return false;
}

function collectSignals(text: string, patch: BuyerPreferenceExtractionPatch): string[] {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  if (patch.transactionIntent?.value === "rent" || RENT_INTENT_RE.test(lower)) signals.push("rent");
  if (patch.transactionIntent?.value === "buy" || BUY_INTENT_RE.test(lower)) signals.push("buy");
  if (/\bsfh\b|single[\s-]?family/i.test(lower)) signals.push("sfh");
  if (/\bcondo/i.test(lower)) signals.push("condo");
  if (/\btownhouse|town[\s-]?house/i.test(lower)) signals.push("townhouse");
  if (/\bapartment/i.test(lower)) signals.push("apartment");
  if (detectShowMeAllPropertyTypeRelaxation(text)) signals.push("show_me_all");
  if (/\bup\s+to\b/i.test(lower)) signals.push("up_to_budget");
  if (/\bbetween\b/i.test(lower) && /\$|\d/.test(lower)) signals.push("between_budget");
  if (/\d+\s*\/\s*\d+/.test(lower)) signals.push("beds_baths_shorthand");
  if (isCorrectionMessage(text)) signals.push("correction");
  if (/\bpool\b/i.test(lower)) signals.push("pool");
  if (/\bno\s+pool\b/i.test(lower)) signals.push("no_pool");
  if (/\bbeach\b/i.test(lower)) signals.push("beach");
  if (/\bfederal\b/i.test(lower)) signals.push("federal");
  if (/\bold\s+pompano\b/i.test(lower)) signals.push("old_pompano");
  if (isFollowupRequestMessage(text)) signals.push("followup");
  return [...new Set(signals)];
}

function classifyKind(
  text: string,
  patch: BuyerPreferenceExtractionPatch,
  current: BuyerPreferenceProfile | undefined,
): BuyerSearchCommandKind {
  if (isFollowupRequestMessage(text)) return "followup_request";
  if (detectShowMeAllPropertyTypeRelaxation(text)) return "broaden_search";
  if (detectTransactionPivot(text, patch, current)) return "transaction_pivot";
  if (isFullReplacementSearch(text, patch, current)) return "new_search";
  if (isCorrectionMessage(text)) return "correction";
  if (isNarrowSearch(text, patch, current)) return "narrow_search";
  if (!profileHasCriteria(current) && patchFieldCount(patch) > 0) return "new_search";
  return "refine_search";
}

function buildExplanation(kind: BuyerSearchCommandKind, signals: string[]): string {
  const tag = signals.length ? signals.join(", ") : "criteria update";
  switch (kind) {
    case "followup_request":
      return "Follow-up request — reuse existing search profile, show more matches.";
    case "new_search":
      return `New search (replacement) — ${tag}. Unmentioned hard gates cleared.`;
    case "broaden_search":
      return `Broaden search (relax property types): ${tag}.`;
    case "narrow_search":
      return `Narrow search (stricter filters): ${tag}.`;
    case "correction":
      return `Correction: ${tag}.`;
    case "transaction_pivot":
      return `Transaction pivot (buy ↔ rent): ${tag}.`;
    default:
      return `Refine search: ${tag}.`;
  }
}

const CHEAPER_BUDGET_RE = /\b(too expensive|cheaper|lower budget|less expensive)\b/i;

function lockedFieldsFromPatch(
  patch: BuyerPreferenceExtractionPatch,
  kind: BuyerSearchCommandKind,
  text?: string,
): (keyof BuyerPreferenceExtractionPatch)[] {
  if (kind === "followup_request") return [];
  const keys = Object.keys(patch) as (keyof BuyerPreferenceExtractionPatch)[];
  if (kind === "correction") {
    return keys.filter((k) => k === "bedsMin" || k === "bedsMax" || k === "bathsMin");
  }
  if (kind === "refine_search" && text && CHEAPER_BUDGET_RE.test(text)) {
    return keys.filter((k) => k !== "targetAreas" && k !== "propertyTypes");
  }
  return keys;
}

function replaceArrayFieldsForCommand(
  text: string,
  kind: BuyerSearchCommandKind,
  patch: BuyerPreferenceExtractionPatch,
): PreferenceArrayReplaceKey[] {
  const detected = detectPreferenceArrayReplacements(text);
  if (kind === "new_search") {
    if ((patch.targetAreas?.value?.length ?? 0) > 0 && !detected.includes("targetAreas")) {
      detected.push("targetAreas");
    }
    if (messageClearsAreaFilters(text) && !detected.includes("targetAreas")) {
      detected.push("targetAreas");
    }
    if (
      ((patch.propertyTypes?.value?.length ?? 0) > 0 || hasExplicitPropertyTypeConstraint(text)) &&
      !detected.includes("propertyTypes")
    ) {
      detected.push("propertyTypes");
    }
  }
  if (kind === "broaden_search" || kind === "narrow_search") {
    if (!detected.includes("propertyTypes")) detected.push("propertyTypes");
  }
  if (kind === "transaction_pivot") {
    if (!detected.includes("propertyTypes") && (patch.propertyTypes?.value?.length ?? 0) > 0) {
      detected.push("propertyTypes");
    }
    if (messageClearsAreaFilters(text) && !detected.includes("targetAreas")) {
      detected.push("targetAreas");
    }
  }
  return [...new Set(detected)];
}

/**
 * Parse inbound buyer inventory message into a structured search command.
 */
export function parseBuyerSearchCommand(
  inboundText: string,
  currentProfile?: BuyerPreferenceProfile,
): BuyerSearchCommand {
  const text = (inboundText || "").trim();

  if (isFollowupRequestMessage(text)) {
    return {
      kind: "followup_request",
      signals: collectSignals(text, {}),
      patch: {},
      replaceArrayFields: [],
      lockedFields: [],
      skipProfileUpdate: true,
      explanation: buildExplanation("followup_request", ["followup"]),
    };
  }

  const patch = hasInventoryPreferenceSignals(text) ? heuristicPatchFromInboundText(text) : {};
  const signals = collectSignals(text, patch);
  const kind = classifyKind(text, patch, currentProfile);
  const buyToRentPivot = isBuyToRentPivotReplacement(text, patch, currentProfile);
  const rentToBuyPivot = isRentToBuyPivotReplacement(text, patch, currentProfile);
  const fullReplacement =
    isFullReplacementSearch(text, patch, currentProfile) || buyToRentPivot || rentToBuyPivot;
  const replaceArrayFields = replaceArrayFieldsForCommand(text, kind, patch);
  const lockedFields = lockedFieldsFromPatch(patch, kind, text);

  return {
    kind,
    signals,
    patch,
    replaceArrayFields,
    lockedFields,
    skipProfileUpdate: false,
    clearUnmentionedHardGates: fullReplacement,
    explanation: buildExplanation(kind, signals),
  };
}

/**
 * Apply command patch over LLM extraction — locked fields always win.
 */
export function applyBuyerSearchCommandToPatch(
  llmPatch: BuyerPreferenceExtractionPatch,
  command: BuyerSearchCommand,
): void {
  if (command.skipProfileUpdate) return;

  for (const key of command.lockedFields) {
    const value = command.patch[key];
    if (value !== undefined) {
      (llmPatch as Record<string, unknown>)[key] = value;
    } else {
      delete (llmPatch as Record<string, unknown>)[key];
    }
  }

  if (command.clearUnmentionedHardGates) {
    stripStaleHardGatesFromPatch(llmPatch, command.patch);
  }

  if (command.patch.priceMax && !command.patch.priceMin) {
    delete llmPatch.priceMin;
  }
}

/** @deprecated Use parseBuyerSearchCommand + applyBuyerSearchCommandToPatch */
export function applyInboundSearchCommandOverrides(
  patch: BuyerPreferenceExtractionPatch,
  inboundText: string,
  currentProfile?: BuyerPreferenceProfile,
): BuyerSearchCommand {
  const command = parseBuyerSearchCommand(inboundText, currentProfile);
  applyBuyerSearchCommandToPatch(patch, command);
  return command;
}
