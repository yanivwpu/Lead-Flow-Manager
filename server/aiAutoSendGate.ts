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

export function toConversationMessages(history: ChatTurn[]) {
  return history.map((m) => ({
    direction: (m.role === "user" ? "inbound" : "outbound") as "inbound" | "outbound",
    content: m.content || "",
  }));
}

const GREETING_ONLY =
  /^(hi|hello|hey|yo|sup|hola|good morning|good afternoon|good evening|gm|gn|howdy|greetings|good day)[\s!?.]*$/i;

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
 */
export function evaluateFullAutoSend(params: {
  businessMode: "off" | "suggest" | "auto";
  conversationHistory: ChatTurn[];
  suggestion: string;
  confidence: number;
  businessKnowledge?: BusinessKnowledgeForScoring;
}): { allowed: boolean; reason: string; missingRequiredLen: number; inboundCount: number } {
  const { businessMode, conversationHistory, suggestion, confidence, businessKnowledge } = params;

  if (businessMode !== "auto") {
    return { allowed: false, reason: "business_mode_not_auto", missingRequiredLen: 0, inboundCount: 0 };
  }

  const msgs = toConversationMessages(conversationHistory);
  const inboundMsgs = msgs.filter((m) => m.direction === "inbound");
  const inboundCount = inboundMsgs.length;

  const joinedInbound = inboundMsgs.map((m) => m.content || "").join("\n");
  const lastInbound = inboundMsgs[inboundMsgs.length - 1]?.content?.trim() || "";

  if (!lastInbound) {
    return { allowed: false, reason: "empty_last_inbound", missingRequiredLen: 0, inboundCount };
  }

  if (STOP_RE.test(joinedInbound) || COMPLAINT_RE.test(joinedInbound)) {
    return { allowed: false, reason: "disqualifier_intent", missingRequiredLen: 0, inboundCount };
  }

  const forceBypass = shouldBypassAutoGuardsForInbound({
    conversationHistory,
    lastInbound,
  });

  if (forceBypass) {
    const trimmedSuggestion = suggestion.trim();
    if (!trimmedSuggestion || trimmedSuggestion.length <= 5) {
      return { allowed: false, reason: "missing_or_trivial_suggestion", missingRequiredLen: 0, inboundCount };
    }
    if (PLACEHOLDER_RE.test(trimmedSuggestion)) {
      return { allowed: false, reason: "suggestion_contains_placeholder", missingRequiredLen: 0, inboundCount };
    }
    return { allowed: true, reason: "followup_force_bypass", missingRequiredLen: 0, inboundCount };
  }

  const strongIntent = detectStrongAutoIntent(joinedInbound, lastInbound);

  if (!strongIntent && inboundCount < 2) {
    return { allowed: false, reason: "conversation_too_short", missingRequiredLen: 0, inboundCount };
  }

  if (!strongIntent && GREETING_ONLY.test(lastInbound)) {
    return { allowed: false, reason: "last_message_greeting_only", missingRequiredLen: 0, inboundCount };
  }

  const signals = getStageSignals(msgs, businessKnowledge);
  const intentClear =
    signals.strongIntent ||
    signals.viewingIntent ||
    lastInbound.length >= 25 ||
    /\?/.test(lastInbound);

  if (!strongIntent && !intentClear) {
    return { allowed: false, reason: "intent_unclear", missingRequiredLen: 0, inboundCount };
  }

  const trimmedSuggestion = suggestion.trim();
  if (!trimmedSuggestion || trimmedSuggestion.length <= 5) {
    return { allowed: false, reason: "missing_or_trivial_suggestion", missingRequiredLen: 0, inboundCount };
  }

  if (PLACEHOLDER_RE.test(trimmedSuggestion)) {
    return { allowed: false, reason: "suggestion_contains_placeholder", missingRequiredLen: 0, inboundCount };
  }

  const scored = scoreLead(msgs, businessKnowledge);
  const missingLen = scored.missingRequired?.length ?? 0;
  const requiredQs = (businessKnowledge?.qualifyingQuestions || []).filter(
    (q) => q?.question?.trim() && (q.required ?? true),
  );

  // Strict path (no override)
  if (!strongIntent) {
    if (confidence < 0.75) {
      return { allowed: false, reason: "low_confidence", missingRequiredLen: missingLen, inboundCount };
    }
    if (requiredQs.length > 0 && missingLen > 1) {
      return { allowed: false, reason: "missing_required_gt_one", missingRequiredLen: missingLen, inboundCount };
    }
    return { allowed: true, reason: "ok", missingRequiredLen: missingLen, inboundCount };
  }

  // Strong intent: relax confidence & qualifying questions (usable suggestion + no placeholders already enforced)
  const bypassed: string[] = [];
  if (confidence < 0.75) bypassed.push("low_confidence");
  if (requiredQs.length > 0 && missingLen > 1) bypassed.push("missing_required_gt_one");
  if (inboundCount < 2) bypassed.push("conversation_too_short");
  if (!intentClear) bypassed.push("intent_unclear");

  console.info("[AI-AUTO] override: strong intent detected", {
    bypassed: bypassed.length ? bypassed : undefined,
    inboundCount,
    confidence,
    preview: lastInbound.slice(0, 120),
  });

  return { allowed: true, reason: "strong_intent_override", missingRequiredLen: missingLen, inboundCount };
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
      .filter((x) => x && typeof (x as any).question === "string")
      .map((x: any) => ({
        key: x.key,
        label: x.label,
        question: String(x.question || ""),
        required: x.required,
      })),
  };
}
