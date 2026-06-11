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

/** HIGH tier — inventory/showing CTA, never broaden/widen qualification. */
function pickHighTierMatchQuestion(profile: BuyerPreferenceProfile): string {
  const areas = fieldActive(profile.targetAreas) ? profile.targetAreas!.value || [] : [];
  const areaHint = areas[0] ? String(areas[0]).trim() : "";
  if (areaHint) {
    return `A few homes in ${areaHint} look like a strong fit — want me to send the best matches?`;
  }
  return "I found several homes that match what you're looking for. Would you like me to send the top options?";
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
      return `Should I keep the search at ${budget} with ${bedsBaths} minimum, or widen it a bit?`;
    }
    if (budget) {
      return `Should I keep you around ${budget}, or open the range a little?`;
    }
    if (bedsBaths) {
      return `Should I keep the ${bedsBaths} minimum, or widen beds/baths a bit?`;
    }
  }

  const priority: Array<{ key: string; question: string }> = [
    { key: "buy_rent", question: "Are you buying or renting?" },
    { key: "budget", question: "What price range are you trying to stay in?" },
    { key: "area", question: "Which city or neighborhood should I focus on?" },
    { key: "property_type", question: "What type of home are you after — house, condo, or townhouse?" },
    { key: "beds_baths", question: "How many beds and baths do you need at minimum?" },
    { key: "timeline", question: "When are you hoping to move?" },
    { key: "financing", question: "Are you pre-approved, paying cash, or still working on financing?" },
  ];

  for (const item of priority) {
    if (missing.includes(item.key)) return item.question;
  }

  return "What matters most right now — location, size, or specific features?";
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

  const useConfirmQuestion = confirmPriorFields && level === "medium";
  const suggestedQuestion =
    level === "high"
      ? pickHighTierMatchQuestion(profile)
      : pickSuggestedQuestion(profile, missing, useConfirmQuestion);

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
      ? "QUALIFICATION TIER: LOW — Do NOT claim matches or say you found homes. Ask exactly ONE question from suggestedQuestion. Sound like a local agent, not a bot."
      : ctx.level === "medium"
        ? "QUALIFICATION TIER: MEDIUM — Briefly acknowledge what you know in plain language. Ask exactly ONE follow-up from suggestedQuestion. Do NOT claim an exact match count or say you are compiling options."
        : "QUALIFICATION TIER: HIGH — Core search criteria are set. Transition to inventory/showing behavior: offer to send the best matches or set up a showing. Do NOT ask to loosen or expand the search. No exact counts. Never sound like a virtual assistant.";

  const actionLine =
    ctx.level === "high"
      ? `- Suggested reply direction (inventory/showing CTA — do NOT loosen criteria): "${ctx.suggestedQuestion}"`
      : `- Suggested next question (ask ONLY this one): "${ctx.suggestedQuestion}"`;

  return `Buyer qualification assessment:
- Tier: ${ctx.level.toUpperCase()}
- Known criteria: ${knownLine}
- Priority gap: ${ctx.missing.slice(0, 3).join(", ") || "none"}
${actionLine}
${ctx.confirmPriorFields && ctx.level === "medium" ? "- Prior budget/beds/baths on file — confirm keep vs widen; do not re-ask from scratch." : ""}
${tierGuide}`;
}

/** Light post-generation cleanup for robotic inventory phrases. */
export function sanitizeRoboticBuyerReply(text: string): string {
  let out = text.trim();
  if (!out) return out;

  const replacements: Array<[RegExp, string]> = [
    [/\bI(?:'ve| have) found \d+ propert(?:y|ies)\b/gi, "A few homes look like a strong fit"],
    [/\bI found \d+ propert(?:y|ies)\b/gi, "A few homes look like a strong fit"],
    [/\bI(?:'ll| will) compile(?: a selection)?(?: of homes)?\b/gi, "I've got a few good options"],
    [/\bcompile(?: a selection)?(?: of homes)?\b/gi, "a few good options"],
    [/\bI(?:'ll| will) gather(?: a)? options\b/gi, "Let me send the best matches"],
    [/\bgather(?: a)? options\b/gi, "send the best matches"],
    [/\b(?:and )?send (?:the )?options shortly\b/gi, "let me send the best matches"],
    [/\bI(?:'ll| will) send (?:the )?options shortly\b/gi, "Let me send the best matches"],
    [/\bfor your convenience\b/gi, ""],
    [/\ba selection of homes\b/gi, "a few good homes"],
    [/\bselection of (?:homes|properties|listings)\b/gi, "a few good options"],
    [/\b(?:I(?:'ll| will)|let me) check(?: our listings)?\b/gi, ""],
    [/\blet me check(?: our listings)?\b/gi, ""],
    [/\blet me verify(?: what we have)?\b/gi, ""],
    [/\bI(?:'ll| will) get back to you shortly\b/gi, "I'll follow up with the best fits"],
    [/\b(?:I(?:'ll| will)|we(?:'ll| will)) follow up shortly\b/gi, "I'll follow up with the best fits"],
    [/\bwaiting for approval\b/gi, ""],
    [/\bI(?:'m| am) waiting for approval\b/gi, ""],
    [/\bI(?:'ll| will) check our listings\b/gi, ""],
    [/\bI searched our listings\b/gi, ""],
    [/\bsearch(?:ing)? (?:for|our) listings\b/gi, "narrowing this down"],
    [/\bvirtual assistant\b/gi, ""],
    [/\bI(?:'ll| will) review(?: this)? at your convenience\b/gi, "Happy to walk you through the best fits"],
    [/\bshortly\b/gi, ""],
  ];

  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }

  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^\s*[,–—-]\s*/g, "")
    .replace(/\s*[,–—-]\s*$/g, "")
    .trim();
}

export const ROBOTIC_PHRASE_PATTERNS = [
  /\blet me check\b/i,
  /\blet me verify\b/i,
  /\bget back to you\b/i,
  /\bwaiting for approval\b/i,
  /\bI found \d+ propert/i,
  /\bcheck our listings\b/i,
  /\bsearched our listings\b/i,
  /\bcompile(?: a selection)?\b/i,
  /\bgather options\b/i,
  /\bfor your convenience\b/i,
  /\bselection of homes\b/i,
  /\bsend (?:the )?options shortly\b/i,
  /\bvirtual assistant\b/i,
] as const;

export function containsRoboticPhrase(text: string): boolean {
  return ROBOTIC_PHRASE_PATTERNS.some((p) => p.test(text));
}
