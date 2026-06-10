/**
 * Test upsert writes flyer columns for a listing.
 * Usage: npx tsx scripts/test-upsert-flyer-cols.ts <listing-uuid>
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings, inventorySources } from "../shared/schema";
import {
  decryptSourceCredentials,
  upsertInventoryListing,
} from "../server/inventory/inventoryDb";
import { normalizeBridgeInteractiveProperty } from "../server/inventory/providers/bridgeInteractiveResoProvider";
import { BRIDGE_ODATA_BASE } from "../server/inventory/providers/bridgeInteractiveResoProvider";
import {
  bridgeInteractiveCredentialsSchema,
  bridgeInteractiveSourceConfigSchema,
} from "../shared/inventory/inventoryListingSchema";

const listingId = process.argv[2]?.trim();
if (!listingId) {
  console.error("Usage: npx tsx scripts/test-upsert-flyer-cols.ts <listing-uuid>");
  process.exit(1);
}

async function main() {
  const [row] = await db
    .select()
    .from(inventoryListings)
    .where(eq(inventoryListings.id, listingId))
    .limit(1);
  if (!row) throw new Error("listing not found");

  console.log("BEFORE", {
    squareFeet: row.squareFeet,
    yearBuilt: row.yearBuilt,
    hoaFeeCents: row.hoaFeeCents,
  });

  const [source] = await db
    .select()
    .from(inventorySources)
    .where(eq(inventorySources.id, row.sourceId))
    .limit(1);
  if (!source) throw new Error("source not found");

  const creds = bridgeInteractiveCredentialsSchema.parse(
    decryptSourceCredentials((source.credentialsEnc || {}) as Record<string, unknown>),
  );
  const cfg = bridgeInteractiveSourceConfigSchema.parse(source.config);
  const filter = encodeURIComponent(`ListingId eq '${row.providerListingId}'`);
  const url = `${BRIDGE_ODATA_BASE}/${cfg.datasetId}/Property/replication?$filter=${filter}&$top=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.serverToken}` } });
  const json = (await res.json()) as { value?: unknown[] };
  const normalized = normalizeBridgeInteractiveProperty(json.value?.[0]);
  if (!normalized) throw new Error("normalize failed");

  console.log("NORMALIZED", {
    squareFeet: normalized.squareFeet,
    yearBuilt: normalized.yearBuilt,
    hoaFeeCents: normalized.hoaFeeCents,
  });

  await upsertInventoryListing(row.userId, row.sourceId, normalized);

  const [after] = await db
    .select({
      squareFeet: inventoryListings.squareFeet,
      yearBuilt: inventoryListings.yearBuilt,
      hoaFeeCents: inventoryListings.hoaFeeCents,
      listingDetails: inventoryListings.listingDetails,
    })
    .from(inventoryListings)
    .where(eq(inventoryListings.id, listingId))
    .limit(1);

  console.log("AFTER", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
