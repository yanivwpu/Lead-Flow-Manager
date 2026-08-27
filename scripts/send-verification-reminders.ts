/**
 * Guarded one-time verification-reminder recovery for three approved legacy
 * website signups (Fahd omaiche, Jarim, Jailza).
 *
 * DO NOT RUN WITH --execute DURING IMPLEMENTATION.
 * Default is dry-run. Execute requires BOTH:
 *   --execute
 *   VERIFICATION_REMINDER_BACKFILL_EXECUTE=1
 *
 * Resolves recipients by exact full user IDs only. Cross-checks sanitized name,
 * UTC creation date, source, and unverified status. Rechecks immediately before
 * each send. Stamps verification_email_last_sent_at and
 * verification_reminder_sent_at only after Resend accepts.
 *
 * Does not start the 14-day trial. Never prints full emails.
 */
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users } from "../shared/schema";
import {
  LEGACY_RECOVERY_ELIGIBILITY_OPTIONS,
  VERIFICATION_REMINDER_BACKFILL_EXECUTE_ENV,
  parseVerificationReminderBackfillCli,
  powershellVerificationReminderRecoveryDryRunCommand,
  powershellVerificationReminderRecoveryExecuteCommand,
  recoveryAssignmentIsFatal,
  resolveVerificationReminderRecoveryByExactIds,
  sanitizeBackfillRecipient,
  sanitizeBackfillSendResult,
  shouldExecuteVerificationReminderBackfill,
  type VerificationReminderBackfillRow,
} from "../shared/verificationReminderBackfill";
import { lookupLatestResendDeliveryEvent, sendVerificationReminderForUser } from "../server/verificationReminderService";

function dbHostLabel(): string {
  const url = process.env.DATABASE_URL || "";
  try {
    const u = new URL(url.replace(/^postgres:/, "postgresql:"));
    return `${u.hostname}/${(u.pathname || "").replace(/^\//, "")}`;
  } catch {
    return "(unparsed DATABASE_URL)";
  }
}

async function loadUsersByExactIds(userIds: string[]): Promise<VerificationReminderBackfillRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select({
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
    })
    .from(users)
    .where(inArray(users.id, userIds));
}

function printJson(label: string, value: unknown): void {
  console.log(`[verification-reminder-backfill] ${label} ${JSON.stringify(value)}`);
}

async function main(): Promise<void> {
  const parsed = parseVerificationReminderBackfillCli(process.argv.slice(2));
  if (parsed.errors.length > 0) {
    for (const err of parsed.errors) console.error(`[verification-reminder-backfill] ${err}`);
    console.log(
      "[verification-reminder-backfill] PowerShell dry-run: npx tsx scripts/send-verification-reminders.ts --user-id=<uuid> --user-id=<uuid> --user-id=<uuid>",
    );
    console.log(
      `[verification-reminder-backfill] PowerShell execute: $env:VERIFICATION_REMINDER_BACKFILL_EXECUTE="1"; npx tsx scripts/send-verification-reminders.ts --user-id=<uuid> --execute`,
    );
    process.exitCode = 1;
    return;
  }

  const execute = shouldExecuteVerificationReminderBackfill(parsed.execute);
  const mode = execute ? "execute" : "dry-run";

  console.log(`[verification-reminder-backfill] mode=${mode}`);
  console.log(`[verification-reminder-backfill] db=${dbHostLabel()}`);
  console.log(
    "[verification-reminder-backfill] Does not start the 14-day Pro + AI Brain trial. Verification still required.",
  );
  console.log(
    `[verification-reminder-backfill] PowerShell dry-run: ${powershellVerificationReminderRecoveryDryRunCommand(parsed.userIds)}`,
  );
  console.log(
    `[verification-reminder-backfill] PowerShell execute: ${powershellVerificationReminderRecoveryExecuteCommand(parsed.userIds)}`,
  );

  if (parsed.execute && !execute) {
    console.error(
      `[verification-reminder-backfill] Refusing execute: set ${VERIFICATION_REMINDER_BACKFILL_EXECUTE_ENV}=1. Showing dry-run preview.`,
    );
  }

  const now = new Date();
  const rows = await loadUsersByExactIds(parsed.userIds);
  const assignments = resolveVerificationReminderRecoveryByExactIds(parsed.userIds, rows);

  const previews = [];
  for (const assignment of assignments) {
    const lastEvent =
      assignment.user?.email ? await lookupLatestResendDeliveryEvent(assignment.user.email) : null;
    const preview = sanitizeBackfillRecipient(assignment, now, lastEvent);
    previews.push(preview);
    printJson("recipient", preview);
  }

  const fatal = previews.some(recoveryAssignmentIsFatal);
  const eligibleCount = previews.filter((row) => row.eligible).length;
  console.log(
    `[verification-reminder-backfill] eligible=${eligibleCount} matched=${assignments.filter((a) => a.status === "matched").length} fatal=${fatal}`,
  );

  if (fatal) {
    for (const preview of previews) {
      printJson(
        "result",
        sanitizeBackfillSendResult(
          preview,
          preview.eligible ? "aborted" : "skipped",
          preview.eligible ? "batch_aborted" : preview.skipReason,
        ),
      );
    }
    console.error(
      "[verification-reminder-backfill] Refusing to send: an ID is missing, ambiguous, changed, verified, suppressed, deleted, or Shopify-shaped.",
    );
    process.exitCode = 1;
    return;
  }

  if (!execute) {
    for (const preview of previews) {
      printJson(
        "result",
        sanitizeBackfillSendResult(preview, "dry_run", preview.eligible ? "would_send" : preview.skipReason),
      );
    }
    console.log(
      `[verification-reminder-backfill] Dry-run complete. No emails sent. To send after review: ${powershellVerificationReminderRecoveryExecuteCommand(parsed.userIds)}`,
    );
    return;
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const alreadyTried = new Set<string>();

  for (let i = 0; i < assignments.length; i++) {
    const assignment = assignments[i];
    const preview = previews[i];
    if (!preview.eligible || !assignment.user) {
      skipped++;
      printJson("result", sanitizeBackfillSendResult(preview, "skipped", preview.skipReason));
      continue;
    }
    if (alreadyTried.has(assignment.user.id)) {
      skipped++;
      printJson("result", sanitizeBackfillSendResult(preview, "skipped", "already_sent"));
      continue;
    }
    alreadyTried.add(assignment.user.id);
    try {
      const result = await sendVerificationReminderForUser(assignment.user.id, {
        now,
        ...LEGACY_RECOVERY_ELIGIBILITY_OPTIONS,
      });
      if (result.sent) {
        sent++;
        printJson("result", sanitizeBackfillSendResult(preview, "sent", null));
      } else {
        skipped++;
        printJson("result", sanitizeBackfillSendResult(preview, "skipped", result.reason ?? "skipped"));
      }
    } catch (err) {
      errors++;
      printJson(
        "result",
        sanitizeBackfillSendResult(
          preview,
          "error",
          err instanceof Error ? err.message.slice(0, 120) : "send_error",
        ),
      );
    }
  }

  console.log(
    `[verification-reminder-backfill] execute complete: sent=${sent} skipped=${skipped} errors=${errors}`,
  );
}

main().catch((err) => {
  console.error("[verification-reminder-backfill] fatal:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
