/**
 * Pure helpers for Prospect Intelligence outreach lifecycle transitions.
 * Keep side-effect free for unit tests.
 */

import type { ProspectIntelligenceReviewStatus } from "./prospectImport";

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  needs_review: 1,
  approved: 2,
  outreach_sent: 3,
  replied: 4,
  qualified: 5,
  converted: 6,
};

export function prospectReviewStatusRank(status?: string | null): number {
  if (!status) return -1;
  return STATUS_RANK[status] ?? -1;
}

/** Idempotent: do not downgrade past outreach_sent once reached. */
export function canMarkProspectOutreachSent(currentStatus?: string | null): boolean {
  const rank = prospectReviewStatusRank(currentStatus);
  // Must be at least approved (or missing treated as not ready). Also allow re-apply when already outreach_sent.
  if (currentStatus === "outreach_sent" || currentStatus === "replied" || currentStatus === "qualified" || currentStatus === "converted") {
    return true; // idempotent no-op path for send callback
  }
  return currentStatus === "approved";
}

export function shouldPersistFirstOutreachSentAt(currentStatus?: string | null): boolean {
  return currentStatus === "approved" || !currentStatus || currentStatus === "needs_review" || currentStatus === "pending";
}

/** Advance to outreach_sent only from approved; already-sent+ stays put. */
export function nextStatusAfterOutreachSend(
  currentStatus?: string | null,
): ProspectIntelligenceReviewStatus | null {
  if (currentStatus === "approved") return "outreach_sent";
  if (
    currentStatus === "outreach_sent" ||
    currentStatus === "replied" ||
    currentStatus === "qualified" ||
    currentStatus === "converted"
  ) {
    return currentStatus;
  }
  return null;
}

export function nextStatusAfterOutreachReply(
  currentStatus?: string | null,
): ProspectIntelligenceReviewStatus | null {
  if (currentStatus === "outreach_sent") return "replied";
  if (currentStatus === "replied" || currentStatus === "qualified" || currentStatus === "converted") {
    return currentStatus;
  }
  return null;
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
  statusLabel: string;
  showApproveButton: boolean;
  showSendOutreach: boolean;
  showViewThread: boolean;
  emailGateLabel: string | null;
  isApprovedOrLater: boolean;
  isOutreachSentOrLater: boolean;
};

export function resolveProspectOutreachLifecycleUi(input: {
  reviewStatus?: string | null;
  email?: string | null;
  outreachConversationId?: string | null;
  hasValidEmail: boolean;
}): ProspectOutreachLifecycleUi {
  const status = input.reviewStatus || "pending";
  const isOutreachSentOrLater = prospectReviewStatusRank(status) >= prospectReviewStatusRank("outreach_sent");
  const isApprovedExact = status === "approved";
  const isApprovedOrLater = prospectReviewStatusRank(status) >= prospectReviewStatusRank("approved");

  const labels: Record<string, string> = {
    pending: "Pending",
    needs_review: "Needs review",
    approved: "Approved",
    outreach_sent: "Outreach sent",
    replied: "Replied",
    qualified: "Qualified",
    converted: "Converted",
  };

  return {
    statusLabel: labels[status] || status,
    showApproveButton: !isApprovedOrLater || status === "needs_review" || status === "pending",
    showSendOutreach: isApprovedExact && input.hasValidEmail,
    showViewThread: isOutreachSentOrLater && Boolean(input.outreachConversationId),
    emailGateLabel:
      isApprovedExact && !input.hasValidEmail
        ? "Add email to send outreach"
        : !input.hasValidEmail
          ? "Email unavailable"
          : null,
    isApprovedOrLater,
    isOutreachSentOrLater,
  };
}
