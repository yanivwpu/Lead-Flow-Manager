/**
 * GHL Marketplace signature, lifecycle, entitlement, and route wiring.
 * Run: npx tsx --test tests/ghl-marketplace-billing.test.ts
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { resolveAIBrainAccess } from "../shared/aiBrainEntitlement";
import {
  isActiveGhlMarketplaceProGrant,
  userHasActiveGhlMarketplaceProGrant,
  ghlUninstallIntegrationCredentialPatch,
} from "../shared/ghlMarketplaceBilling";
import { mergeGhlLifecycleRawPayload } from "../shared/ghlConnectionState";
import {
  applyGhlMarketplaceLifecycleEvent,
  emptyGhlMarketplaceBillingState,
  parseGhlLifecycleEvent,
  sanitizeGhlLifecyclePayloadForStorage,
} from "../shared/ghlMarketplaceLifecycle";
import {
  classifyGhlMarketplacePlanId,
  ghlMarketplacePlanConfigFromEnv,
  ghlMarketplacePlanConfigReadiness,
  type GhlMarketplacePlanConfig,
} from "../shared/ghlMarketplacePlanIds";
import {
  GHL_ACK_ONLY_DISABLED_EVENTS,
  GHL_CANONICAL_WEBHOOK_PATH,
  GHL_CANONICAL_WEBHOOK_URL,
  GHL_SUPPORTED_CONTACT_EVENTS,
  GHL_WEBHOOK_ALIAS_PATH,
} from "../shared/ghlWebhookEvents";
import { getEffectivePlanForUser, isProAiTrialActive } from "../shared/trialEntitlements";
import {
  GHL_PLATFORM_ED25519_PUBLIC_KEY_PEM,
  verifyGhlWebhookSignature,
} from "../server/ghlWebhookSignature";

const root = process.cwd();
const FREE_ID = "plan_free_test_aaaaaaaa";
const PRO_ID = "plan_pro_test_bbbbbbbbb";
const config: GhlMarketplacePlanConfig = {
  freePlanId: FREE_ID,
  proPlanId: PRO_ID,
  configured: true,
};

const now = new Date("2026-08-31T12:00:00.000Z");
const future = new Date("2026-09-14T12:00:00.000Z");
const past = new Date("2026-08-01T12:00:00.000Z");

function user(overrides: Record<string, unknown> = {}) {
  return {
    trialEndsAt: null,
    trialStatus: "none",
    trialPlan: null,
    planOverrideEnabled: false,
    planOverride: null,
    billingPlan: "free",
    subscriptionStatus: "none",
    shopifyShop: null,
    shopifySubscriptionStatus: null,
    shopifyAIBrainEnabled: false,
    aiBrainEntitlementOverrideEnabled: false,
    aiBrainEntitlementOverrideGrant: false,
    email: "user@example.com",
    ...overrides,
  } as Parameters<typeof getEffectivePlanForUser>[0] & Parameters<typeof resolveAIBrainAccess>[0];
}

function signEd25519(raw: Buffer, privateKey: Parameters<typeof sign>[2]) {
  return sign(null, raw, privateKey).toString("base64");
}

function apply(type: string, body: Record<string, unknown>, current = null as ReturnType<typeof emptyGhlMarketplaceBillingState> | null) {
  const parsed = parseGhlLifecycleEvent({ type, companyId: "co_1", locationId: "loc_1", ...body });
  assert.ok(parsed);
  return applyGhlMarketplaceLifecycleEvent(current, parsed, config);
}

test("1. Valid signed webhook accepted (injected Ed25519 keypair)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from('{"type":"INSTALL","companyId":"co_1"}', "utf8");
  const signature = signEd25519(raw, privateKey);
  const result = verifyGhlWebhookSignature({
    rawBody: raw,
    headers: { "x-ghl-signature": signature },
    keys: {
      ed25519PublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      rsaPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.method, "ed25519");
});

test("2. Missing signature rejected", () => {
  const result = verifyGhlWebhookSignature({
    rawBody: Buffer.from("{}", "utf8"),
    headers: {},
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "missing_signature");
});

test("3. Invalid Ed25519 signature rejected", () => {
  const { publicKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from('{"type":"INSTALL"}', "utf8");
  const result = verifyGhlWebhookSignature({
    rawBody: raw,
    headers: { "x-ghl-signature": Buffer.from("not-a-real-signature").toString("base64") },
    keys: {
      ed25519PublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      rsaPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_signature");
});

test("4. Raw-body mutation causes verification failure", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from('{"type":"INSTALL","companyId":"co_1"}', "utf8");
  const signature = signEd25519(raw, privateKey);
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const mutated = Buffer.from('{"type":"INSTALL","companyId":"co_2"}', "utf8");
  const result = verifyGhlWebhookSignature({
    rawBody: mutated,
    headers: { "x-ghl-signature": signature },
    keys: { ed25519PublicKeyPem: pem, rsaPublicKeyPem: pem },
  });
  assert.equal(result.ok, false);
});

test("production Ed25519 path is the official GHL platform key", () => {
  assert.match(GHL_PLATFORM_ED25519_PUBLIC_KEY_PEM, /MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=/);
});

test("5. Free install maps to Free", () => {
  const result = apply("INSTALL", { planId: FREE_ID });
  assert.equal(result.kind, "applied");
  assert.equal(result.grantsPro, false);
  assert.equal(classifyGhlMarketplacePlanId(result.next.marketplacePlanId, config), "free");
  const u = user();
  assert.equal(getEffectivePlanForUser(u, now, { ghlMarketplaceProActive: false }), "free");
  assert.equal(resolveAIBrainAccess(u, { now, ghlMarketplaceProActive: false }).hasAIBrain, false);
});

test("6. Eligible Free install still receives the internal 14-day Pro trial", () => {
  const result = apply("INSTALL", { planId: FREE_ID });
  assert.equal(result.grantsPro, false);
  const u = user({ trialEndsAt: future, trialStatus: "active", trialPlan: "pro_ai" });
  assert.equal(isProAiTrialActive(u, now, { ghlMarketplaceProActive: false }), true);
  assert.equal(getEffectivePlanForUser(u, now, { ghlMarketplaceProActive: false }), "pro");
  assert.equal(resolveAIBrainAccess(u, { now, ghlMarketplaceProActive: false }).source, "trial");
});

test("7. Trial expiry returns GHL Free to Free without AI Brain", () => {
  const u = user({
    trialEndsAt: past,
    trialStatus: "expired",
    trialPlan: "pro_ai",
    billingPlan: "free",
  });
  assert.equal(getEffectivePlanForUser(u, now, { ghlMarketplaceProActive: false }), "free");
  assert.equal(resolveAIBrainAccess(u, { now, ghlMarketplaceProActive: false }).hasAIBrain, false);
});

test("8. Pro install grants Pro and AI Brain", () => {
  const result = apply("INSTALL", { planId: PRO_ID });
  assert.equal(result.grantsPro, true);
  const linked = { ...result.next, whachatUserId: "u1" };
  assert.equal(userHasActiveGhlMarketplaceProGrant("u1", [linked], config), true);
  const u = user({ billingPlan: "free" });
  assert.equal(getEffectivePlanForUser(u, now, { ghlMarketplaceProActive: true }), "pro");
  const brain = resolveAIBrainAccess(u, { now, ghlMarketplaceProActive: true });
  assert.equal(brain.hasAIBrain, true);
  assert.equal(brain.source, "pro");
});

test("9. Free → Pro PlanChange grants Pro and AI Brain", () => {
  const installed = apply("INSTALL", { planId: FREE_ID, timestamp: "2026-08-01T00:00:00.000Z" });
  const changed = apply(
    "PLAN_CHANGE",
    { currentPlanId: FREE_ID, newPlanId: PRO_ID, timestamp: "2026-08-02T00:00:00.000Z" },
    installed.next,
  );
  assert.equal(changed.grantsPro, true);
  const u = user();
  assert.equal(resolveAIBrainAccess(u, { now, ghlMarketplaceProActive: true }).hasAIBrain, true);
});

test("10. Pro → Free removes only the GHL grant", () => {
  const installed = apply("INSTALL", { planId: PRO_ID, timestamp: "2026-08-01T00:00:00.000Z" });
  const changed = apply(
    "PLAN_CHANGE",
    { currentPlanId: PRO_ID, newPlanId: FREE_ID, timestamp: "2026-08-02T00:00:00.000Z" },
    installed.next,
  );
  assert.equal(changed.grantsPro, false);
  const stripePro = user({ billingPlan: "pro", subscriptionStatus: "active" });
  assert.equal(getEffectivePlanForUser(stripePro, now, { ghlMarketplaceProActive: false }), "pro");
  assert.equal(resolveAIBrainAccess(stripePro, { now, ghlMarketplaceProActive: false }).hasAIBrain, true);
});

test("11. GHL Free cannot downgrade active Stripe Pro", () => {
  apply("INSTALL", { planId: FREE_ID });
  const stripePro = user({ billingPlan: "pro", subscriptionStatus: "active" });
  assert.equal(getEffectivePlanForUser(stripePro, now, { ghlMarketplaceProActive: false }), "pro");
});

test("12. GHL failure cannot downgrade active Shopify Pro", () => {
  const installed = apply("INSTALL", { planId: PRO_ID, timestamp: "2026-08-01T00:00:00.000Z" });
  const failed = apply(
    "APP_PAYMENT_STATUS",
    { previousStatus: "COMPLETE", newStatus: "FAILED", timestamp: "2026-08-03T00:00:00.000Z" },
    installed.next,
  );
  assert.equal(failed.grantsPro, false);
  const shopifyPro = user({
    billingPlan: "pro",
    shopifyShop: "store.myshopify.com",
    shopifySubscriptionStatus: "active",
  });
  assert.equal(getEffectivePlanForUser(shopifyPro, now, { ghlMarketplaceProActive: false }), "pro");
  assert.equal(resolveAIBrainAccess(shopifyPro, { now, ghlMarketplaceProActive: false }).hasAIBrain, true);
});

test("13. GHL uninstall cannot remove admin-granted Pro", () => {
  const installed = apply("INSTALL", { planId: PRO_ID, timestamp: "2026-08-01T00:00:00.000Z" });
  const uninstalled = apply("UNINSTALL", { timestamp: "2026-08-04T00:00:00.000Z" }, installed.next);
  assert.equal(uninstalled.grantsPro, false);
  const admin = user({ planOverrideEnabled: true, planOverride: "pro" });
  assert.equal(getEffectivePlanForUser(admin, now, { ghlMarketplaceProActive: false }), "pro");
  assert.equal(resolveAIBrainAccess(admin, { now, ghlMarketplaceProActive: false }).hasAIBrain, true);
});

test("14. Unknown plan ID never grants Pro", () => {
  const result = apply("INSTALL", { planId: "plan_unknown_zzzz" });
  assert.equal(result.grantsPro, false);
  assert.equal(result.warning, "ghl_marketplace_unknown_plan_id");
  assert.equal(classifyGhlMarketplacePlanId("plan_unknown_zzzz", config), "unknown");
});

test("15. Missing plan-ID environment configuration fails closed", () => {
  const missing = ghlMarketplacePlanConfigFromEnv({});
  assert.equal(missing.configured, false);
  const readiness = ghlMarketplacePlanConfigReadiness(missing);
  assert.equal(readiness.planIdsConfigured, false);
  const result = applyGhlMarketplaceLifecycleEvent(
    null,
    parseGhlLifecycleEvent({
      type: "INSTALL",
      companyId: "co_1",
      locationId: "loc_1",
      planId: PRO_ID,
    })!,
    missing,
  );
  assert.equal(result.grantsPro, false);
  assert.equal(result.warning, "ghl_marketplace_plan_ids_unconfigured");
});

test("16. Payment failure follows official GHL status semantics", () => {
  const installed = apply("INSTALL", { planId: PRO_ID, timestamp: "2026-08-01T00:00:00.000Z" });
  const pending = apply(
    "APP_PAYMENT_STATUS",
    { previousStatus: "COMPLETE", newStatus: "PENDING", timestamp: "2026-08-02T00:00:00.000Z" },
    installed.next,
  );
  assert.equal(pending.grantsPro, true, "PENDING dunning keeps Pro");
  const complete = apply(
    "APP_PAYMENT_STATUS",
    { previousStatus: "PENDING", newStatus: "COMPLETE", timestamp: "2026-08-03T00:00:00.000Z" },
    pending.next,
  );
  assert.equal(complete.grantsPro, true);
  const failed = apply(
    "APP_PAYMENT_STATUS",
    { previousStatus: "COMPLETE", newStatus: "FAILED", timestamp: "2026-08-04T00:00:00.000Z" },
    complete.next,
  );
  assert.equal(failed.grantsPro, false);
  const invented = apply(
    "APP_PAYMENT_STATUS",
    { previousStatus: "COMPLETE", newStatus: "CANCELED", timestamp: "2026-08-05T00:00:00.000Z" },
    complete.next,
  );
  assert.equal(invented.grantsPro, false);
  assert.equal(invented.warning, "ghl_marketplace_unknown_payment_status");
});

test("17. Uninstall disables tokens/integration", () => {
  const patch = ghlUninstallIntegrationCredentialPatch();
  assert.equal(patch.isActive, false);
  assert.equal(patch.accessToken, null);
  assert.equal(patch.refreshToken, null);
  const src = readFileSync(join(root, "server/ghlMarketplaceLifecycleService.ts"), "utf8");
  assert.match(src, /ghlUninstallIntegrationCredentialPatch/);
  assert.match(src, /webhook_uninstall_credentials_revoked/);
});

test("18. Event arriving before OAuth linking is reconciled later", () => {
  const result = apply("INSTALL", { planId: PRO_ID });
  assert.equal(result.next.whachatUserId, null);
  assert.equal(result.grantsPro, true);
  assert.equal(userHasActiveGhlMarketplaceProGrant("u1", [result.next], config), false);
  const linked = { ...result.next, whachatUserId: "u1" };
  assert.equal(userHasActiveGhlMarketplaceProGrant("u1", [linked], config), true);
  const oauth = readFileSync(join(root, "server/ghlOAuthFlow.ts"), "utf8");
  assert.match(oauth, /linkMarketplaceInstallToIntegration/);
  assert.doesNotMatch(
    readFileSync(join(root, "server/ghlMarketplaceLifecycleService.ts"), "utf8"),
    /accessToken:\s*["']/,
  );
});

test("18b. PLAN_CHANGE overlay cannot reintroduce OAuth secrets into raw_payload", () => {
  const merged = mergeGhlLifecycleRawPayload(
    { access_token: "keep-me", refresh_token: "keep-refresh", type: "INSTALL" },
    { type: "PLAN_CHANGE", newPlanId: PRO_ID },
  );
  assert.equal("access_token" in merged, false);
  assert.equal("refresh_token" in merged, false);
  assert.equal(merged.type, "PLAN_CHANGE");
  assert.equal(merged.newPlanId, PRO_ID);
});

test("19. Duplicate events are idempotent", () => {
  const first = apply("INSTALL", {
    planId: PRO_ID,
    webhookId: "wh_dup_1",
    timestamp: "2026-08-01T00:00:00.000Z",
  });
  const second = apply(
    "INSTALL",
    { planId: PRO_ID, webhookId: "wh_dup_1", timestamp: "2026-08-01T00:00:00.000Z" },
    first.next,
  );
  assert.equal(second.kind, "duplicate");
  assert.equal(second.next.lastWebhookId, first.next.lastWebhookId);
});

test("20. Older out-of-order events cannot overwrite newer state", () => {
  const newer = apply("PLAN_CHANGE", {
    currentPlanId: FREE_ID,
    newPlanId: PRO_ID,
    timestamp: "2026-08-10T00:00:00.000Z",
    webhookId: "wh_new",
  });
  assert.equal(newer.grantsPro, true);
  const older = apply(
    "PLAN_CHANGE",
    {
      currentPlanId: PRO_ID,
      newPlanId: FREE_ID,
      timestamp: "2026-08-01T00:00:00.000Z",
      webhookId: "wh_old",
    },
    newer.next,
  );
  assert.equal(older.kind, "stale");
  assert.equal(older.grantsPro, true);
  assert.equal(older.next.marketplacePlanId, PRO_ID);
});

test("21. /api/ext/webhook and /api/ghl/webhook use the same secure handler", () => {
  const ghlRoutes = readFileSync(join(root, "server/ghlRoutes.ts"), "utf8");
  const routes = readFileSync(join(root, "server/routes.ts"), "utf8");
  const index = readFileSync(join(root, "server/index.ts"), "utf8");
  assert.match(ghlRoutes, /export async function handleGhlWebhook/);
  assert.match(ghlRoutes, /router\.post\('\/webhook',\s*handleGhlWebhook\)/);
  assert.match(ghlRoutes, /verifyGhlWebhookSignature/);
  assert.match(ghlRoutes, /status\(401\)/);
  assert.doesNotMatch(ghlRoutes, /router\.post\('\/webhook',\s*async/);
  assert.match(routes, /app\.post\('\/api\/ghl\/webhook',\s*handleGhlWebhook\)/);
  assert.match(index, /app\.use\('\/api\/ext\/webhook'/);
  assert.match(index, /app\.use\('\/api\/ghl\/webhook'/);
  assert.match(index, /req\.rawBody = buf/);
  assert.equal(GHL_CANONICAL_WEBHOOK_PATH, "/api/ext/webhook");
  assert.equal(GHL_WEBHOOK_ALIAS_PATH, "/api/ghl/webhook");
  assert.equal(GHL_CANONICAL_WEBHOOK_URL, "https://app.whachatcrm.com/api/ext/webhook");
  assert.doesNotMatch(index, /www\.whachatcrm\.com\/api\/ext\/webhook/);
});

test("22. No retired Starter or AI Brain add-on logic is introduced", () => {
  const billing = readFileSync(join(root, "shared/ghlMarketplaceBilling.ts"), "utf8");
  const lifecycle = readFileSync(join(root, "shared/ghlMarketplaceLifecycle.ts"), "utf8");
  const planIds = readFileSync(join(root, "shared/ghlMarketplacePlanIds.ts"), "utf8");
  for (const src of [billing, lifecycle, planIds]) {
    assert.doesNotMatch(src, /starter/i);
    assert.doesNotMatch(src, /ai[_-]?brain[_-]?addon/i);
    assert.doesNotMatch(src, /\$29/);
  }
  assert.deepEqual([...GHL_SUPPORTED_CONTACT_EVENTS], ["ContactCreate", "ContactUpdate", "ContactTagUpdate"]);
  assert.deepEqual([...GHL_ACK_ONLY_DISABLED_EVENTS], ["ContactDndUpdate", "ConversationUnreadUpdate"]);
});

test("X-GHL-Signature present does not fall back to RSA", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from('{"type":"INSTALL"}', "utf8");
  const good = signEd25519(raw, privateKey);
  const result = verifyGhlWebhookSignature({
    rawBody: raw,
    headers: {
      "x-ghl-signature": "AAAA",
      "x-wh-signature": good,
    },
    keys: {
      ed25519PublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      rsaPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
  });
  assert.equal(result.ok, false);
});

test("handler rejects before lifecycle persist when signature is missing", () => {
  const ghlRoutes = readFileSync(join(root, "server/ghlRoutes.ts"), "utf8");
  const handler = ghlRoutes.slice(ghlRoutes.indexOf("export async function handleGhlWebhook"));
  const verifyIdx = handler.indexOf("verifyGhlWebhookSignature");
  const rejectIdx = handler.indexOf("status(401)");
  const persistIdx = handler.indexOf("persistGhlMarketplaceLifecycleEvent");
  assert.ok(verifyIdx >= 0 && rejectIdx > verifyIdx && persistIdx > rejectIdx);
});

test("sanitized stored payload does not keep tokens", () => {
  const stored = sanitizeGhlLifecyclePayloadForStorage({
    type: "INSTALL",
    planId: PRO_ID,
    access_token: "secret",
    refreshToken: "secret",
    companyId: "co_1",
  });
  assert.equal(stored.type, "INSTALL");
  assert.equal("access_token" in stored, false);
  assert.equal("refreshToken" in stored, false);
});

test("location-only UNINSTALL parses without companyId and does not clobber existing companyId", () => {
  const parsed = parseGhlLifecycleEvent({
    type: "UNINSTALL",
    appId: "698aac74b0b22c778055e2cc",
    locationId: "EOFOVqrgSM7x1c2WAV4m",
    webhookId: "a8acc102-542e-4425-927c-30a0dbae0fe3",
    timestamp: "2026-09-02T02:14:26.534Z",
    versionId: "6a9508949596830098ee3525",
    userId: "MDWRlJpN0ePLWn51JUaM",
    planId: "698abb1fc7198bfbf0b89a99",
    installType: "Location",
  });
  assert.ok(parsed);
  assert.equal(parsed.type, "UNINSTALL");
  assert.equal(parsed.locationId, "EOFOVqrgSM7x1c2WAV4m");
  assert.equal(parsed.companyId, "unknown");
  const installed = apply("INSTALL", {
    planId: FREE_ID,
    companyId: "Jyk3C3jKACswbgW8duhg",
    locationId: "EOFOVqrgSM7x1c2WAV4m",
    timestamp: "2026-09-02T02:11:59.557Z",
  });
  const uninstalled = applyGhlMarketplaceLifecycleEvent(installed.next, parsed, config);
  assert.equal(uninstalled.next.installationStatus, "Uninstalled");
  assert.equal(uninstalled.next.companyId, "Jyk3C3jKACswbgW8duhg");
  assert.equal(uninstalled.next.locationId, "EOFOVqrgSM7x1c2WAV4m");
});

test("diagnostics expose configured flags not plan ID values", () => {
  const env = {
    GHL_MARKETPLACE_FREE_PLAN_ID: FREE_ID,
    GHL_MARKETPLACE_PRO_PLAN_ID: PRO_ID,
  };
  const readiness = ghlMarketplacePlanConfigReadiness(ghlMarketplacePlanConfigFromEnv(env));
  const blob = JSON.stringify(readiness);
  assert.equal(readiness.planIdsConfigured, true);
  assert.doesNotMatch(blob, new RegExp(FREE_ID));
  assert.doesNotMatch(blob, new RegExp(PRO_ID));
});

test("GHL Pro plus grandfathered Stripe Starter is effective Pro", () => {
  const starter = user({ billingPlan: "starter", subscriptionStatus: "active" });
  assert.equal(getEffectivePlanForUser(starter, now, { ghlMarketplaceProActive: true }), "pro");
});

test("hash fallback is stable without webhookId", () => {
  const a = parseGhlLifecycleEvent({
    type: "INSTALL",
    companyId: "co_1",
    locationId: "loc_1",
    planId: PRO_ID,
    timestamp: "2026-08-01T00:00:00.000Z",
  });
  const b = parseGhlLifecycleEvent({
    type: "INSTALL",
    companyId: "co_1",
    locationId: "loc_1",
    planId: PRO_ID,
    timestamp: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(a?.webhookId, b?.webhookId);
  assert.ok(a?.webhookId.startsWith("h:"));
  assert.equal(a?.webhookId.length, 2 + 64);
  void createHash;
});
