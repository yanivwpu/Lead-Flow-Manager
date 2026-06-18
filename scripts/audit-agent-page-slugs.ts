/**
 * Read-only slug + visibility audit for bulk publish planning.
 * Usage: npx tsx scripts/audit-agent-page-slugs.ts [userId]
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings } from "../shared/schema";
import { MATCHABLE_INVENTORY_STATUSES } from "../shared/inventory/inventoryListingSchema";
import { publicListingMlsGateSql } from "../shared/inventory/publicListingMlsGateSql";
import {
  listingHasPublicSlugAddress,
  normalizeListingSlugAddressInput,
} from "../shared/inventory/listingPublicSlug";
import {
  countPublicShareableListings,
  getListingPublicationStats,
} from "../server/inventory/inventoryDb";
import { fetchPublishedListingsForAgentPage } from "../server/agentPage/agentPageDb";

const DEFAULT_USER_ID = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";

async function main() {
  const userId = (process.argv[2] || DEFAULT_USER_ID).trim();

  const eligibleConds = [
    eq(inventoryListings.userId, userId),
    inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
    publicListingMlsGateSql(),
    eq(inventoryListings.publishPublicly, false),
  ];

  const rows = await db
    .select({
      id: inventoryListings.id,
      publicSlug: inventoryListings.publicSlug,
      addressLine1: inventoryListings.addressLine1,
      addressLine2: inventoryListings.addressLine2,
      city: inventoryListings.city,
      state: inventoryListings.state,
      zip: inventoryListings.zip,
    })
    .from(inventoryListings)
    .where(and(...eligibleConds));

  let existingPublicSlug = 0;
  let missingPublicSlug = 0;
  let slugGeneratableOnBulkPublish = 0;
  let wouldRemainUuidOnly = 0;

  for (const row of rows) {
    if (row.publicSlug?.trim()) existingPublicSlug += 1;
    else missingPublicSlug += 1;

    const input = normalizeListingSlugAddressInput(row);
    if (listingHasPublicSlugAddress(input)) slugGeneratableOnBulkPublish += 1;
    else if (!row.publicSlug?.trim()) wouldRemainUuidOnly += 1;
  }

  const publicationStats = await getListingPublicationStats(userId);
  const sitemapCountNow = await countPublicShareableListings();
  const agentPageVisibleNow = (await fetchPublishedListingsForAgentPage(userId)).length;

  const report = {
    userId,
    publicationStats,
    eligibleUnpublished: rows.length,
    existingPublicSlug,
    missingPublicSlug,
    slugGeneratableOnBulkPublish,
    wouldRemainUuidOnly,
    sitemapCountNow,
    sitemapCountAfterPublish: sitemapCountNow + rows.length,
    agentPageVisibleNow,
    agentPageCardsAfterPublish: Math.min(rows.length, 200),
    agentPagePublishedTotal: rows.length,
    agentPageFetchLimit: 200,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
