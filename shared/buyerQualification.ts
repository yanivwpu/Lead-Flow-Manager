/**
 * Buyer qualification completeness — drives AI reply tiering (Phase 2B/2C).
 */
import type { BuyerPreferenceProfile } from "./buyerPreferenceSchema";
import { buildBuyerPreferenceChips } from "./buyerPreferenceDisplay";

export type QualificationLevel = "low" | "medium" | "high";

export type BuyerQualificationContext = {
  level: QualificationLevel;
  score: number;
  known: string[];
  missing: string[];
  suggestedQuestion: string;
  confirmPriorFields: boolean;
  hasBuyRentIntent: boolean;
  hasBudget: boolean;
  hasArea: boolean;
  hasPropertyType: boolean;
  mayPresentMatches: boolean;
};

export type BuyerQualificationInput = {
  profile: BuyerPreferenceProfile;
  buyRentIntent?: string | null;
  leadType?: string | null;
};

const MIN_CONFIDENCE = 0.5;

function fieldActive<T>(
  f: { value?: T; confidence?: number } | undefined,
  min = MIN_CONFIDENCE,
): boolean {
  return !!f && typeof f.confidence === "number" && f.confidence >= min && f.value != null;
}

function formatMoneyShort(n: number): string {
  if (n >= 1_000_000) return `$${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

/** Parse minimum sq ft from must-haves or profile text patterns. */
export function parseSqftMinFromProfile(profile: BuyerPreferenceProfile): number | null {
  const sources: string[] = [];
  if (fieldActive(profile.mustHaves, 0.45)) {
    sources.push(...(profile.mustHaves!.value || []).map(String));
  }
  for (const raw of sources) {
    const m = raw.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function resolveBuyRentIntent(input: BuyerQualificationInput): boolean {
  const lt = (input.leadType || "").toLowerCase();
  if (lt === "buyer" || lt === "renter" || lt === "tenant") return true;
  const intent = (input.buyRentIntent || "").toLowerCase();
  if (!intent) return false;
  return (
    /\bbuy(?:er|ing)?\b/.test(intent) ||
    /\brent(?:er|ing|al)?\b/.test(intent) ||
    /\binvest/.test(intent)
  );
}

function hasStrongMustHave(profile: BuyerPreferenceProfile): boolean {
  if (fieldActive(profile.pool) && profile.pool!.value === true) return true;
  if (fieldActive(profile.waterfront) && profile.waterfront!.value === true) return true;
  const mh = fieldActive(profile.mustHaves, 0.45) ? profile.mustHaves!.value || [] : [];
  return mh.some((item) => /\b(pool|waterfront|must have)\b/i.test(String(item)));
}

function buildKnownLabels(profile: BuyerPreferenceProfile): string[] {
  return buildBuyerPreferenceChips(profile).map((c) => {
    if (c.id === "propertyTypes") return c.value.toLowerCase().includes("house") ? "single-family home" : c.value;
    return c.value;
  });
}

function formatBudgetLabel(profile: BuyerPreferenceProfile): string | null {
  const min = fieldActive(profile.priceMin) ? profile.priceMin!.value : null;
  const max = fieldActive(profile.priceMax) ? profile.priceMax!.value : null;
  if (max != null && min != null) return `${formatMoneyShort(min)}–${formatMoneyShort(max)}`;
  if (max != null) return `up to ${formatMoneyShort(max)}`;
  if (min != null) return `from ${formatMoneyShort(min)}`;
  return null;
}

function formatBedsBathsLabel(profile: BuyerPreferenceProfile): string | null {
  const parts: string[] = [];
  if (fieldActive(profile.bedsMin) && profile.bedsMin!.value > 0) {
    parts.push(`${profile.bedsMin!.value}-bed`);
  }
  if (fieldActive(profile.bathsMin) && profile.bathsMin!.value > 0) {
    parts.push(`${profile.bathsMin!.value}-bath`);
  }
  return parts.length > 0 ? parts.join("/") : null;
}

function pickSuggestedQuestion(
  profile: BuyerPreferenceProfile,
  missing: string[],
  confirmPriorFields: boolean,
): string {
  if (confirmPriorFields) {
    const budget = formatBudgetLabel(profile);
    const bedsBaths = formatBedsBathsLabel(profile);
    if (budget && bedsBaths) {
      return `Are we keeping the same budget (${budget}) and ${bedsBaths} minimum, or should I broaden the search?`;
    }
    if (budget) {
      return `Are we keeping the same budget range (${budget}), or should I broaden it?`;
    }
    if (bedsBaths) {
      return `Are we keeping the same ${bedsBaths} minimum, or should I broaden the search?`;
    }
  }

  const priority: Array<{ key: string; question: string }> = [
    { key: "buy_rent", question: "Are you looking to buy or rent?" },
    { key: "budget", question: "What budget range should I stay within?" },
    { key: "area", question: "Which city or area should I focus on?" },
    { key: "property_type", question: "What type of home are you looking for — house, condo, or townhouse?" },
    { key: "beds_baths", question: "How many bedrooms and bathrooms do you need at minimum?" },
    { key: "timeline", question: "What kind of timeline are you working with?" },
    { key: "financing", question: "Are you pre-approved, paying cash, or still exploring financing?" },
  ];

  for (const item of priority) {
    if (missing.includes(item.key)) return item.question;
  }

  return "What matters most to you in this search — location, size, or specific features?";
}

export function assessBuyerQualification(input: BuyerQualificationInput): BuyerQualificationContext {
  const { profile } = input;
  const hasBuyRentIntent = resolveBuyRentIntent(input);
  const hasBudget =
    fieldActive(profile.priceMin) || fieldActive(profile.priceMax);
  const hasArea =
    fieldActive(profile.targetAreas) && (profile.targetAreas!.value?.length ?? 0) > 0;
  const hasPropertyType =
    fieldActive(profile.propertyTypes) && (profile.propertyTypes!.value?.length ?? 0) > 0;
  const hasBeds = fieldActive(profile.bedsMin) && profile.bedsMin!.value > 0;
  const hasBaths = fieldActive(profile.bathsMin) && profile.bathsMin!.value > 0;
  const hasBedsBaths = hasBeds || hasBaths;
  const hasTimeline = fieldActive(profile.timeline);
  const hasFinancing = fieldActive(profile.financingStatus);
  const strongMustHave = hasStrongMustHave(profile);
  const sqftMin = parseSqftMinFromProfile(profile);

  const missing: string[] = [];
  if (!hasBuyRentIntent) missing.push("buy_rent");
  if (!hasBudget) missing.push("budget");
  if (!hasArea) missing.push("area");
  if (!hasPropertyType) missing.push("property_type");
  if (!hasBedsBaths) missing.push("beds_baths");
  if (!hasTimeline) missing.push("timeline");
  if (!hasFinancing) missing.push("financing");
  if (sqftMin == null) missing.push("sqft");

  const known = buildKnownLabels(profile);
  const confirmPriorFields = hasBudget && hasBedsBaths;

  const majorCount = [hasBuyRentIntent, hasBudget, hasArea, hasPropertyType].filter(Boolean).length;
  const searchReady = hasArea && hasPropertyType && (hasBudget || strongMustHave);

  let level: QualificationLevel;
  if (!hasArea && !hasPropertyType) {
    level = "low";
  } else if (
    searchReady &&
    hasBuyRentIntent &&
    hasBudget &&
    hasBedsBaths &&
    (hasTimeline || hasFinancing || (strongMustHave && hasArea && hasPropertyType))
  ) {
    level = "high";
  } else if (searchReady || (hasArea && strongMustHave) || majorCount >= 2) {
    level = "medium";
  } else {
    level = "low";
  }

  const score = Math.min(
    100,
    majorCount * 18 +
      (hasBedsBaths ? 8 : 0) +
      (strongMustHave ? 10 : 0) +
      (hasTimeline ? 6 : 0) +
      (hasFinancing ? 6 : 0) +
      (sqftMin != null ? 4 : 0),
  );

  const useConfirmQuestion =
    confirmPriorFields && (level === "medium" || (level === "high" && !hasTimeline && !hasFinancing));
  const suggestedQuestion = pickSuggestedQuestion(profile, missing, useConfirmQuestion);

  return {
    level,
    score,
    known,
    missing,
    suggestedQuestion,
    confirmPriorFields,
    hasBuyRentIntent,
    hasBudget,
    hasArea,
    hasPropertyType,
    mayPresentMatches: level === "high",
  };
}

export function formatQualificationContextForAi(ctx: BuyerQualificationContext): string {
  const knownLine =
    ctx.known.length > 0 ? ctx.known.join(", ") : "not yet captured";
  const tierGuide =
    ctx.level === "low"
      ? "QUALIFICATION TIER: LOW — Do NOT claim matches or say you found properties. Ask exactly ONE question from suggestedQuestion."
      : ctx.level === "medium"
        ? "QUALIFICATION TIER: MEDIUM — Acknowledge known criteria briefly. Ask exactly ONE confirmation or gap question. Do NOT claim an exact match count."
        : "QUALIFICATION TIER: HIGH — You may mention that a few homes stand out. Offer to send best matches or schedule a review. No exact counts.";

  return `Buyer qualification assessment:
- Tier: ${ctx.level.toUpperCase()}
- Known criteria: ${knownLine}
- Priority gap: ${ctx.missing.slice(0, 3).join(", ") || "none"}
- Suggested next question (ask ONLY this one): "${ctx.suggestedQuestion}"
${ctx.confirmPriorFields ? "- Prior budget/beds/baths on file — confirm whether to keep or broaden, do not re-ask from scratch." : ""}
${tierGuide}`;
}

/** Light post-generation cleanup for robotic inventory phrases. */
export function sanitizeRoboticBuyerReply(text: string): string {
  let out = text.trim();
  if (!out) return out;

  const replacements: Array<[RegExp, string]> = [
    [/\bI(?:'ve| have) found \d+ propert(?:y|ies)\b/gi, "A few homes stand out"],
    [/\bI found \d+ propert(?:y|ies)\b/gi, "A few homes stand out"],
    [/\blet me check(?: our listings)?\b/gi, "I can narrow this down"],
    [/\blet me verify(?: what we have)?\b/gi, "I can narrow this down"],
    [/\bI(?:'ll| will) get back to you shortly\b/gi, "I can follow up with options"],
    [/\bwaiting for approval\b/gi, ""],
    [/\bI(?:'m| am) waiting for approval\b/gi, ""],
    [/\bI(?:'ll| will) check our listings\b/gi, "I can narrow this down"],
    [/\bI searched our listings\b/gi, ""],
    [/\bsearch(?:ing)? (?:for|our) listings\b/gi, "narrow this down"],
  ];

  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }

  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

export const ROBOTIC_PHRASE_PATTERNS = [
  /\blet me check\b/i,
  /\blet me verify\b/i,
  /\bget back to you\b/i,
  /\bwaiting for approval\b/i,
  /\bI found \d+ propert/i,
  /\bcheck our listings\b/i,
  /\bsearched our listings\b/i,
] as const;

export function containsRoboticPhrase(text: string): boolean {
  return ROBOTIC_PHRASE_PATTERNS.some((p) => p.test(text));
}
