import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  errorIndicatesSuppressedDelivery,
  pickLatestResendLastEventForRecipient,
  shouldSendVerificationReminder,
  VERIFICATION_REMINDER_DELAY_MS,
  type ResendListEmail,
  type VerificationReminderEligibilityOptions,
  type VerificationReminderSkipReason,
} from "@shared/verificationReminderEligibility";
import { maskEmailForLogs, sendEmailVerificationReminderEmail } from "./email";
import {
  abandonIssuedVerificationToken,
  insertEmailVerificationToken,
  markVerificationEmailAccepted,
} from "./emailVerification";
import { loadVerificationReminderRolloutActiveAfter } from "./verificationReminderRollout";

const RESEND_LIST_PAGE_LIMIT = 100;
const RESEND_LIST_MAX_PAGES = 5;

export type VerificationReminderLookupDeliveryEvent = (
  email: string,
) => Promise<string | null | undefined>;

export type VerificationReminderJobResult = {
  sent: number;
  skipped: number;
  errors: number;
};

type ReminderCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: Date | null;
  emailVerifiedAt: Date | null;
  verificationReminderSentAt: Date | null;
  verificationEmailLastSentAt: Date | null;
  deletionRequestedAt: Date | null;
  shopifyShop: string | null;
  shopifyInstalledAt: Date | null;
};

function reminderSelect() {
  return {
    id: users.id,
    name: users.name,
    email: users.email,
    createdAt: users.createdAt,
    emailVerifiedAt: users.emailVerifiedAt,
    verificationReminderSentAt: users.verificationReminderSentAt,
    verificationEmailLastSentAt: users.verificationEmailLastSentAt,
    deletionRequestedAt: users.deletionRequestedAt,
    shopifyShop: users.shopifyShop,
    shopifyInstalledAt: users.shopifyInstalledAt,
  };
}

/**
 * Latest Resend last_event for this recipient, if found in recent sends.
 * Missing API / errors / no match → null (fail-open: not treated as suppressed).
 */
export async function lookupLatestResendDeliveryEvent(
  email: string,
): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !email) return null;

  try {
    const collected: ResendListEmail[] = [];
    let after: string | undefined;

    for (let page = 0; page < RESEND_LIST_MAX_PAGES; page++) {
      const url = new URL("https://api.resend.com/emails");
      url.searchParams.set("limit", String(RESEND_LIST_PAGE_LIMIT));
      if (after) url.searchParams.set("after", after);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        console.warn(
          `[Cron] Resend email list lookup HTTP ${response.status}; treating delivery status as unknown`,
        );
        return null;
      }

      const json = (await response.json()) as {
        data?: ResendListEmail[];
        has_more?: boolean;
      };
      const data = Array.isArray(json.data) ? json.data : [];
      collected.push(...data);

      const hit = pickLatestResendLastEventForRecipient(collected, email);
      if (hit) return hit;

      if (!json.has_more || data.length === 0) break;
      const lastId = data[data.length - 1]?.id;
      if (!lastId) break;
      after = lastId;
    }

    return pickLatestResendLastEventForRecipient(collected, email);
  } catch (err) {
    console.warn(
      "[Cron] Resend delivery lookup failed; treating delivery status as unknown:",
      (err as Error)?.message,
    );
    return null;
  }
}

async function loadUserForReminder(userId: string): Promise<ReminderCandidate | null> {
  const rows = await db.select(reminderSelect()).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export type SendVerificationReminderOptions = {
  now?: Date;
  lookupDeliveryEvent?: VerificationReminderLookupDeliveryEvent;
  rolloutActiveAfter?: Date | null;
  requireRollout?: boolean;
  requireDelay?: boolean;
};

/**
 * Send the one-time verification reminder for a single account.
 * Rechecks eligibility immediately before send. Does not start the trial.
 * Timestamps are written only after Resend accepts. Two concurrent workers
 * serialize on pg_advisory_xact_lock so only one send can proceed.
 */
export async function sendVerificationReminderForUser(
  userId: string,
  options?: SendVerificationReminderOptions,
): Promise<{ sent: boolean; reason?: VerificationReminderSkipReason | "send_failed" | "race_verified" }> {
  const now = options?.now ?? new Date();
  const lookup = options?.lookupDeliveryEvent ?? lookupLatestResendDeliveryEvent;
  const eligibilityOptions: VerificationReminderEligibilityOptions = {
    rolloutActiveAfter: options?.rolloutActiveAfter,
    requireRollout: options?.requireRollout,
    requireDelay: options?.requireDelay,
  };

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`verification_reminder:${userId}`}))`,
    );

    const user = await loadUserForReminder(userId);
    if (!user) {
      return { sent: false, reason: "missing_email" as const };
    }

    const lastEvent = user.email ? await lookup(user.email) : null;
    const decision = shouldSendVerificationReminder(user, now, lastEvent, eligibilityOptions);
    if (!decision.send) {
      return { sent: false, reason: decision.reason };
    }
    if (!user.email) {
      return { sent: false, reason: "missing_email" as const };
    }

    const issued = await insertEmailVerificationToken(user.id);

    const fresh = await loadUserForReminder(user.id);
    const lastEventFresh = fresh?.email ? await lookup(fresh.email) : lastEvent;
    const freshDecision = fresh
      ? shouldSendVerificationReminder(fresh, now, lastEventFresh, eligibilityOptions)
      : { send: false as const, reason: "missing_email" as const };
    if (!freshDecision.send) {
      await abandonIssuedVerificationToken(issued.tokenId);
      console.log(
        `[Cron] Verification reminder aborted before send for ${maskEmailForLogs(user.email)}: ${freshDecision.reason}`,
      );
      return { sent: false, reason: freshDecision.reason };
    }
    if (!fresh?.email) {
      await abandonIssuedVerificationToken(issued.tokenId);
      return { sent: false, reason: "missing_email" as const };
    }

    const ok = await sendEmailVerificationReminderEmail(fresh.name || "there", fresh.email, issued.rawToken);
    if (!ok) {
      await abandonIssuedVerificationToken(issued.tokenId);
      return { sent: false, reason: "send_failed" as const };
    }

    await markVerificationEmailAccepted(fresh.id, issued.tokenId);
    await tx
      .update(users)
      .set({ verificationReminderSentAt: new Date() })
      .where(
        and(eq(users.id, fresh.id), isNull(users.verificationReminderSentAt)),
      );

    return { sent: true };
  });
}

/**
 * Hourly send-once reminder for public website accounts created after the durable
 * rollout boundary, still unverified, 24h after the latest accepted verification
 * email (fallback: created_at). Missing/invalid boundary fail-closes.
 * Does not start the 14-day trial.
 */
export async function runVerificationReminders(options?: {
  now?: Date;
  lookupDeliveryEvent?: VerificationReminderLookupDeliveryEvent;
  rolloutActiveAfter?: Date | null;
}): Promise<VerificationReminderJobResult> {
  console.log("[Cron] Starting verification-reminder email job...");

  const now = options?.now ?? new Date();
  const lookup = options?.lookupDeliveryEvent ?? lookupLatestResendDeliveryEvent;
  const boundary =
    options?.rolloutActiveAfter !== undefined
      ? options.rolloutActiveAfter
      : await loadVerificationReminderRolloutActiveAfter();

  if (!boundary) {
    console.error(
      "[Cron] Verification reminders fail-closed: rollout boundary missing or invalid",
    );
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const delayBefore = new Date(now.getTime() - VERIFICATION_REMINDER_DELAY_MS);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const candidates = await db
      .select(reminderSelect())
      .from(users)
      .where(
        and(
          isNull(users.emailVerifiedAt),
          isNull(users.verificationReminderSentAt),
          isNull(users.deletionRequestedAt),
          isNull(users.shopifyShop),
          isNull(users.shopifyInstalledAt),
          gt(users.createdAt, boundary),
          sql`COALESCE(${users.verificationEmailLastSentAt}, ${users.createdAt}) <= ${delayBefore}`,
          sql`lower(${users.email}) not like '%@shopify.whachatcrm.com'`,
        ),
      );

    console.log(`[Cron] Checking ${candidates.length} user(s) for verification reminder`);

    for (const user of candidates) {
      try {
        const result = await sendVerificationReminderForUser(user.id, {
          now,
          lookupDeliveryEvent: lookup,
          rolloutActiveAfter: boundary,
          requireRollout: true,
          requireDelay: true,
        });
        if (result.sent) {
          sent++;
          console.log(
            `[Cron] Sent verification reminder to ${maskEmailForLogs(user.email)}`,
          );
        } else if (result.reason === "send_failed") {
          errors++;
          console.warn(
            `[Cron] Verification reminder not sent for ${maskEmailForLogs(user.email)}; will retry on the next hourly cron`,
          );
        } else {
          skipped++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (errorIndicatesSuppressedDelivery(message)) {
          skipped++;
          console.warn(
            `[Cron] Verification reminder skipped (suppressed) for ${maskEmailForLogs(user.email)}`,
          );
          continue;
        }
        errors++;
        console.error(
          `[Cron] Verification reminder error for ${maskEmailForLogs(user.email)}:`,
          err,
        );
      }
    }

    console.log(
      `[Cron] Verification reminders complete: sent=${sent}, skipped=${skipped}, errors=${errors}`,
    );
    return { sent, skipped, errors };
  } catch (error) {
    console.error("[Cron] Error in verification-reminder email job:", error);
    throw error;
  }
}
