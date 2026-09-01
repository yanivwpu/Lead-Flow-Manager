/**
 * AI Brain + shared in-app Pro upgrade CTA.
 * One-time 14-day Pro trial (includes AI Brain). No separate AI Brain trial.
 * Run: npx tsx --test tests/ai-brain-inapp-upgrade.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canStartInternalProAiTrial } from "../shared/trialEntitlements";
import { resolveInAppUpgradeCta } from "../shared/pricingProCta";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const now = new Date("2026-08-31T12:00:00.000Z");

function freeUser(overrides: Record<string, unknown> = {}) {
  return {
    trialEndsAt: null,
    trialStartedAt: null,
    trialStatus: "none" as const,
    trialPlan: null,
    planOverrideEnabled: false,
    planOverride: null,
    billingPlan: "free" as const,
    subscriptionStatus: "active",
    shopifyShop: null,
    shopifySubscriptionStatus: null,
    ...overrides,
  };
}

const expiredTrialUser = freeUser({
  trialEndsAt: new Date("2026-05-31T00:00:00.000Z"),
  trialStartedAt: new Date("2026-05-17T00:00:00.000Z"),
  trialStatus: "expired",
  trialPlan: "pro_ai",
});

const AUTHENTICATED_UPGRADE_SURFACES = [
  "client/src/pages/AIBrain.tsx",
  "client/src/pages/Settings.tsx",
  "client/src/pages/Workflows.tsx",
  "client/src/pages/ChatbotBuilder.tsx",
  "client/src/pages/Templates.tsx",
  "client/src/pages/RealtorGrowthEngine.tsx",
  "client/src/components/UpgradeModal.tsx",
  "client/src/components/AIUpgradePrompt.tsx",
  "client/src/components/InAppProUpgradeButton.tsx",
  "client/src/components/UsageWarningBanner.tsx",
  "client/src/components/InboxLeadDetailsPanel.tsx",
] as const;

test("eligible Free → start_trial; expired/used Free → upgrade_pro; Shopify never starts web trial", () => {
  assert.equal(canStartInternalProAiTrial(freeUser(), now), true);
  assert.equal(
    resolveInAppUpgradeCta({ canStartInternalTrial: true, isShopify: false }),
    "start_trial",
  );

  assert.equal(canStartInternalProAiTrial(expiredTrialUser, now), false);
  assert.equal(
    resolveInAppUpgradeCta({ canStartInternalTrial: false, isShopify: false }),
    "upgrade_pro",
  );

  assert.equal(
    resolveInAppUpgradeCta({ canStartInternalTrial: true, isShopify: true }),
    "shopify_choose",
  );
  assert.equal(
    resolveInAppUpgradeCta({ canStartInternalTrial: false, isShopify: true }),
    "shopify_choose",
  );
});

test("in-app CTA copy is Pro trial, not a separate AI Brain / Free trial", () => {
  const en = JSON.parse(read("client/src/locales/en.json"));
  assert.equal(en.inAppUpgrade.startTrial, "Start Your 14-Day Pro Trial");
  assert.equal(en.inAppUpgrade.upgradePro, "Upgrade to Pro");
  assert.equal(en.aiBrain.workspace.cta, "Start Your 14-Day Pro Trial");
  assert.equal(en.aiBrain.workspace.ctaUpgrade, "Upgrade to Pro");
  assert.notEqual(en.inAppUpgrade.startTrial, "Start Your 14-Day Free Trial");

  const es = JSON.parse(read("client/src/locales/es.json"));
  const he = JSON.parse(read("client/src/locales/he.json"));
  assert.equal(typeof es.inAppUpgrade.startTrial, "string");
  assert.equal(typeof es.inAppUpgrade.upgradePro, "string");
  assert.equal(typeof he.inAppUpgrade.startTrial, "string");
  assert.equal(typeof he.inAppUpgrade.upgradePro, "string");
  assert.match(es.inAppUpgrade.startTrial, /Pro/);
  assert.match(he.inAppUpgrade.startTrial, /Pro/);
});

test("shared InAppProUpgradeButton uses server canStartInternalTrial and the in-app resolver", () => {
  const btn = read("client/src/components/InAppProUpgradeButton.tsx");
  assert.ok(btn.includes("resolveInAppUpgradeCta({ canStartInternalTrial, isShopify })"));
  assert.ok(btn.includes("performInAppProUpgrade(kind"));
  assert.ok(btn.includes('t("inAppUpgrade.startTrial")'));
  assert.ok(btn.includes('t("inAppUpgrade.upgradePro")'));
  assert.ok(btn.includes("data-in-app-upgrade-cta={kind}"));
  assert.ok(!btn.includes("trialEndsAt"));
  assert.ok(!btn.includes("billingPlan"));
  assert.ok(!btn.includes("planName"));
});

test("performInAppProUpgrade: eligible → start-trial; ineligible → paid Pro checkout", () => {
  const helper = read("client/src/lib/inAppProUpgrade.ts");
  const startIdx = helper.indexOf('if (kind === "start_trial")');
  const checkoutIdx = helper.indexOf('fetch("/api/subscription/checkout"');
  assert.ok(startIdx > 0);
  assert.ok(checkoutIdx > startIdx);
  const startBody = helper.slice(startIdx, checkoutIdx);
  assert.ok(startBody.includes('fetch("/api/subscription/start-trial"'));
  assert.ok(startBody.includes('method: "POST"'));
  assert.ok(!startBody.includes("getUncachableStripeClient"));
  assert.ok(!startBody.includes("trial_period_days"));

  const checkoutBody = helper.slice(checkoutIdx);
  assert.ok(checkoutBody.includes('planId: "pro"'));
  assert.ok(checkoutBody.includes('billingInterval: "monthly"'));
  assert.ok(!checkoutBody.includes("trial_period_days"));
  assert.ok(!checkoutBody.includes("/api/subscription/checkout/pro-ai"));
});

test("AI Brain locked screen uses shared CTA; expired trial is never offered another trial", () => {
  const page = read("client/src/pages/AIBrain.tsx");
  const locked = page.slice(
    page.indexOf("if (!hasAIAssist && !effectiveHasAIBrain)"),
    page.indexOf("if (settingsLoading"),
  );
  assert.ok(locked.includes("InAppProUpgradeButton"));
  assert.ok(locked.includes("canStartInternalTrial={!!subMeta?.canStartInternalTrial}"));
  assert.ok(locked.includes('testId="button-ai-workspace-choose-plan"'));
  assert.ok(!locked.includes("Start Your 14-Day Free Trial"));
  assert.ok(!locked.includes('t("aiBrain.workspace.cta")'));
  assert.ok(!locked.includes("trialEndsAt"));
  assert.ok(!locked.includes("isFree"));
  assert.ok(!locked.includes("handleProCheckout"));
});

test("active Pro trial and paid Pro show AI Brain as included, not a trial CTA", () => {
  const page = read("client/src/pages/AIBrain.tsx");
  assert.ok(page.includes("const showTrialFullSuite = isInTrial && trialIncludesAIBrain && effectiveHasAIBrain"));
  assert.ok(page.includes("const hidePaidBrainCta = isInTrial && trialIncludesAIBrain && effectiveHasAIBrain"));
  assert.ok(page.includes("Trial includes AI Assist Basic, Pro workflow access, and AI Brain"));
  assert.ok(page.includes("AI Brain is active — your intelligence layer is unlocked below."));
  assert.ok(page.includes("Included in your trial — no separate checkout."));

  const active = page.slice(page.indexOf('data-testid="ai-workspace-active"'));
  assert.ok(!active.includes("InAppProUpgradeButton"));
  assert.ok(!active.includes("Start Your 14-Day"));

  const starterUpsell = page.slice(
    page.indexOf("showBrainUpgradeSection"),
    page.indexOf("How the assistant acts"),
  );
  assert.ok(starterUpsell.includes('data-testid="button-ai-brain-primary-cta"'));
  assert.ok(starterUpsell.includes("Upgrade to Pro"));
  assert.ok(!starterUpsell.includes("InAppProUpgradeButton"));
  assert.ok(!starterUpsell.includes("Start Your 14-Day"));
});

test("authenticated upgrade CTAs reuse the shared eligibility CTA, not hardcoded Free Trial", () => {
  for (const rel of AUTHENTICATED_UPGRADE_SURFACES) {
    const src = read(rel);
    assert.ok(
      !src.includes("Start Your 14-Day Free Trial"),
      `${rel} still hardcodes Start Your 14-Day Free Trial`,
    );
    assert.ok(
      src.includes("InAppProUpgradeButton") ||
        src.includes("resolveInAppUpgradeCta") ||
        src.includes("performInAppProUpgrade") ||
        src.includes("inAppUpgradeCtaLabel"),
      `${rel} is not wired to the shared in-app upgrade CTA`,
    );
    assert.ok(
      src.includes("canStartInternalTrial"),
      `${rel} does not pass server canStartInternalTrial`,
    );
  }

  const settings = read("client/src/pages/Settings.tsx");
  assert.ok(settings.includes('testId="button-settings-pro-upgrade"'));

  const modal = read("client/src/components/UpgradeModal.tsx");
  assert.ok(modal.includes("performInAppProUpgrade(inAppCtaKind"));
  assert.ok(modal.includes("data-in-app-upgrade-cta={inAppCtaKind}"));

  const workflows = read("client/src/pages/Workflows.tsx");
  assert.ok(workflows.includes('testId="button-automations-upgrade"'));

  const chatbot = read("client/src/pages/ChatbotBuilder.tsx");
  assert.ok(chatbot.includes("<InAppProUpgradeButton"));

  const templates = read("client/src/pages/Templates.tsx");
  assert.ok(templates.includes('testId="button-upgrade-template-campaigns"'));
});
