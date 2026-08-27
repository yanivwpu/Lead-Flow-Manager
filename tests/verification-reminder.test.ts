/**
 * 24-hour unverified-signup verification reminder + guarded legacy recovery.
 * Run: npx tsx --test tests/verification-reminder.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMAIL_VERIFICATION_REMINDER_SUBJECT,
  renderEmailVerificationReminderHtml,
} from "../server/email";
import { EMAIL_VERIFICATION_TTL_MS } from "../server/emailVerification";
import {
  dedupeBackfillSendUserIds,
  isExactVerificationReminderUserId,
  maskEmailForBackfill,
  nameMatchesBackfillTarget,
  parseVerificationReminderBackfillCli,
  powershellVerificationReminderRecoveryDryRunCommand,
  powershellVerificationReminderRecoveryExecuteCommand,
  recoveryAssignmentIsFatal,
  resolveVerificationReminderRecoveryByExactIds,
  sanitizeBackfillRecipient,
  sanitizeBackfillSendResult,
  shouldExecuteVerificationReminderBackfill,
  utcCalendarDate,
  VERIFICATION_REMINDER_BACKFILL_EXECUTE_ENV,
  VERIFICATION_REMINDER_RECOVERY_PROFILES,
  verificationReminderBackfillExecuteConfirmed,
  type VerificationReminderBackfillRow,
} from "../shared/verificationReminderBackfill";
import {
  errorIndicatesSuppressedDelivery,
  isBlockedVerificationDeliveryEvent,
  isPostVerificationReminderRollout,
  pickLatestResendLastEventForRecipient,
  shouldSendVerificationReminder,
  tryClaimVerificationReminderSlot,
  verificationReminderRaceAbort,
  verificationReminderTimingAnchor,
  VERIFICATION_REMINDER_DELAY_MS,
  VERIFICATION_REMINDER_ROLLOUT_FEATURE_KEY,
  type VerificationReminderUser,
} from "../shared/verificationReminderEligibility";

const root = process.cwd();
const now = new Date("2026-08-26T23:00:00.000Z");
const POST_ROLLOUT = new Date("2026-08-01T00:00:00.000Z");

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function pendingSignup(
  overrides: Partial<VerificationReminderUser> = {},
): VerificationReminderUser {
  return {
    email: "alex@example.com",
    name: "Alex Example",
    createdAt: new Date("2026-08-21T18:00:00.000Z"),
    emailVerifiedAt: null,
    verificationReminderSentAt: null,
    verificationEmailLastSentAt: null,
    deletionRequestedAt: null,
    shopifyShop: null,
    shopifyInstalledAt: null,
    ...overrides,
  };
}

function decide(
  user: VerificationReminderUser,
  at: Date = now,
  event: string | null = null,
  extra: Parameters<typeof shouldSendVerificationReminder>[3] = {},
) {
  return shouldSendVerificationReminder(user, at, event, {
    rolloutActiveAfter: POST_ROLLOUT,
    ...extra,
  });
}

function recoveryRow(
  overrides: Partial<VerificationReminderBackfillRow> & Pick<VerificationReminderBackfillRow, "id">,
): VerificationReminderBackfillRow {
  return {
    ...pendingSignup(),
    name: "Jarim",
    createdAt: new Date("2026-08-21T18:39:38.000Z"),
    ...overrides,
  };
}

const FAHD_ID = "11111111-1111-4111-8111-11113890884a";
const JARIM_ID = "22222222-2222-4222-8222-2222f7423eba";
const JAILZA_ID = "33333333-3333-4333-8333-33337d27bc78";

test("reminder timing: 24 hours after latest accepted verification email, fallback created_at", () => {
  assert.equal(VERIFICATION_REMINDER_DELAY_MS, 24 * 60 * 60 * 1000);
  const created = new Date("2026-08-25T23:00:00.000Z");
  assert.deepEqual(decide(pendingSignup({ createdAt: created })), { send: true });
  assert.deepEqual(
    decide(pendingSignup({ createdAt: new Date("2026-08-26T00:01:12.000Z") })),
    { send: false, reason: "too_soon" },
  );
  const exactly24h = new Date(now.getTime() - VERIFICATION_REMINDER_DELAY_MS);
  assert.deepEqual(decide(pendingSignup({ createdAt: exactly24h })), { send: true });
  assert.equal(
    verificationReminderTimingAnchor(
      pendingSignup({
        createdAt: created,
        verificationEmailLastSentAt: new Date("2026-08-26T12:00:00.000Z"),
      }),
    )?.toISOString(),
    "2026-08-26T12:00:00.000Z",
  );
});

test("manual resend at hour 23 postpones the automatic reminder", () => {
  const created = new Date("2026-08-25T23:00:00.000Z");
  const resendAtHour23 = new Date("2026-08-26T22:00:00.000Z");
  assert.deepEqual(
    decide(pendingSignup({ createdAt: created, verificationEmailLastSentAt: null })),
    { send: true },
  );
  assert.deepEqual(
    decide(
      pendingSignup({ createdAt: created, verificationEmailLastSentAt: resendAtHour23 }),
    ),
    { send: false, reason: "too_soon" },
  );
  const afterPostponement = new Date(resendAtHour23.getTime() + VERIFICATION_REMINDER_DELAY_MS);
  assert.deepEqual(
    decide(
      pendingSignup({ createdAt: created, verificationEmailLastSentAt: resendAtHour23 }),
      afterPostponement,
    ),
    { send: true },
  );

  const auth = src("server/auth.ts");
  assert.ok(auth.includes("resendVerificationForEmail") || auth.includes("issueEmailVerification"));
  const verify = src("server/emailVerification.ts");
  assert.ok(verify.includes("resendVerificationForEmail"));
  assert.ok(verify.includes("issueEmailVerification"));
  assert.ok(verify.includes("markVerificationEmailAccepted"));
  assert.ok(verify.includes("verificationEmailLastSentAt"));
});

test("Change Email at hour 23 postpones the automatic reminder", () => {
  const created = new Date("2026-08-25T23:00:00.000Z");
  const changeEmailAtHour23 = new Date("2026-08-26T22:00:00.000Z");
  assert.deepEqual(
    decide(
      pendingSignup({
        createdAt: created,
        verificationEmailLastSentAt: changeEmailAtHour23,
      }),
    ),
    { send: false, reason: "too_soon" },
  );
  const afterPostponement = new Date(
    changeEmailAtHour23.getTime() + VERIFICATION_REMINDER_DELAY_MS,
  );
  assert.deepEqual(
    decide(
      pendingSignup({
        createdAt: created,
        verificationEmailLastSentAt: changeEmailAtHour23,
      }),
      afterPostponement,
    ),
    { send: true },
  );

  const auth = src("server/auth.ts");
  assert.ok(auth.includes("/api/auth/change-pending-email"));
  assert.ok(auth.includes("issueEmailVerification(sessionUser.id, nextEmail"));
  const service = src("server/verificationReminderService.ts");
  assert.ok(service.includes("COALESCE(${users.verificationEmailLastSentAt}, ${users.createdAt})"));
});

test("deduplication: at most one reminder per account", () => {
  assert.deepEqual(
    decide(
      pendingSignup({ verificationReminderSentAt: new Date("2026-08-26T12:00:00.000Z") }),
    ),
    { send: false, reason: "already_sent" },
  );

  const service = src("server/verificationReminderService.ts");
  assert.ok(service.includes("isNull(users.verificationReminderSentAt)"));
  assert.ok(service.includes("if (result.sent)"));
  assert.ok(service.includes("verificationReminderSentAt: new Date()"));
  assert.ok(service.includes("will retry on the next hourly cron"));
  assert.ok(!service.includes("trialStartedAt"));
  assert.ok(!service.includes("trialStatus"));
  assert.ok(!service.includes("consumeEmailVerificationToken"));
});

test("exclusions: shopify, synthetic, deleted, bounced/complained/blocked/suppressed, verified", () => {
  assert.deepEqual(decide(pendingSignup({ shopifyShop: "nqx.myshopify.com" })), {
    send: false,
    reason: "shopify_or_synthetic",
  });
  assert.deepEqual(
    decide(pendingSignup({ shopifyInstalledAt: new Date("2026-08-20T00:00:00.000Z") })),
    { send: false, reason: "shopify_or_synthetic" },
  );
  assert.deepEqual(decide(pendingSignup({ email: "store@shopify.whachatcrm.com" })), {
    send: false,
    reason: "shopify_or_synthetic",
  });
  assert.deepEqual(
    decide(pendingSignup({ deletionRequestedAt: new Date("2026-08-25T00:00:00.000Z") })),
    { send: false, reason: "deletion_requested" },
  );
  assert.deepEqual(
    decide(pendingSignup({ emailVerifiedAt: new Date("2026-08-22T00:00:00.000Z") })),
    { send: false, reason: "already_verified" },
  );
  assert.deepEqual(decide(pendingSignup({ emailVerifiedAt: undefined })), {
    send: false,
    reason: "already_verified",
  });
  assert.deepEqual(decide(pendingSignup({ email: "demo@whachat.com" })), {
    send: false,
    reason: "excluded_email",
  });

  assert.equal(isBlockedVerificationDeliveryEvent("bounced"), true);
  assert.equal(isBlockedVerificationDeliveryEvent("complained"), true);
  assert.equal(isBlockedVerificationDeliveryEvent("blocked"), true);
  assert.equal(isBlockedVerificationDeliveryEvent("suppressed"), true);
  assert.equal(isBlockedVerificationDeliveryEvent("failed"), true);
  assert.equal(isBlockedVerificationDeliveryEvent("delivered"), false);
  assert.equal(isBlockedVerificationDeliveryEvent("delivery_delayed"), false);
  assert.equal(isBlockedVerificationDeliveryEvent(null), false);

  assert.deepEqual(decide(pendingSignup(), now, "bounced"), {
    send: false,
    reason: "delivery_suppressed",
  });
  assert.deepEqual(decide(pendingSignup(), now, "delivered"), { send: true });
  assert.deepEqual(decide(pendingSignup(), now, "delivery_delayed"), { send: true });
  assert.equal(errorIndicatesSuppressedDelivery("Recipient is suppressed"), true);
  assert.equal(errorIndicatesSuppressedDelivery("timeout"), false);
});

test("failed replacement send does not destroy the last usable verification path", () => {
  const verify = src("server/emailVerification.ts");
  const issueFn = verify.slice(verify.indexOf("export async function issueEmailVerification"));
  const insertIdx = issueFn.indexOf("insertEmailVerificationToken");
  const sendIdx = issueFn.indexOf("sendEmailVerificationEmail");
  const acceptIdx = issueFn.indexOf("markVerificationEmailAccepted");
  const abandonIdx = issueFn.indexOf("abandonIssuedVerificationToken");
  assert.ok(insertIdx >= 0 && sendIdx > insertIdx && acceptIdx > sendIdx && abandonIdx > sendIdx);
  assert.ok(issueFn.includes("if (sent)"));
  assert.ok(verify.includes("ne(emailVerificationTokens.id, keepTokenId)"));

  const insertFn = verify.slice(
    verify.indexOf("export async function insertEmailVerificationToken"),
    verify.indexOf("export async function markVerificationEmailAccepted"),
  );
  assert.ok(!insertFn.includes("invalidateOtherUnusedTokens"));
  assert.ok(!insertFn.includes("usedAt: new Date()"));

  const service = src("server/verificationReminderService.ts");
  const sendFn = service.slice(service.indexOf("export async function sendVerificationReminderForUser"));
  const failIdx = sendFn.indexOf('reason: "send_failed"');
  const abandonFail = sendFn.lastIndexOf("abandonIssuedVerificationToken", failIdx);
  const stampReminder = sendFn.indexOf("verificationReminderSentAt: new Date()");
  const stampLastSent = sendFn.indexOf("markVerificationEmailAccepted");
  assert.ok(failIdx > 0 && abandonFail > 0 && abandonFail < failIdx);
  assert.ok(stampReminder > failIdx && stampLastSent > failIdx);
  assert.ok(sendFn.includes("if (!ok)"));
  assert.ok(service.includes("will retry on the next hourly cron"));
});

test("fresh 24-hour token: invalidate unused tokens only after Resend accepts; reminder uses distinct template", () => {
  assert.equal(EMAIL_VERIFICATION_TTL_MS, 24 * 60 * 60 * 1000);
  const verify = src("server/emailVerification.ts");
  assert.ok(verify.includes("export async function insertEmailVerificationToken"));
  assert.ok(verify.includes("export async function markVerificationEmailAccepted"));
  assert.ok(verify.includes("invalidateOtherUnusedTokens"));
  assert.ok(verify.includes("EMAIL_VERIFICATION_TTL_MS"));
  assert.ok(verify.includes("issueEmailVerification"));

  const service = src("server/verificationReminderService.ts");
  assert.ok(!service.includes("isVerificationReminderBackfillCohortId"));
  assert.ok(service.includes("insertEmailVerificationToken"));
  assert.ok(service.includes("sendEmailVerificationReminderEmail"));
  assert.ok(!service.includes("sendEmailVerificationEmail("));

  assert.equal(
    EMAIL_VERIFICATION_REMINDER_SUBJECT,
    "Reminder: verify your email to start your 14-day Pro + AI Brain trial",
  );
  const html = renderEmailVerificationReminderHtml("Alex", "token-abc", {
    appUrl: "https://app.whachatcrm.com",
  });
  assert.match(html, /14-day Pro \+ AI Brain trial/);
  assert.match(html, /trial does not begin until you verify/);
  assert.match(html, /expires in 24 hours/);
  assert.match(html, /Verify email and start my 14-day trial/);
  assert.match(html, /\/verify-email\?token=token-abc/);
});

test("verification race safety: recheck eligibility immediately before send", () => {
  assert.equal(
    verificationReminderRaceAbort({
      emailVerifiedAt: new Date("2026-08-26T22:59:00.000Z"),
      verificationReminderSentAt: null,
    }),
    "already_verified",
  );
  assert.equal(
    verificationReminderRaceAbort({
      emailVerifiedAt: null,
      verificationReminderSentAt: new Date("2026-08-26T22:59:00.000Z"),
    }),
    "already_sent",
  );
  assert.equal(
    verificationReminderRaceAbort({
      emailVerifiedAt: null,
      verificationReminderSentAt: null,
      email: "alex@example.com",
    }),
    null,
  );
  assert.equal(
    verificationReminderRaceAbort({
      emailVerifiedAt: null,
      verificationReminderSentAt: null,
      deletionRequestedAt: new Date("2026-08-26T22:59:00.000Z"),
      email: "alex@example.com",
    }),
    "deletion_requested",
  );
  assert.equal(
    verificationReminderRaceAbort({
      emailVerifiedAt: null,
      verificationReminderSentAt: null,
      shopifyShop: "store.myshopify.com",
      email: "alex@example.com",
    }),
    "shopify_or_synthetic",
  );
  assert.equal(
    verificationReminderRaceAbort(
      {
        emailVerifiedAt: null,
        verificationReminderSentAt: null,
        email: "alex@example.com",
      },
      "bounced",
    ),
    "delivery_suppressed",
  );

  const service = src("server/verificationReminderService.ts");
  assert.ok(service.includes("shouldSendVerificationReminder(fresh"));
  assert.ok(service.includes("insertEmailVerificationToken"));
  const sendFn = service.slice(service.indexOf("export async function sendVerificationReminderForUser"));
  const tokenIdx = sendFn.indexOf("insertEmailVerificationToken");
  const recheckIdx = sendFn.indexOf("shouldSendVerificationReminder(fresh");
  const sendIdx = sendFn.indexOf("await sendEmailVerificationReminderEmail");
  assert.ok(tokenIdx > 0 && recheckIdx > tokenIdx && sendIdx > recheckIdx);

  const consume = src("server/emailVerification.ts");
  assert.ok(consume.includes("shouldStartTrial"));
  assert.ok(consume.includes("emailVerifiedAt: now"));
});

test("Resend last_event lookup uses newest matching recipient and fails open", () => {
  const event = pickLatestResendLastEventForRecipient(
    [
      {
        to: ["alex@example.com"],
        last_event: "delivered",
        created_at: "2026-08-21T15:00:00.000Z",
      },
      {
        to: ["alex@example.com"],
        last_event: "bounced",
        created_at: "2026-08-22T15:00:00.000Z",
      },
      {
        to: ["other@example.com"],
        last_event: "complained",
        created_at: "2026-08-26T15:00:00.000Z",
      },
    ],
    "Alex@example.com",
  );
  assert.equal(event, "bounced");
  assert.equal(pickLatestResendLastEventForRecipient([], "alex@example.com"), null);

  const service = src("server/verificationReminderService.ts");
  assert.ok(service.includes("treating delivery status as unknown"));
  assert.ok(service.includes("maskEmailForLogs"));
});

test("pre-rollout legacy users are not automatically emailed on deploy", () => {
  const deployBoundary = new Date("2026-08-26T20:00:00.000Z");
  const legacy = pendingSignup({ createdAt: new Date("2026-08-21T18:00:00.000Z") });
  assert.equal(isPostVerificationReminderRollout(legacy.createdAt, deployBoundary), false);
  assert.deepEqual(
    shouldSendVerificationReminder(legacy, now, null, { rolloutActiveAfter: deployBoundary }),
    { send: false, reason: "pre_rollout" },
  );
  assert.deepEqual(
    shouldSendVerificationReminder(legacy, now, null, { rolloutActiveAfter: null }),
    { send: false, reason: "rollout_not_ready" },
  );
  assert.deepEqual(
    shouldSendVerificationReminder(legacy, now, null, { rolloutActiveAfter: "not-a-date" }),
    { send: false, reason: "rollout_not_ready" },
  );

  const service = src("server/verificationReminderService.ts");
  assert.ok(service.includes("gt(users.createdAt, boundary)"));
  assert.ok(service.includes("rollout boundary missing or invalid"));
  assert.ok(!service.includes("isVerificationReminderBackfillCohortId"));
  assert.ok(!service.includes("fahd"));
  assert.ok(!service.includes("3890884a"));
  assert.ok(!service.includes("f7423eba"));
  assert.ok(!service.includes("7d27bc78"));

  const cron = src("server/cron.ts");
  assert.ok(cron.includes("loadVerificationReminderRolloutActiveAfter"));
  assert.ok(cron.includes("hourly only; not run on deploy"));
  const startCron = cron.indexOf("export function startCronJobs");
  const startBody = cron.slice(startCron, cron.indexOf("cronInterval = setInterval"));
  assert.ok(!startBody.includes("runVerificationReminders("));

  const indexSrc = src("server/index.ts");
  assert.ok(!indexSrc.includes("runVerificationReminders("));
});

test("new post-rollout users receive one reminder", () => {
  const boundary = new Date("2026-08-20T00:00:00.000Z");
  const newbie = pendingSignup({ createdAt: new Date("2026-08-21T18:00:00.000Z") });
  assert.equal(isPostVerificationReminderRollout(newbie.createdAt, boundary), true);
  assert.deepEqual(
    shouldSendVerificationReminder(newbie, now, null, { rolloutActiveAfter: boundary }),
    { send: true },
  );
  assert.deepEqual(
    shouldSendVerificationReminder(
      pendingSignup({
        createdAt: new Date("2026-08-21T18:00:00.000Z"),
        verificationReminderSentAt: new Date("2026-08-26T12:00:00.000Z"),
      }),
      now,
      null,
      { rolloutActiveAfter: boundary },
    ),
    { send: false, reason: "already_sent" },
  );

  const equalToBoundary = pendingSignup({ createdAt: boundary });
  assert.deepEqual(
    shouldSendVerificationReminder(equalToBoundary, now, null, { rolloutActiveAfter: boundary }),
    { send: false, reason: "pre_rollout" },
  );
});

test("two concurrent cron workers send only once", () => {
  const slot = { reminderSentAt: null as Date | null };
  const attempts = [1, 2].map(() => {
    const claim = tryClaimVerificationReminderSlot(slot.reminderSentAt, now);
    if (!claim.claimed) return { sent: false };
    slot.reminderSentAt = claim.nextSentAt;
    return { sent: true };
  });
  assert.equal(attempts.filter((row) => row.sent).length, 1);
  assert.equal(attempts.filter((row) => !row.sent).length, 1);

  const second = tryClaimVerificationReminderSlot(slot.reminderSentAt, now);
  assert.equal(second.claimed, false);

  const service = src("server/verificationReminderService.ts");
  assert.ok(service.includes("pg_advisory_xact_lock"));
  assert.ok(service.includes("hashtext("));
  assert.ok(service.includes("db.transaction"));
  const sendFn = service.slice(service.indexOf("export async function sendVerificationReminderForUser"));
  const lockIdx = sendFn.indexOf("pg_advisory_xact_lock");
  const sendIdx = sendFn.indexOf("await sendEmailVerificationReminderEmail");
  const stampIdx = sendFn.indexOf("verificationReminderSentAt: new Date()");
  assert.ok(lockIdx > 0 && sendIdx > lockIdx && stampIdx > sendIdx);
  assert.ok(sendFn.includes("isNull(users.verificationReminderSentAt)"));
});

test("legacy recovery requires exact full user IDs", () => {
  assert.equal(VERIFICATION_REMINDER_RECOVERY_PROFILES.length, 3);
  assert.ok(VERIFICATION_REMINDER_RECOVERY_PROFILES.some((t) => t.label === "Fahd omaiche"));
  assert.ok(VERIFICATION_REMINDER_RECOVERY_PROFILES.some((t) => t.label === "Jarim"));
  assert.ok(VERIFICATION_REMINDER_RECOVERY_PROFILES.some((t) => t.label === "Jailza"));
  assert.equal(isExactVerificationReminderUserId(JARIM_ID), true);
  assert.equal(isExactVerificationReminderUserId("f7423eba"), false);
  assert.equal(isExactVerificationReminderUserId("jarim"), false);

  const missingIds = parseVerificationReminderBackfillCli([]);
  assert.equal(missingIds.execute, false);
  assert.ok(missingIds.errors.some((err) => err.includes("exact --user-id=")));
  assert.equal(missingIds.userIds.length, 0);

  const parsed = parseVerificationReminderBackfillCli([
    `--user-id=${FAHD_ID}`,
    "--user-id",
    JARIM_ID,
    `--user-id=${JAILZA_ID}`,
  ]);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.userIds, [FAHD_ID, JARIM_ID, JAILZA_ID]);

  const tailRejected = parseVerificationReminderBackfillCli(["--user-id=f7423eba"]);
  assert.ok(tailRejected.errors.some((err) => err.includes("Invalid --user-id")));

  const rows: VerificationReminderBackfillRow[] = [
    recoveryRow({
      id: FAHD_ID,
      name: "Fahd omaiche",
      email: "omaiche@gmail.com",
      createdAt: new Date("2026-08-26T00:01:12.000Z"),
    }),
    recoveryRow({
      id: JARIM_ID,
      name: "Jarim",
      email: "jarim@gmail.com",
      createdAt: new Date("2026-08-21T18:39:38.000Z"),
    }),
    recoveryRow({
      id: JAILZA_ID,
      name: "Jaliza",
      email: "jailza@gmail.com",
      createdAt: new Date("2026-08-21T15:08:01.000Z"),
    }),
  ];

  const assignments = resolveVerificationReminderRecoveryByExactIds(
    [FAHD_ID, JARIM_ID, JAILZA_ID],
    rows,
  );
  assert.equal(assignments.every((a) => a.status === "matched"), true);
  assert.equal(utcCalendarDate(rows[0].createdAt), "2026-08-26");

  const fahd = sanitizeBackfillRecipient(assignments[0], now, "delivered");
  assert.equal(fahd.eligible, true);
  assert.equal(fahd.emailMasked, "o***@gmail.com");
  assert.equal(fahd.userId, FAHD_ID);
  assert.ok(!JSON.stringify(fahd).includes("omaiche@gmail.com"));
  assert.equal(recoveryAssignmentIsFatal(fahd), false);

  const missing = resolveVerificationReminderRecoveryByExactIds(
    ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    rows,
  );
  assert.equal(missing[0]?.status, "missing");
  assert.equal(
    recoveryAssignmentIsFatal(sanitizeBackfillRecipient(missing[0], now)),
    true,
  );

  const changed = resolveVerificationReminderRecoveryByExactIds(
    [JARIM_ID],
    [
      recoveryRow({
        id: JARIM_ID,
        name: "Someone Else",
        createdAt: new Date("2026-08-21T18:39:38.000Z"),
      }),
    ],
  );
  assert.equal(changed[0]?.status, "identity_changed");

  const verified = sanitizeBackfillRecipient(
    resolveVerificationReminderRecoveryByExactIds(
      [JARIM_ID],
      [
        recoveryRow({
          id: JARIM_ID,
          name: "Jarim",
          emailVerifiedAt: new Date("2026-08-22T00:00:00.000Z"),
        }),
      ],
    )[0],
    now,
  );
  assert.equal(verified.eligible, false);
  assert.equal(verified.skipReason, "already_verified");
  assert.equal(recoveryAssignmentIsFatal(verified), true);

  const shopify = sanitizeBackfillRecipient(
    resolveVerificationReminderRecoveryByExactIds(
      [JARIM_ID],
      [
        recoveryRow({
          id: JARIM_ID,
          name: "Jarim",
          shopifyShop: "store.myshopify.com",
        }),
      ],
    )[0],
    now,
  );
  assert.equal(shopify.skipReason, "shopify_or_synthetic");
  assert.equal(recoveryAssignmentIsFatal(shopify), true);

  assert.ok(
    nameMatchesBackfillTarget(
      "Jaliza",
      VERIFICATION_REMINDER_RECOVERY_PROFILES.find((t) => t.key === "jailza")!.nameNeedles,
    ),
  );

  const dryRunCmd = powershellVerificationReminderRecoveryDryRunCommand([
    FAHD_ID,
    JARIM_ID,
    JAILZA_ID,
  ]);
  assert.equal(
    dryRunCmd,
    `npx tsx scripts/send-verification-reminders.ts --user-id=${FAHD_ID} --user-id=${JARIM_ID} --user-id=${JAILZA_ID}`,
  );
  const executeCmd = powershellVerificationReminderRecoveryExecuteCommand([JARIM_ID]);
  assert.equal(
    executeCmd,
    `$env:VERIFICATION_REMINDER_BACKFILL_EXECUTE="1"; npx tsx scripts/send-verification-reminders.ts --user-id=${JARIM_ID} --execute`,
  );
  assert.ok(!dryRunCmd.includes("@gmail.com"));
  assert.ok(!executeCmd.includes("@gmail.com"));

  const dry = parseVerificationReminderBackfillCli([`--user-id=${JARIM_ID}`]);
  assert.equal(dry.execute, false);
  const execFlag = parseVerificationReminderBackfillCli([`--user-id=${JARIM_ID}`, "--execute"]);
  assert.equal(execFlag.execute, true);
  assert.equal(verificationReminderBackfillExecuteConfirmed({}), false);
  assert.equal(shouldExecuteVerificationReminderBackfill(true, {}), false);
  assert.equal(
    shouldExecuteVerificationReminderBackfill(true, {
      [VERIFICATION_REMINDER_BACKFILL_EXECUTE_ENV]: "1",
    }),
    true,
  );
  assert.deepEqual(dedupeBackfillSendUserIds(["a", "b", "a", ""]), ["a", "b"]);
  assert.equal(maskEmailForBackfill("omaiche@gmail.com"), "o***@gmail.com");

  const dryResult = sanitizeBackfillSendResult(fahd, "dry_run", "would_send");
  assert.equal(dryResult.outcome, "dry_run");
  assert.ok(!JSON.stringify(dryResult).includes("omaiche@gmail.com"));

  const script = src("scripts/send-verification-reminders.ts");
  assert.ok(script.includes("mode=${mode}"));
  assert.ok(script.includes(VERIFICATION_REMINDER_BACKFILL_EXECUTE_ENV));
  assert.ok(script.includes("sendVerificationReminderForUser"));
  assert.ok(script.includes("inArray(users.id, userIds)"));
  assert.ok(script.includes("powershellVerificationReminderRecoveryDryRunCommand"));
  assert.ok(script.includes("LEGACY_RECOVERY_ELIGIBILITY_OPTIONS"));
  assert.ok(!script.includes("omaiche@"));
  assert.ok(!script.includes("idTail"));
  assert.ok(script.includes("Does not start the 14-day"));
  assert.ok(script.includes("catch (err)"));
  assert.ok(script.includes("alreadyTried"));
});

test("schema, cron, and startup: durable last-sent, rollout boundary, hourly only, no send on deploy", () => {
  const schema = src("shared/schema.ts");
  assert.ok(schema.includes('verificationReminderSentAt: timestamp("verification_reminder_sent_at")'));
  assert.ok(
    schema.includes('verificationEmailLastSentAt: timestamp("verification_email_last_sent_at")'),
  );
  assert.ok(schema.includes('appFeatureRollouts = pgTable("app_feature_rollouts"'));
  assert.ok(schema.includes('featureKey: text("feature_key").primaryKey()'));
  assert.ok(schema.includes('activeAfter: timestamp("active_after").notNull()'));

  const mig85 = src("migrations/0085_verification_reminder.sql");
  assert.ok(mig85.includes("verification_reminder_sent_at"));
  assert.ok(!mig85.includes("SET verification_reminder_sent_at"));
  assert.ok(mig85.includes("Do not stamp existing unverified users"));

  const mig86 = src("migrations/0086_verification_reminder_last_sent_and_rollout.sql");
  assert.ok(mig86.includes("verification_email_last_sent_at"));
  assert.ok(mig86.includes("CREATE TABLE IF NOT EXISTS app_feature_rollouts"));
  assert.ok(mig86.includes("ON CONFLICT (feature_key) DO NOTHING"));
  assert.ok(mig86.includes(`'${VERIFICATION_REMINDER_ROLLOUT_FEATURE_KEY}'`));
  assert.ok(!mig86.includes("SET verification_email_last_sent_at"));

  const patches = src("server/startupSchemaPatches.ts");
  assert.ok(patches.includes('tag: "0085_verification_reminder"'));
  assert.ok(patches.includes('tag: "0086_verification_reminder_last_sent_and_rollout"'));
  assert.ok(patches.includes("ON CONFLICT (feature_key) DO NOTHING"));
  assert.ok(
    patches.includes('patchResults.get("0085_verification_reminder") === true') &&
      patches.includes(
        'patchResults.get("0086_verification_reminder_last_sent_and_rollout") === true',
      ),
  );

  const cron = src("server/cron.ts");
  assert.ok(cron.includes("runVerificationReminders"));
  assert.ok(cron.includes("enableVerificationRemindersAfterSchemaReady"));
  assert.ok(cron.includes("hourly only; not run on deploy"));
  assert.ok(cron.includes("runHourlyAccountEmailJobs"));
  assert.ok(cron.includes("utcMin === 0"));
  assert.ok(cron.includes("loadVerificationReminderRolloutActiveAfter"));
  const startCron = cron.indexOf("export function startCronJobs");
  const startBody = cron.slice(startCron, cron.indexOf("cronInterval = setInterval"));
  assert.ok(!startBody.includes("runVerificationReminders("));
  assert.ok(startBody.includes("runTrialExpirySync()"));

  const service = src("server/verificationReminderService.ts");
  assert.ok(!service.includes("isVerificationReminderBackfillCohortId"));

  const indexSrc = src("server/index.ts");
  assert.ok(indexSrc.includes("verificationReminderPatchOk"));
  assert.ok(indexSrc.includes("enableVerificationRemindersAfterSchemaReady"));
  assert.ok(!indexSrc.includes("runVerificationReminders("));

  const routes = src("server/routes.ts");
  assert.ok(routes.includes("verificationReminderPatchOk"));
});
