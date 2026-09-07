import {
  scoreLead,
  getStageSignals,
  type BusinessKnowledgeForScoring,
} from "../client/src/lib/leadScoring";

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

/** Web Chat only: "Hello guys." is still a greeting, not a knowledge question. */
const WEBCHAT_CASUAL_GREETING =
  /^(hi|hello|hey|yo|sup|hola|good morning|good afternoon|good evening|gm|gn|howdy|greetings|good day)([\s,]+[a-z]{1,16}){0,3}[\s!?.]*$/i;

export const AUTO_SEND_MIN_CONFIDENCE = 0.75;
/** Web Chat send threshold when the model actually returned a score. */
export const WEBCHAT_AUTO_SEND_MIN_CONFIDENCE = 0.7;

export type AutoSendConfidenceSource = "model" | "defaulted" | "missing";

export function isWebchatChannel(channel: string | null | undefined): boolean {
  return String(channel || "").trim().toLowerCase() === "webchat";
}

export function isCasualWebchatGreeting(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return GREETING_ONLY.test(t) || WEBCHAT_CASUAL_GREETING.test(t);
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
 * High-intent phrases / bundles — when matched, Full Auto may bypass strict Copilot gates
 * (intent_unclear, low_confidence, conversation length, qualifyingQuestions gaps).
 * Safety disqualifiers (stop/complaint), trivial suggestion, and placeholders still apply.
 */
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
}): {
  allowed: boolean;
  reason: string;
  missingRequiredLen: number;
  inboundCount: number;
  confidenceSource: AutoSendConfidenceSource;
} {
  const { businessMode, conversationHistory, suggestion, businessKnowledge } = params;
  const webchat = isWebchatChannel(params.channel);
  const none = (reason: string, inboundCount = 0, missingRequiredLen = 0, confidenceSource: AutoSendConfidenceSource = "missing") => ({
    allowed: false,
    reason,
    missingRequiredLen,
    inboundCount,
    confidenceSource,
  });

  if (businessMode !== "auto") {
    return none("business_mode_not_auto");
  }

  const msgs = toConversationMessages(conversationHistory);
  const inboundMsgs = msgs.filter((m) => m.direction === "inbound");
  const inboundCount = inboundMsgs.length;

  const joinedInbound = inboundMsgs.map((m) => m.content || "").join("\n");
  const lastInbound = inboundMsgs[inboundMsgs.length - 1]?.content?.trim() || "";

  if (!lastInbound) {
    return none("empty_last_inbound", inboundCount);
  }

  // Checked ahead of every override: a reply that states a price the business never
  // published, or claims not to know something it does, must reach a human first.
  if (params.groundingViolations && params.groundingViolations.length > 0) {
    return none(`grounding_violation:${params.groundingViolations[0]}`, inboundCount);
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
  const missingLen = scored.missingRequired?.length ?? 0;
  const requiredQs = (businessKnowledge?.qualifyingQuestions || []).filter(
    (q) => q?.question?.trim() && (q.required ?? true) && (q as { enabled?: boolean }).enabled !== false,
  );
  const qualifyingGuess = requiredQs.length > 0 && missingLen > 1;

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
      knowledgeQuestion &&
      grounded &&
      !isCasualWebchatGreeting(lastInbound);
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
      return none(conf.reason, inboundCount, missingLen, conf.source);
    }
    return {
      allowed: true,
      reason: "followup_force_bypass",
      missingRequiredLen: missingLen,
      inboundCount,
      confidenceSource: conf.source,
    };
  }

  if (!strongIntent && webchat && isCasualWebchatGreeting(lastInbound)) {
    return none("last_message_greeting_only", inboundCount, missingLen);
  }

  if (!strongIntent && inboundCount < 2 && !knowledgeQuestion) {
    return none("conversation_too_short", inboundCount, missingLen);
  }

  if (!strongIntent && GREETING_ONLY.test(lastInbound)) {
    return none("last_message_greeting_only", inboundCount, missingLen);
  }

  const signals = getStageSignals(msgs, businessKnowledge);
  const intentClear =
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
    if (!knowledgeQuestion && qualifyingGuess) {
      return none("missing_required_gt_one", inboundCount, missingLen, conf.source);
    }
    return {
      allowed: true,
      reason: knowledgeQuestion ? "ok_knowledge_question" : "ok",
      missingRequiredLen: missingLen,
      inboundCount,
      confidenceSource: conf.source,
    };
  }

  const conf = resolveConfidence({ bypassLowModel: true });
  if (!conf.ok) {
    return none(conf.reason, inboundCount, missingLen, conf.source);
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
