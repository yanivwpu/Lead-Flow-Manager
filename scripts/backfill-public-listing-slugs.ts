/**
 * Backfill public_slug for shareable inventory listings.
 * Usage:
 *   npx tsx scripts/backfill-public-listing-slugs.ts [--dry-run] [--limit N] [--all] [--force]
 */
import "dotenv/config";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
const all = args.has("--all");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = all ? 1_000_000 : Number.parseInt(limitArg?.split("=")[1] ?? "500", 10);

async function main() {
  const conditions = [inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES])];
  if (!force) conditions.push(isNull(inventoryListings.publicSlug));
  if (isProductionDevSeedGuardEnabled()) {
    conditions.push(sql`${inventoryListings.providerListingId} not like 'dev-seed-%'`);
  }

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
    .limit(limit);

  let assigned = 0;
  let skipped = 0;

  for (const row of rows) {
    if (isProductionDevSeedGuardEnabled() && isDevSeedProviderListingId(row.providerListingId)) {
      skipped += 1;
      continue;
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
      skipped += 1;
      continue;
    }

    const slug = buildListingPublicSlug(input);
    if (!slug) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log("[dry-run]", row.id, slug);
      assigned += 1;
      continue;
    }

    if (force && row.publicSlug) {
      const [updated] = await db
        .update(inventoryListings)
        .set({ publicSlug: slug, updatedAt: new Date() })
        .where(eq(inventoryListings.id, row.id))
        .returning({ id: inventoryListings.id });
      if (updated) assigned += 1;
      else skipped += 1;
      continue;
    }

    const result = await ensurePublicSlugForListing(row.id);
    if (result) assigned += 1;
    else skipped += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        force,
        scanned: rows.length,
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
