/**
 * Shopify lifetime shop-trial ledger (pure policy + source contracts).
 * Run: npx tsx tests/shopify-shop-trial-ledger.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeShopifyShopDomain,
  shopDomainFromShopifySyntheticEmail,
} from "../shared/shopifyBilling";
import {
  addShopifyTrialDays,
  decideShopifyShopTrialBackfill,
  decideShopifyShopTrialClaim,
  isBlockedShopifyShopTrialStatus,
  shopifyInstallShouldGrantUserTrial,
  shopifyLedgerPreventsAutomaticGrant,
  SHOPIFY_SHOP_TRIAL_DAYS,
  SHOPIFY_SHOP_TRIAL_REDACT_POLICY,
} from "../shared/shopifyShopTrialPolicy";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function section(title: string) {
  console.log(`\n== ${title} ==`);
}

section("canonical shop normalization");
{
  assert.equal(normalizeShopifyShopDomain("Store.myshopify.com"), "store.myshopify.com");
  assert.equal(
    normalizeShopifyShopDomain("https://store.myshopify.com/admin/apps"),
    "store.myshopify.com",
  );
  assert.equal(
    normalizeShopifyShopDomain("http://user:pass@store.myshopify.com:443/path?x=1#hash"),
    "store.myshopify.com",
  );
  assert.equal(normalizeShopifyShopDomain("www.store.myshopify.com"), "store.myshopify.com");
  assert.equal(normalizeShopifyShopDomain("store.example.com"), null);
  assert.equal(normalizeShopifyShopDomain(""), null);
  assert.equal(
    shopDomainFromShopifySyntheticEmail("store@shopify.whachatcrm.com"),
    "store.myshopify.com",
  );
}

section("user grant eligibility");
{
  const base = {
    planOverrideEnabled: false,
    planOverride: null,
    billingPlan: "free",
    subscriptionStatus: "active",
    shopifyShop: "store.myshopify.com",
    shopifySubscriptionStatus: "pending",
    trialEndsAt: null,
    trialStartedAt: null,
    trialStatus: "none",
  } as const;
  assert.equal(shopifyInstallShouldGrantUserTrial(base as any), true);
  assert.equal(
    shopifyInstallShouldGrantUserTrial({ ...base, trialEndsAt: new Date() } as any),
    false,
  );
  assert.equal(
    shopifyInstallShouldGrantUserTrial({ ...base, trialStatus: "expired" } as any),
    false,
  );
  assert.equal(
    shopifyInstallShouldGrantUserTrial({ ...base, billingPlan: "pro", subscriptionStatus: "active" } as any),
    false,
  );
  const start = new Date("2026-08-01T00:00:00.000Z");
  assert.equal(addShopifyTrialDays(start).toISOString(), "2026-08-15T00:00:00.000Z");
  assert.equal(SHOPIFY_SHOP_TRIAL_DAYS, 14);
}

section("backfill preserves original dates; ambiguous shops get durable blocked rows");
{
  const started = new Date("2026-08-19T07:23:33.503Z");
  const ends = addShopifyTrialDays(started);
  const insert = decideShopifyShopTrialBackfill([
    {
      canonicalShop: "https://Ys11ty-tj.myshopify.com/admin",
      userId: "user-a",
      trialStartedAt: started,
      trialEndsAt: ends,
      trialPlan: "pro_ai",
    },
  ]);
  assert.equal(insert[0]?.action, "insert");
  if (insert[0]?.action === "insert") {
    assert.equal(insert[0].row.canonicalShop, "ys11ty-tj.myshopify.com");
    assert.equal(insert[0].row.status, "backfilled");
    assert.equal(insert[0].row.trialStartedAt.toISOString(), started.toISOString());
    assert.equal(insert[0].row.trialEndsAt.toISOString(), ends.toISOString());
  }

  const conflict = decideShopifyShopTrialBackfill([
    {
      canonicalShop: "dup.myshopify.com",
      userId: "u1",
      trialStartedAt: started,
      trialEndsAt: ends,
      trialPlan: "pro_ai",
    },
    {
      canonicalShop: "dup.myshopify.com",
      userId: "u2",
      trialStartedAt: new Date("2026-08-20T00:00:00.000Z"),
      trialEndsAt: addShopifyTrialDays(new Date("2026-08-20T00:00:00.000Z")),
      trialPlan: "pro_ai",
    },
  ]);
  const conflictDecision = conflict.find((d) => d.action === "block_conflict");
  assert.ok(conflictDecision);
  if (conflictDecision?.action === "block_conflict") {
    assert.equal(conflictDecision.skip_conflict, true);
    assert.equal(conflictDecision.row.status, "blocked_conflict");
    assert.equal(conflictDecision.row.trialStartedAt, null);
    assert.equal(conflictDecision.row.trialEndsAt, null);
    assert.equal(shopifyLedgerPreventsAutomaticGrant(conflictDecision.row), true);
    assert.equal(isBlockedShopifyShopTrialStatus(conflictDecision.row.status), true);
  }

  const noTrial = decideShopifyShopTrialBackfill([
    {
      canonicalShop: "fresh.myshopify.com",
      userId: "u3",
      trialStartedAt: null,
      trialEndsAt: null,
      trialPlan: null,
    },
  ]);
  assert.equal(noTrial[0]?.action, "block_unknown_history");
  if (noTrial[0]?.action === "block_unknown_history") {
    assert.equal(noTrial[0].skip_no_trial, true);
    assert.equal(noTrial[0].row.status, "blocked_unknown_history");
    assert.equal(noTrial[0].row.trialStartedAt, null);
    assert.equal(shopifyLedgerPreventsAutomaticGrant(noTrial[0].row), true);
  }
}

section("skip_conflict and skip_no_trial cannot later receive a trial");
{
  const eligible = true;
  const conflictGrant = decideShopifyShopTrialClaim({
    canonicalShop: "dup.myshopify.com",
    ledgerReady: true,
    existingLedger: { status: "blocked_conflict" },
    userEligible: eligible,
  });
  assert.equal(conflictGrant.insert, false);
  assert.equal(conflictGrant.grantUserTrial, false);
  assert.equal(conflictGrant.reason, "ledger_exists");

  const noTrialGrant = decideShopifyShopTrialClaim({
    canonicalShop: "fresh.myshopify.com",
    ledgerReady: true,
    existingLedger: { status: "blocked_unknown_history" },
    userEligible: eligible,
  });
  assert.equal(noTrialGrant.insert, false);
  assert.equal(noTrialGrant.grantUserTrial, false);
  assert.equal(noTrialGrant.reason, "ledger_exists");

  const backfilledGrant = decideShopifyShopTrialClaim({
    canonicalShop: "known.myshopify.com",
    ledgerReady: true,
    existingLedger: { status: "backfilled" },
    userEligible: eligible,
  });
  assert.equal(backfilledGrant.grantUserTrial, false);

  const notReady = decideShopifyShopTrialClaim({
    canonicalShop: "new.myshopify.com",
    ledgerReady: false,
    existingLedger: null,
    userEligible: eligible,
  });
  assert.equal(notReady.insert, false);
  assert.equal(notReady.grantUserTrial, false);
  assert.equal(notReady.reason, "ledger_not_ready");

  const first = decideShopifyShopTrialClaim({
    canonicalShop: "new.myshopify.com",
    ledgerReady: true,
    existingLedger: null,
    userEligible: eligible,
  });
  assert.equal(first.insert, true);
  assert.equal(first.grantUserTrial, true);
}

section("in-memory concurrent first claim cannot double-grant");
{
  const ledger = new Map<string, { granted: boolean }>();
  function claim(shop: string, eligible: boolean) {
    if (ledger.has(shop)) return { claimed: false, granted: false };
    ledger.set(shop, { granted: eligible });
    return { claimed: true, granted: eligible };
  }
  const results = [claim("a.myshopify.com", true), claim("a.myshopify.com", true)];
  assert.equal(results.filter((r) => r.claimed).length, 1);
  assert.equal(results.filter((r) => r.granted).length, 1);
}

section("source: atomic claim + blocked rows never overwritten + sanitized logs");
{
  const service = src("server/shopifyShopTrialService.ts");
  assert.ok(service.includes("db.transaction"));
  assert.ok(service.includes("onConflictDoNothing"));
  assert.ok(service.includes("shopifyShopTrials.canonicalShop"));
  assert.ok(service.includes("isShopifyShopTrialLedgerReady"));
  assert.ok(service.includes('status: "granted"'));
  assert.ok(service.includes("ledger_not_ready"));
  assert.ok(service.includes("hashShopifyShopForLogs"));
  assert.ok(!service.includes("shop: normalizedShop"));
  assert.ok(service.includes("ensureUsersShopifyShopUniqueIndex"));
  assert.ok(service.includes("users_shopify_shop_uidx NOT created"));

  const routes = src("server/shopifyRoutes.ts");
  assert.ok(routes.includes("claimShopifyShopTrialForInstall"));
  assert.ok(routes.includes("trialStatus: 'none'"));
  assert.ok(routes.includes("shopHash"));
  assert.ok(!routes.includes("const neverHadTrial"));

  const billing = src("server/shopify.ts");
  const billingFn = billing.slice(billing.indexOf("syncShopifyBillingToUser"));
  assert.ok(billing.includes("export async function syncShopifyBillingToUser"));
  assert.ok(!billingFn.includes("trialEndsAt"));
  assert.ok(!billingFn.includes("trialStartedAt"));

  const managed = src("server/shopifyManagedPricing.ts");
  assert.ok(!managed.includes("trialEndsAt"));
  assert.ok(!managed.includes("trialStartedAt"));

  const install = src("server/shopifyInstallUser.ts");
  const synthIdx = install.indexOf('resolution: "synthetic_email"');
  const sessionIdx = install.indexOf('resolution: "session_link"');
  assert.ok(synthIdx > 0 && sessionIdx > synthIdx, "synthetic email is resolved before session_link");
}

section("uninstall keeps ledger; shop/redact deletes identifying ledger");
{
  const routes = src("server/shopifyRoutes.ts");
  const uninstallStart = routes.indexOf("router.post('/webhooks/app-uninstalled'");
  const uninstallEnd = routes.indexOf("router.post('/webhooks/subscription-update'");
  const uninstall = routes.slice(uninstallStart, uninstallEnd);
  assert.ok(uninstall.includes("shopifySubscriptionStatus: 'uninstalled'"));
  assert.ok(!uninstall.includes("deleteShopifyShopTrialLedgerForCanonicalShop"));
  assert.ok(uninstall.includes("Keep shopify_shop and shopify_shop_trials"));

  const redactStart = routes.indexOf("router.post('/webhooks/shop/redact'");
  const redact = routes.slice(redactStart, redactStart + 3500);
  assert.ok(redact.includes("deleteShopifyShopTrialLedgerForCanonicalShop"));
  assert.ok(redact.includes("may qualify as a new shop trial"));
  assert.ok(!redact.includes("intentionally\n      // not deleted"));
  assert.ok(!redact.includes("non-PII lifetime consumption"));

  const service = src("server/shopifyShopTrialService.ts");
  assert.ok(service.includes("export async function deleteShopifyShopTrialLedgerForCanonicalShop"));
  assert.ok(service.includes(".delete(shopifyShopTrials)"));
  assert.match(SHOPIFY_SHOP_TRIAL_REDACT_POLICY, /shop\/redact/);
  assert.match(SHOPIFY_SHOP_TRIAL_REDACT_POLICY, /may qualify as a new shop trial/);
  assert.match(SHOPIFY_SHOP_TRIAL_REDACT_POLICY, /User deletion does not delete the ledger/);
}

section("migration/backfill fail-closed, idempotent, no silent unique-index skip");
{
  const mig = src("migrations/0084_shopify_shop_trials.sql");
  assert.ok(mig.includes("CREATE TABLE IF NOT EXISTS shopify_shop_trials"));
  assert.ok(mig.includes("ON DELETE SET NULL"));
  assert.ok(mig.includes("ON CONFLICT (canonical_shop) DO NOTHING"));
  assert.ok(mig.includes("blocked_conflict"));
  assert.ok(mig.includes("blocked_unknown_history"));
  assert.ok(mig.includes("conflicting_trial_dates"));
  assert.ok(mig.includes("no_original_trial_dates"));
  assert.ok(mig.includes("count(DISTINCT (trial_started_at, trial_ends_at, trial_plan))"));
  assert.ok(mig.includes("No access tokens"));
  assert.ok(mig.includes("Deleted on shop/redact") || mig.includes("deleted with store data"));
  assert.ok(!mig.includes("RAISE NOTICE '0084 skip users_shopify_shop_uidx"));
  assert.ok(!mig.includes("Preserved through GDPR shop/redact"));

  const patches = src("server/startupSchemaPatches.ts");
  assert.ok(patches.includes('tag: "0084_shopify_shop_trials"'));
  assert.ok(patches.includes("blocked_conflict"));
  assert.ok(patches.includes("blocked_unknown_history"));
  assert.ok(patches.includes("ensureUsersShopifyShopUniqueIndex"));
  assert.ok(patches.includes("setShopifyShopTrialLedgerReady(true)"));
  assert.ok(patches.includes("shopifyShopTrialLedgerPatchOk"));
  assert.ok(!patches.includes("RAISE NOTICE '0084 skip users_shopify_shop_uidx"));
}

section("schema: user deletion does not drop shop ledger; dates nullable for blocked rows");
{
  const schema = src("shared/schema.ts");
  assert.ok(schema.includes('onDelete: "set null"'));
  assert.ok(schema.includes("shopify_shop_trials"));
  assert.ok(schema.includes("users_shopify_shop_uidx"));
  assert.ok(schema.includes('status: text("status")'));
  assert.ok(schema.includes('blockReason: text("block_reason")'));
  assert.ok(schema.includes('trialStartedAt: timestamp("trial_started_at")'));
  assert.ok(!schema.includes('trialStartedAt: timestamp("trial_started_at").notNull()'));
  assert.ok(schema.includes("Deleted on valid shop/redact") || schema.includes("Deleted on valid shop/redact together"));
}

section("startup: 0084 completes before listen; OAuth cannot grant until ready");
{
  const indexSrc = src("server/index.ts");
  const patchCall = indexSrc.indexOf("const schemaPatches = await applyStartupSchemaPatches()");
  const listenCall = indexSrc.indexOf("httpServer.listen");
  assert.ok(patchCall > 0 && listenCall > patchCall, "0084 runs before HTTP listen");
  assert.ok(indexSrc.includes("shopifyShopTrialLedgerPatchOk"));
  assert.ok(indexSrc.includes("refusing to listen so OAuth cannot grant trials"));

  const service = src("server/shopifyShopTrialService.ts");
  const readyCheck = service.indexOf("isShopifyShopTrialLedgerReady");
  const insertCall = service.indexOf(".insert(shopifyShopTrials)");
  assert.ok(readyCheck > 0 && insertCall > readyCheck, "ready gate is before insert/grant");
}

console.log("\nAll shopify-shop-trial-ledger tests passed.");
