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
  /** Meta / WhatsApp status webhook failure (e.g. 131049) after Graph accepted the send */
  lastDeliveryErrorCode?: string | null;
  lastDeliveryErrorHint?: string | null;
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
    lastDeliveryErrorCode:
      typeof o.lastDeliveryErrorCode === "string" ? o.lastDeliveryErrorCode : null,
    lastDeliveryErrorHint:
      typeof o.lastDeliveryErrorHint === "string" ? o.lastDeliveryErrorHint : null,
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
    lastDeliveryErrorCode: null,
    lastDeliveryErrorHint: null,
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

/** After Meta reports `failed` on an outbound template (webhook), while we were awaiting a reply. */
export function buildReEngagementAfterMetaDeliveryFailure(
  prev: ConversationReEngagement,
  opts: {
    errorCode?: string | number | null;
    userHint: string;
  }
): ConversationReEngagement {
  const code =
    opts.errorCode != null && String(opts.errorCode).trim() !== ""
      ? String(opts.errorCode).trim()
      : null;
  return {
    ...prev,
    state: "failed",
    lastTemplateStatus: "failed",
    lastDeliveryErrorCode: code,
    lastDeliveryErrorHint: opts.userHint,
  };
}

export type RetargetReEngagementApiFields = {
  reEngagementState: ReEngagementState;
  lastTemplateSentAt: string | null;
  lastTemplateName: string | null;
  lastTemplateStatus: string | null;
  lastDeliveryErrorCode: string | null;
  lastDeliveryErrorHint: string | null;
  replyWindowReopenedAt: string | null;
};

/** Template display name from persisted `template_variables` (Meta send) or leading `Template:` line in `content`. */
export function retargetTemplateNameFromOutboundMessage(row: {
  templateVariables?: unknown;
  content?: string | null;
}): string | null {
  const tv = row.templateVariables;
  if (tv && typeof tv === "object" && !Array.isArray(tv)) {
    const n = (tv as Record<string, unknown>).templateName;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  const c = (row.content || "").trim();
  const m = /^Template:\s*(.+)/i.exec(c);
  if (m?.[1]) return m[1].split("\n")[0].trim();
  return null;
}

/** User-facing hint for re-engagement list / repair — shared so GET reconcile matches inbox copy (incl. 131049). */
export function reEngagementUserHintFromMessageError(opts: {
  errorCode?: string | null;
  errorMessage?: string | null;
}): string {
  const code = opts.errorCode != null ? String(opts.errorCode).trim() : "";
  if (code === "131049") {
    return "WhatsApp blocked this send due to Meta engagement limits. Try another approved template or wait before retrying.";
  }
  const em = (opts.errorMessage || "").trim();
  if (em) {
    const first = em.split("\n")[0].trim();
    return first.length > 600 ? `${first.slice(0, 597)}…` : first;
  }
  return code
    ? `WhatsApp reported error code ${code}. Check template approval and recipient eligibility.`
    : "WhatsApp delivery failed for the last template send.";
}

/**
 * When the **latest** outbound WhatsApp template message is `failed`, the retargeting API must reflect delivery
 * failure even if `conversations.re_engagement` is stale (pre-webhook-fix or `{}`).
 */
export function reconcileRetargetApiFieldsWithLatestOutboundTemplate(
  channel: string,
  reEngagementRaw: unknown,
  latest: {
    status: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null
): RetargetReEngagementApiFields {
  const base = deriveRetargetReEngagementApiFields(channel, reEngagementRaw);
  if ((channel || "").toLowerCase() !== "whatsapp" || !latest) return base;
  const st = String(latest.status || "").toLowerCase();
  if (st !== "failed") return base;
  const code =
    latest.errorCode != null && String(latest.errorCode).trim() !== ""
      ? String(latest.errorCode).trim()
      : null;
  const hint = reEngagementUserHintFromMessageError({
    errorCode: code,
    errorMessage: latest.errorMessage ?? null,
  });
  return {
    ...base,
    reEngagementState: "failed",
    lastTemplateStatus: "failed",
    lastDeliveryErrorCode: code ?? base.lastDeliveryErrorCode,
    lastDeliveryErrorHint: hint || base.lastDeliveryErrorHint,
  };
}

/** True when we should persist `re_engagement` from the latest failed outbound template row (stale or missing). */
export function shouldRepairReEngagementJsonFromLatestFailedTemplate(
  storedRaw: unknown,
  latest: { status: string; errorCode?: string | null; errorMessage?: string | null } | null
): boolean {
  if (!latest || String(latest.status || "").toLowerCase() !== "failed") return false;
  const parsed = parseConversationReEngagement(storedRaw);
  if (parsed?.state === "blocked") return false;
  if (!parsed) return true;
  if (parsed.state === "template_sent_awaiting_reply" && parsed.lastTemplateStatus === "sent") return true;
  if (parsed.lastTemplateStatus !== "failed" && parsed.state !== "failed") return true;
  const msgCode = latest.errorCode != null ? String(latest.errorCode).trim() : "";
  const storedCode = (parsed.lastDeliveryErrorCode || "").trim();
  if (msgCode && (!storedCode || storedCode !== msgCode)) return true;
  const hint = (parsed.lastDeliveryErrorHint || "").trim();
  const msgHint = reEngagementUserHintFromMessageError({
    errorCode: latest.errorCode ?? null,
    errorMessage: latest.errorMessage ?? null,
  });
  if (!hint && msgHint) return true;
  return false;
}

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
    lastDeliveryErrorCode: null,
    lastDeliveryErrorHint: null,
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
    lastDeliveryErrorCode: parsed.lastDeliveryErrorCode ?? null,
    lastDeliveryErrorHint: parsed.lastDeliveryErrorHint ?? null,
    replyWindowReopenedAt: parsed.replyWindowReopenedAt ?? null,
  };
}

export function isResendCoolingDown(lastTemplateSentAt: string | null | undefined): boolean {
  if (!lastTemplateSentAt) return false;
  const t = new Date(lastTemplateSentAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < RE_ENGAGEMENT_RESEND_COOLDOWN_MS;
}
