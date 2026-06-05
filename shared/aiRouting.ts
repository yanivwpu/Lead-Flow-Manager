/**
 * Platform-level AI qualification & routing.
 * Determines the next CRM action before booking links or handoffs fire.
 * Growth Engines may pass `industrySignals` to boost industry-specific routes.
 */

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

export type AiRoutingResult = {
  decision: AiRoutingDecision;
  confidence: number;
  reason: string;
  signals: string[];
  /** Ask whether they want live human chat vs scheduling before acting */
  needsRoutingClarification: boolean;
  /** Short instruction fragment for the AI system prompt */
  promptGuidance: string;
};

const APPOINTMENT_RE =
  /\b(book(?:ing)?\s+(?:a\s+)?(?:meeting|call|appointment|consultation|demo|viewing|showing|slot)|schedule\s+(?:a\s+)?(?:meeting|call|appointment|consultation|demo|viewing|showing|time)|set up\s+(?:a\s+)?(?:call|meeting|appointment)|pick\s+a\s+time|discovery\s+call|(?:property\s+)?viewing|(?:home\s+)?showing|(?:book|schedule)\s+(?:me|us)\s+(?:a|for)|calendly|when\s+(?:are\s+you|can\s+(?:we|i))\s+(?:available|free))\b/i;

const HUMAN_CHAT_RE =
  /\b(speak\s+(?:with|to)|talk\s+(?:with|to)|chat\s+with|connect\s+me|human|live\s+(?:person|agent|rep)|real\s+person|(?:sales|support)\s+(?:rep|agent|person)|customer\s+service|someone\s+(?:help|assist)|can\s+(?:someone|you)\s+help|help\s+me\s+(?:understand|with)|(?:pricing|price|cost|rate|fee)s?\b|how\s+much|clarif|explain\s+(?:this|that|the)|(?:too\s+expensive|not\s+sure|concerned|objection)|advisor|representative)\b/i;

/** High-confidence human handoff — pricing, support, objections (not vague "speak with someone"). */
const EXPLICIT_HUMAN_CHAT_RE =
  /\b((?:pricing|price|cost|rate|fee)s?\b|how\s+much|support|help\s+me\s+(?:understand|with)|clarif|explain\s+(?:this|that|the)|(?:too\s+expensive|not\s+sure|concerned|objection)|customer\s+service)\b/i;

/** Vague human request — clarify live chat vs schedule before handoff or booking. */
const SOFT_HUMAN_CHAT_RE =
  /\b(speak\s+(?:with|to)|talk\s+(?:with|to)|chat\s+with|connect\s+me|(?:speak|talk)\s+(?:with\s+)?(?:an?\s+)?(?:advisor|agent|human|rep|someone)|human|live\s+(?:person|agent|rep)|real\s+person|someone\s+(?:help|assist)|can\s+(?:someone|you)\s+help|advisor|representative)\b/i;

const NURTURE_RE =
  /\b(just\s+browsing|not\s+ready|maybe\s+later|not\s+now|no\s+rush|in\s+the\s+future|(?:still\s+)?researching|looking\s+around|exploring\s+options|not\s+yet|sometime\s+next|few\s+months\s+out)\b/i;

const CLARIFY_OUTBOUND_RE =
  /\b(chat with someone now|speak with someone now|talk to someone now|schedule a (?:call|meeting)|book a (?:call|meeting)|live chat|or schedule)\b/i;

const LIVE_CHAT_CHOICE_RE =
  /\b(now|right now|live|chat|question|pricing|help me|speak|talk|asap|today|this week)\b/i;

const SCHEDULE_CHOICE_RE =
  /\b(schedule|book|appointment|time slot|calendly|meeting|set up a call|pick a time)\b/i;

function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
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

function matchesHandoffKeyword(text: string, keywords?: string[]): boolean {
  const list = (keywords?.length ? keywords : ["call me", "human", "agent", "speak to someone"]).map((k) =>
    k.trim().toLowerCase(),
  ).filter(Boolean);
  return list.some((kw) => text.includes(kw));
}

function buildPromptGuidance(result: Omit<AiRoutingResult, "promptGuidance">): string {
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
      return `Continue the conversation naturally.
- Do NOT send a scheduling link unless the customer clearly asks to book or schedule.
- Prefer one useful qualifying question over jumping to booking.`;
  }
}

/**
 * Resolve the platform routing decision for the latest inbound message.
 */
export function resolveAiRouting(input: AiRoutingInput): AiRoutingResult {
  const inbound = (input.inbound || "").trim();
  const text = norm(input.joinedInbound ? `${input.joinedInbound}\n${inbound}` : inbound);
  const signals: string[] = [];

  if (!inbound) {
    return {
      decision: "CONTINUE_AI",
      confidence: 0,
      reason: "empty_inbound",
      signals,
      needsRoutingClarification: false,
      promptGuidance: buildPromptGuidance({
        decision: "CONTINUE_AI",
        confidence: 0,
        reason: "empty_inbound",
        signals,
        needsRoutingClarification: false,
      }),
    };
  }

  const clarify = detectClarificationFromHistory(input.history);
  const industry = (input.industry || "").toLowerCase();
  const isRealEstate =
    industry.includes("real estate") ||
    industry.includes("realestate") ||
    industry.includes("property") ||
    industry.includes("realtor");

  const hasAppointment =
    APPOINTMENT_RE.test(text) ||
    matchesCustomPhrases(text, input.industrySignals?.appointmentPhrases) ||
    (input.industrySignals?.viewingIntent === true && /\b(view|tour|showing|see the)\b/i.test(text));
  const hasExplicitHuman =
    EXPLICIT_HUMAN_CHAT_RE.test(text) ||
    matchesCustomPhrases(text, input.industrySignals?.humanChatPhrases);
  const hasSoftHuman =
    (SOFT_HUMAN_CHAT_RE.test(text) || matchesHandoffKeyword(text, input.handoffKeywords)) &&
    !hasExplicitHuman;
  const hasHumanChat = hasExplicitHuman || hasSoftHuman;
  const hasNurture = NURTURE_RE.test(text);

  if (hasAppointment) signals.push("appointment_intent");
  if (hasExplicitHuman) signals.push("human_chat_explicit");
  if (hasSoftHuman) signals.push("human_chat_soft");
  if (hasHumanChat) signals.push("human_chat_intent");
  if (hasNurture) signals.push("nurture_intent");
  if (input.industrySignals?.viewingIntent) signals.push("industry:viewing");
  if (input.industrySignals?.strongIntent) signals.push("industry:strong_intent");

  if (clarify.choseLiveChat || (hasExplicitHuman && !hasAppointment)) {
    const base = {
      decision: "ASSIGN_AGENT" as const,
      confidence: clarify.choseLiveChat ? 0.9 : 0.85,
      reason: clarify.choseLiveChat ? "clarified_live_chat" : "explicit_human_chat_signals",
      signals: [...signals, ...(clarify.choseLiveChat ? ["clarified:live_chat"] : [])],
      needsRoutingClarification: false,
    };
    return { ...base, promptGuidance: buildPromptGuidance(base) };
  }

  if (
    hasSoftHuman &&
    !hasAppointment &&
    !clarify.asked &&
    !clarify.choseLiveChat &&
    !clarify.choseSchedule
  ) {
    const base = {
      decision: "CONTINUE_AI" as const,
      confidence: 0.72,
      reason: "soft_human_needs_clarification",
      signals: [...signals, "clarify:human_vs_book"],
      needsRoutingClarification: true,
    };
    return { ...base, promptGuidance: buildPromptGuidance(base) };
  }

  if (clarify.choseSchedule || (hasAppointment && !hasNurture)) {
    const base = {
      decision: "BOOK_APPOINTMENT" as const,
      confidence: clarify.choseSchedule ? 0.92 : 0.85,
      reason: clarify.choseSchedule ? "clarified_schedule" : "appointment_signals",
      signals: [...signals, ...(clarify.choseSchedule ? ["clarified:schedule"] : [])],
      needsRoutingClarification: false,
    };
    return { ...base, promptGuidance: buildPromptGuidance(base) };
  }

  if (hasNurture && !hasAppointment && !hasHumanChat) {
    const base = {
      decision: "START_NURTURE" as const,
      confidence: 0.75,
      reason: "nurture_signals",
      signals,
      needsRoutingClarification: false,
    };
    return { ...base, promptGuidance: buildPromptGuidance(base) };
  }

  if (hasAppointment && hasHumanChat) {
    const base = {
      decision: "BOOK_APPOINTMENT" as const,
      confidence: 0.65,
      reason: "mixed_signals_default_book",
      signals,
      needsRoutingClarification: !clarify.asked,
    };
    if (base.needsRoutingClarification) {
      base.decision = "CONTINUE_AI";
      base.reason = "mixed_signals_needs_clarification";
      base.signals.push("clarify:mixed");
    }
    return { ...base, promptGuidance: buildPromptGuidance(base) };
  }

  if (isRealEstate && input.industrySignals?.viewingIntent && !hasHumanChat && !hasNurture) {
    const base = {
      decision: "BOOK_APPOINTMENT" as const,
      confidence: 0.72,
      reason: "industry_viewing_intent",
      signals,
      needsRoutingClarification: false,
    };
    return { ...base, promptGuidance: buildPromptGuidance(base) };
  }

  const base = {
    decision: "CONTINUE_AI" as const,
    confidence: 0.5,
    reason: "default_continue",
    signals,
    needsRoutingClarification: false,
  };
  return { ...base, promptGuidance: buildPromptGuidance(base) };
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
  return decision.decision === "ASSIGN_AGENT" && !decision.needsRoutingClarification;
}
