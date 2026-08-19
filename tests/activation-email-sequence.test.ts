/**
 * New-user activation email sequence: Day 0 / Day 5 / Day 10.
 * Run: npx tsx --test tests/activation-email-sequence.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chooseActivationSequenceAction,
  ACTIVATION_EMAIL_DAY5_THRESHOLD,
  ACTIVATION_EMAIL_DAY10_THRESHOLD,
} from "../shared/activationEmailEligibility";
import { hasQualifyingMessagingChannelForActivationEmails } from "../shared/activationEmailChannels";
import {
  APP_INBOX_PATH,
  APP_INTEGRATIONS_PATH,
  APP_PROSPECT_AI_PATH,
  APP_TEMPLATES_PATH,
} from "../shared/appProductPaths";
import { settingsChannelsHref } from "../shared/settingsChannelsNavigation";
import {
  ACTIVATION_DAY5_EMAIL_SUBJECT,
  ACTIVATION_DAY10_EMAIL_SUBJECT,
  WELCOME_EMAIL_SUBJECT,
  WHACHATCRM_SUPPORT_EMAIL,
  renderActivationEmailDay5Html,
  renderActivationEmailDay10Html,
  renderWelcomeEmailHtml,
} from "../server/email";

const root = process.cwd();
const appUrl = "https://app.whachatcrm.com";
const welcomeHtml = renderWelcomeEmailHtml("Alex Rivera", { appUrl });
const day5Html = renderActivationEmailDay5Html("Alex", { appUrl });
const day10Html = renderActivationEmailDay10Html("Alex", { appUrl });

function connected(channel: string) {
  return hasQualifyingMessagingChannelForActivationEmails({
    channels: [{ channel, isConnected: true }],
  });
}

test("A: Day 0 welcome is after verification, once, not at raw signup", () => {
  const auth = readFileSync(join(root, "server/auth.ts"), "utf8");
  const verify = readFileSync(join(root, "server/emailVerification.ts"), "utf8");
  assert.ok(!auth.includes("sendWelcomeEmail(name, email)"));
  assert.ok(auth.includes("issueEmailVerification"));
  assert.ok(verify.includes("trySendWelcomeEmailForUser"));
  assert.ok(verify.includes("if (user.welcomeEmailSentAt) return true"));
  assert.equal(WELCOME_EMAIL_SUBJECT, "Welcome to WhachatCRM — here's what you can do now 🚀");
});

test("B–F: Day 0 covers Prospect AI, Inbox, Integrations, Templates, Coexistence", () => {
  assert.match(welcomeHtml, /Prospect AI/);
  assert.match(welcomeHtml, /Unified Inbox/);
  assert.match(welcomeHtml, /Integrations/);
  assert.match(welcomeHtml, /WhatsApp Templates/);
  assert.match(welcomeHtml, /WhatsApp Coexistence/);
  assert.match(welcomeHtml, /WhatsApp Business App/);
  assert.match(welcomeHtml, /Growth Engines → Prospect AI/);
  assert.match(welcomeHtml, /does not become the WhachatCRM inbox/i);
});

test("G: Day 0 distinguishes 14-day Pro + AI Brain trial from permanent Free", () => {
  assert.match(welcomeHtml, /14-day Pro \+ AI Brain trial/);
  assert.match(welcomeHtml, /Free plan/);
  assert.match(welcomeHtml, /AI Brain is not included on Free after the trial/);
  assert.doesNotMatch(welcomeHtml, /free AI assistant/i);
  assert.match(welcomeHtml, /Bulk template campaigns and workflow automation are not included on Free/);
});

test("H: primary CTA is the real Prospect AI app route", () => {
  assert.equal(APP_PROSPECT_AI_PATH, "/app/prospect-ai");
  const prospectAiSrc = readFileSync(join(root, "client/src/lib/prospectAi.ts"), "utf8");
  assert.ok(prospectAiSrc.includes('export const PROSPECT_AI_PATH = "/app/prospect-ai"'));
  const layout = readFileSync(join(root, "client/src/pages/AppLayout.tsx"), "utf8");
  assert.ok(layout.includes('path="/app/prospect-ai"'));
  assert.ok(welcomeHtml.includes(`${appUrl}${APP_PROSPECT_AI_PATH}`));
  assert.match(welcomeHtml, />Try Prospect AI</);
  assert.ok(welcomeHtml.includes(`${appUrl}${APP_INBOX_PATH}`));
  assert.ok(welcomeHtml.includes(`${appUrl}${APP_INTEGRATIONS_PATH}`));
  assert.ok(welcomeHtml.includes(`${appUrl}${APP_TEMPLATES_PATH}`));
  assert.ok(welcomeHtml.includes(`${appUrl}${settingsChannelsHref()}`));
});

test("I: Day 5 does not send before day 5", () => {
  assert.equal(ACTIVATION_EMAIL_DAY5_THRESHOLD, 5);
  assert.deepEqual(
    chooseActivationSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceStart: 4,
      hasQualifyingChannel: false,
    }),
    { action: "none" },
  );
});

test("J: Day 5 sends >= day 5 if no qualifying channel", () => {
  assert.deepEqual(
    chooseActivationSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceStart: 5,
      hasQualifyingChannel: false,
    }),
    { action: "day5" },
  );
  assert.equal(ACTIVATION_DAY5_EMAIL_SUBJECT, "Connect your channels — it's easier than you think");
  assert.match(day5Html, /Connect a Channel/);
  assert.match(day5Html, /WhatsApp Coexistence/);
  assert.match(day5Html, /easier than you think/);
  assert.doesNotMatch(day5Html, /free AI assistant/i);
  assert.ok(day5Html.includes(`${appUrl}${settingsChannelsHref()}`));
  assert.ok(!day5Html.includes("provider=whatsapp"));
});

test("K–Q: qualifying channels suppress Day 5/10; TikTok does not", () => {
  assert.equal(connected("whatsapp"), true);
  assert.equal(connected("facebook"), true);
  assert.equal(connected("instagram"), true);
  assert.equal(connected("email"), true);
  assert.equal(connected("sms"), true);
  assert.equal(connected("telegram"), true);
  assert.equal(connected("webchat"), true);
  assert.equal(connected("tiktok"), false);
  assert.equal(
    hasQualifyingMessagingChannelForActivationEmails({
      canonicalWhatsAppConnected: true,
      channels: [],
    }),
    true,
  );
  assert.equal(
    hasQualifyingMessagingChannelForActivationEmails({
      channels: [],
      nativeEmailMailboxConnected: true,
    }),
    true,
  );
  assert.equal(
    hasQualifyingMessagingChannelForActivationEmails({
      channels: [{ channel: "whatsapp", isConnected: false }],
    }),
    false,
  );

  assert.deepEqual(
    chooseActivationSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceStart: 12,
      hasQualifyingChannel: true,
    }),
    { action: "mark_complete" },
  );
});

test("R–T: Day 10 rescue copy, support Reply-To, no-charge help", () => {
  assert.equal(ACTIVATION_EMAIL_DAY10_THRESHOLD, 10);
  assert.equal(ACTIVATION_DAY10_EMAIL_SUBJECT, "Need help getting WhachatCRM set up?");
  assert.equal(WHACHATCRM_SUPPORT_EMAIL, "support@whachatcrm.com");
  assert.deepEqual(
    chooseActivationSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceStart: 10,
      hasQualifyingChannel: false,
    }),
    { action: "day10", alsoCompleteDay5: true },
  );
  assert.match(day10Html, /Get Setup Help/);
  assert.match(day10Html, /at no charge/);
  assert.match(day10Html, /automation\/workflow/);
  assert.match(day10Html, /Just reply to this email/);
  assert.ok(day10Html.includes(`mailto:${WHACHATCRM_SUPPORT_EMAIL}`));

  const emailSrc = readFileSync(join(root, "server/email.ts"), "utf8");
  assert.ok(emailSrc.includes("replyTo: WHACHATCRM_SUPPORT_EMAIL"));
  assert.ok(emailSrc.includes("reply_to: replyTo"));
});

test("U: stale users never receive Day 5 + Day 10 in the same decision", () => {
  const stale = chooseActivationSequenceAction({
    welcomeSent: true,
    day5Sent: false,
    day10Sent: false,
    daysSinceStart: 14,
    hasQualifyingChannel: false,
  });
  assert.deepEqual(stale, { action: "day10", alsoCompleteDay5: true });
  assert.notEqual(stale.action, "day5");
});

test("V: activated user who later disconnects does not re-enter the sequence", () => {
  assert.deepEqual(
    chooseActivationSequenceAction({
      welcomeSent: true,
      day5Sent: true,
      day10Sent: true,
      daysSinceStart: 20,
      hasQualifyingChannel: false,
    }),
    { action: "none" },
  );
  const service = readFileSync(join(root, "server/activationEmailService.ts"), "utf8");
  assert.ok(service.includes("markActivationSequenceComplete"));
  assert.ok(service.includes("activationEmailDay3Sent: true"));
  assert.ok(service.includes("activationEmailDay10Sent: true"));
});

test("W–X: failed welcome remains retryable; success never duplicates", () => {
  assert.deepEqual(
    chooseActivationSequenceAction({
      welcomeSent: false,
      day5Sent: false,
      day10Sent: false,
      daysSinceStart: 12,
      hasQualifyingChannel: false,
    }),
    { action: "welcome" },
  );
  const verify = readFileSync(join(root, "server/emailVerification.ts"), "utf8");
  assert.ok(verify.includes("if (sent)"));
  assert.ok(verify.includes("welcomeEmailSentAt: new Date()"));
  assert.ok(verify.includes("will retry on the activation cron"));
  const service = readFileSync(join(root, "server/activationEmailService.ts"), "utf8");
  assert.ok(service.includes("isNull(users.welcomeEmailSentAt)"));
  assert.ok(service.includes("trySendWelcomeEmailForUser"));
});

test("Day 5/10 use WhachatCRM branding; activation-status API is unchanged", () => {
  assert.match(welcomeHtml, /WhachatCRM/);
  assert.match(day5Html, /WhachatCRM/);
  assert.match(day10Html, /WhachatCRM/);
  assert.doesNotMatch(welcomeHtml, /WhaChatCRM/);
  assert.doesNotMatch(day5Html, /WhaChatCRM/);
  assert.doesNotMatch(day10Html, /WhaChatCRM/);

  const channels = readFileSync(join(root, "server/routes/channels.ts"), "utf8");
  assert.ok(channels.includes("const hasAnyMessagingChannel = whatsappConnected || metaConnected"));
  assert.ok(!channels.includes("getUserMessagingChannelStatusForEmails"));
});
