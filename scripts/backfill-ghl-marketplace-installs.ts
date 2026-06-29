/**
 * One-time backfill: ghl_marketplace_installs ← integrations (type = gohighlevel).
 *
 * Safe to run multiple times. Does not overwrite rich CSV/webhook marketplace rows
 * with sparse integration-only data; only fills missing links and empty fields.
 *
 * Usage:
 *   npx tsx scripts/backfill-ghl-marketplace-installs.ts
 *   npx tsx scripts/backfill-ghl-marketplace-installs.ts --dry-run
 *
 * Production order:
 *   1. Run migration 0054_ghl_marketplace_installs.sql
 *   2. Run this script
 *   3. Import GHL Marketplace CSV in Sales Admin → GHL tab
 *   4. Verify Sales Admin → GHL and Activation tabs
 */
import "dotenv/config";
import { backfillGhlMarketplaceInstallsFromIntegrations } from "../server/ghlMarketplaceService";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  console.log(`[ghl-backfill] Starting${dryRun ? " (dry-run)" : ""}...`);

  const result = await backfillGhlMarketplaceInstallsFromIntegrations({ dryRun });

  console.log("[ghl-backfill] Complete");
  console.log(`  Scanned integrations: ${result.scanned}`);
  console.log(`  Inserted:             ${result.inserted}`);
  console.log(`  Updated:              ${result.updated}`);
  console.log(`  Skipped:              ${result.skipped}`);

  if (result.errors.length > 0) {
    console.log(`  Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`    - ${err}`);
    }
  }

  if (dryRun) {
    console.log("\nDry-run only — no database writes were made.");
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[ghl-backfill] Fatal error:", err);
  process.exit(1);
});
