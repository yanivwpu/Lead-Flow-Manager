/**
 * Pure helpers for Prospect Intelligence outreach lifecycle.
 * review_status (AI approval) stays separate from outreach_status (sent/replied).
 */

export const PROSPECT_OUTREACH_STATUSES = [
  "not_sent",
  "outreach_sent",
  "replied",
] as const;
export type ProspectOutreachStatus = (typeof PROSPECT_OUTREACH_STATUSES)[number];

/** Combined user-facing Status column priority (highest first). */
export const PROSPECT_DISPLAY_STATUS_PRIORITY = [
  "replied",
  "outreach_sent",
  "approved",
  "needs_review",
  "pending",
] as const;
export type ProspectDisplayStatus = (typeof PROSPECT_DISPLAY_STATUS_PRIORITY)[number];

const DISPLAY_RANK: Record<string, number> = {
  pending: 0,
  needs_review: 1,
  approved: 2,
  outreach_sent: 3,
  replied: 4,
};

export function prospectDisplayStatusRank(status?: string | null): number {
  if (!status) return -1;
  return DISPLAY_RANK[status] ?? -1;
}

/**
 * Combined table Status:
 * Replied > Outreach Sent > Approved > Needs Review > Pending
 */
export function resolveProspectDisplayStatus(input: {
  reviewStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
}): ProspectDisplayStatus {
  const outreach = normalizeOutreachStatus(input.outreachStatus, input);
  if (outreach === "replied") return "replied";
  if (outreach === "outreach_sent") return "outreach_sent";

  const review = String(input.reviewStatus || "pending").toLowerCase();
  if (review === "approved") return "approved";
  if (review === "needs_review") return "needs_review";
  return "pending";
}

export function normalizeOutreachStatus(
  raw?: string | null,
  fallback?: {
    outreachSentAt?: string | Date | null;
    repliedAt?: string | Date | null;
  },
): ProspectOutreachStatus {
  const v = String(raw || "").toLowerCase();
  if (v === "replied") return "replied";
  if (v === "outreach_sent") return "outreach_sent";
  if (v === "not_sent") return "not_sent";
  // Legacy: timestamps without outreach_status column filled yet
  if (fallback?.repliedAt) return "replied";
  if (fallback?.outreachSentAt) return "outreach_sent";
  return "not_sent";
}

export function prospectDisplayStatusLabel(status: ProspectDisplayStatus | string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    needs_review: "Needs Review",
    approved: "Approved",
    outreach_sent: "Outreach Sent",
    replied: "Replied",
  };
  return labels[status] || status;
}

/** Advance to outreach_sent only from not_sent when review is approved. */
export function nextOutreachStatusAfterSend(input: {
  reviewStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
}): ProspectOutreachStatus | null {
  const current = normalizeOutreachStatus(input.outreachStatus, input);
  if (current === "replied") return "replied"; // idempotent
  if (current === "outreach_sent") return "outreach_sent"; // idempotent
  if (String(input.reviewStatus || "").toLowerCase() !== "approved") return null;
  return "outreach_sent";
}

export function canMarkProspectOutreachSent(input: {
  reviewStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
}): boolean {
  return nextOutreachStatusAfterSend(input) != null;
}

export function shouldPersistFirstOutreachSentAt(input: {
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
}): boolean {
  const current = normalizeOutreachStatus(input.outreachStatus, input);
  return current === "not_sent";
}

export function nextOutreachStatusAfterReply(input: {
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
}): ProspectOutreachStatus | null {
  const current = normalizeOutreachStatus(input.outreachStatus, input);
  if (current === "replied") return "replied";
  if (current === "outreach_sent") return "replied";
  return null;
}

/** Whether an inbound message may advance outreach → replied (exact linked thread). */
export function shouldMarkOutreachReplied(input: {
  direction: string;
  conversationId?: string | null;
  linkedOutreachConversationId?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
  fromEmail?: string | null;
  subject?: string | null;
  isCalendarOrInvite?: boolean;
}): { mark: boolean; reason: string } {
  if (String(input.direction).toLowerCase() !== "inbound") {
    return { mark: false, reason: "not_inbound" };
  }
  if (input.isCalendarOrInvite) {
    return { mark: false, reason: "calendar_or_invite" };
  }
  if (isSystemOrBounceEmail({ fromEmail: input.fromEmail, subject: input.subject })) {
    return { mark: false, reason: "system_or_bounce" };
  }
  const linked = String(input.linkedOutreachConversationId || "").trim();
  const conv = String(input.conversationId || "").trim();
  if (!linked || !conv || linked !== conv) {
    return { mark: false, reason: "conversation_mismatch" };
  }
  const next = nextOutreachStatusAfterReply(input);
  if (!next || next !== "replied") {
    return { mark: false, reason: "lifecycle_not_outreach_sent" };
  }
  return { mark: true, reason: "reply_matched" };
}

/** Bounce / DSN / system mail must not count as prospect replies. */
export function isSystemOrBounceEmail(input: {
  fromEmail?: string | null;
  subject?: string | null;
}): boolean {
  const from = String(input.fromEmail || "").toLowerCase();
  const subject = String(input.subject || "").toLowerCase();
  if (!from && !subject) return false;
  if (
    /mailer-daemon@|postmaster@|mail-daemon@|noreply@|no-reply@|bounce@|bounces@/.test(from) ||
    from.includes("mailer-daemon") ||
    from.includes("postmaster")
  ) {
    return true;
  }
  if (
    /delivery status notification|undeliverable|mail delivery failed|returned mail|failure notice|delivery failure|permanent failure/.test(
      subject,
    )
  ) {
    return true;
  }
  return false;
}

export type ProspectOutreachLifecycleUi = {
  displayStatus: ProspectDisplayStatus;
  statusLabel: string;
  showApproveButton: boolean;
  showSendOutreach: boolean;
  showViewThread: boolean;
  emailGateLabel: string | null;
  isApproved: boolean;
  isOutreachSentOrLater: boolean;
  reviewStatus: string;
  outreachStatus: ProspectOutreachStatus;
};

export function resolveProspectOutreachLifecycleUi(input: {
  reviewStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
  email?: string | null;
  outreachConversationId?: string | null;
  hasValidEmail: boolean;
}): ProspectOutreachLifecycleUi {
  const review = String(input.reviewStatus || "pending").toLowerCase();
  const outreach = normalizeOutreachStatus(input.outreachStatus, input);
  const displayStatus = resolveProspectDisplayStatus({
    reviewStatus: review,
    outreachStatus: outreach,
    outreachSentAt: input.outreachSentAt,
    repliedAt: input.repliedAt,
  });
  const isApproved = review === "approved";
  const isOutreachSentOrLater = outreach === "outreach_sent" || outreach === "replied";

  return {
    displayStatus,
    statusLabel: prospectDisplayStatusLabel(displayStatus),
    showApproveButton: review === "pending" || review === "needs_review",
    showSendOutreach: isApproved && !isOutreachSentOrLater && input.hasValidEmail,
    showViewThread: isOutreachSentOrLater && Boolean(input.outreachConversationId),
    emailGateLabel:
      isApproved && !isOutreachSentOrLater && !input.hasValidEmail
        ? "Add email to send outreach"
        : !input.hasValidEmail
          ? "Email unavailable"
          : null,
    isApproved: isApproved || isOutreachSentOrLater,
    isOutreachSentOrLater,
    reviewStatus: review,
    outreachStatus: outreach,
  };
}

/** Safe diagnostic logger payload (no bodies/tokens). */
export function prospectOutreachLifecycleDiag(event: string, data: Record<string, unknown>) {
  return {
    tag: "[ProspectOutreachLifecycle]",
    event,
    ...data,
  };
}
