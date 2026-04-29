import type { ConversationMessage } from "./conversationIntelligence";

export type LeadBucket = "hot" | "warm" | "cold" | "unqualified";

export type BusinessQualifyingQuestion = {
  key?: string;
  label?: string;
  question: string;
  required?: boolean;
};

export type BusinessKnowledgeForScoring = {
  industry?: string;
  salesGoals?: string;
  servicesProducts?: string;
  qualifyingQuestions?: BusinessQualifyingQuestion[];
};

export type LeadScoreResult = {
  score: number; // 0–100
  bucket: LeadBucket;
  reasons: string[];
  missingRequired: string[];
  negativeSignals: string[];
  confidence: number; // 0–1
};

type ScoreOptions = {
  /** Force a profile; otherwise inferred from businessKnowledge.industry */
  isRealEstate?: boolean;
};

const URGENCY_WORDS = [
  "asap",
  "as soon as possible",
  "immediately",
  "urgent",
  "urgently",
  "right away",
  "right now",
  "today",
  "this week",
  "tomorrow",
];

const NEGATIVE_PATTERNS: Array<{ key: string; re: RegExp; reason: string; hardDisqualify?: boolean }> = [
  { key: "stop", re: /\b(stop|unsubscribe|do not contact|dont contact|remove me)\b/i, reason: "Asked to stop / unsubscribe", hardDisqualify: true },
  { key: "wrong_number", re: /\bwrong number\b/i, reason: "Wrong number", hardDisqualify: true },
  { key: "not_interested", re: /\bnot interested|no longer interested|not looking\b/i, reason: "Not interested", hardDisqualify: true },
  { key: "spam", re: /\bspam\b/i, reason: "Spam / irrelevant", hardDisqualify: true },
];

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalize(text: string): string {
  return (text || "").toLowerCase().replace(/['"]/g, "").replace(/\s+/g, " ").trim();
}

function inboundText(messages: ConversationMessage[]): string {
  return normalize(messages.filter((m) => m.direction === "inbound").map((m) => m.content).join(" "));
}

function messageStats(messages: ConversationMessage[]) {
  const inbound = messages.filter((m) => m.direction === "inbound").length;
  const outbound = messages.filter((m) => m.direction === "outbound").length;
  const turns = Math.min(inbound, outbound); // rough back-and-forth proxy
  return { inbound, outbound, turns, total: messages.length };
}

function detectUrgency(inbound: string): boolean {
  return URGENCY_WORDS.some((w) => inbound.includes(w));
}

function detectIntent(inbound: string): Array<"booking" | "pricing" | "quote" | "availability"> {
  const intents: Array<"booking" | "pricing" | "quote" | "availability"> = [];
  if (/\b(book|booking|schedule|appointment|call|demo|meeting)\b/i.test(inbound)) intents.push("booking");
  if (/\b(price|pricing|cost|how much|rate|rates)\b/i.test(inbound)) intents.push("pricing");
  if (/\bquote|estimate\b/i.test(inbound)) intents.push("quote");
  if (/\bavailable|availability|in stock|still available\b/i.test(inbound)) intents.push("availability");
  return intents;
}

// Minimal real-estate-only signals (deterministic, inbound-only)
function extractRealEstateSignals(inbound: string) {
  const hasBudget = /\$\s*[\d,]+(?:\.\d+)?(?:\s*(?:k|m|million|thousand))?/i.test(inbound) || /\b(budget|price range|afford|spend)\b/i.test(inbound);
  const hasTimeline =
    /\b(asap|urgent|immediately|this week|next week|next month|within \d+ (?:day|week|month|year)s?)\b/i.test(inbound) ||
    /\b(in|within|around)\s+\d+\s+(day|week|month|year)s?\b/i.test(inbound);
  const hasFinancing = /\b(pre-?approved|cash|mortgage|loan|financing)\b/i.test(inbound);
  const viewingIntent = /\b(viewing|showing|tour|see (?:the|it)|visit|open house)\b/i.test(inbound);

  const buyer = /\blooking to buy|buying\b/i.test(inbound);
  const seller = /\b(sell|selling|list|listing)\b/i.test(inbound);
  const investor = /\b(invest|investment|roi|cap rate|rental income)\b/i.test(inbound);
  const intent = investor ? "investor" : seller ? "seller" : buyer ? "buyer" : null;

  return { hasBudget, hasTimeline, hasFinancing, viewingIntent, intent };
}

function inferIsRealEstate(businessKnowledge?: BusinessKnowledgeForScoring, options?: ScoreOptions): boolean {
  if (options?.isRealEstate != null) return options.isRealEstate;
  const industry = (businessKnowledge?.industry || "").toLowerCase();
  return (
    industry.includes("real estate") ||
    industry.includes("realestate") ||
    industry.includes("property") ||
    industry.includes("realtor") ||
    industry === "real_estate"
  );
}

function computeQualificationCompleteness(params: {
  inbound: string;
  isRealEstate: boolean;
  realEstateSignals: ReturnType<typeof extractRealEstateSignals> | null;
  qualifyingQuestions?: BusinessQualifyingQuestion[];
}) {
  const { inbound, isRealEstate, qualifyingQuestions, realEstateSignals } = params;
  const raw = Array.isArray(qualifyingQuestions) ? qualifyingQuestions : [];
  const required = raw.filter((q) => q?.question?.trim() && (q.required ?? true));
  if (required.length === 0) return { missingRequired: [] as string[], completedRequiredCount: 0, requiredCount: 0 };

  const answeredKey = (key: string): boolean => {
    const k = normalize(key);
    if (!k) return false;

    // Deterministic key→signal mapping (Phase 1). We only mark "answered" when we have explicit evidence.
    if (isRealEstate && realEstateSignals) {
      if (k.includes("budget")) return realEstateSignals.hasBudget;
      if (k.includes("timeline") || k.includes("move")) return realEstateSignals.hasTimeline;
      if (k.includes("financing") || k.includes("preapproval") || k.includes("pre-approved") || k.includes("loan") || k.includes("mortgage"))
        return realEstateSignals.hasFinancing;
      if (k.includes("view") || k.includes("show") || k.includes("tour")) return realEstateSignals.viewingIntent;
      if (k.includes("intent")) return !!realEstateSignals.intent;
    }

    // Generic keys (non-real-estate): only mark as answered on strong explicit matches.
    if (k.includes("email")) return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(inbound);
    if (k.includes("phone")) return /\b\+?\d[\d\s().-]{7,}\b/i.test(inbound);
    if (k.includes("name")) return /\bmy name is\b/i.test(inbound);
    if (k.includes("budget") || k.includes("price")) return /\$\s*[\d,]+/i.test(inbound) || /\b(budget|price range|afford|spend)\b/i.test(inbound);
    if (k.includes("timeline") || k.includes("when")) return detectUrgency(inbound) || /\b(within|in)\s+\d+\s+(day|week|month|year)s?\b/i.test(inbound);

    return false;
  };

  const missingRequired = required
    .filter((q, i) => {
      const key = q.key || `q_${i}`;
      return !answeredKey(key);
    })
    .map((q, i) => q.label || q.key || `Question ${i + 1}`);

  const completedRequiredCount = required.length - missingRequired.length;
  return { missingRequired, completedRequiredCount, requiredCount: required.length };
}

export function scoreLead(
  messages: ConversationMessage[],
  businessKnowledge?: BusinessKnowledgeForScoring,
  options?: ScoreOptions
): LeadScoreResult {
  const inbound = inboundText(messages);
  const stats = messageStats(messages);
  const isRealEstate = inferIsRealEstate(businessKnowledge, options);
  const reSignals = isRealEstate ? extractRealEstateSignals(inbound) : null;

  // Negative signals
  const negatives = NEGATIVE_PATTERNS.filter((p) => p.re.test(inbound));
  const negativeSignals = negatives.map((n) => n.reason);
  const hardDisqualify = negatives.some((n) => n.hardDisqualify);

  if (hardDisqualify) {
    return {
      score: 0,
      bucket: "unqualified",
      reasons: negativeSignals.slice(0, 3),
      missingRequired: [],
      negativeSignals,
      confidence: 0.9,
    };
  }

  const intents = detectIntent(inbound);
  const urgent = detectUrgency(inbound);

  const { missingRequired, completedRequiredCount, requiredCount } = computeQualificationCompleteness({
    inbound,
    isRealEstate,
    realEstateSignals: reSignals,
    qualifyingQuestions: businessKnowledge?.qualifyingQuestions,
  });

  // ── Score components (Phase 1 deterministic) ─────────────────────────────
  let score = 0;
  const reasons: string[] = [];

  // Engagement (0–20)
  const engagement =
    stats.inbound >= 3 ? 18 :
    stats.inbound === 2 ? 12 :
    stats.inbound === 1 ? 6 :
    0;
  score += engagement;
  if (engagement >= 12) reasons.push("Strong engagement from customer");
  else if (engagement >= 6) reasons.push("Some engagement from customer");

  // Back-and-forth turns (0–10)
  const turnPoints = stats.turns >= 3 ? 10 : stats.turns === 2 ? 7 : stats.turns === 1 ? 4 : 0;
  score += turnPoints;
  if (turnPoints >= 7) reasons.push("Back-and-forth conversation established");

  // Intent clarity (0–20)
  const intentPoints = Math.min(20, intents.length * 7);
  score += intentPoints;
  if (intents.includes("booking")) reasons.push("Asked about booking/scheduling");
  if (intents.includes("quote")) reasons.push("Requested a quote/estimate");
  if (intents.includes("pricing")) reasons.push("Asked about pricing/cost");
  if (intents.includes("availability")) reasons.push("Asked about availability");

  // Urgency (0–10)
  if (urgent) {
    score += 8;
    reasons.push("Time-sensitive / urgent");
  }

  // Qualification completeness (0–30)
  if (requiredCount > 0) {
    const completionRatio = completedRequiredCount / requiredCount;
    const qualPoints = Math.round(30 * completionRatio);
    score += qualPoints;
    if (missingRequired.length === 0) reasons.push("Required qualification captured");
    else reasons.push(`${missingRequired.length} required qualification field${missingRequired.length !== 1 ? "s" : ""} missing`);
  } else if (businessKnowledge?.qualifyingQuestions && businessKnowledge.qualifyingQuestions.length > 0) {
    // No required fields, but configured criteria exists
    score += 8;
    reasons.push("Qualification criteria configured");
  }

  // Real-estate profile (additional deterministic boosts, only when industry explicitly real estate)
  if (isRealEstate && reSignals) {
    let reBoost = 0;
    if (reSignals.viewingIntent) { reBoost += 10; reasons.push("Shows intent to view/tour"); }
    if (reSignals.hasBudget) { reBoost += 6; reasons.push("Budget signal mentioned"); }
    if (reSignals.hasTimeline) { reBoost += 6; reasons.push("Timeline signal mentioned"); }
    if (reSignals.hasFinancing) { reBoost += 6; reasons.push("Financing/pre-approval signal mentioned"); }
    if (reSignals.intent) { reBoost += 4; reasons.push(`Intent: ${reSignals.intent}`); }
    score += Math.min(20, reBoost);
  }

  score = clampScore(score);

  // Buckets
  const bucket: LeadBucket =
    score >= 75 ? "hot" :
    score >= 45 ? "warm" :
    score >= 15 ? "cold" :
    "unqualified";

  // Confidence: based on evidence volume + presence of intent/qualification signals
  const evidenceCount =
    (stats.inbound >= 2 ? 1 : 0) +
    (intents.length > 0 ? 1 : 0) +
    (urgent ? 1 : 0) +
    (requiredCount > 0 && completedRequiredCount > 0 ? 1 : 0) +
    (isRealEstate && reSignals && (reSignals.hasBudget || reSignals.hasTimeline || reSignals.hasFinancing || reSignals.viewingIntent) ? 1 : 0);
  const confidence = clamp01(0.25 + evidenceCount * 0.15 + Math.min(0.2, stats.inbound * 0.03));

  // De-dupe reasons, keep most important first (simple stable order)
  const uniqReasons = Array.from(new Set(reasons)).slice(0, 8);

  return {
    score,
    bucket,
    reasons: uniqReasons,
    missingRequired,
    negativeSignals,
    confidence,
  };
}

