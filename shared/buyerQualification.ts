/**
 * Buyer qualification completeness — drives AI reply tiering (Phase 2B/2C).
 */
import type { BuyerPreferenceProfile } from "./buyerPreferenceSchema";
import { buildBuyerPreferenceChips } from "./buyerPreferenceDisplay";
import { resolveMatchingBudgetBounds } from "./buyerPreferenceBudget";

export type QualificationLevel = "low" | "medium" | "high";

export type BuyerQualificationContext = {
  level: QualificationLevel;
  score: number;
  known: string[];
  missing: string[];
  suggestedQuestion: string;
  confirmPriorFields: boolean;
  criteriaComplete: boolean;
  /** Exit qualification — present inventory (matches exist or criteria fully set). */
  inventoryMode: boolean;
  hasBuyRentIntent: boolean;
  hasBudget: boolean;
  hasArea: boolean;
  hasPropertyType: boolean;
  hasPool: boolean;
  mayPresentMatches: boolean;
  matchCount: number;
};

export type BuyerQualificationInput = {
  profile: BuyerPreferenceProfile;
  buyRentIntent?: string | null;
  leadType?: string | null;
  /** Latest inbound line — used for buy/show intent. */
  inboundText?: string | null;
  /** Persisted inventory match count — unlocks inventory mode when > 0. */
  matchCount?: number;
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

/** Parse minimum sq ft from must-haves (excludes "up to" / max tokens). */
export function parseSqftMinFromProfile(profile: BuyerPreferenceProfile): number | null {
  const sources: string[] = [];
  if (fieldActive(profile.mustHaves, 0.45)) {
    sources.push(...(profile.mustHaves!.value || []).map(String));
  }
  for (const raw of sources) {
    if (/^sqft_max:/i.test(raw) || /\bup\s+to\b/i.test(raw)) continue;
    const m = raw.match(/(?:at least|minimum|min(?:imum)?)\s+(\d{1,3}(?:,\d{3})+|\d+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Parse maximum sq ft — "up to 2000 sqft" means exclude listings ABOVE this size. */
export function parseSqftMaxFromProfile(profile: BuyerPreferenceProfile): number | null {
  const sources: string[] = [];
  if (fieldActive(profile.mustHaves, 0.45)) {
    sources.push(...(profile.mustHaves!.value || []).map(String));
  }
  for (const raw of sources) {
    const token = raw.match(/^sqft_max:(\d{1,3}(?:,\d{3})+|\d+)$/i);
    if (token) {
      const n = parseInt(token[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const upTo = raw.match(/\bup\s+to\s+(\d{1,3}(?:,\d{3})+|\d+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)?/i);
    if (upTo) {
      const n = parseInt(upTo[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function resolveBuyRentIntent(input: BuyerQualificationInput): boolean {
  const profileIntent = input.profile.transactionIntent;
  if (fieldActive(profileIntent) && (profileIntent!.value === "rent" || profileIntent!.value === "buy")) {
    return true;
  }
  const lt = (input.leadType || "").toLowerCase();
  if (lt === "buyer" || lt === "renter" || lt === "tenant") return true;
  const inbound = (input.inboundText || "").toLowerCase();
  if (/\b(for\s+rent|rental|lease|renting)\b/.test(inbound)) return true;
  if (/\bshow me\b/.test(inbound) || /\blooking for\b/.test(inbound)) return true;
  const intent = (input.buyRentIntent || "").toLowerCase();
  if (!intent) return false;
  return (
    /\bbuy(?:er|ing)?\b/.test(intent) ||
    /\brent(?:er|ing|al)?\b/.test(intent) ||
    /\binvest/.test(intent)
  );
}

function isRentSearchProfile(profile: BuyerPreferenceProfile): boolean {
  return fieldActive(profile.transactionIntent) && profile.transactionIntent!.value === "rent";
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
  const { priceMin: min, priceMax: max } = resolveMatchingBudgetBounds(profile);
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

/** Inventory/showing CTA — never broaden/widen/reconfirm known criteria. */
function pickInventoryModeReply(profile: BuyerPreferenceProfile, matchCount: number): string {
  const areas = fieldActive(profile.targetAreas) ? profile.targetAreas!.value || [] : [];
  const areaHint = areas[0] ? String(areas[0]).trim() : "";
  if (matchCount > 0 && areaHint) {
    return `A few homes in ${areaHint} look like a strong fit — want me to send the best matches?`;
  }
  if (matchCount > 0) {
    return "I found several homes that match those criteria. Would you like me to send the top options?";
  }
  if (areaHint) {
    return `I've got enough to start — want me to pull the best matches in ${areaHint}?`;
  }
  return "I've got enough to start narrowing this down — want me to send the top options?";
}

function pickGapQuestion(missing: string[]): string {
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

/** Core search fields the agent needs before presenting inventory. */
function isCriteriaComplete(input: {
  hasBuyRentIntent: boolean;
  hasArea: boolean;
  hasBudget: boolean;
  hasBeds: boolean;
  hasBaths: boolean;
  hasPropertyType: boolean;
  hasPool: boolean;
}): boolean {
  return (
    input.hasBuyRentIntent &&
    input.hasArea &&
    input.hasBudget &&
    input.hasBeds &&
    input.hasBaths &&
    input.hasPropertyType &&
    input.hasPool
  );
}

export function assessBuyerQualification(input: BuyerQualificationInput): BuyerQualificationContext {
  const { profile } = input;
  const rentSearch = isRentSearchProfile(profile);
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
  const hasPool = fieldActive(profile.pool) && profile.pool!.value === true;
  const hasTimeline = fieldActive(profile.timeline);
  const hasFinancing = fieldActive(profile.financingStatus);
  const strongMustHave = hasStrongMustHave(profile);
  const sqftMin = parseSqftMinFromProfile(profile);
  const matchCount = Math.max(0, input.matchCount ?? 0);

  const missing: string[] = [];
  if (!hasBuyRentIntent) missing.push("buy_rent");
  if (!hasBudget) missing.push("budget");
  if (!hasArea) missing.push("area");
  if (!hasPropertyType) missing.push("property_type");
  if (!hasBeds) missing.push("beds");
  if (!hasBaths) missing.push("baths");
  if (!rentSearch && !hasPool && !strongMustHave) missing.push("pool");
  if (!rentSearch && !hasTimeline) missing.push("timeline");
  if (!rentSearch && !hasFinancing) missing.push("financing");
  if (!rentSearch && sqftMin == null) missing.push("sqft");

  const known = buildKnownLabels(profile);
  const confirmPriorFields = hasBudget && hasBedsBaths;

  const criteriaComplete = rentSearch
    ? hasBuyRentIntent && hasArea && hasBudget && hasBeds && hasBaths && hasPropertyType
    : isCriteriaComplete({
        hasBuyRentIntent,
        hasArea,
        hasBudget,
        hasBeds,
        hasBaths,
        hasPropertyType,
        hasPool: hasPool || strongMustHave,
      });

  const majorCount = [hasBuyRentIntent, hasBudget, hasArea, hasPropertyType].filter(Boolean).length;
  const inventoryReady =
    hasBuyRentIntent &&
    hasArea &&
    hasBudget &&
    hasBeds &&
    hasBaths &&
    (rentSearch || hasPropertyType || hasPool || strongMustHave);

  const inventoryMode = criteriaComplete || (inventoryReady && matchCount > 0);

  let level: QualificationLevel;
  if (inventoryMode) {
    level = "high";
  } else if (!hasArea && !hasBudget && !hasBedsBaths) {
    level = "low";
  } else if (inventoryReady || (hasArea && strongMustHave) || majorCount >= 2) {
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
      (sqftMin != null ? 4 : 0) +
      (matchCount > 0 ? 12 : 0),
  );

  const suggestedQuestion = inventoryMode
    ? pickInventoryModeReply(profile, matchCount)
    : level === "high"
      ? pickInventoryModeReply(profile, matchCount)
      : pickGapQuestion(missing);

  return {
    level,
    score,
    known,
    missing,
    suggestedQuestion,
    confirmPriorFields,
    criteriaComplete,
    inventoryMode,
    hasBuyRentIntent,
    hasBudget,
    hasArea,
    hasPropertyType,
    hasPool: hasPool || strongMustHave,
    mayPresentMatches: level === "high" || inventoryMode,
    matchCount,
  };
}

export function formatQualificationContextForAi(ctx: BuyerQualificationContext): string {
  const knownLine =
    ctx.known.length > 0 ? ctx.known.join(", ") : "not yet captured";

  if (ctx.inventoryMode) {
    return `Buyer qualification assessment:
- Tier: HIGH — INVENTORY MODE (exit qualification; do not ask qualifying questions)
- Criteria complete: yes
- Inventory matches: ${ctx.matchCount > 0 ? `${ctx.matchCount} strong match(es) on file` : "criteria set — present options"}
- Known criteria (do NOT reconfirm): ${knownLine}
- Reply direction: "${ctx.suggestedQuestion}"
INVENTORY MODE RULES:
- Behave like a buyer's agent ready to present homes — offer top matches, property details, a shortlist, or a showing
- FORBIDDEN: widen/broaden search, reconfirm budget, reconfirm beds/baths, ask for criteria already listed above
- Allowed: "A few homes look like a strong fit", "I found several homes that match", offer to send top options`;
  }

  const tierGuide =
    ctx.level === "low"
      ? "QUALIFICATION TIER: LOW — Do NOT claim matches or say you found homes. Ask exactly ONE question from suggestedQuestion. Sound like a local agent, not a bot."
      : ctx.level === "medium"
        ? "QUALIFICATION TIER: MEDIUM — Briefly acknowledge what you know in plain language. Ask exactly ONE gap question from suggestedQuestion. Do NOT widen/broaden the search. Do NOT reconfirm budget or beds/baths already known. Do NOT claim an exact match count."
        : "QUALIFICATION TIER: HIGH — Transition to inventory/showing. Offer to send best matches or set up a showing. Do NOT widen/broaden or reconfirm known criteria.";

  const actionLine =
    ctx.level === "high"
      ? `- Suggested reply direction: "${ctx.suggestedQuestion}"`
      : `- Suggested next question (ask ONLY this one): "${ctx.suggestedQuestion}"`;

  return `Buyer qualification assessment:
- Tier: ${ctx.level.toUpperCase()}
- Criteria complete: ${ctx.criteriaComplete ? "yes" : "no"}
- Known criteria: ${knownLine}
- Priority gap: ${ctx.missing.slice(0, 3).join(", ") || "none"}
${actionLine}
${tierGuide}`;
}

/** Light post-generation cleanup for robotic inventory phrases. */
export function sanitizeRoboticBuyerReply(text: string): string {
  let out = text.trim();
  if (!out) return out;

  if (containsWidenQualificationPhrase(out)) {
    return "A few homes look like a strong fit — want me to send the best matches?";
  }

  const replacements: Array<[RegExp, string]> = [
    [
      /\bshould i keep (?:the search )?(?:at |around )?[^.?!]*(?:widen|broaden|open the range)[^.?!]*\??/gi,
      "A few homes look like a strong fit — want me to send the best matches?",
    ],
    [
      /\b(?:or )?(?:would you like to )?(?:widen|broaden)(?: it| the search)?(?: a bit)?\??/gi,
      "want me to send the best matches?",
    ],
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

export const WIDEN_QUALIFICATION_PATTERNS = [
  /\bwiden it\b/i,
  /\bwould you like to widen\b/i,
  /\bbroaden\b/i,
  /\bkeep the search at\b/i,
  /\bopen the range\b/i,
] as const;

export function containsWidenQualificationPhrase(text: string): boolean {
  return WIDEN_QUALIFICATION_PATTERNS.some((p) => p.test(text));
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
