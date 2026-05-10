/**
 * Re-engagement (CRM follow-up) state stored on `conversations.re_engagement` (jsonb).
 * Not for delivery receipts — use message status + webhooks for delivered/read.
 * Manual sends first; `campaignEnrollmentId` / `scheduledSendAt` reserved for automation.
 */

export const RE_ENGAGEMENT_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

export type ReEngagementState =
  | "waiting_template_send"
  | "template_sent_awaiting_reply"
  | "reply_window_reopened"
  | "failed"
  | "blocked";

export type ReEngagementLastTemplateStatus = "sent" | "failed";

export type ConversationReEngagement = {
  state: ReEngagementState;
  lastTemplateSentAt?: string | null;
  lastTemplateName?: string | null;
  lastTemplateStatus?: ReEngagementLastTemplateStatus | null;
  replyWindowReopenedAt?: string | null;
  /** Future: link to preset campaign enrollment */
  campaignEnrollmentId?: string | null;
  /** Future: scheduler */
  scheduledSendAt?: string | null;
};

const STATES: ReEngagementState[] = [
  "waiting_template_send",
  "template_sent_awaiting_reply",
  "reply_window_reopened",
  "failed",
  "blocked",
];

function isReEngagementState(s: string): s is ReEngagementState {
  return (STATES as readonly string[]).includes(s);
}

export function parseConversationReEngagement(raw: unknown): ConversationReEngagement | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const stateRaw = typeof o.state === "string" ? o.state : "";
  if (!stateRaw || !isReEngagementState(stateRaw)) return null;
  return {
    state: stateRaw,
    lastTemplateSentAt: typeof o.lastTemplateSentAt === "string" ? o.lastTemplateSentAt : null,
    lastTemplateName: typeof o.lastTemplateName === "string" ? o.lastTemplateName : null,
    lastTemplateStatus:
      o.lastTemplateStatus === "sent" || o.lastTemplateStatus === "failed"
        ? o.lastTemplateStatus
        : null,
    replyWindowReopenedAt:
      typeof o.replyWindowReopenedAt === "string" ? o.replyWindowReopenedAt : null,
    campaignEnrollmentId:
      typeof o.campaignEnrollmentId === "string" ? o.campaignEnrollmentId : null,
    scheduledSendAt: typeof o.scheduledSendAt === "string" ? o.scheduledSendAt : null,
  };
}

/** Empty DB payload — treated as waiting_template_send for WhatsApp rows. */
export function emptyReEngagementPayload(): Record<string, never> {
  return {};
}

export function buildReEngagementAfterSuccessfulSend(
  templateName: string,
  prev?: ConversationReEngagement | null
): ConversationReEngagement {
  const base = prev ?? null;
  return {
    ...base,
    state: "template_sent_awaiting_reply",
    lastTemplateSentAt: new Date().toISOString(),
    lastTemplateName: templateName,
    lastTemplateStatus: "sent",
    replyWindowReopenedAt: null,
  };
}

export function buildReEngagementAfterFailedSend(
  templateName: string,
  prev?: ConversationReEngagement | null
): ConversationReEngagement {
  const base = prev ?? null;
  return {
    ...base,
    state: "failed",
    lastTemplateName: templateName,
    lastTemplateStatus: "failed",
  };
}

export type RetargetReEngagementApiFields = {
  reEngagementState: ReEngagementState;
  lastTemplateSentAt: string | null;
  lastTemplateName: string | null;
  lastTemplateStatus: string | null;
  replyWindowReopenedAt: string | null;
};

export function deriveRetargetReEngagementApiFields(
  channel: string,
  raw: unknown
): RetargetReEngagementApiFields {
  const ch = (channel || "").toLowerCase();
  const parsed = parseConversationReEngagement(raw);
  const defaults: RetargetReEngagementApiFields = {
    reEngagementState: "waiting_template_send",
    lastTemplateSentAt: null,
    lastTemplateName: null,
    lastTemplateStatus: null,
    replyWindowReopenedAt: null,
  };
  if (ch !== "whatsapp") {
    return defaults;
  }
  if (!parsed) {
    return defaults;
  }
  return {
    reEngagementState: parsed.state,
    lastTemplateSentAt: parsed.lastTemplateSentAt ?? null,
    lastTemplateName: parsed.lastTemplateName ?? null,
    lastTemplateStatus: parsed.lastTemplateStatus ?? null,
    replyWindowReopenedAt: parsed.replyWindowReopenedAt ?? null,
  };
}

export function isResendCoolingDown(lastTemplateSentAt: string | null | undefined): boolean {
  if (!lastTemplateSentAt) return false;
  const t = new Date(lastTemplateSentAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < RE_ENGAGEMENT_RESEND_COOLDOWN_MS;
}
