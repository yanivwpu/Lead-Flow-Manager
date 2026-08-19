/**
 * Shopify merchant onboarding email sequence (Day 0 / 5 / 10).
 * Run: npx tsx --test tests/shopify-onboarding-emails.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isEligibleForActivationEmails,
  isShopifyLinkedAccount,
} from "../shared/activationEmailEligibility";
import { hasQualifyingMessagingChannelForActivationEmails } from "../shared/activationEmailChannels";
import {
  isShopifySyntheticMerchantEmail,
  sanitizeShopifyOwnerEmail,
  shopifySyntheticMerchantEmail,
} from "../shared/shopifyBilling";
import {
  chooseShopifyOnboardingSequenceAction,
  isShopifyInstallActiveForOnboarding,
  shouldProcessShopifyOnboardingUser,
  shopifyOnboardingStartAt,
  usableShopifyOwnerEmail,
  SHOPIFY_ONBOARDING_DAY5_THRESHOLD,
  SHOPIFY_ONBOARDING_DAY10_THRESHOLD,
} from "../shared/shopifyOnboardingEmailEligibility";
import {
  APP_INBOX_PATH,
  APP_INTEGRATIONS_PATH,
  APP_PROSPECT_AI_PATH,
  APP_TEMPLATES_PATH,
} from "../shared/appProductPaths";
import { settingsChannelsHref } from "../shared/settingsChannelsNavigation";
import {
  DEFAULT_RESEND_FROM_EMAIL,
  SHOPIFY_ACTIVATION_DAY5_EMAIL_SUBJECT,
  SHOPIFY_ACTIVATION_DAY10_EMAIL_SUBJECT,
  SHOPIFY_WELCOME_EMAIL_SUBJECT,
  WHACHATCRM_SUPPORT_EMAIL,
  renderShopifyActivationEmailDay5Html,
  renderShopifyActivationEmailDay10Html,
  renderShopifyWelcomeEmailHtml,
} from "../server/email";

const root = process.cwd();
const appUrl = "https://app.whachatcrm.com";
const welcomeHtml = renderShopifyWelcomeEmailHtml("Acme Store", { appUrl });
const day5Html = renderShopifyActivationEmailDay5Html("Acme", { appUrl });
const day10Html = renderShopifyActivationEmailDay10Html("Acme", { appUrl });

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function connected(channel: string): boolean {
  return hasQualifyingMessagingChannelForActivationEmails({
    channels: [{ channel, isConnected: true }],
  });
}

test("A: install fetches shop.email via Admin GraphQL", () => {
  const shopifyTs = src("server/shopify.ts");
  assert.ok(shopifyTs.includes("query shopOwnerEmail"));
  assert.ok(shopifyTs.includes("fetchShopifyShopOwnerEmail"));
  assert.match(shopifyTs, /shop\s*\{\s*email\s*\}/);
  assert.ok(src("server/shopifyRoutes.ts").includes("fetchShopifyShopOwnerEmail"));
  assert.ok(src("server/shopifyRoutes.ts").includes("shopifyOwnerEmail"));
});

test("B: users.email remains synthetic identity", () => {
  const routes = src("server/shopifyRoutes.ts");
  assert.ok(routes.includes("shopifySyntheticMerchantEmail(normalizedShop)"));
  assert.ok(routes.includes("email: merchantEmail"));
  assert.ok(!routes.includes("email: shopOwnerEmail"));
  assert.ok(!routes.includes("email: shopifyOwnerEmail"));
  assert.equal(
    shopifySyntheticMerchantEmail("acme.myshopify.com"),
    "acme@shopify.whachatcrm.com",
  );
});

test("C: no new Shopify scope required", () => {
  const shopifyTs = src("server/shopify.ts");
  assert.ok(shopifyTs.includes("export const SHOPIFY_SCOPES = ['read_customers', 'read_orders']"));
  const toml = src("shopify.app.whachatcrm.toml");
  assert.match(toml, /scopes = "read_customers,read_orders"/);
  assert.ok(!shopifyTs.includes("'read_users'"));
  assert.ok(!shopifyTs.includes('"read_users"'));
});

test("D: customer emails and contactEmail are never the merchant recipient", () => {
  const shopifyTs = src("server/shopify.ts");
  const fetchStart = shopifyTs.indexOf("export async function fetchShopifyShopOwnerEmail");
  const fetchBody = shopifyTs.slice(fetchStart, fetchStart + 1400);
  assert.ok(!fetchBody.includes("contactEmail"));
  assert.ok(!fetchBody.includes("customers"));
  assert.ok(fetchBody.includes("sanitizeShopifyOwnerEmail(data?.shop?.email)"));
  const queryStart = shopifyTs.indexOf("SHOPIFY_SHOP_OWNER_EMAIL_QUERY");
  const queryBody = shopifyTs.slice(queryStart, queryStart + 400);
  assert.ok(!queryBody.includes("contactEmail"));
  assert.ok(!queryBody.includes("customers"));
});

test("E–H: first install Day 0 once, owner email recipient, Connect WhatsApp CTA", () => {
  assert.equal(
    SHOPIFY_WELCOME_EMAIL_SUBJECT,
    "Welcome to WhachatCRM — connect your store conversations",
  );
  assert.match(welcomeHtml, /Your Shopify store is now connected/);
  assert.match(welcomeHtml, />Connect WhatsApp</);
  assert.ok(welcomeHtml.includes(`${appUrl}${settingsChannelsHref({ provider: "whatsapp" })}`));
  assert.ok(welcomeHtml.includes(`${appUrl}${APP_INBOX_PATH}`));
  assert.ok(welcomeHtml.includes(`${appUrl}${APP_PROSPECT_AI_PATH}`));
  assert.ok(welcomeHtml.includes(`${appUrl}${APP_TEMPLATES_PATH}`));
  assert.ok(welcomeHtml.includes(`${appUrl}${APP_INTEGRATIONS_PATH}`));
  assert.match(welcomeHtml, /WhatsApp Coexistence/);
  assert.match(welcomeHtml, /14-day Pro \+ AI Brain trial/);
  assert.doesNotMatch(welcomeHtml, /WhaChatCRM/);
  assert.equal(DEFAULT_RESEND_FROM_EMAIL, "WhachatCRM <noreply@crm.whachatcrm.com>");

  const service = src("server/shopifyOnboardingEmailService.ts");
  assert.ok(service.includes("if (user.shopifyWelcomeEmailSentAt) return true"));
  assert.ok(service.includes("usableShopifyOwnerEmail(user.shopifyOwnerEmail)"));
  assert.ok(service.includes("sendShopifyWelcomeEmail(user.name, recipient)"));
  assert.ok(!service.includes("sendShopifyWelcomeEmail(user.name, user.email)"));
});

test("F/G: Day 0 recipient is shopifyOwnerEmail, never synthetic users.email", () => {
  assert.equal(usableShopifyOwnerEmail("owner@merchant.com"), "owner@merchant.com");
  assert.equal(usableShopifyOwnerEmail("acme@shopify.whachatcrm.com"), null);
  assert.equal(sanitizeShopifyOwnerEmail("acme@shopify.whachatcrm.com"), null);
  assert.ok(isShopifySyntheticMerchantEmail("acme@shopify.whachatcrm.com"));
  const emailTs = src("server/email.ts");
  assert.ok(emailTs.includes("isShopifySyntheticMerchantEmail(to)"));
  assert.ok(emailTs.includes("Refusing to send to synthetic Shopify identity"));
});

test("I/J: Shopify-linked session_link users do not get generic web Day 0/5/10", () => {
  const sessionLink = {
    email: "merchant@example.com",
    emailVerifiedAt: "2026-08-01T00:00:00.000Z",
    trialStartedAt: "2026-08-01T00:00:00.000Z",
    shopifyShop: "acme.myshopify.com",
  };
  assert.equal(isShopifyLinkedAccount(sessionLink), true);
  assert.equal(isEligibleForActivationEmails(sessionLink), false);

  const installedOnly = {
    email: "merchant@example.com",
    emailVerifiedAt: "2026-08-01T00:00:00.000Z",
    trialStartedAt: "2026-08-01T00:00:00.000Z",
    shopifyInstalledAt: "2026-08-01T00:00:00.000Z",
  };
  assert.equal(isEligibleForActivationEmails(installedOnly), false);

  const web = {
    email: "merchant@example.com",
    emailVerifiedAt: "2026-08-01T00:00:00.000Z",
    trialStartedAt: "2026-08-01T00:00:00.000Z",
  };
  assert.equal(isEligibleForActivationEmails(web), true);

  const activationService = src("server/activationEmailService.ts");
  assert.ok(activationService.includes("isShopifyLinkedAccount(user)"));
  const verify = src("server/emailVerification.ts");
  assert.ok(verify.includes("isShopifyLinkedAccount(user)"));
});

test("K–O: Day 5 only without a channel; WA/IG/FB/Gmail suppress Day 5/10", () => {
  assert.equal(SHOPIFY_ONBOARDING_DAY5_THRESHOLD, 5);
  assert.deepEqual(
    chooseShopifyOnboardingSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceInstall: 4,
      hasQualifyingChannel: false,
      hasUsableOwnerEmail: true,
    }),
    { action: "none" },
  );
  assert.deepEqual(
    chooseShopifyOnboardingSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceInstall: 5,
      hasQualifyingChannel: false,
      hasUsableOwnerEmail: true,
    }),
    { action: "day5" },
  );
  assert.equal(
    SHOPIFY_ACTIVATION_DAY5_EMAIL_SUBJECT,
    "Connect WhatsApp to your Shopify store conversations",
  );
  assert.match(day5Html, /Shopify is already connected/);
  assert.match(day5Html, /WhatsApp Coexistence/);
  assert.match(day5Html, /Instagram/);
  assert.match(day5Html, /Facebook Messenger/);
  assert.match(day5Html, /Gmail\/Email/);
  assert.match(day5Html, /Connect a Channel/);
  assert.ok(day5Html.includes(`${appUrl}${settingsChannelsHref()}`));

  for (const channel of ["whatsapp", "instagram", "facebook", "email"] as const) {
    assert.equal(connected(channel), true, `${channel} qualifies`);
    assert.deepEqual(
      chooseShopifyOnboardingSequenceAction({
        welcomeSent: true,
        day5Sent: false,
        day10Sent: false,
        daysSinceInstall: 12,
        hasQualifyingChannel: true,
        hasUsableOwnerEmail: true,
      }),
      { action: "mark_complete" },
    );
  }
});

test("P/Q: Day 10 only if still unactivated; Reply-To support", () => {
  assert.equal(SHOPIFY_ONBOARDING_DAY10_THRESHOLD, 10);
  assert.equal(
    SHOPIFY_ACTIVATION_DAY10_EMAIL_SUBJECT,
    "Need help connecting WhachatCRM to your store?",
  );
  assert.deepEqual(
    chooseShopifyOnboardingSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceInstall: 10,
      hasQualifyingChannel: false,
      hasUsableOwnerEmail: true,
    }),
    { action: "day10", alsoCompleteDay5: true },
  );
  assert.match(day10Html, /Get Setup Help/);
  assert.match(day10Html, /at no charge/);
  assert.match(day10Html, /Just reply to this email/);
  assert.ok(day10Html.includes(`mailto:${WHACHATCRM_SUPPORT_EMAIL}`));
  const emailTs = src("server/email.ts");
  assert.ok(emailTs.includes("sendShopifyActivationEmailDay10"));
  assert.ok(emailTs.includes("replyTo: WHACHATCRM_SUPPORT_EMAIL"));
});

test("R: uninstall / redact suppress Shopify onboarding mail", () => {
  assert.equal(
    isShopifyInstallActiveForOnboarding({
      shopifyShop: "acme.myshopify.com",
      shopifySubscriptionStatus: "pending",
    }),
    true,
  );
  assert.equal(
    isShopifyInstallActiveForOnboarding({
      shopifyShop: "acme.myshopify.com",
      shopifySubscriptionStatus: "uninstalled",
    }),
    false,
  );
  assert.equal(
    isShopifyInstallActiveForOnboarding({
      shopifyShop: "acme.myshopify.com",
      shopifySubscriptionStatus: "redacted",
    }),
    false,
  );
  assert.equal(
    isShopifyInstallActiveForOnboarding({
      shopifyShop: null,
      shopifySubscriptionStatus: "pending",
    }),
    false,
  );
  assert.equal(
    shouldProcessShopifyOnboardingUser({
      shopifyShop: "acme.myshopify.com",
      shopifySubscriptionStatus: "uninstalled",
      shopifyOwnerEmail: "owner@merchant.com",
    }),
    false,
  );
  const uninstall = src("server/shopifyRoutes.ts");
  assert.ok(uninstall.includes("shopifySubscriptionStatus: 'uninstalled'"));
  assert.ok(!uninstall.includes("sendShopifyWelcomeEmail"));
});

test("S/T: reinstall does not duplicate Day 0 or re-grant trial", () => {
  assert.deepEqual(
    chooseShopifyOnboardingSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceInstall: 0,
      hasQualifyingChannel: false,
      hasUsableOwnerEmail: true,
    }),
    { action: "none" },
  );
  const routes = src("server/shopifyRoutes.ts");
  assert.ok(routes.includes("shopifyInstalledAt: user.shopifyInstalledAt ?? new Date()"));
  assert.ok(routes.includes("const neverHadTrial = !user.trialEndsAt && !trialPreviouslyExpired"));
  assert.ok(routes.includes("Granted 14-day Pro + AI trial on first install"));
  const start = shopifyOnboardingStartAt({
    shopifyInstalledAt: "2026-06-01T00:00:00.000Z",
  });
  assert.equal(start?.toISOString(), "2026-06-01T00:00:00.000Z");
});

test("U: historical Shopify users are not launch-blasted", () => {
  const mig = src("migrations/0082_shopify_onboarding_emails.sql");
  assert.ok(mig.includes("shopify_welcome_email_sent_at"));
  assert.ok(mig.includes("WHERE shopify_installed_at IS NOT NULL"));
  assert.ok(mig.includes("shopify_welcome_email_sent_at"));
  assert.ok(mig.includes("column_name = 'shopify_welcome_email_sent_at'"));
  assert.ok(mig.includes("shopify_activation_email_day5_sent_at"));
  assert.ok(mig.includes("shopify_activation_email_day10_sent_at"));
  const patches = src("server/startupSchemaPatches.ts");
  assert.ok(patches.includes('tag: "0082_shopify_onboarding_emails"'));
  assert.ok(patches.includes("shopify_welcome_email_sent_at = COALESCE"));
});

test("V: merchant who already connected WhatsApp skips Day 5/10", () => {
  assert.deepEqual(
    chooseShopifyOnboardingSequenceAction({
      welcomeSent: true,
      day5Sent: false,
      day10Sent: false,
      daysSinceInstall: 12,
      hasQualifyingChannel: true,
      hasUsableOwnerEmail: true,
    }),
    { action: "mark_complete" },
  );
  assert.deepEqual(
    chooseShopifyOnboardingSequenceAction({
      welcomeSent: true,
      day5Sent: true,
      day10Sent: true,
      daysSinceInstall: 20,
      hasQualifyingChannel: false,
      hasUsableOwnerEmail: true,
    }),
    { action: "none" },
  );
  const service = src("server/shopifyOnboardingEmailService.ts");
  assert.ok(service.includes("markShopifyRemindersComplete"));
  assert.ok(service.includes("getUserMessagingChannelStatusForEmails"));
});

test("Day 14 Shopify exclusion is unchanged", () => {
  const trial = src("shared/trialExpirationEmailEligibility.ts");
  assert.ok(trial.includes('reason: "shopify_managed"'));
  assert.ok(trial.includes("if (user.shopifyShop)"));
});

test("in-app Shopify Day 0 copy uses existing modal, not a new one", () => {
  const modal = src("client/src/components/ActivationSetupModal.tsx");
  assert.ok(modal.includes("shopifyConnected"));
  assert.ok(modal.includes("activation.shopifyDescription"));
  assert.ok(modal.includes("activation.shopifyCoexistence"));
  const layout = src("client/src/pages/AppLayout.tsx");
  assert.ok(layout.includes("shopifyConnected={!!subscription?.subscription?.isShopify}"));
  const inbox = src("client/src/pages/UnifiedInbox.tsx");
  assert.ok(inbox.includes("emptyNoChannelsHintShopify"));
  const en = src("client/src/locales/en.json");
  assert.ok(en.includes("Shopify is connected. Next, connect WhatsApp"));
});
