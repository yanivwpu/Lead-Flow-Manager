import {
  scoreLead,
  getStageSignals,
  type BusinessKnowledgeForScoring,
} from "../client/src/lib/leadScoring";
import {
  isCasualWebchatGreeting,
  unsafeWebchatGreetingWelcomeReason,
} from "@shared/webchatGreetingWelcome";
import { draftHasCurrencyAmount } from "@shared/factGrounding";
import {
  draftContainsVerifiedBookingUrl,
  extractHttpUrls,
  isTrustedCalendlySchedulingUrl,
  normalizeSchedulingUrlForCompare,
} from "@shared/verifiedBookingUrl";

export { isCasualWebchatGreeting } from "@shared/webchatGreetingWelcome";

export type ChatTurn = { role: string; content?: string };

/** Maps DB + API variants to the three logical modes. */
export function normalizeBusinessAiMode(raw: string | undefined | null): "off" | "suggest" | "auto" {
  const v = (raw || "").toLowerCase().trim();
  if (v === "full_auto" || v === "auto") return "auto";
  if (v === "suggest_only" || v === "suggest") return "suggest";
  return "off";
}

/** Inbound text suitable for Full Auto generation (excludes empty / media placeholders without transcription). */
export function isSubstantiveTextForAiAutoSend(text: string | undefined | null): boolean {
  const raw = (text || "").trim();
  if (!raw) return false;
  const t = raw.toLowerCase();
  const placeholders = new Set([
    "media received",
    "sticker received",
    "attachment",
    "[media]",
    "[image]",
    "[video]",
    "[audio]",
    "[document]",
  ]);
  if (placeholders.has(t)) return false;
  if (/^\[[^\]]+\]$/.test(t) && t.length < 40) return false;
  return true;
}

export function toConversationMessages(history: ChatTurn[]) {
  return history.map((m) => ({
    direction: (m.role === "user" ? "inbound" : "outbound") as "inbound" | "outbound",
    content: m.content || "",
  }));
}

const GREETING_ONLY =
  /^(hi|hello|hey|yo|sup|hola|good morning|good afternoon|good evening|gm|gn|howdy|greetings|good day)[\s!?.]*$/i;

export const AUTO_SEND_MIN_CONFIDENCE = 0.75;
/** Web Chat send threshold when the model actually returned a score. */
export const WEBCHAT_AUTO_SEND_MIN_CONFIDENCE = 0.7;

export type AutoSendConfidenceSource = "model" | "defaulted" | "missing";

export function isWebchatChannel(channel: string | null | undefined): boolean {
  return String(channel || "").trim().toLowerCase() === "webchat";
}

/** Direct, answerable visitor question — not a greeting and not a media placeholder. */
export function isClearKnowledgeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || isCasualWebchatGreeting(t)) return false;
  return /\?/.test(t) || t.length >= 25;
}

const PLACEHOLDER_RE =
  /\{\{|\}\}|\[\[|\]\]|\[NAME\]|\[DATE\]|\[PRICE\]|\[PHONE\]|\[EMAIL\]|TODO\b|TBD\b|XXX\b|___+|…{3,}/i;

const COMPLAINT_RE =
  /\b(lawsuit|sue you|suing|terrible|awful|worst experience|this is a scam|fraud|refund now|report you to|disgusting|hate this|angry\b|furious|unacceptable service)\b/i;

const STOP_RE = /\b(stop|unsubscribe|do not contact|dont contact|don't contact|remove me|opt out)\b/i;

/**
 * Full Auto: follow-up / frustration lines that must get a reply (bypass short-thread & greeting-only guards).
 * Does not bypass STOP/COMPLAINT or trivial AI output — see evaluateFullAutoSend.
 */
export function shouldBypassAutoGuardsForInbound(params: {
  conversationHistory: ChatTurn[];
  lastInbound: string;
}): boolean {
  const last = params.lastInbound.trim();
  if (!last) return false;

  if (/\bno\s*answer\b/i.test(last)) return true;

  if (/\bhello\s*\?/i.test(last)) return true;

  const inboundLines = params.conversationHistory
    .filter((m) => m.role === "user")
    .map((m) => (m.content || "").trim())
    .filter(Boolean);
  if (inboundLines.length >= 2) {
    const prev = inboundLines[inboundLines.length - 2];
    const cur = inboundLines[inboundLines.length - 1];
    if (GREETING_ONLY.test(prev) && GREETING_ONLY.test(cur)) return true;
  }

  return false;
}

/**
 * Invented meeting details, guarantees, or customer-profile claims.
 * A safe Book a demo CTA is a short invitation plus the verified Calendly URL.
 */
const UNSAFE_BOOKING_REPLY_RE =
  /\b(?:available (?:on|at|from)|availability|time slot|opens?\s+at|guarante(?:e|ed)|we promise|100\s*%|your (?:budget|company|team|package|timeline)|i see you)\b|\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.{0,24}\b(?:at|from)\b|זמין(?:ה)?(?:\s+ב)|בשעה\s+\d|מובטח|disponible\s+(?:el|mañana)|garantiz/i;

/** Qualification-field gaps from Copilot scoring — not reply-grounding facts. */
export function listMissingRequiredQualificationLabels(
  conversationHistory: ChatTurn[],
  businessKnowledge?: BusinessKnowledgeForScoring,
): string[] {
  return scoreLead(toConversationMessages(conversationHistory), businessKnowledge).missingRequired ?? [];
}

/**
 * Structured Book a demo may skip qualification-gap holds only when the reply is a
 * grounded booking invitation that contains the exact verified workspace URL.
 */
export function isSafeStructuredBookingCta(draft: string, verifiedUrl: string): boolean {
  if (!isTrustedCalendlySchedulingUrl(verifiedUrl)) return false;
  if (!draftContainsVerifiedBookingUrl(draft, verifiedUrl)) return false;
  const expected = normalizeSchedulingUrlForCompare(verifiedUrl);
  if (extractHttpUrls(draft).some((found) => normalizeSchedulingUrlForCompare(found) !== expected)) {
    return false;
  }
  if (draftHasCurrencyAmount(draft)) return false;
  const withoutUrls = (draft || "").replace(/https?:\/\/\S+/gi, " ");
  return !UNSAFE_BOOKING_REPLY_RE.test(withoutUrls);
}

export function detectStrongAutoIntent(joinedInbound: string, lastInbound: string): boolean {
  const text = `${joinedInbound}\n${lastInbound}`.trim();
  if (!text) return false;
  const t = text.toLowerCase();

  if (/\b(schedule|book)\b[^.?!]{0,80}\b(showing|viewing|tour|appointment|call|time)\b/i.test(t)) {
    return true;
  }
  if (/\b(showing|viewing|tour)\b[^.?!]{0,80}\b(on|for)\b[^.?!]{0,40}\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/i.test(t)) {
    return true;
  }
  if (/\blet'?s\s+(schedule|book)\b/i.test(t)) return true;

  // Urgency + concrete action (e.g. "send papers asap", "deposit today")
  const hasUrgency = /\b(asap|as\s*a\.?\s*s\.?\s*a\.?\s*p|urgent|urgently|right away|eod|end of day|immediately|today)\b/i.test(
    t,
  );
  const hasActionSignal =
    /\b(send\s+papers?|papers|deposit|sign(ing)?|offer|close|pay|buy|proceed|contract|wire)\b/i.test(t);
  if (hasUrgency && hasActionSignal) return true;

  // Phrase-level strong intent
  if (/\bsend\s+papers?\b/i.test(t)) return true;
  if (/\bmove\s+forward\b/i.test(t)) return true;
  if (/\bput\s+(a\s+)?deposit\b/i.test(t)) return true;
  if (/\b(pay|place)\s+(the\s+)?deposit\b/i.test(t)) return true;
  if (/\bready\s+to\s+(put|send|sign|pay|buy|move|proceed|close|make|wire)\b/i.test(t)) return true;
  if (/\b(make|accept)\s+(an?\s+)?offer\b/i.test(t)) return true;
  if (/\b(your|the)\s+offer\b/i.test(t)) return true;
  if (/\bi\s*'?m\s+ready\s+to\b/i.test(t)) return true;
  if (/\b(let'?s|lets)\s+(sign|close|proceed|move forward)\b/i.test(t)) return true;

  // Keyword clusters: clearly actionable deal intent
  if (/\bdeposit\b/i.test(t) && /\b(put|pay|place|ready|send|wire)\b/i.test(t)) return true;
  if (/\bbuy(ing)?\b/i.test(t) && /\b(ready|want|going to|will|let'?s)\b/i.test(t)) return true;
  if (/\bsign(ing)?\b/i.test(t) && /\b(contract|papers|agreement|today|now)\b/i.test(t)) return true;
  if (/\bproceed\b/i.test(t) && /\b(with|forward)\b/i.test(t)) return true;

  // Standalone strong transactional keywords in substantive lines
  if (/\b(send\s+papers|move\s+forward)\b/i.test(t)) return true;

  // "offer" with clear transactional verbs / nouns
  if (/\boffer\b/i.test(t) && /\b(accept|make|take|send|your|the|my|deposit|sign|papers)\b/i.test(t)) return true;

  return false;
}

/**
 * Controlled Full Auto gate — all checks must pass for auto-send.
 * Uses the same lead scoring / signals as Copilot (client leadScoring.ts).
 * Strong-intent override bypasses unclear intent, low confidence, short thread, and missing qualifying answers.
 * Missing model confidence is never treated as a passing score unless Web Chat knowledge is verified.
 */
export function evaluateFullAutoSend(params: {
  businessMode: "off" | "suggest" | "auto";
  conversationHistory: ChatTurn[];
  suggestion: string;
  confidence: number;
  businessKnowledge?: BusinessKnowledgeForScoring;
  /** Set when the draft contradicts or ignores published business facts. */
  groundingViolations?: string[];
  /** When webchat, knowledge-backed questions use the Web Chat send policy (not Copilot sales gates). */
  channel?: string | null;
  /** False when the model omitted confidence. Undefined treats `confidence` as model-provided. */
  confidenceProvided?: boolean;
  /** True only when retrieved published facts exist and the draft passed grounding. */
  knowledgeGrounded?: boolean;
  /**
   * Current-inbound structured Ask Question resolution only.
   * Stale visitor_intent from an earlier turn must not be passed as trusted.
   */
  currentTurnAskIntent?: {
    trusted?: boolean;
    provenanceCurrentInbound?: boolean;
    kind?: string;
  } | null;
  /**
   * Current-inbound page-rule suggested action only.
   * Stale contact pageAction from an earlier inbound must not be passed as trusted.
   */
  currentTurnPageAction?: {
    trusted?: boolean;
    provenanceCurrentInbound?: boolean;
    kind?: string;
    ruleKey?: string;
    actionIndex?: number;
    explicitUserChoice?: boolean;
  } | null;
  /** Workspace-selected Calendly URL. Required for the scoped Book a demo qualification skip. */
  verifiedBookingUrl?: string | null;
}): {
  allowed: boolean;
  reason: string;
  missingRequiredLen: number;
  inboundCount: number;
  confidenceSource: AutoSendConfidenceSource;
  missingRequired: string[];
  pageActionValidated?: boolean;
  pageActionCurrentInbound?: boolean;
  pageRuleKey?: string;
  pageActionIndex?: number;
  explicitUserChoice?: boolean;
} {
  const { businessMode, conversationHistory, suggestion, businessKnowledge } = params;
  const webchat = isWebchatChannel(params.channel);
  const pageActionValidated =
    params.currentTurnPageAction?.trusted === true &&
    params.currentTurnPageAction.provenanceCurrentInbound === true;
  const explicitUserChoice = pageActionValidated;
  const pageActionDiagnostics = {
    pageActionValidated,
    pageActionCurrentInbound: params.currentTurnPageAction?.provenanceCurrentInbound === true,
    ...(pageActionValidated && params.currentTurnPageAction?.ruleKey
      ? { pageRuleKey: String(params.currentTurnPageAction.ruleKey).slice(0, 220) }
      : {}),
    ...(pageActionValidated && typeof params.currentTurnPageAction?.actionIndex === "number"
      ? { pageActionIndex: params.currentTurnPageAction.actionIndex }
      : {}),
    explicitUserChoice,
  };
  const none = (
    reason: string,
    inboundCount = 0,
    missingRequiredLen = 0,
    confidenceSource: AutoSendConfidenceSource = "missing",
    missingRequired: string[] = [],
  ) => ({
    allowed: false,
    reason,
    missingRequiredLen,
    inboundCount,
    confidenceSource,
    missingRequired,
    ...pageActionDiagnostics,
  });

  if (businessMode !== "auto") {
    return none("business_mode_not_auto");
  }

  const msgs = toConversationMessages(conversationHistory);
  const inboundMsgs = msgs.filter((m) => m.direction === "inbound");
  const inboundCount = inboundMsgs.length;

  const joinedInbound = inboundMsgs.map((m) => m.content || "").join("\n");
  const lastInbound = inboundMsgs[inboundMsgs.length - 1]?.content?.trim() || "";
  const structuredBooking =
    (params.currentTurnAskIntent?.trusted === true &&
      params.currentTurnAskIntent.provenanceCurrentInbound === true &&
      params.currentTurnAskIntent.kind === "book_demo") ||
    (pageActionValidated && params.currentTurnPageAction?.kind === "book_demo");

  if (!lastInbound) {
    return none("empty_last_inbound", inboundCount);
  }

  // Checked ahead of every override: a reply that states a price the business never
  // published, or claims not to know something it does, must reach a human first.
  if (params.groundingViolations && params.groundingViolations.length > 0) {
    const modelProvidedEarly =
      params.confidenceProvided !== false && typeof params.confidence === "number";
    return none(
      `grounding_violation:${params.groundingViolations[0]}`,
      inboundCount,
      0,
      modelProvidedEarly ? "model" : "missing",
    );
  }

  if (STOP_RE.test(joinedInbound) || COMPLAINT_RE.test(joinedInbound)) {
    return none("disqualifier_intent", inboundCount);
  }

  const forceBypass = shouldBypassAutoGuardsForInbound({
    conversationHistory,
    lastInbound,
  });

  const strongIntent = detectStrongAutoIntent(joinedInbound, lastInbound);
  const knowledgeQuestion = webchat && isClearKnowledgeQuestion(lastInbound);
  const minConfidence = webchat ? WEBCHAT_AUTO_SEND_MIN_CONFIDENCE : AUTO_SEND_MIN_CONFIDENCE;
  const modelProvided = params.confidenceProvided !== false && typeof params.confidence === "number";
  const grounded = params.knowledgeGrounded === true;

  const finishSuggestionChecks = (): { ok: true } | { ok: false; reason: string } => {
    const trimmedSuggestion = suggestion.trim();
    if (!trimmedSuggestion || trimmedSuggestion.length <= 5) {
      return { ok: false, reason: "missing_or_trivial_suggestion" };
    }
    if (PLACEHOLDER_RE.test(trimmedSuggestion)) {
      return { ok: false, reason: "suggestion_contains_placeholder" };
    }
    return { ok: true };
  };

  const scored = scoreLead(msgs, businessKnowledge);
  const missingRequired = scored.missingRequired ?? [];
  const missingLen = missingRequired.length;
  const requiredQs = (businessKnowledge?.qualifyingQuestions || []).filter(
    (q) => q?.question?.trim() && (q.required ?? true) && (q as { enabled?: boolean }).enabled !== false,
  );
  const qualifyingGuess = requiredQs.length > 0 && missingLen > 1;
  const verifiedBookingUrl = String(params.verifiedBookingUrl || "").trim();
  const safeBookingCta =
    structuredBooking &&
    grounded &&
    isSafeStructuredBookingCta(suggestion, verifiedBookingUrl);

  const resolveConfidence = (opts?: { bypassLowModel?: boolean }):
    | { ok: true; confidence: number; source: AutoSendConfidenceSource }
    | { ok: false; reason: string; source: AutoSendConfidenceSource } => {
    if (modelProvided) {
      if (!opts?.bypassLowModel && params.confidence < minConfidence) {
        return { ok: false, reason: "low_confidence", source: "model" };
      }
      return { ok: true, confidence: params.confidence, source: "model" };
    }
    const mayDefault =
      webchat &&
      !isCasualWebchatGreeting(lastInbound) &&
      ((knowledgeQuestion && grounded) ||
        (structuredBooking && grounded) ||
        (explicitUserChoice &&
          !structuredBooking &&
          (grounded || !draftHasCurrencyAmount(suggestion))));
    if (!mayDefault) {
      return { ok: false, reason: "confidence_not_provided", source: "missing" };
    }
    return { ok: true, confidence: WEBCHAT_AUTO_SEND_MIN_CONFIDENCE, source: "defaulted" };
  };

  if (forceBypass) {
    const suggestionOk = finishSuggestionChecks();
    if (!suggestionOk.ok) {
      return none(suggestionOk.reason, inboundCount, missingLen);
    }
    const conf = resolveConfidence();
    if (!conf.ok) {
      return none(conf.reason, inboundCount, missingLen, conf.source, missingRequired);
    }
    return {
      allowed: true,
      reason: "followup_force_bypass",
      missingRequiredLen: missingLen,
      inboundCount,
      confidenceSource: conf.source,
      missingRequired,
      ...pageActionDiagnostics,
    };
  }

  if (!strongIntent && webchat && isCasualWebchatGreeting(lastInbound)) {
    const suggestionOk = finishSuggestionChecks();
    if (!suggestionOk.ok) {
      return none(suggestionOk.reason, inboundCount, missingLen);
    }
    const unsafe = unsafeWebchatGreetingWelcomeReason(suggestion);
    if (unsafe) {
      return none(`greeting_welcome_unsafe:${unsafe}`, inboundCount, missingLen);
    }
    return {
      allowed: true,
      reason: "ok_greeting_welcome",
      missingRequiredLen: missingLen,
      inboundCount,
      confidenceSource: modelProvided ? "model" : "defaulted",
      missingRequired,
      ...pageActionDiagnostics,
    };
  }

  if (!strongIntent && !structuredBooking && !explicitUserChoice && inboundCount < 2 && !knowledgeQuestion) {
    return none("conversation_too_short", inboundCount, missingLen);
  }

  if (!strongIntent && !structuredBooking && !explicitUserChoice && GREETING_ONLY.test(lastInbound)) {
    return none("last_message_greeting_only", inboundCount, missingLen);
  }

  const signals = getStageSignals(msgs, businessKnowledge);
  const intentClear =
    structuredBooking ||
    explicitUserChoice ||
    signals.strongIntent ||
    signals.viewingIntent ||
    lastInbound.length >= 25 ||
    /\?/.test(lastInbound);

  if (!strongIntent && !intentClear) {
    return none("intent_unclear", inboundCount, missingLen);
  }

  const suggestionOk = finishSuggestionChecks();
  if (!suggestionOk.ok) {
    return none(suggestionOk.reason, inboundCount, missingLen);
  }

  if (!strongIntent) {
    const conf = resolveConfidence();
    if (!conf.ok) {
      return none(conf.reason, inboundCount, missingLen, conf.source);
    }
    if ((knowledgeQuestion || explicitUserChoice) && !grounded && draftHasCurrencyAmount(suggestion)) {
      return none("ungrounded_pricing", inboundCount, missingLen, conf.source);
    }
    if (
      qualifyingGuess &&
      !safeBookingCta &&
      !knowledgeQuestion &&
      !(explicitUserChoice && !structuredBooking)
    ) {
      return none("missing_required_gt_one", inboundCount, missingLen, conf.source, missingRequired);
    }
    return {
      allowed: true,
      reason: structuredBooking
        ? "ok_structured_booking"
        : explicitUserChoice
          ? "ok_validated_page_action"
          : knowledgeQuestion
            ? "ok_knowledge_question"
            : "ok",
      missingRequiredLen: missingLen,
      inboundCount,
      confidenceSource: conf.source,
      missingRequired,
      ...pageActionDiagnostics,
    };
  }

  const conf = resolveConfidence({ bypassLowModel: true });
  if (!conf.ok) {
    return none(conf.reason, inboundCount, missingLen, conf.source);
  }
  if ((knowledgeQuestion || explicitUserChoice) && !grounded && draftHasCurrencyAmount(suggestion)) {
    return none("ungrounded_pricing", inboundCount, missingLen, conf.source);
  }

  const bypassed: string[] = [];
  if (conf.source === "model" && params.confidence < minConfidence) bypassed.push("low_confidence");
  if (qualifyingGuess) bypassed.push("missing_required_gt_one");
  if (inboundCount < 2) bypassed.push("conversation_too_short");
  if (!intentClear) bypassed.push("intent_unclear");

  console.info("[AI-AUTO] override: strong intent detected", {
    bypassed: bypassed.length ? bypassed : undefined,
    inboundCount,
    confidenceSource: conf.source,
    textLen: lastInbound.length,
    textRedacted: true,
  });

  return {
    allowed: true,
    reason: "strong_intent_override",
    missingRequiredLen: missingLen,
    inboundCount,
    confidenceSource: conf.source,
    missingRequired,
    ...pageActionDiagnostics,
  };
}

/** Map `ai_business_knowledge` row → scoring input (same shape as client Copilot). */
export function businessKnowledgeFromAiRecord(k: Record<string, unknown> | undefined | null): BusinessKnowledgeForScoring | undefined {
  if (!k) return undefined;
  const qqRaw = k.qualifyingQuestions;
  const qq = Array.isArray(qqRaw) ? qqRaw : [];
  return {
    industry: (k.industry as string) || undefined,
    salesGoals: (k.salesGoals as string) || undefined,
    servicesProducts: (k.servicesProducts as string) || undefined,
    qualifyingQuestions: qq
      .filter((x) => x && typeof (x as any).question === "string" && (x as any).enabled !== false)
      .map((x: any) => ({
        key: x.key,
        label: x.label,
        question: String(x.question || ""),
        required: x.required,
      })),
  };
}
