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

/** Core + optional industry layer + UI-friendly detections (stable string ids). */
export type LeadScoringSignals = {
  core: {
    engagementScore: number;
    interestScore: number;
    decisionScore: number;
    urgencyScore: number;
    /** Magnitude subtracted in the final sum (non-negative). */
    negativeScore: number;
  };
  industry: { layer: "real_estate" | "property_management"; bonus: number } | null;
  detected: string[];
  decisionOverride?: boolean;
};

export type LeadScoreResult = {
  score: number; // 0–100
  bucket: LeadBucket;
  reasons: string[];
  /** From business qualifying questions — for UI only; not used in core score. */
  missingRequired: string[];
  negativeSignals: string[];
  confidence: number; // 0–1
  signals: LeadScoringSignals;
};

type ScoreOptions = {
  /** Force a profile; otherwise inferred from businessKnowledge.industry */
  isRealEstate?: boolean;
};

export type StageSignalSummary = {
  isRealEstate: boolean;
  strongEngagement: boolean;
  strongIntent: boolean;
  viewingIntent: boolean;
  intents: Array<"booking" | "pricing" | "quote" | "availability">;
};

// ── Constants ───────────────────────────────────────────────────────────────

/** On 0–~32 scale; at or above → `hot` bucket (score also floored to hot band). */
const DECISION_HOT_THRESHOLD = 20;

const MAX_INDUSTRY_BONUS = 20;
const MAX_PM_BONUS = 16;

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
  "eod",
  "end of day",
];

const HARD_NEGATIVE_PATTERNS: Array<{
  key: string;
  re: RegExp;
  reason: string;
  hardDisqualify: true;
}> = [
  { key: "stop", re: /\b(stop|unsubscribe|do not contact|dont contact|remove me)\b/i, reason: "Asked to stop / unsubscribe", hardDisqualify: true },
  { key: "wrong_number", re: /\bwrong number\b/i, reason: "Wrong number", hardDisqualify: true },
  { key: "not_interested", re: /\bnot interested|no longer interested|not looking\b/i, reason: "Not interested", hardDisqualify: true },
  { key: "spam", re: /\bspam\b/i, reason: "Spam / irrelevant", hardDisqualify: true },
];

const SOFT_NEGATIVE_PATTERNS: Array<{ key: string; re: RegExp; pts: number; id: string }> = [
  { key: "defer", re: /\b(maybe later|not right now|not at this time|circle back)\b/i, pts: 6, id: "negative:defer" },
  { key: "price_objection", re: /\b(too expensive|out of (my )?budget|can'?t afford|cheaper (?:elsewhere|option))\b/i, pts: 7, id: "negative:price" },
  { key: "hesitation", re: /\b(i don'?t know|not sure (?:yet|if)|skeptical|wary)\b/i, pts: 4, id: "negative:hesitate" },
];

type InterestIntent = "booking" | "pricing" | "quote" | "availability";

const DECISION_SIGNALS: Array<{ re: RegExp; pts: number; id: string }> = [
  { re: /\b(let'?s|lets)\s+(sign|close|proceed|do it|move forward)\b/i, pts: 18, id: "decision:commit" },
  { re: /\b(sign|signing)\s+(the\s+)?(contract|papers|agreement|lease)\b/i, pts: 18, id: "decision:sign" },
  { re: /\b(send|forward)\s+(the\s+)?(contract|papers|agreement|invoice|quote)\b/i, pts: 14, id: "decision:send_docs" },
  { re: /\b(put|pay|place|make)\s+(a\s+)?deposit\b/i, pts: 16, id: "decision:deposit" },
  { re: /\b(wire|transfer)\s+(the\s+)?(money|funds|payment)\b/i, pts: 14, id: "decision:wire" },
  { re: /\b(book|schedule|reserve)\b(?!\s+keeping)/i, pts: 12, id: "decision:book" },
  { re: /\b(proceed|move forward)\s+(with|to)\b/i, pts: 12, id: "decision:proceed" },
  { re: /\b(accept|take)\s+(your\s+|the\s+|my\s+)?offer\b/i, pts: 14, id: "decision:offer" },
  { re: /\bready\s+to\s+(buy|pay|sign|close|proceed|move|commit)\b/i, pts: 14, id: "decision:ready" },
  { re: /\b(enroll|register|checkout|purchase|subscribe)\b/i, pts: 10, id: "decision:transact" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

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
  const turns = Math.min(inbound, outbound);
  return { inbound, outbound, turns, total: messages.length };
}

function detectIntent(inbound: string): InterestIntent[] {
  const intents: InterestIntent[] = [];
  if (/\b(book|booking|schedule|appointment|call|demo|meeting|viewing|tour)\b/i.test(inbound)) intents.push("booking");
  if (/\b(price|pricing|cost|how much|rate|rates|fee|fees)\b/i.test(inbound)) intents.push("pricing");
  if (/\bquote|estimate\b/i.test(inbound)) intents.push("quote");
  if (/\bavailable|availability|in stock|still available|open slots?\b/i.test(inbound)) intents.push("availability");
  return intents;
}

function detectQuestionInterest(inbound: string): boolean {
  if (inbound.includes("?")) return true;
  return /\b(how much|how many|what(?:'s| is)|when can|where (?:is|do)|can you|could you|do you (?:have|offer)|is it (?:still )?available)\b/i.test(
    inbound,
  );
}

function computeEngagementScore(stats: ReturnType<typeof messageStats>): { value: number; detected: string[] } {
  const detected: string[] = [];
  const msgPts =
    stats.inbound >= 4 ? 14 : stats.inbound === 3 ? 12 : stats.inbound === 2 ? 8 : stats.inbound === 1 ? 5 : 0;
  if (msgPts >= 12) detected.push("engagement:messages_high");
  else if (msgPts >= 5) detected.push("engagement:messages_some");

  const turnPts = stats.turns >= 3 ? 11 : stats.turns === 2 ? 8 : stats.turns === 1 ? 4 : 0;
  if (turnPts >= 8) detected.push("engagement:back_and_forth");
  else if (turnPts >= 4) detected.push("engagement:dialog_started");

  return { value: Math.min(25, msgPts + turnPts), detected };
}

function computeInterestScore(inbound: string): { value: number; detected: string[] } {
  const intents = detectIntent(inbound);
  const detected: string[] = [];
  let value = Math.min(21, intents.length * 7);
  for (const i of intents) {
    detected.push(`interest:${i}`);
  }
  if (detectQuestionInterest(inbound)) {
    value += 6;
    detected.push("interest:questions");
  }
  return { value: Math.min(24, value), detected };
}

function computeDecisionScore(inbound: string): { value: number; detected: string[] } {
  const detected: string[] = [];
  let sum = 0;
  for (const s of DECISION_SIGNALS) {
    if (s.re.test(inbound)) {
      sum += s.pts;
      if (!detected.includes(s.id)) detected.push(s.id);
    }
  }
  return { value: Math.min(32, sum), detected };
}

function computeUrgencyScore(inbound: string): { value: number; detected: string[] } {
  let hits = 0;
  for (const w of URGENCY_WORDS) {
    if (inbound.includes(w)) hits++;
  }
  if (/\b(asap|today|urgent|immediately|right now)\b/i.test(inbound)) {
    const v = hits >= 2 ? 12 : 9;
    return { value: v, detected: ["urgency:time_sensitive"] };
  }
  if (hits >= 1) return { value: 7, detected: ["urgency:time_sensitive"] };
  return { value: 0, detected: [] };
}

function computeSoftNegativeScore(inbound: string): { value: number; detected: string[] } {
  const detected: string[] = [];
  let sum = 0;
  for (const s of SOFT_NEGATIVE_PATTERNS) {
    if (s.re.test(inbound)) {
      sum += s.pts;
      detected.push(s.id);
    }
  }
  return { value: Math.min(28, sum), detected };
}

function inferPropertyManagement(businessKnowledge?: BusinessKnowledgeForScoring): boolean {
  const i = (businessKnowledge?.industry || "").toLowerCase();
  return i === "property_management" || i.includes("property management") || i.includes("property_management");
}

function inferIsRealEstate(businessKnowledge?: BusinessKnowledgeForScoring, options?: ScoreOptions): boolean {
  if (options?.isRealEstate != null) return options.isRealEstate;
  if (inferPropertyManagement(businessKnowledge)) return false;
  const industry = (businessKnowledge?.industry || "").toLowerCase();
  return (
    industry.includes("real estate") ||
    industry.includes("realestate") ||
    industry.includes("property") ||
    industry.includes("realtor") ||
    industry === "real_estate"
  );
}

/** RE-specific layer: budget, timeline, financing, viewing, role intent. */
function extractRealEstateSignals(inbound: string) {
  const hasBudget =
    /\$\s*[\d,]+(?:\.\d+)?(?:\s*(?:k|m|million|thousand))?/i.test(inbound) ||
    /\b(budget|price range|afford|spend)\b/i.test(inbound);
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

/** Property management / ops — complaints and urgent maintenance. */
function extractPropertyManagementSignals(inbound: string) {
  const complaint =
    /\b(complaint|unacceptable|disgusting|terrible|awful|not working|broken|leak|mold|noise|issue|problem with)\b/i.test(
      inbound,
    );
  const maintenanceUrgent =
    /\b(emergency|flooding|no heat|no ac|fire|unsafe|hazard|burst pipe|sewage)\b/i.test(inbound) ||
    (/\b(asap|urgent|immediately|today)\b/i.test(inbound) &&
      /\b(fix|repair|maintenance|technician|vendor|unit|apartment)\b/i.test(inbound));

  return { complaint, maintenanceUrgent };
}

function computeIndustryLayer(
  inbound: string,
  businessKnowledge: BusinessKnowledgeForScoring | undefined,
  options: ScoreOptions | undefined,
): { bonus: number; layer: "real_estate" | "property_management"; detected: string[] } | null {
  if (inferPropertyManagement(businessKnowledge)) {
    const pm = extractPropertyManagementSignals(inbound);
    let bonus = 0;
    const detected: string[] = [];
    if (pm.maintenanceUrgent) {
      bonus += 10;
      detected.push("pm:maintenance_urgent");
    }
    if (pm.complaint) {
      bonus += 8;
      detected.push("pm:complaint");
    }
    bonus = Math.min(MAX_PM_BONUS, bonus);
    if (bonus <= 0) return { bonus: 0, layer: "property_management", detected: [] };
    return { bonus, layer: "property_management", detected };
  }

  const reLayer =
    (businessKnowledge?.industry || "").toLowerCase() === "real_estate" || inferIsRealEstate(businessKnowledge, options);
  if (!reLayer) return null;

  const re = extractRealEstateSignals(inbound);
  let bonus = 0;
  const detected: string[] = [];
  if (re.viewingIntent) {
    bonus += 10;
    detected.push("re:viewing");
  }
  if (re.hasBudget) {
    bonus += 6;
    detected.push("re:budget");
  }
  if (re.hasTimeline) {
    bonus += 6;
    detected.push("re:timeline");
  }
  if (re.hasFinancing) {
    bonus += 6;
    detected.push("re:financing");
  }
  if (re.intent) {
    bonus += 4;
    detected.push(`re:intent_${re.intent}`);
  }
  bonus = Math.min(MAX_INDUSTRY_BONUS, bonus);
  if (bonus <= 0) return { bonus: 0, layer: "real_estate", detected: [] };
  return { bonus, layer: "real_estate", detected };
}

/**
 * Qualifying question gaps for CRM UI only — never affects numeric score.
 */
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

  const detectUrgency = (s: string) => URGENCY_WORDS.some((w) => s.includes(w));

  const answeredKey = (key: string): boolean => {
    const k = normalize(key);
    if (!k) return false;

    if (isRealEstate && realEstateSignals) {
      if (k.includes("budget")) return realEstateSignals.hasBudget;
      if (k.includes("timeline") || k.includes("move")) return realEstateSignals.hasTimeline;
      if (
        k.includes("financing") ||
        k.includes("preapproval") ||
        k.includes("pre-approved") ||
        k.includes("loan") ||
        k.includes("mortgage")
      )
        return realEstateSignals.hasFinancing;
      if (k.includes("view") || k.includes("show") || k.includes("tour")) return realEstateSignals.viewingIntent;
      if (k.includes("intent")) return !!realEstateSignals.intent;
    }

    if (k.includes("email")) return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(inbound);
    if (k.includes("phone")) return /\b\+?\d[\d\s().-]{7,}\b/.test(inbound);
    if (k.includes("name")) return /\bmy name is\b/i.test(inbound);
    if (k.includes("budget") || k.includes("price"))
      return /\$\s*[\d,]+/i.test(inbound) || /\b(budget|price range|afford|spend)\b/i.test(inbound);
    if (k.includes("timeline") || k.includes("when"))
      return detectUrgency(inbound) || /\b(within|in)\s+\d+\s+(day|week|month|year)s?\b/i.test(inbound);

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

function emptyCoreSignals(): LeadScoringSignals["core"] {
  return {
    engagementScore: 0,
    interestScore: 0,
    decisionScore: 0,
    urgencyScore: 0,
    negativeScore: 0,
  };
}

/**
 * Deterministic intent/engagement signals for stage suggestions.
 * This is explicitly NOT an auto-move mechanism — it only produces evidence flags.
 */
function getStageSignals(
  messages: ConversationMessage[],
  businessKnowledge?: BusinessKnowledgeForScoring,
  options?: ScoreOptions,
): StageSignalSummary {
  const inbound = inboundText(messages);
  const stats = messageStats(messages);
  const isRealEstate = inferIsRealEstate(businessKnowledge, options);
  const intents = detectIntent(inbound);
  const reSignals = isRealEstate ? extractRealEstateSignals(inbound) : null;

  const strongEngagement = stats.inbound >= 2 && stats.turns >= 1;
  const strongIntent = intents.length > 0;
  const viewingIntent = !!reSignals?.viewingIntent;

  return { isRealEstate, strongEngagement, strongIntent, viewingIntent, intents };
}

export function scoreLead(
  messages: ConversationMessage[],
  businessKnowledge?: BusinessKnowledgeForScoring,
  options?: ScoreOptions,
): LeadScoreResult {
  const inbound = inboundText(messages);
  const stats = messageStats(messages);
  const isRealEstate = inferIsRealEstate(businessKnowledge, options);
  const reSignalsForQual = isRealEstate ? extractRealEstateSignals(inbound) : null;

  const hardHits = HARD_NEGATIVE_PATTERNS.filter((p) => p.re.test(inbound));
  const negativeSignals = hardHits.map((n) => n.reason);
  if (hardHits.length > 0) {
    const { missingRequired } = computeQualificationCompleteness({
      inbound,
      isRealEstate,
      realEstateSignals: reSignalsForQual,
      qualifyingQuestions: businessKnowledge?.qualifyingQuestions,
    });
    return {
      score: 0,
      bucket: "unqualified",
      reasons: negativeSignals.slice(0, 3),
      missingRequired,
      negativeSignals,
      confidence: 0.9,
      signals: {
        core: { ...emptyCoreSignals(), negativeScore: 100 },
        industry: null,
        detected: hardHits.map((h) => `negative:${h.key}`),
      },
    };
  }

  const engagement = computeEngagementScore(stats);
  const interest = computeInterestScore(inbound);
  const decision = computeDecisionScore(inbound);
  const urgency = computeUrgencyScore(inbound);
  const softNeg = computeSoftNegativeScore(inbound);

  const industry = computeIndustryLayer(inbound, businessKnowledge, options);

  const core: LeadScoringSignals["core"] = {
    engagementScore: engagement.value,
    interestScore: interest.value,
    decisionScore: decision.value,
    urgencyScore: urgency.value,
    negativeScore: softNeg.value,
  };

  let score =
    core.engagementScore +
    core.interestScore +
    core.decisionScore +
    core.urgencyScore -
    core.negativeScore +
    (industry?.bonus ?? 0);

  let decisionOverride = false;
  if (core.decisionScore >= DECISION_HOT_THRESHOLD) {
    decisionOverride = true;
    score = Math.max(score, 75);
  }

  score = clampScore(score);

  let bucket: LeadBucket =
    score >= 75 ? "hot" : score >= 45 ? "warm" : score >= 15 ? "cold" : "unqualified";

  if (decisionOverride) {
    bucket = "hot";
  }

  const detected = Array.from(
    new Set([
      ...engagement.detected,
      ...interest.detected,
      ...decision.detected,
      ...urgency.detected,
      ...softNeg.detected,
      ...(industry?.detected ?? []),
    ]),
  );

  const reasons: string[] = [];
  if (engagement.value >= 12) reasons.push("Strong engagement from customer");
  else if (engagement.value >= 6) reasons.push("Some engagement from customer");
  if (interest.detected.some((d) => d.startsWith("interest:"))) reasons.push("Interest / discovery signals");
  if (decision.detected.length > 0) reasons.push("Strong decision / next-step intent");
  if (urgency.detected.length > 0) reasons.push("Time-sensitive / urgent");
  if (industry?.layer === "real_estate" && (industry.bonus ?? 0) > 0) reasons.push("Real-estate-specific signals");
  if (industry?.layer === "property_management" && (industry.bonus ?? 0) > 0) reasons.push("Property-management signals");

  const { missingRequired } = computeQualificationCompleteness({
    inbound,
    isRealEstate,
    realEstateSignals: reSignalsForQual,
    qualifyingQuestions: businessKnowledge?.qualifyingQuestions,
  });
  if (missingRequired.length > 0) {
    reasons.push(
      `${missingRequired.length} configured qualification field${missingRequired.length !== 1 ? "s" : ""} not yet captured`,
    );
  }

  const evidenceCount =
    (stats.inbound >= 2 ? 1 : 0) +
    (interest.value > 0 ? 1 : 0) +
    (decision.value > 0 ? 1 : 0) +
    (urgency.value > 0 ? 1 : 0) +
    ((industry?.bonus ?? 0) > 0 ? 1 : 0);
  const confidence = clamp01(0.25 + evidenceCount * 0.14 + Math.min(0.22, stats.inbound * 0.03));

  const uniqReasons = Array.from(new Set(reasons)).slice(0, 8);

  return {
    score,
    bucket,
    reasons: uniqReasons,
    missingRequired,
    negativeSignals: [],
    confidence,
    signals: {
      core,
      industry: industry && industry.bonus > 0 ? { layer: industry.layer, bonus: industry.bonus } : null,
      detected,
      decisionOverride,
    },
  };
}

export { getStageSignals };
