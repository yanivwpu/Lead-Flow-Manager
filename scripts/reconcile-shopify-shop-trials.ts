/**
 * READ-ONLY post-deploy check: Shopify OAuth/installs with no shopify_shop_trials row.
 *
 * Use after deploying the shop-trial ledger to find mixed-version installs.
 * Does not grant, restart, insert, or modify any trial.
 *
 * Usage:
 *   npx tsx scripts/reconcile-shopify-shop-trials.ts
 *   npx tsx scripts/reconcile-shopify-shop-trials.ts --since=2026-08-27T00:00:00.000Z
 *
 * Output is sanitized (shop hashes + user ids). Canonical shop domains are not printed.
 */
import "dotenv/config";
import { isNotNull, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { shopifyShopTrials, users } from "../shared/schema";
import { hashShopifyShopForLogs } from "../server/shopifyShopTrialService";
import {
  findShopifyInstallsMissingLedger,
  sanitizeMissingLedgerInstall,
} from "../shared/shopifyShopTrialReconciliation";

function parseSince(argv: string[]): Date | null {
  for (const arg of argv) {
    if (arg.startsWith("--since=")) {
      const raw = arg.slice("--since=".length).trim();
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`Invalid --since timestamp: ${raw}`);
      }
      return d;
    }
  }
  return null;
}

function dbHostLabel(): string {
  const url = process.env.DATABASE_URL || "";
  try {
    const u = new URL(url.replace(/^postgres:/, "postgresql:"));
    return `${u.hostname}/${(u.pathname || "").replace(/^\//, "")}`;
  } catch {
    return "(unparsed DATABASE_URL)";
  }
}

async function main(): Promise<void> {
  const since = parseSince(process.argv.slice(2));
  console.log("[shopify-trial-reconcile] mode=read-only");
  console.log(`[shopify-trial-reconcile] db=${dbHostLabel()}`);
  console.log(
    `[shopify-trial-reconcile] since=${since ? since.toISOString() : "(all missing ledger rows)"}`,
  );
  console.log(
    "[shopify-trial-reconcile] Does not grant, restart, or change trials. Report only.",
  );

  const [installs, ledger] = await Promise.all([
    db
      .select({
        userId: users.id,
        shopifyShop: users.shopifyShop,
        email: users.email,
        shopifyInstalledAt: users.shopifyInstalledAt,
        createdAt: users.createdAt,
        trialStartedAt: users.trialStartedAt,
        trialEndsAt: users.trialEndsAt,
      })
      .from(users)
      .where(
        or(
          isNotNull(users.shopifyShop),
          sql`lower(${users.email}) like '%@shopify.whachatcrm.com'`,
        ),
      ),
    db
      .select({
        canonicalShop: shopifyShopTrials.canonicalShop,
        status: shopifyShopTrials.status,
      })
      .from(shopifyShopTrials),
  ]);

  const missing = findShopifyInstallsMissingLedger(installs, ledger, { since });
  console.log(
    `[shopify-trial-reconcile] users_scanned=${installs.length} ledger_rows=${ledger.length} missing=${missing.length}`,
  );

  for (const row of missing) {
    const sanitized = sanitizeMissingLedgerInstall(row, hashShopifyShopForLogs(row.canonicalShop));
    console.log(`[shopify-trial-reconcile] missing ${JSON.stringify(sanitized)}`);
  }

  console.log("[shopify-trial-reconcile] complete. No writes performed.");
}

main().catch((err) => {
  console.error("[shopify-trial-reconcile] fatal:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
