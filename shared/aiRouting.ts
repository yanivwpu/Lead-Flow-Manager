/**
 * Platform-level AI qualification & routing.
 * Determines the next CRM action before booking links or handoffs fire.
 * Growth Engines may pass `industrySignals` to boost industry-specific routes.
 */

import { detectListingFollowUp } from "./inventory/inventoryListingFollowUp";

export type AiRoutingDecision =
  | "CONTINUE_AI"
  | "ASSIGN_AGENT"
  | "BOOK_APPOINTMENT"
  | "START_NURTURE";

export type AiRoutingIndustrySignals = {
  viewingIntent?: boolean;
  strongIntent?: boolean;
  /** Extra regex strings (case-insensitive) that imply BOOK_APPOINTMENT for this industry */
  appointmentPhrases?: string[];
  /** Extra regex strings that imply ASSIGN_AGENT for this industry */
  humanChatPhrases?: string[];
};

export type AiRoutingHistoryTurn = {
  role: string;
  content?: string;
};

export type AiRoutingInput = {
  inbound: string;
  joinedInbound?: string;
  history?: AiRoutingHistoryTurn[];
  handoffKeywords?: string[];
  industry?: string;
  industrySignals?: AiRoutingIndustrySignals;
};

/** Coarse current-turn intent shared by routing, Copilot, and reply generation. */
export type AiTurnIntent =
  | "human_handoff"
  | "info_seeking"
  | "appointment"
  | "nurture"
  | "listing_follow_up"
  | "clarify_routing"
  | "continue";

export type AiRoutingResult = {
  decision: AiRoutingDecision;
  confidence: number;
  reason: string;
  signals: string[];
  /** Ask whether they want live human chat vs scheduling before acting */
  needsRoutingClarification: boolean;
  /** Short instruction fragment for the AI system prompt */
  promptGuidance: string;
  /** True only when the latest inbound explicitly requests a human. */
  humanHandoffRequested: boolean;
  /** Structured current-turn intent for shared consumers (not a second classifier). */
  turnIntent: AiTurnIntent;
  /** Lightweight sub-intents derived from the latest inbound (e.g. pricing_question). */
  subIntents: string[];
};

const DEFAULT_HANDOFF_KEYWORDS = ["call me", "human", "agent", "speak to someone"];

const APPOINTMENT_RE =
  /\b(book(?:ing)?\s+(?:a\s+)?(?:meeting|call|appointment|consultation|demo|viewing|showing|slot)|schedule\s+(?:a\s+)?(?:meeting|call|appointment|consultation|demo|viewing|showing|time)|set up\s+(?:a\s+)?(?:call|meeting|appointment)|pick\s+a\s+time|discovery\s+call|(?:property\s+)?viewing|(?:home\s+)?showing|(?:book|schedule)\s+(?:me|us)\s+(?:a|for)|calendly|when\s+(?:are\s+you|can\s+(?:we|i))\s+(?:available|free))\b/i;

/**
 * Product / education / pricing intent — AI should answer from Brain knowledge.
 * Must NOT escalate to a human solely because the customer asked about price or "how do I…".
 */
const INFO_SEEKING_RE =
  /\b(?:learn\s+more|tell\s+me\s+more|more\s+information|more\s+info|more\s+details|how\s+does\s+(?:it|this|your|the)\s+work|how\s+do\s+i\b|how\s+can\s+i\b|how\s+do\s+(?:you|your)|how\s+much\b|how\s+many\b|what(?:'s|\s+is|\s+are)\b|what\s+(?:is|are)\s+(?:your|the)|(?:what(?:'s|\s+are)\s+)?the\s+benefits?|benefits?\b|pricing\b|prices?\b|costs?\b|fees?\b|rates?\b|per\s+month|monthly\b|plans?\b|packages?\b|interested\s+in|curious\s+about|want\s+to\s+(?:know|learn|understand)|looking\s+to\s+learn|about\s+your\s+(?:product|service|platform|automation|software|tool|features?)|(?:your|the)\s+features?\b|what\s+can\s+(?:it|you|this)\s+do|can\s+you\s+(?:help|tell|explain)\b|do\s+you\s+(?:offer|have|support)|join\s+(?:the\s+)?(?:directory|platform)|list\s+my\b|advertis(?:e|ing)\b)\b/i;

/**
 * High-confidence human handoff — explicit request for a person / escalation.
 * Pricing, "how much", and "how do I…" are NOT handoff signals (those are info-seeking).
 * "Speak with an advisor/agent" is soft (clarify) — not an immediate ASSIGN_AGENT.
 */
const EXPLICIT_HUMAN_CHAT_RE =
  /\b(?:(?:customer|technical)\s+support|billing\s+(?:issue|problem)|help\s+me\s+with\s+(?:my|an|a)\s+(?:issue|problem|order|account|billing|refund)|(?:refund|chargeback|complaint|not\s+happy|unsatisfied)|(?:speak|talk)\s+(?:to|with)\s+(?:an?\s+)?(?:human|person|manager|supervisor|real\s+person)\b|can\s+(?:i|we)\s+(?:speak|talk)\s+(?:to|with)\s+(?:an?\s+)?(?:human|person|manager|supervisor)|(?:need|want)\s+(?:an?\s+)?(?:human|person|real\s+person)\b|(?:i\s+)?need\s+to\s+speak\s+(?:to|with)\s+(?:an?\s+)?(?:human|person|manager)|(?:i\s+)?(?:want|would\s+like)\s+(?:an?\s+)?(?:human|agent|representative)\b|can\s+someone\s+call\s+me|(?:please\s+)?call\s+me\b|connect\s+me\s+with\s+(?:support|a\s+human|an?\s+agent|an?\s+representative)|escalat(?:e|ion))\b/i;

/**
 * Vague human request — clarify live chat vs schedule before handoff or booking.
 * "Can you help me …" (AI-directed) must NOT match — requires someone/human/agent/person.
 */
const SOFT_HUMAN_CHAT_RE =
  /\b(?:(?:speak|talk)\s+(?:with|to)\s+(?:an?\s+)?(?:advisor|agent|rep|representative|someone)|chat\s+with\s+(?:an?\s+)?(?:human|person|agent|advisor|representative|someone)|connect\s+me\s+(?:with|to)\s+(?:an?\s+)?(?:human|person|agent|advisor|representative|support|someone)|(?:live|real)\s+(?:person|agent|rep)|someone\s+(?:help|assist)\s+me|can\s+someone\s+(?:help|assist)|(?:human|real)\s+(?:advisor|agent|rep))\b/i;

/** Sub-intent detectors on the latest inbound only. */
const PRICING_QUESTION_RE =
  /\b(?:how\s+much|pricing|prices?|costs?|fees?|rates?|per\s+month|monthly\s+(?:fee|cost|price|rate)|what\s+does\s+it\s+cost)\b/i;
const BENEFITS_QUESTION_RE =
  /\b(?:benefits?|what(?:'s|\s+is|\s+are)\s+(?:the\s+)?(?:benefit|value|advantage)|why\s+(?:should|would)\s+i)\b/i;
const LISTING_JOIN_QUESTION_RE =
  /\b(?:list\s+my|how\s+(?:do|can)\s+i\s+list|join\s+(?:the\s+)?directory|advertis(?:e|ing)\s+my|get\s+(?:my|our)\s+business\s+listed)\b/i;

const NURTURE_RE =
  /\b(just\s+browsing|not\s+ready|maybe\s+later|not\s+now|no\s+rush|in\s+the\s+future|(?:still\s+)?researching|looking\s+around|exploring\s+options|not\s+yet|sometime\s+next|few\s+months\s+out)\b/i;

const CLARIFY_OUTBOUND_RE =
  /\b(chat with someone now|speak with someone now|talk to someone now|schedule a (?:call|meeting)|book a (?:call|meeting)|live chat|or schedule)\b/i;

const LIVE_CHAT_CHOICE_RE =
  /\b(now|right now|live|asap|today|this week|pricing|help me with my)\b/i;

const SCHEDULE_CHOICE_RE =
  /\b(schedule|book|appointment|time slot|calendly|meeting|set up a call|pick a time)\b/i;

function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesCustomPhrases(text: string, phrases?: string[]): boolean {
  if (!phrases?.length) return false;
  return phrases.some((p) => {
    try {
      return new RegExp(p, "i").test(text);
    } catch {
      return text.includes(p.toLowerCase());
    }
  });
}

/** Word-boundary keyword match — avoids false positives like "agent" inside "automation". */
export function matchesHandoffKeyword(text: string, keywords?: string[]): boolean {
  const list = (keywords?.length ? keywords : DEFAULT_HANDOFF_KEYWORDS)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  return list.some((kw) => {
    if (/\s/.test(kw)) {
      return text.includes(kw);
    }
    try {
      return new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(text);
    } catch {
      return false;
    }
  });
}

function detectClarificationFromHistory(history: AiRoutingHistoryTurn[] | undefined): {
  asked: boolean;
  choseLiveChat: boolean;
  choseSchedule: boolean;
} {
  if (!history?.length) {
    return { asked: false, choseLiveChat: false, choseSchedule: false };
  }

  for (let i = 0; i < history.length - 1; i++) {
    const out = history[i];
    const inp = history[i + 1];
    const outRole = (out.role || "").toLowerCase();
    if (outRole !== "assistant" && outRole !== "agent" && outRole !== "system") continue;
    if (!CLARIFY_OUTBOUND_RE.test(out.content || "")) continue;

    const inText = norm(inp.content || "");
    if (!inText) continue;

    if (SCHEDULE_CHOICE_RE.test(inText)) {
      return { asked: true, choseLiveChat: false, choseSchedule: true };
    }
    if (LIVE_CHAT_CHOICE_RE.test(inText) && !SCHEDULE_CHOICE_RE.test(inText)) {
      return { asked: true, choseLiveChat: true, choseSchedule: false };
    }
  }

  const lastAssistant = [...history]
    .reverse()
    .find((m) => ["assistant", "agent"].includes((m.role || "").toLowerCase()));
  const asked = !!lastAssistant && CLARIFY_OUTBOUND_RE.test(lastAssistant.content || "");
  return { asked, choseLiveChat: false, choseSchedule: false };
}

function isInfoSeeking(text: string): boolean {
  return INFO_SEEKING_RE.test(text);
}

/** Short option list for info-seeking qualification questions, by industry. */
export function infoSeekingQualificationOptions(industry?: string): string {
  const i = (industry || "").toLowerCase();
  if (i.includes("property management") || i.includes("property_management")) {
    return "maintenance requests, leasing inquiries, tenant renewals, or owner/investor leads";
  }
  if (
    i.includes("med spa") ||
    i.includes("medspa") ||
    i.includes("medical spa") ||
    i.includes("aesthetic") ||
    i.includes("cosmetic")
  ) {
    return "treatment inquiries, booking a consultation, treatment follow-ups, or membership/packages";
  }
  if (
    i.includes("real estate") ||
    i.includes("realestate") ||
    i.includes("realtor") ||
    (i.includes("property") && !i.includes("management"))
  ) {
    return "buyer qualification, scheduling showings, automated follow-ups, or MLS/inventory search";
  }
  return "faster lead response, AI qualification, automated follow-ups, or managing all messages in one inbox";
}

/** Prompt fragment when routing is CONTINUE_AI with info_seeking. */
export function buildInfoSeekingPromptGuidance(industry?: string): string {
  const options = infoSeekingQualificationOptions(industry);
  return `INFO-SEEKING QUALIFICATION — customer wants to learn, not book yet:
- Do NOT mention a meeting, call, appointment, viewing, demo, or scheduling unless they explicitly asked to book/schedule/call.
- Do NOT say "during our meeting", "let's discuss on a call", "pick a time", or similar — routing is CONTINUE_AI, not booking.
- Do NOT give a generic marketing pitch, feature dump, or "how can I help" opener.
- Reply in 1–2 short, natural sentences. Warm acknowledgment + ONE question only.
- Ask which area they care about. When useful, offer 3–4 short options inside that single question.
- Example: "Absolutely — are you mainly interested in ${options}?"
- Tailor options using WEBSITE KNOWLEDGE / SERVICES when available; prefer concrete business capabilities over vague marketing.
- If they already named a topic (e.g. "automation"), acknowledge it and ask one sharper follow-up about their goal — do not repeat a generic brochure.`;
}

function buildPromptGuidance(
  result: Omit<AiRoutingResult, "promptGuidance">,
  industry?: string,
): string {
  if (result.needsRoutingClarification) {
    return `The customer asked to speak with a person/advisor but did not clearly request a scheduled meeting.
- Do NOT send a scheduling or booking link.
- Ask ONE short clarifying question: are they looking to chat with someone now about a specific question, or to schedule a call/meeting?
- Keep it to 1–2 sentences. Do not list multiple options as a menu.`;
  }

  switch (result.decision) {
    case "ASSIGN_AGENT":
      return `Route to a human agent — do NOT send a scheduling/booking link.
- Acknowledge their request warmly.
- Offer to connect them with a team member, or ask the single most helpful qualifying question before handoff.
- Do not push self-service booking unless they explicitly ask to schedule.`;
    case "BOOK_APPOINTMENT":
      return `The customer wants to schedule a meeting/call/showing.
- You may share the scheduling link only if one is provided in SCHEDULING LINK rules above.
- Confirm what type of meeting they need in one sentence if unclear.`;
    case "START_NURTURE":
      return `The customer is researching or not ready to commit.
- Do NOT send a scheduling link or push for a meeting.
- Be helpful and low-pressure. Offer to follow up when timing is better.`;
    default:
      if (result.signals.includes("listing_follow_up")) {
        return `LISTING FOLLOW-UP — the customer is responding to a listing recommendation recently sent in this thread.
- Continue the same listing conversation — share more property details (features, neighborhood, price, beds/baths, description).
- Re-include the View Property Flyer link if one was shared earlier and it is still relevant.
- Do NOT treat this as a human handoff or switch to unrelated qualification.
- Do NOT say you will "check for available options" — they are asking about a listing already discussed.
- Offer a showing or next step in one short question at the end.`;
      }
      if (result.signals.includes("info_seeking")) {
        return buildInfoSeekingPromptGuidance(industry);
      }
      return `Continue the conversation naturally.
- Do NOT send a scheduling link unless the customer clearly asks to book or schedule.
- Prefer one useful qualifying question over jumping to booking.`;
  }
}

function deriveSubIntents(latestNorm: string): string[] {
  const out: string[] = [];
  if (PRICING_QUESTION_RE.test(latestNorm)) out.push("pricing_question");
  if (BENEFITS_QUESTION_RE.test(latestNorm)) out.push("benefits_question");
  if (LISTING_JOIN_QUESTION_RE.test(latestNorm)) out.push("listing_join_question");
  return out;
}

function resolveTurnIntent(
  partial: Pick<AiRoutingResult, "decision" | "reason" | "signals" | "needsRoutingClarification">,
  humanHandoffRequested: boolean,
): AiTurnIntent {
  if (humanHandoffRequested) return "human_handoff";
  if (partial.needsRoutingClarification) return "clarify_routing";
  if (partial.signals.includes("listing_follow_up") || partial.reason === "listing_follow_up") {
    return "listing_follow_up";
  }
  if (partial.signals.includes("info_seeking") || partial.reason === "info_seeking_qualify") {
    return "info_seeking";
  }
  if (partial.decision === "BOOK_APPOINTMENT") return "appointment";
  if (partial.decision === "START_NURTURE") return "nurture";
  return "continue";
}

function finalizeRoutingResult(
  partial: Omit<AiRoutingResult, "promptGuidance" | "humanHandoffRequested" | "turnIntent" | "subIntents">,
  opts: {
    industry?: string;
    subIntents: string[];
    humanHandoffRequested: boolean;
  },
): AiRoutingResult {
  const turnIntent = resolveTurnIntent(partial, opts.humanHandoffRequested);
  const withMeta = {
    ...partial,
    humanHandoffRequested: opts.humanHandoffRequested,
    turnIntent,
    subIntents: opts.subIntents,
  };
  return {
    ...withMeta,
    promptGuidance: buildPromptGuidance(withMeta, opts.industry),
  };
}

function continueAiResult(
  reason: string,
  signals: string[],
  confidence: number,
  needsRoutingClarification = false,
  industry?: string,
  subIntents: string[] = [],
  humanHandoffRequested = false,
): AiRoutingResult {
  return finalizeRoutingResult(
    {
      decision: "CONTINUE_AI",
      confidence,
      reason,
      signals,
      needsRoutingClarification,
    },
    { industry, subIntents, humanHandoffRequested },
  );
}

/** Strict explicit human-request check on a single message (latest inbound). */
export function detectsExplicitHumanHandoffRequest(text: string | null | undefined): boolean {
  const t = norm(text || "");
  if (!t) return false;
  if (isInfoSeeking(t)) return false;
  return EXPLICIT_HUMAN_CHAT_RE.test(t);
}

/**
 * Resolve the platform routing decision for the latest inbound message.
 *
 * Human-handoff detection uses the latest inbound only so prior thread text
 * (or a previous false-positive) cannot silently re-escalate.
 */
export function resolveAiRouting(input: AiRoutingInput): AiRoutingResult {
  const inbound = (input.inbound || "").trim();
  const latest = norm(inbound);
  // Thread text may still inform appointment/nurture continuity; handoff uses latest only.
  const thread = norm(input.joinedInbound ? `${input.joinedInbound}\n${inbound}` : inbound);
  const signals: string[] = [];
  const industry = (input.industry || "").toLowerCase();
  const subIntents = deriveSubIntents(latest);

  if (!inbound) {
    return continueAiResult("empty_inbound", signals, 0, false, industry, [], false);
  }

  const clarify = detectClarificationFromHistory(input.history);
  const isRealEstate =
    industry.includes("real estate") ||
    industry.includes("realestate") ||
    industry.includes("property") ||
    industry.includes("realtor");

  const infoSeeking = isInfoSeeking(latest);
  const hasAppointment =
    APPOINTMENT_RE.test(latest) ||
    matchesCustomPhrases(latest, input.industrySignals?.appointmentPhrases) ||
    (input.industrySignals?.viewingIntent === true &&
      /\b(view|tour|showing|see the)\b/i.test(latest));
  const hasExplicitHuman =
    !infoSeeking &&
    (EXPLICIT_HUMAN_CHAT_RE.test(latest) ||
      matchesCustomPhrases(latest, input.industrySignals?.humanChatPhrases));
  const handoffKeywordMatch = !infoSeeking && matchesHandoffKeyword(latest, input.handoffKeywords);
  const hasSoftHuman =
    !infoSeeking &&
    (SOFT_HUMAN_CHAT_RE.test(latest) || handoffKeywordMatch) &&
    !hasExplicitHuman;
  const hasHumanChat = hasExplicitHuman || hasSoftHuman;
  const hasNurture = NURTURE_RE.test(latest) || NURTURE_RE.test(thread);

  if (infoSeeking) signals.push("info_seeking");
  if (hasAppointment) signals.push("appointment_intent");
  if (hasExplicitHuman) signals.push("human_chat_explicit");
  if (hasSoftHuman) signals.push("human_chat_soft");
  if (handoffKeywordMatch) signals.push("handoff_keyword");
  if (hasHumanChat) signals.push("human_chat_intent");
  if (hasNurture) signals.push("nurture_intent");
  if (input.industrySignals?.viewingIntent) signals.push("industry:viewing");
  if (input.industrySignals?.strongIntent) signals.push("industry:strong_intent");
  for (const s of subIntents) signals.push(`sub:${s}`);

  const meta = { industry, subIntents };

  if (clarify.choseLiveChat) {
    return finalizeRoutingResult(
      {
        decision: "ASSIGN_AGENT",
        confidence: 0.9,
        reason: "clarified_live_chat",
        signals: [...signals, "clarified:live_chat"],
        needsRoutingClarification: false,
      },
      { ...meta, humanHandoffRequested: true },
    );
  }

  if (clarify.choseSchedule) {
    return finalizeRoutingResult(
      {
        decision: "BOOK_APPOINTMENT",
        confidence: 0.92,
        reason: "clarified_schedule",
        signals: [...signals, "clarified:schedule"],
        needsRoutingClarification: false,
      },
      { ...meta, humanHandoffRequested: false },
    );
  }

  const listingFollowUp =
    isRealEstate && detectListingFollowUp(input.history, inbound).active;
  if (listingFollowUp) {
    return continueAiResult(
      "listing_follow_up",
      [...signals, "listing_follow_up"],
      0.92,
      false,
      industry,
      subIntents,
      false,
    );
  }

  if (infoSeeking && !hasAppointment && !clarify.choseLiveChat) {
    return continueAiResult(
      "info_seeking_qualify",
      signals,
      0.88,
      false,
      industry,
      subIntents,
      false,
    );
  }

  if (hasExplicitHuman && !hasAppointment) {
    return finalizeRoutingResult(
      {
        decision: "ASSIGN_AGENT",
        confidence: 0.88,
        reason: "explicit_human_chat_signals",
        signals,
        needsRoutingClarification: false,
      },
      { ...meta, humanHandoffRequested: true },
    );
  }

  if (
    hasSoftHuman &&
    !hasAppointment &&
    !clarify.asked &&
    !clarify.choseLiveChat &&
    !clarify.choseSchedule
  ) {
    return continueAiResult(
      "soft_human_needs_clarification",
      [...signals, "clarify:human_vs_book"],
      0.72,
      true,
      industry,
      subIntents,
      false,
    );
  }

  if (hasAppointment && !hasNurture) {
    return finalizeRoutingResult(
      {
        decision: "BOOK_APPOINTMENT",
        confidence: 0.85,
        reason: "appointment_signals",
        signals,
        needsRoutingClarification: false,
      },
      { ...meta, humanHandoffRequested: false },
    );
  }

  if (hasNurture && !hasAppointment && !hasHumanChat) {
    return finalizeRoutingResult(
      {
        decision: "START_NURTURE",
        confidence: 0.75,
        reason: "nurture_signals",
        signals,
        needsRoutingClarification: false,
      },
      { ...meta, humanHandoffRequested: false },
    );
  }

  if (hasAppointment && hasHumanChat) {
    const needsClarify = !clarify.asked;
    if (needsClarify) {
      return continueAiResult(
        "mixed_signals_needs_clarification",
        [...signals, "clarify:mixed"],
        0.65,
        true,
        industry,
        subIntents,
        false,
      );
    }
    return finalizeRoutingResult(
      {
        decision: "BOOK_APPOINTMENT",
        confidence: 0.65,
        reason: "mixed_signals_default_book",
        signals,
        needsRoutingClarification: false,
      },
      { ...meta, humanHandoffRequested: false },
    );
  }

  if (isRealEstate && input.industrySignals?.viewingIntent && !hasHumanChat && !hasNurture) {
    return finalizeRoutingResult(
      {
        decision: "BOOK_APPOINTMENT",
        confidence: 0.72,
        reason: "industry_viewing_intent",
        signals,
        needsRoutingClarification: false,
      },
      { ...meta, humanHandoffRequested: false },
    );
  }

  return continueAiResult("default_continue", signals, 0.5, false, industry, subIntents, false);
}

/** Remove scheduling URLs from AI output when routing disallows booking. */
export function stripSchedulingUrlsFromReply(text: string): string {
  if (!text?.trim()) return text;
  let out = text;
  out = out.replace(/https?:\/\/(?:[\w-]+\.)?calendly\.com[^\s)\]>]*/gi, "").trim();
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

export function routingAllowsSchedulingLink(decision: AiRoutingResult): boolean {
  return decision.decision === "BOOK_APPOINTMENT" && !decision.needsRoutingClarification;
}

export function routingShouldTriggerHandoff(decision: AiRoutingResult): boolean {
  return (
    decision.humanHandoffRequested === true &&
    decision.decision === "ASSIGN_AGENT" &&
    !decision.needsRoutingClarification
  );
}
