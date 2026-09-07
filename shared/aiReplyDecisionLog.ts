/**
 * Privacy-safe AI reply eligibility / outcome logs.
 * Never include message content, contact details, secrets, or visitor identifiers.
 */

export type AiReplyOutcome = "sent" | "drafted" | "skipped" | "owned_by_other_responder";

export type AiReplyDecisionSource = "inbox_suggest_reply" | "webchat_unattended" | "inbox_auto_client";

const OWNED_BY_OTHER = new Set([
  "skip_chatbot_owns",
  "skip_booking",
  "skip_crm_fallback",
  "skip_handoff",
  "chatbot_flow_active",
  "non_text_inbound_chatbot_active",
]);

const FORBIDDEN_KEY =
  /content|message|visitor|phone|email|secret|body|suggestion|contactid|chatid|conversationid|inboundmessageid|webchatid/i;

export function outcomeForReasonCode(
  reasonCode: string,
  opts: { sent?: boolean; hasDraft?: boolean; autoSendAllowed?: boolean } = {},
): AiReplyOutcome {
  if (opts.sent === true || opts.autoSendAllowed === true) return "sent";
  if (OWNED_BY_OTHER.has(reasonCode) || reasonCode.startsWith("skip_chatbot") || reasonCode.startsWith("skip_booking")) {
    return "owned_by_other_responder";
  }
  if (opts.hasDraft === true) return "drafted";
  if (reasonCode === "suggest_only" || reasonCode.startsWith("send_auto:held")) return "drafted";
  return "skipped";
}

export function sanitizeEligibility(
  eligibility: Record<string, boolean | string | number | null | undefined> | undefined,
): Record<string, boolean | string | number | null> {
  const out: Record<string, boolean | string | number | null> = {};
  if (!eligibility) return out;
  for (const [key, value] of Object.entries(eligibility)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (value === undefined) continue;
    if (typeof value === "string" && value.length > 80) {
      out[key] = value.slice(0, 80);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function logAiReplyDecision(entry: {
  source: AiReplyDecisionSource;
  channel: string;
  outcome: AiReplyOutcome;
  reasonCode: string;
  workspaceUserId?: string;
  eligibility?: Record<string, boolean | string | number | null | undefined>;
}): void {
  console.info(
    JSON.stringify({
      tag: "[AiReplyDecision]",
      source: entry.source,
      channel: entry.channel || "unknown",
      outcome: entry.outcome,
      reasonCode: entry.reasonCode,
      workspaceUserId: entry.workspaceUserId,
      eligibility: sanitizeEligibility(entry.eligibility),
    }),
  );
}
