import {
  scoreLead,
  getStageSignals,
  type BusinessKnowledgeForScoring,
} from "../client/src/lib/leadScoring";

export type ChatTurn = { role: string; content: string };

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
 * Controlled Full Auto gate — all checks must pass for auto-send.
 * Uses the same lead scoring / signals as Copilot (client leadScoring.ts).
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

  if (inboundCount < 2) {
    return { allowed: false, reason: "conversation_too_short", missingRequiredLen: 0, inboundCount };
  }

  const lastInbound = inboundMsgs[inboundMsgs.length - 1]?.content?.trim() || "";
  if (!lastInbound) {
    return { allowed: false, reason: "empty_last_inbound", missingRequiredLen: 0, inboundCount };
  }
  if (GREETING_ONLY.test(lastInbound)) {
    return { allowed: false, reason: "last_message_greeting_only", missingRequiredLen: 0, inboundCount };
  }

  const joinedInbound = inboundMsgs.map((m) => m.content || "").join("\n");
  if (STOP_RE.test(joinedInbound) || COMPLAINT_RE.test(joinedInbound)) {
    return { allowed: false, reason: "disqualifier_intent", missingRequiredLen: 0, inboundCount };
  }

  const signals = getStageSignals(msgs, businessKnowledge);
  const intentClear =
    signals.strongIntent ||
    signals.viewingIntent ||
    lastInbound.length >= 25 ||
    /\?/.test(lastInbound);
  if (!intentClear) {
    return { allowed: false, reason: "intent_unclear", missingRequiredLen: 0, inboundCount };
  }

  const trimmedSuggestion = suggestion.trim();
  if (!trimmedSuggestion || trimmedSuggestion.length <= 5) {
    return { allowed: false, reason: "missing_or_trivial_suggestion", missingRequiredLen: 0, inboundCount };
  }

  if (confidence < 0.75) {
    return { allowed: false, reason: "low_confidence", missingRequiredLen: 0, inboundCount };
  }

  if (PLACEHOLDER_RE.test(trimmedSuggestion)) {
    return { allowed: false, reason: "suggestion_contains_placeholder", missingRequiredLen: 0, inboundCount };
  }

  const scored = scoreLead(msgs, businessKnowledge);
  const missingLen = scored.missingRequired?.length ?? 0;
  const requiredQs = (businessKnowledge?.qualifyingQuestions || []).filter(
    (q) => q?.question?.trim() && (q.required ?? true),
  );
  if (requiredQs.length > 0 && missingLen > 1) {
    return { allowed: false, reason: "missing_required_gt_one", missingRequiredLen: missingLen, inboundCount };
  }

  return { allowed: true, reason: "ok", missingRequiredLen: missingLen, inboundCount };
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
