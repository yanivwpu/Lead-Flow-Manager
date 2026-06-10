/**
 * One-time backfill of square_feet / year_built / hoa_fee_cents for a source or all sources.
 * Usage:
 *   npx tsx scripts/backfill-flyer-columns.ts <source-id>
 *   npx tsx scripts/backfill-flyer-columns.ts --all
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventorySources } from "../shared/schema";
import { decryptSourceCredentials } from "../server/inventory/inventoryDb";
import {
  backfillMissingFlyerColumnsForSource,
  expectedSyncCredentialField,
} from "../server/inventory/inventoryFlyerBackfill";
import { providerSupportsListingSync, type InventoryProvider } from "../shared/inventory/inventoryProviderSchema";
import { inventorySourceHasSyncCredentials } from "../server/inventory/inventorySourceService";
import { assertProductionDevSeedSourceAllowed } from "../shared/inventory/inventoryDevSeedGuard";

const arg = (process.argv[2] || "").trim();
if (!arg) {
  console.error("Usage: npx tsx scripts/backfill-flyer-columns.ts <source-id> | --all");
  process.exit(1);
}

async function main() {
  const sources =
    arg === "--all"
      ? await db.select().from(inventorySources)
      : await db.select().from(inventorySources).where(eq(inventorySources.id, arg));

  if (sources.length === 0) {
    console.error("No sources found for:", arg);
    process.exit(1);
  }

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
        displayName: source.displayName,
        expectedField: expectedSyncCredentialField(provider),
        credentialKeys: Object.keys(creds),
      });
      continue;
    }

    console.log("backfill:", {
      id: source.id,
      provider,
      displayName: source.displayName,
      expectedField: expectedSyncCredentialField(provider),
      credentialKeys: Object.keys(creds),
    });

    const stats = await backfillMissingFlyerColumnsForSource(source.userId, source.id, {
      maxListings: 5000,
    });
    console.log(source.id, stats);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
