/**
 * Backfill public_slug for shareable inventory listings.
 * Usage:
 *   npx tsx scripts/backfill-public-listing-slugs.ts [--dry-run] [--limit N|all] [--all] [--force]
 *   npx tsx scripts/backfill-public-listing-slugs.ts --all --batch-size=500
 */
import "dotenv/config";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings } from "../shared/schema";
import { MATCHABLE_INVENTORY_STATUSES } from "../shared/inventory/inventoryListingSchema";
import {
  buildListingPublicSlug,
  listingHasPublicSlugAddress,
} from "../shared/inventory/listingPublicSlug";
import { ensurePublicSlugForListing } from "../server/inventory/inventoryDb";
import { isProductionDevSeedGuardEnabled, isDevSeedProviderListingId } from "../shared/inventory/inventoryDevSeedGuard";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const scanAll = args.has("--all");

function readNumericArg(prefix: string, fallback: number): number {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  if (!match) return fallback;
  const parsed = Number.parseInt(match.split("=")[1] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limitRaw = limitArg?.split("=")[1]?.trim().toLowerCase();
const limitAll = scanAll || limitRaw === "all";
const maxRows = limitAll ? Number.POSITIVE_INFINITY : Number.parseInt(limitRaw ?? "500", 10);
const batchSize = readNumericArg("--batch-size", 500);

async function processRow(row: {
  id: string;
  publicSlug: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  providerListingId: string;
}): Promise<"assigned" | "skipped"> {
  if (isProductionDevSeedGuardEnabled() && isDevSeedProviderListingId(row.providerListingId)) {
    return "skipped";
  }

  const input = {
    id: row.id,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    zip: row.zip,
  };

  if (!listingHasPublicSlugAddress(input)) {
    return "skipped";
  }

  const slug = buildListingPublicSlug(input);
  if (!slug) {
    return "skipped";
  }

  if (dryRun) {
    console.log("[dry-run]", row.id, slug);
    return "assigned";
  }

  if (force && row.publicSlug) {
    const [updated] = await db
      .update(inventoryListings)
      .set({ publicSlug: slug, updatedAt: new Date() })
      .where(eq(inventoryListings.id, row.id))
      .returning({ id: inventoryListings.id });
    return updated ? "assigned" : "skipped";
  }

  const result = await ensurePublicSlugForListing(row.id);
  return result ? "assigned" : "skipped";
}

async function main() {
  const conditions = [inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES])];
  if (!force) conditions.push(isNull(inventoryListings.publicSlug));
  if (isProductionDevSeedGuardEnabled()) {
    conditions.push(sql`${inventoryListings.providerListingId} not like 'dev-seed-%'`);
  }

  let assigned = 0;
  let skipped = 0;
  let scanned = 0;
  let offset = 0;

  while (scanned < maxRows) {
    const take = limitAll
      ? batchSize
      : Math.min(batchSize, maxRows - scanned);

    const rows = await db
      .select({
        id: inventoryListings.id,
        publicSlug: inventoryListings.publicSlug,
        addressLine1: inventoryListings.addressLine1,
        addressLine2: inventoryListings.addressLine2,
        city: inventoryListings.city,
        state: inventoryListings.state,
        zip: inventoryListings.zip,
        status: inventoryListings.status,
        providerListingId: inventoryListings.providerListingId,
      })
      .from(inventoryListings)
      .where(and(...conditions))
      .orderBy(asc(inventoryListings.createdAt), asc(inventoryListings.id))
      .limit(take)
      .offset(offset);

    if (rows.length === 0) break;

    for (const row of rows) {
      const outcome = await processRow(row);
      if (outcome === "assigned") assigned += 1;
      else skipped += 1;
    }

    scanned += rows.length;
    offset += rows.length;

    if (rows.length < take) break;
    if (!limitAll && scanned >= maxRows) break;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        force,
        scanAll: limitAll,
        maxRows: limitAll ? "all" : maxRows,
        batchSize,
        scanned,
        assigned,
        skipped,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
