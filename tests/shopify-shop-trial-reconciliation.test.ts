/**
 * Read-only Shopify ledger reconciliation (mixed-version installs missing a row).
 * Run: npx tsx --test tests/shopify-shop-trial-reconciliation.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findShopifyInstallsMissingLedger,
  sanitizeMissingLedgerInstall,
} from "../shared/shopifyShopTrialReconciliation";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const windowStart = new Date("2026-08-27T00:00:00.000Z");

test("install without ledger row is reported; existing ledger of any status is not", () => {
  const missing = findShopifyInstallsMissingLedger(
    [
      {
        userId: "user-new",
        shopifyShop: "https://NewShop.myshopify.com/admin",
        email: "new@shopify.whachatcrm.com",
        shopifyInstalledAt: "2026-08-27T01:00:00.000Z",
        createdAt: "2026-08-27T01:00:00.000Z",
        trialStartedAt: "2026-08-27T01:00:00.000Z",
        trialEndsAt: "2026-09-10T01:00:00.000Z",
      },
      {
        userId: "user-blocked",
        shopifyShop: "dup.myshopify.com",
        shopifyInstalledAt: "2026-08-27T01:05:00.000Z",
        createdAt: "2026-08-27T01:05:00.000Z",
        trialStartedAt: null,
        trialEndsAt: null,
      },
      {
        userId: "user-old",
        shopifyShop: "old.myshopify.com",
        shopifyInstalledAt: "2026-08-19T07:00:00.000Z",
        createdAt: "2026-08-19T07:00:00.000Z",
        trialStartedAt: "2026-08-19T07:00:00.000Z",
        trialEndsAt: "2026-09-02T07:00:00.000Z",
      },
    ],
    [
      { canonicalShop: "dup.myshopify.com", status: "blocked_conflict" },
      { canonicalShop: "old.myshopify.com", status: "backfilled" },
    ],
    { since: windowStart },
  );

  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.canonicalShop, "newshop.myshopify.com");
  assert.equal(missing[0]?.userId, "user-new");
  assert.equal(missing[0]?.hasUserTrialDates, true);
  assert.equal(missing[0]?.source, "shopify_shop");
});

test("synthetic-email install without shopify_shop is still detected", () => {
  const missing = findShopifyInstallsMissingLedger(
    [
      {
        userId: "user-synth",
        shopifyShop: null,
        email: "orphan@shopify.whachatcrm.com",
        shopifyInstalledAt: null,
        createdAt: "2026-08-27T02:00:00.000Z",
        trialStartedAt: null,
        trialEndsAt: null,
      },
    ],
    [],
    { since: windowStart },
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.canonicalShop, "orphan.myshopify.com");
  assert.equal(missing[0]?.source, "synthetic_email");
  assert.equal(missing[0]?.hasUserTrialDates, false);
});

test("since filter excludes older installs outside the mixed-version window", () => {
  const missing = findShopifyInstallsMissingLedger(
    [
      {
        userId: "user-before",
        shopifyShop: "early.myshopify.com",
        shopifyInstalledAt: "2026-08-26T12:00:00.000Z",
        createdAt: "2026-08-26T12:00:00.000Z",
      },
    ],
    [],
    { since: windowStart },
  );
  assert.equal(missing.length, 0);
});

test("sanitized output has no shop domain; script is read-only", () => {
  const sanitized = sanitizeMissingLedgerInstall(
    {
      canonicalShop: "newshop.myshopify.com",
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaa3890884a",
      source: "shopify_shop",
      installedAtIso: "2026-08-27T01:00:00.000Z",
      createdAtIso: "2026-08-27T01:00:00.000Z",
      hasUserTrialDates: true,
    },
    "shop_abc123def456",
  );
  const json = JSON.stringify(sanitized);
  assert.ok(!json.includes("myshopify.com"));
  assert.ok(!json.includes("newshop"));
  assert.equal(sanitized.shopHash, "shop_abc123def456");
  assert.equal(sanitized.userIdTail, "3890884a");

  const script = src("scripts/reconcile-shopify-shop-trials.ts");
  assert.ok(script.includes("mode=read-only"));
  assert.ok(script.includes("findShopifyInstallsMissingLedger"));
  assert.ok(script.includes("hashShopifyShopForLogs"));
  assert.ok(!script.includes("claimShopifyShopTrialForInstall"));
  assert.ok(!script.includes("trialStatus"));
  assert.ok(!script.includes(".insert("));
  assert.ok(!script.includes(".update("));
  assert.ok(!script.includes(".delete("));
  assert.ok(script.includes("Does not grant, restart, or change trials"));
});
