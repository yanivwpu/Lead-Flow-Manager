/**
 * Trace one listing by UUID through Bridge → normalize → DB.
 * Usage: npx tsx scripts/trace-listing-by-id.ts <listing-uuid>
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "../drizzle/db";
import { inventoryListings, inventorySources } from "../shared/schema";
import {
  decryptSourceCredentials,
  getPublicShareListing,
} from "../server/inventory/inventoryDb";
import {
  bridgeInteractiveCredentialsSchema,
  bridgeInteractiveSourceConfigSchema,
} from "../shared/inventory/inventoryListingSchema";
import { normalizeBridgeInteractiveProperty } from "../server/inventory/providers/bridgeInteractiveResoProvider";
import { BRIDGE_ODATA_BASE } from "../server/inventory/providers/bridgeInteractiveResoProvider";
import {
  extractResoSquareFeet,
  extractResoHoaFeeCents,
  extractResoYearBuilt,
} from "../shared/inventory/reso/resoNormalizer";
import {
  inventoryRowToFlyerListing,
  resolveFlyerSpecFields,
  buildPublicListingFlyerHtml,
} from "../shared/inventory/publicListingFlyer";

const listingId = (process.argv[2] || "").trim();
if (!listingId) {
  console.error("Usage: npx tsx scripts/trace-listing-by-id.ts <listing-uuid>");
  process.exit(1);
}

async function main() {
  const [row] = await db
    .select()
    .from(inventoryListings)
    .where(eq(inventoryListings.id, listingId))
    .limit(1);

  if (!row) {
    console.error("Listing not found:", listingId);
    process.exit(1);
  }

  console.log("\n=== DB row (inventory_listings) ===\n");
  console.log({
    id: row.id,
    providerListingId: row.providerListingId,
    provider: row.provider,
    squareFeet: row.squareFeet,
    yearBuilt: row.yearBuilt,
    hoaFeeCents: row.hoaFeeCents,
    listingDetails: row.listingDetails,
    syncedAt: row.syncedAt,
  });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rawCols = await pool.query(
    `SELECT square_feet, year_built, hoa_fee_cents, listing_details FROM inventory_listings WHERE id = $1`,
    [listingId],
  );
  await pool.end();
  console.log("\n=== Raw SQL columns ===\n", rawCols.rows[0]);

  const share = await getPublicShareListing(listingId);
  const flyerListing = share ? inventoryRowToFlyerListing(share) : null;
  const specs = flyerListing ? resolveFlyerSpecFields(flyerListing) : null;
  console.log("\n=== Public share → flyer listing → specs ===\n");
  console.log({
    shareSquareFeet: share?.squareFeet,
    shareYearBuilt: share?.yearBuilt,
    shareHoaFeeCents: share?.hoaFeeCents,
    flyerSquareFeet: flyerListing?.squareFeet,
    flyerYearBuilt: flyerListing?.yearBuilt,
    specs,
  });

  const [source] = await db
    .select()
    .from(inventorySources)
    .where(eq(inventorySources.id, row.sourceId))
    .limit(1);

  if (!source || source.provider !== "bridge_interactive") {
    console.log("\n=== Bridge fetch skipped (provider:", source?.provider ?? "no source", ") ===\n");
    return;
  }

  const creds = bridgeInteractiveCredentialsSchema.parse(
    decryptSourceCredentials((source.credentialsEnc || {}) as Record<string, unknown>),
  );
  const cfg = bridgeInteractiveSourceConfigSchema.parse(source.config);
  async function fetchBridge(path: string, label: string) {
    const filter = encodeURIComponent(`ListingId eq '${row.providerListingId}'`);
    const url = `${BRIDGE_ODATA_BASE}/${cfg.datasetId}/${path}?$filter=${filter}&$top=1`;
    console.log(`\n=== Bridge ${label} ===\n`, url.replace(creds.serverToken, "***"));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.serverToken}` } });
    if (!res.ok) {
      console.error("Bridge HTTP", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as { value?: unknown[] };
    return (json.value?.[0] as Record<string, unknown> | undefined) ?? null;
  }

  const replicationRaw = await fetchBridge("Property/replication", "Property/replication (sync path)");
  if (replicationRaw) {
    console.log("\n=== Replication payload area/year/hoa ===\n");
    console.log({
      LivingArea: replicationRaw.LivingArea,
      BuildingAreaTotal: replicationRaw.BuildingAreaTotal,
      YearBuilt: replicationRaw.YearBuilt,
      AssociationFee: replicationRaw.AssociationFee,
      extractResoSquareFeet: extractResoSquareFeet(replicationRaw),
      extractResoYearBuilt: extractResoYearBuilt(replicationRaw),
      extractResoHoaFeeCents: extractResoHoaFeeCents(replicationRaw),
      normalized: normalizeBridgeInteractiveProperty(replicationRaw),
    });
  }

  const bridgeRaw = await fetchBridge("Property", "Property (full resource)");
  if (!bridgeRaw) {
    console.log("No Bridge Property row returned.");
    return;
  }

  console.log("\n=== Bridge RESO area/year/hoa fields (full Property) ===\n");
  console.log({
    LivingArea: bridgeRaw.LivingArea,
    BuildingAreaTotal: bridgeRaw.BuildingAreaTotal,
    AboveGradeFinishedArea: bridgeRaw.AboveGradeFinishedArea,
    BelowGradeFinishedArea: bridgeRaw.BelowGradeFinishedArea,
    YearBuilt: bridgeRaw.YearBuilt,
    AssociationFee: bridgeRaw.AssociationFee,
    AssociationFee2: bridgeRaw.AssociationFee2,
    AssociationFeeMonthly: bridgeRaw.AssociationFeeMonthly,
    extractResoSquareFeet: extractResoSquareFeet(bridgeRaw),
    extractResoYearBuilt: extractResoYearBuilt(bridgeRaw),
    extractResoHoaFeeCents: extractResoHoaFeeCents(bridgeRaw),
  });

  const normalized = normalizeBridgeInteractiveProperty(bridgeRaw);
  console.log("\n=== normalizeBridgeInteractiveProperty() ===\n");
  console.log({
    squareFeet: normalized?.squareFeet,
    yearBuilt: normalized?.yearBuilt,
    hoaFeeCents: normalized?.hoaFeeCents,
    listingDetails: normalized?.listingDetails,
  });

  console.log("\n=== DIAGNOSIS ===\n");
  const bridgeSqft = extractResoSquareFeet(bridgeRaw);
  const bridgeYear = extractResoYearBuilt(bridgeRaw);
  if (bridgeSqft != null && row.squareFeet == null) {
    console.log("BUG: Bridge has squareFeet but DB square_feet is NULL — sync/normalize→upsert gap");
  }
  if (bridgeYear != null && row.yearBuilt == null) {
    console.log("BUG: Bridge has yearBuilt but DB year_built is NULL — sync/normalize→upsert gap");
  }
  if (bridgeSqft == null) {
    console.log("Bridge raw payload has no extractable LivingArea/BuildingAreaTotal");
  }
  if (bridgeYear == null) {
    console.log("Bridge raw payload has no extractable YearBuilt");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
