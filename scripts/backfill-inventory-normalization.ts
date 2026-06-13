/**
 * Backfill normalized property type, sale/rent, and pool flags on existing inventory.
 *
 * Usage:
 *   npx tsx scripts/backfill-inventory-normalization.ts --userId <uuid>
 *   npx tsx scripts/backfill-inventory-normalization.ts --userId <uuid> --all-statuses
 *   npx tsx scripts/backfill-inventory-normalization.ts --userId <uuid> --from-bridge
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings } from "../shared/schema";
import {
  backfillAllSourcesForUser,
  backfillStoredListingNormalizationForUser,
  countListingNormalizationSummary,
} from "../server/inventory/inventoryNormalizationBackfill";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function resolveUserId(): Promise<string> {
  const userId = argValue("--userId");
  if (userId) return userId;

  const [topUser] = await db
    .select({ userId: inventoryListings.userId, count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .groupBy(inventoryListings.userId)
    .orderBy(sql`count(*) desc`)
    .limit(1);
  if (!topUser?.userId) throw new Error("No inventory — pass --userId");
  console.log("(auto-selected userId with most inventory)");
  return topUser.userId;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const userId = await resolveUserId();
  const fromBridge = process.argv.includes("--from-bridge");
  const allStatuses = process.argv.includes("--all-statuses");

  console.log("\n=== Inventory normalization backfill ===\n");
  console.log("userId:", userId);

  const before = await countListingNormalizationSummary(userId);
  console.log("\nBefore (active/coming_soon):", before);

  const stats = fromBridge
    ? await backfillAllSourcesForUser(userId)
    : await backfillStoredListingNormalizationForUser(userId, {
        activeOnly: !allStatuses,
      });

  const after = await countListingNormalizationSummary(userId);
  console.log("\nBackfill stats:", stats);
  console.log("\nAfter (active/coming_soon):", after);
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
