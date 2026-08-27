/**
 * One automatic verification reminder for public website signups still unverified
 * 24 hours after the latest successfully accepted verification email
 * (fallback: account creation). Does not start the trial.
 */
import { isExcludedFromActivationEmails, isShopifyLinkedAccount } from "./activationEmailEligibility";
import { isRetiredCrmDemoEmail } from "./retiredCrmDemoAgent";
import { isShopifySyntheticMerchantEmail } from "./shopifyBilling";

export const VERIFICATION_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

export const VERIFICATION_REMINDER_ROLLOUT_FEATURE_KEY = "verification_reminder";

export const BLOCKED_VERIFICATION_DELIVERY_EVENTS = new Set([
  "bounced",
  "complained",
  "blocked",
  "suppressed",
  "failed",
]);

export type VerificationReminderSkipReason =
  | "already_sent"
  | "already_verified"
  | "deletion_requested"
  | "shopify_or_synthetic"
  | "excluded_email"
  | "too_soon"
  | "delivery_suppressed"
  | "missing_email"
  | "missing_created_at"
  | "pre_rollout"
  | "rollout_not_ready";

export type VerificationReminderDecision =
  | { send: true }
  | { send: false; reason: VerificationReminderSkipReason };

export type VerificationReminderUser = {
  email?: string | null;
  name?: string | null;
  createdAt?: Date | string | null;
  emailVerifiedAt?: Date | string | null;
  verificationReminderSentAt?: Date | string | null;
  verificationEmailLastSentAt?: Date | string | null;
  deletionRequestedAt?: Date | string | null;
  shopifyShop?: string | null;
  shopifyInstalledAt?: Date | string | null;
};

export type VerificationReminderEligibilityOptions = {
  /** Stored app_feature_rollouts.active_after for verification_reminder. */
  rolloutActiveAfter?: Date | string | null;
  /** Automatic cron: true (default). Guarded legacy recovery: false. */
  requireRollout?: boolean;
  /** Automatic cron: true (default). Guarded legacy recovery: false. */
  requireDelay?: boolean;
};

export function isBlockedVerificationDeliveryEvent(
  lastEvent: string | null | undefined,
): boolean {
  if (!lastEvent) return false;
  return BLOCKED_VERIFICATION_DELIVERY_EVENTS.has(String(lastEvent).trim().toLowerCase());
}

function accountIsVerified(user: { emailVerifiedAt?: Date | string | null }): boolean {
  if (user.emailVerifiedAt === undefined) return true;
  return user.emailVerifiedAt != null && String(user.emailVerifiedAt).length > 0;
}

export function toVerificationReminderDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Automatic reminder clock: latest successfully accepted verification email,
 * or account creation if none was ever accepted.
 */
export function verificationReminderTimingAnchor(
  user: Pick<VerificationReminderUser, "verificationEmailLastSentAt" | "createdAt">,
): Date | null {
  return (
    toVerificationReminderDate(user.verificationEmailLastSentAt) ??
    toVerificationReminderDate(user.createdAt)
  );
}

export function parseVerificationReminderRolloutActiveAfter(
  value: Date | string | null | undefined,
): Date | null {
  return toVerificationReminderDate(value);
}

export function isPostVerificationReminderRollout(
  createdAt: Date | string | null | undefined,
  activeAfter: Date | string | null | undefined,
): boolean {
  const created = toVerificationReminderDate(createdAt);
  const boundary = parseVerificationReminderRolloutActiveAfter(activeAfter);
  if (!created || !boundary) return false;
  return created.getTime() > boundary.getTime();
}

/**
 * Occupancy claim for send-once under concurrency. Only one caller can claim a
 * null reminder slot; the loser must not send.
 */
export function tryClaimVerificationReminderSlot(
  currentSentAt: Date | string | null | undefined,
  now: Date,
): { claimed: boolean; nextSentAt: Date } {
  if (currentSentAt) {
    const existing = toVerificationReminderDate(currentSentAt);
    return { claimed: false, nextSentAt: existing ?? now };
  }
  return { claimed: true, nextSentAt: now };
}

/**
 * Whether a pending public signup should receive the one-time 24h reminder.
 * `lastDeliveryEvent` is the latest Resend last_event for this recipient, if known.
 *
 * Automatic reminders require a valid durable rollout boundary and created_at
 * strictly after it. Missing/invalid boundary → fail-closed (`rollout_not_ready`).
 */
export function shouldSendVerificationReminder(
  user: VerificationReminderUser,
  now: Date = new Date(),
  lastDeliveryEvent?: string | null,
  options?: VerificationReminderEligibilityOptions,
): VerificationReminderDecision {
  const requireRollout = options?.requireRollout !== false;
  const requireDelay = options?.requireDelay !== false;

  if (user.verificationReminderSentAt) {
    return { send: false, reason: "already_sent" };
  }
  if (accountIsVerified(user)) {
    return { send: false, reason: "already_verified" };
  }
  if (user.deletionRequestedAt) {
    return { send: false, reason: "deletion_requested" };
  }
  if (isShopifyLinkedAccount(user) || isShopifySyntheticMerchantEmail(user.email)) {
    return { send: false, reason: "shopify_or_synthetic" };
  }
  if (!user.email) {
    return { send: false, reason: "missing_email" };
  }
  if (isExcludedFromActivationEmails(user.email) || isRetiredCrmDemoEmail(user.email)) {
    return { send: false, reason: "excluded_email" };
  }
  const createdAt = toVerificationReminderDate(user.createdAt);
  if (!createdAt) {
    return { send: false, reason: "missing_created_at" };
  }
  if (requireRollout) {
    const boundary = parseVerificationReminderRolloutActiveAfter(options?.rolloutActiveAfter);
    if (!boundary) {
      return { send: false, reason: "rollout_not_ready" };
    }
    if (!isPostVerificationReminderRollout(createdAt, boundary)) {
      return { send: false, reason: "pre_rollout" };
    }
  }
  if (requireDelay) {
    const anchor = verificationReminderTimingAnchor(user);
    if (!anchor) {
      return { send: false, reason: "missing_created_at" };
    }
    if (now.getTime() - anchor.getTime() < VERIFICATION_REMINDER_DELAY_MS) {
      return { send: false, reason: "too_soon" };
    }
  }
  if (isBlockedVerificationDeliveryEvent(lastDeliveryEvent)) {
    return { send: false, reason: "delivery_suppressed" };
  }
  return { send: true };
}

/** Recheck immediately before send: abort if verified, reminded, deleted, Shopify, or suppressed. */
export function verificationReminderRaceAbort(
  user: VerificationReminderUser,
  lastDeliveryEvent?: string | null,
): VerificationReminderSkipReason | null {
  if (accountIsVerified(user)) return "already_verified";
  if (user.verificationReminderSentAt) return "already_sent";
  if (user.deletionRequestedAt) return "deletion_requested";
  if (isShopifyLinkedAccount(user) || isShopifySyntheticMerchantEmail(user.email)) {
    return "shopify_or_synthetic";
  }
  if (!user.email) return "missing_email";
  if (isBlockedVerificationDeliveryEvent(lastDeliveryEvent)) return "delivery_suppressed";
  return null;
}

export type ResendListEmail = {
  id?: string;
  to?: string | string[] | null;
  last_event?: string | null;
  created_at?: string | null;
};

/** Newest matching Resend row for this recipient. Unknown / missing → null (not suppressed). */
export function pickLatestResendLastEventForRecipient(
  emails: ResendListEmail[],
  recipient: string,
): string | null {
  const want = String(recipient || "").trim().toLowerCase();
  if (!want) return null;
  const matches = emails.filter((row) => {
    const to = Array.isArray(row.to) ? row.to : row.to ? [row.to] : [];
    return to.some((addr) => String(addr || "").trim().toLowerCase() === want);
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta;
  });
  const event = matches[0]?.last_event;
  return event ? String(event) : null;
}

export function errorIndicatesSuppressedDelivery(error: string | null | undefined): boolean {
  if (!error) return false;
  const s = String(error).toLowerCase();
  return ["bounced", "complained", "blocked", "suppressed"].some((key) => s.includes(key));
}
