/**
 * Backfill listing_compliance from MLS/RESO for all or one inventory source.
 * Usage:
 *   npx tsx scripts/backfill-listing-compliance.ts --audit
 *   npx tsx scripts/backfill-listing-compliance.ts <source-id>
 *   npx tsx scripts/backfill-listing-compliance.ts --all
 *   npx tsx scripts/backfill-listing-compliance.ts --all --include-inactive
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventorySources } from "../shared/schema";
import { decryptSourceCredentials } from "../server/inventory/inventoryDb";
import {
  backfillMissingListingComplianceForSource,
  countListingComplianceFieldPopulation,
} from "../server/inventory/inventoryComplianceBackfill";
import { expectedSyncCredentialField } from "../server/inventory/inventoryFlyerBackfill";
import { providerSupportsListingSync, type InventoryProvider } from "../shared/inventory/inventoryProviderSchema";
import { inventorySourceHasSyncCredentials } from "../server/inventory/inventorySourceService";
import { assertProductionDevSeedSourceAllowed } from "../shared/inventory/inventoryDevSeedGuard";

const args = process.argv.slice(2);
const auditOnly = args.includes("--audit");
const allSources = args.includes("--all");
const includeInactive = args.includes("--include-inactive");
const sourceIdArg = args.find((a) => !a.startsWith("--"));

async function printAudit() {
  const counts = await countListingComplianceFieldPopulation();
  console.log("\n=== Compliance field population (production DB) ===\n");
  console.log(`Total listings:              ${counts.total}`);
  console.log(`Matchable (active/CS):       ${counts.matchable}`);
  console.log(`With extractedAt:            ${counts.withExtractedAt}`);
  console.log(`With listOfficeName:         ${counts.withListOfficeName}`);
  console.log(`With mlsListingId:         ${counts.withMlsListingId}`);
  console.log(`With mlsSourceName:          ${counts.withMlsSourceName}`);
  console.log(`Attribution complete (3/3):  ${counts.attributionComplete}`);
  console.log(`MLS gate eligible:           ${counts.complianceEligible}`);
}

async function main() {
  if (auditOnly) {
    await printAudit();
    return;
  }

  if (!allSources && !sourceIdArg) {
    console.error(
      "Usage: npx tsx scripts/backfill-listing-compliance.ts --audit | <source-id> | --all [--include-inactive]",
    );
    process.exit(1);
  }

  const sources = allSources
    ? await db.select().from(inventorySources)
    : await db.select().from(inventorySources).where(eq(inventorySources.id, sourceIdArg!));

  if (sources.length === 0) {
    console.error("No sources found.");
    process.exit(1);
  }

  console.log("Before backfill:");
  await printAudit();

  for (const source of sources) {
    const provider = source.provider as InventoryProvider;
    if (!providerSupportsListingSync(provider)) {
      console.log("skip (no listing sync):", source.id, provider);
      continue;
    }

    const devSeedGuard = assertProductionDevSeedSourceAllowed(
      (source.config || {}) as Record<string, unknown>,
    );
    if (!devSeedGuard.ok) {
      console.log("skip (dev seed blocked):", source.id, provider, devSeedGuard.message);
      continue;
    }

    const creds = decryptSourceCredentials((source.credentialsEnc || {}) as Record<string, unknown>);
    if (!inventorySourceHasSyncCredentials(provider, creds)) {
      console.log("skip (no credentials):", {
        id: source.id,
        provider,
        expectedField: expectedSyncCredentialField(provider),
      });
      continue;
    }

    console.log("\nbackfill:", source.id, provider, source.displayName);
    const stats = await backfillMissingListingComplianceForSource(source.userId, source.id, {
      maxListings: 25_000,
      activeOnly: !includeInactive,
    });
    console.log(stats);
  }

  console.log("\nAfter backfill:");
  await printAudit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
