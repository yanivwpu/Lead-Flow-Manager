/**
 * Day 14 Pro + AI Brain trial-expiration email + entitlement gates.
 * Run: npx tsx --test tests/trial-expiration-email.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeTrialStatus,
  getEffectivePlanForUser,
  hadProAiBrainTrial,
  hasActivePaidPlan,
  isProAiTrialActive,
} from "../shared/trialEntitlements";
import {
  shouldSendTrialExpirationEmail,
  type TrialExpirationEmailUser,
} from "../shared/trialExpirationEmailEligibility";
import { chooseActivationSequenceAction } from "../shared/activationEmailEligibility";
import { APP_INBOX_PATH, APP_PRICING_PATH } from "../shared/appProductPaths";
import { PROSPECT_AI_MONTHLY_QUOTAS } from "../shared/prospectAI";
import {
  DEFAULT_RESEND_FROM_EMAIL,
  TRIAL_EXPIRATION_EMAIL_SUBJECT,
  renderTrialExpirationEmailHtml,
  resolveResendFromEmail,
} from "../server/email";

const root = process.cwd();
const appUrl = "https://app.whachatcrm.com";
const now = new Date("2026-08-18T18:00:00.000Z");
const html = renderTrialExpirationEmailHtml("Alex", { appUrl });

function expiredFreeUser(
  overrides: Partial<TrialExpirationEmailUser> = {},
): TrialExpirationEmailUser {
  return {
    email: "alex@example.com",
    deletionRequestedAt: null,
    shopifyShop: null,
    trialEndsAt: new Date("2026-08-18T12:00:00.000Z"),
    trialStatus: "expired",
    trialPlan: "pro_ai",
    trialExpirationEmailSentAt: null,
    planOverrideEnabled: false,
    planOverride: null,
    billingPlan: "free",
    subscriptionStatus: "active",
    shopifySubscriptionStatus: null,
    aiBrainEntitlementOverrideEnabled: false,
    aiBrainEntitlementOverrideGrant: false,
    ...overrides,
  };
}

test("trial entitlements: wall-clock trialEndsAt is the expiry source of truth", () => {
  const active = expiredFreeUser({
    trialEndsAt: new Date("2026-08-19T12:00:00.000Z"),
    trialStatus: "active",
  });
  assert.equal(computeTrialStatus(active, now), "active");
  assert.equal(isProAiTrialActive(active, now), true);
  assert.equal(getEffectivePlanForUser(active, now), "pro");
  assert.equal(hadProAiBrainTrial(active), true);

  const expired = expiredFreeUser();
  assert.equal(computeTrialStatus(expired, now), "expired");
  assert.equal(isProAiTrialActive(expired, now), false);
  assert.equal(getEffectivePlanForUser(expired, now), "free");
});

test("A: active trial before expiration → no email", () => {
  const user = expiredFreeUser({
    trialEndsAt: new Date("2026-08-19T12:00:00.000Z"),
    trialStatus: "active",
  });
  assert.deepEqual(shouldSendTrialExpirationEmail(user, now), {
    send: false,
    reason: "trial_still_active",
  });
});

test("B: trial expires → email sends once (eligible)", () => {
  assert.deepEqual(shouldSendTrialExpirationEmail(expiredFreeUser(), now), { send: true });
});

test("C–D: failed send stays retryable; success never duplicates", () => {
  const service = readFileSync(join(root, "server/trialExpirationEmailService.ts"), "utf8");
  assert.ok(service.includes("isNull(users.trialExpirationEmailSentAt)"));
  assert.ok(service.includes("if (ok)"));
  assert.ok(service.includes("trialExpirationEmailSentAt: new Date()"));
  assert.ok(service.includes("will retry on the next expiry-sync cron"));

  assert.deepEqual(
    shouldSendTrialExpirationEmail(
      expiredFreeUser({ trialExpirationEmailSentAt: new Date("2026-08-18T13:00:00.000Z") }),
      now,
    ),
    { send: false, reason: "already_sent" },
  );
});

test("E: extended trial does not send on the old expiration date", () => {
  const user = expiredFreeUser({
    trialEndsAt: new Date("2026-08-25T12:00:00.000Z"),
    trialStatus: "active",
  });
  assert.equal(isProAiTrialActive(user, now), true);
  assert.deepEqual(shouldSendTrialExpirationEmail(user, now), {
    send: false,
    reason: "trial_still_active",
  });
});

test("F: user upgraded before trial end → no misleading expiration email", () => {
  const upgradedDuringTrial = expiredFreeUser({
    trialEndsAt: new Date("2026-08-25T12:00:00.000Z"),
    trialStatus: "active",
    billingPlan: "pro",
    subscriptionStatus: "active",
  });
  assert.equal(hasActivePaidPlan(upgradedDuringTrial, now), true);
  assert.equal(isProAiTrialActive(upgradedDuringTrial, now), false);
  assert.deepEqual(shouldSendTrialExpirationEmail(upgradedDuringTrial, now), {
    send: false,
    reason: "paid_or_override",
  });

  const upgradedThenExpired = expiredFreeUser({
    billingPlan: "pro",
    subscriptionStatus: "active",
  });
  assert.deepEqual(shouldSendTrialExpirationEmail(upgradedThenExpired, now), {
    send: false,
    reason: "paid_or_override",
  });
});

test("G: paid users retaining relevant entitlements are suppressed", () => {
  assert.deepEqual(
    shouldSendTrialExpirationEmail(
      expiredFreeUser({ billingPlan: "starter", subscriptionStatus: "active" }),
      now,
    ),
    { send: false, reason: "paid_or_override" },
  );
  assert.deepEqual(
    shouldSendTrialExpirationEmail(
      expiredFreeUser({ billingPlan: "pro", subscriptionStatus: "active" }),
      now,
    ),
    { send: false, reason: "paid_or_override" },
  );
  assert.deepEqual(
    shouldSendTrialExpirationEmail(
      expiredFreeUser({
        planOverrideEnabled: true,
        planOverride: "pro",
      }),
      now,
    ),
    { send: false, reason: "paid_or_override" },
  );
  assert.deepEqual(
    shouldSendTrialExpirationEmail(
      expiredFreeUser({
        aiBrainEntitlementOverrideEnabled: true,
        aiBrainEntitlementOverrideGrant: true,
      }),
      now,
    ),
    { send: false, reason: "ai_brain_override_grant" },
  );
  assert.deepEqual(
    shouldSendTrialExpirationEmail(
      expiredFreeUser({ shopifyShop: "store.myshopify.com" }),
      now,
    ),
    { send: false, reason: "shopify_managed" },
  );
});

test("H: expired user falling back to Free gets continuation copy", () => {
  assert.equal(getEffectivePlanForUser(expiredFreeUser(), now), "free");
  assert.equal(
    TRIAL_EXPIRATION_EMAIL_SUBJECT,
    "Your Pro + AI Brain trial has ended — your Free account is still active",
  );
  assert.match(html, /Your 14-day Pro \+ AI Brain trial has ended/);
  assert.match(html, /account is still active/);
  assert.match(html, /features included with Free/);
  assert.doesNotMatch(html, /account is disabled/i);
  assert.doesNotMatch(html, /unusable/i);
});

test("I: channel-connected user can still receive trial-expiration email", () => {
  const connected = chooseActivationSequenceAction({
    welcomeSent: true,
    day5Sent: true,
    day10Sent: true,
    daysSinceStart: 14,
    hasQualifyingChannel: true,
  });
  assert.equal(connected.action, "none");
  assert.deepEqual(shouldSendTrialExpirationEmail(expiredFreeUser(), now), { send: true });
});

test("J: Day 5/10 activation flags do not control Day 14", () => {
  const eligibility = readFileSync(
    join(root, "shared/trialExpirationEmailEligibility.ts"),
    "utf8",
  );
  const service = readFileSync(join(root, "server/trialExpirationEmailService.ts"), "utf8");
  assert.ok(!eligibility.includes("activationEmailDay3Sent"));
  assert.ok(!eligibility.includes("activationEmailDay10Sent"));
  assert.ok(!service.includes("activationEmailDay3Sent"));
  assert.ok(!service.includes("activationEmailDay10Sent"));
  assert.ok(!service.includes("chooseActivationSequenceAction"));
});

test("K: Day 14 copy covers trial ended, Free continuation, and feature list", () => {
  assert.match(html, /trial has ended/);
  assert.match(html, /Free account is still active/);
  assert.match(html, /Prospect AI/);
  assert.match(html, /Unified Inbox/);
  assert.match(html, /Integrations/);
  assert.match(html, /WhatsApp Templates/);
  assert.match(html, /View Plans &amp; AI Options|View Plans & AI Options/);
  assert.match(html, /Continue on Free/);
  assert.match(html, /optional add-on for paid plans/);
  assert.match(html, new RegExp(`${PROSPECT_AI_MONTHLY_QUOTAS.free} discoveries`));
  assert.doesNotMatch(html, /WhaChatCRM/);
  assert.match(html, /WhachatCRM/);
});

test("L: pricing CTA uses canonical /pricing route without Stripe Price IDs", () => {
  assert.equal(APP_PRICING_PATH, "/pricing");
  const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");
  assert.ok(app.includes('localeRoutes("/pricing", Pricing)'));
  assert.ok(html.includes(`${appUrl}${APP_PRICING_PATH}`));
  assert.ok(html.includes(`${appUrl}${APP_INBOX_PATH}`));
  assert.doesNotMatch(html, /price_/i);
  assert.doesNotMatch(html, /STRIPE_/);
});

test("M: sender display name is WhachatCRM", () => {
  assert.equal(DEFAULT_RESEND_FROM_EMAIL, "WhachatCRM <noreply@crm.whachatcrm.com>");
  assert.equal(resolveResendFromEmail(undefined), DEFAULT_RESEND_FROM_EMAIL);
  assert.equal(
    resolveResendFromEmail("WhaChatCRM <noreply@crm.whachatcrm.com>"),
    "WhachatCRM <noreply@crm.whachatcrm.com>",
  );
  assert.equal(
    resolveResendFromEmail("noreply@crm.whachatcrm.com"),
    "noreply@crm.whachatcrm.com",
  );
  const emailSrc = readFileSync(join(root, "server/email.ts"), "utf8");
  assert.ok(emailSrc.includes("from: resolveResendFromEmail()"));
  assert.ok(emailSrc.includes('DEFAULT_RESEND_FROM_EMAIL = "WhachatCRM <noreply@crm.whachatcrm.com>"'));
});

test("cron uses existing hourly trial-expiry job, not activation flags", () => {
  const cron = readFileSync(join(root, "server/cron.ts"), "utf8");
  assert.ok(cron.includes("runTrialExpirationEmails"));
  assert.ok(cron.includes("runTrialExpiryThenExpirationEmails"));
  const mig = readFileSync(join(root, "migrations/0080_trial_expiration_email.sql"), "utf8");
  assert.ok(mig.includes("trial_expiration_email_sent_at"));
  assert.ok(mig.includes("trial_ends_at <= NOW()"));
});

test("startup: 0080 backfill completes before the first trial-expiration email scan", () => {
  const indexSrc = readFileSync(join(root, "server/index.ts"), "utf8");
  const cronSrc = readFileSync(join(root, "server/cron.ts"), "utf8");
  const routesSrc = readFileSync(join(root, "server/routes.ts"), "utf8");
  const patchesSrc = readFileSync(join(root, "server/startupSchemaPatches.ts"), "utf8");

  assert.ok(routesSrc.includes("Do not run backfills during route registration"));
  assert.ok(indexSrc.includes("await (app as any).locals.runBackfills?.()"));
  const cronStart = indexSrc.indexOf("startCronJobs();");
  const backfillStart = indexSrc.indexOf("locals.runBackfills");
  assert.ok(cronStart > 0 && backfillStart > cronStart, "listen backfill is after startCronJobs()");

  assert.ok(cronSrc.includes("runTrialExpirySync().catch"));
  assert.ok(cronSrc.includes("startTrialExpirationEmailsAfterSchemaReady"));
  assert.ok(cronSrc.includes("Trial-expiration emails deferred until schema patch 0080"));
  assert.ok(indexSrc.includes("startTrialExpirationEmailsAfterSchemaReady"));
  assert.ok(indexSrc.includes("trialExpirationEmailPatchOk"));
  assert.ok(indexSrc.indexOf("startTrialExpirationEmailsAfterSchemaReady") > backfillStart);

  assert.ok(patchesSrc.includes('tag: "0080_trial_expiration_email"'));
  assert.ok(patchesSrc.includes("trialExpirationEmailPatchOk: patchResults.get(\"0080_trial_expiration_email\") === true"));
});
