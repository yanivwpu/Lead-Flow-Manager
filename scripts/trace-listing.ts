/**
 * Trace a listing: Bridge API -> normalize -> DB -> flyer display.
 * Usage: npx tsx scripts/trace-listing.ts <providerListingId>
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
} from "../shared/inventory/reso/resoNormalizer";
import {
  resolveDisplaySquareFeet,
  resolveDisplayHoaFee,
  inventoryRowToFlyerListing,
} from "../shared/inventory/publicListingFlyer";

const providerListingId = (process.argv[2] || "").trim();
if (!providerListingId) {
  console.error("Usage: npx tsx scripts/trace-listing.ts <providerListingId>");
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const coreRows = await db
    .select({
      id: inventoryListings.id,
      userId: inventoryListings.userId,
      sourceId: inventoryListings.sourceId,
      provider: inventoryListings.provider,
      providerListingId: inventoryListings.providerListingId,
      status: inventoryListings.status,
      syncedAt: inventoryListings.syncedAt,
      sourceUpdatedAt: inventoryListings.sourceUpdatedAt,
      description: inventoryListings.description,
      features: inventoryListings.features,
      priceCents: inventoryListings.priceCents,
      beds: inventoryListings.beds,
      baths: inventoryListings.baths,
      propertyType: inventoryListings.propertyType,
      photos: inventoryListings.photos,
      addressLine1: inventoryListings.addressLine1,
      addressLine2: inventoryListings.addressLine2,
      city: inventoryListings.city,
      state: inventoryListings.state,
      zip: inventoryListings.zip,
      latitude: inventoryListings.latitude,
      longitude: inventoryListings.longitude,
    })
    .from(inventoryListings)
    .where(eq(inventoryListings.providerListingId, providerListingId));

  console.log("\n=== DB rows (provider_listing_id =", providerListingId, ") ===\n");
  console.log("row count:", coreRows.length);

  type FlyerCols = {
    square_feet: number | null;
    hoa_fee_cents: number | null;
    year_built: number | null;
    property_subtype: string | null;
    migration_0038: "present" | "missing";
  };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  async function loadFlyerCols(listingId: string): Promise<FlyerCols> {
    try {
      const result = await pool.query<{
        square_feet: number | null;
        hoa_fee_cents: number | null;
        year_built: number | null;
        property_subtype: string | null;
      }>(
        `SELECT square_feet, hoa_fee_cents, year_built, property_subtype
         FROM inventory_listings WHERE id = $1 LIMIT 1`,
        [listingId],
      );
      const r = result.rows[0];
      return {
        square_feet: r?.square_feet ?? null,
        hoa_fee_cents: r?.hoa_fee_cents ?? null,
        year_built: r?.year_built ?? null,
        property_subtype: r?.property_subtype ?? null,
        migration_0038: "present",
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("does not exist")) {
        return {
          square_feet: null,
          hoa_fee_cents: null,
          year_built: null,
          property_subtype: null,
          migration_0038: "missing",
        };
      }
      throw error;
    }
  }

  if (coreRows.length === 0) {
    console.log("No listing found in inventory_listings.");
  } else {
    for (const row of coreRows) {
      const flyerCols = await loadFlyerCols(row.id);
      console.log("\n--- inventory_listings row ---");
      console.log({
        id: row.id,
        userId: row.userId,
        sourceId: row.sourceId,
        provider: row.provider,
        providerListingId: row.providerListingId,
        status: row.status,
        ...flyerCols,
        synced_at: row.syncedAt,
        source_updated_at: row.sourceUpdatedAt,
      });
    }
  }

  const listing = coreRows[0];
  const flyerCols = listing ? await loadFlyerCols(listing.id) : null;
  let bridgeRaw: Record<string, unknown> | null = null;

  if (listing) {
    const [source] = await db
      .select()
      .from(inventorySources)
      .where(eq(inventorySources.id, listing.sourceId))
      .limit(1);

    if (!source) {
      console.log("\nSource not found for listing.sourceId:", listing.sourceId);
    } else if (source.provider !== "bridge_interactive") {
      console.log("\nSource provider is", source.provider, "(not bridge_interactive)");
    } else {
      const creds = bridgeInteractiveCredentialsSchema.parse(
        decryptSourceCredentials((source.credentialsEnc || {}) as Record<string, unknown>),
      );
      const cfg = bridgeInteractiveSourceConfigSchema.parse(source.config);
      const filter = encodeURIComponent(`ListingId eq '${providerListingId}'`);
      const url = `${BRIDGE_ODATA_BASE}/${cfg.datasetId}/Property?$filter=${filter}&$top=1`;

      console.log("\n=== Bridge API fetch ===\n");
      console.log("datasetId:", cfg.datasetId);
      console.log("url (token redacted):", url);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${creds.serverToken}` },
      });

      if (!res.ok) {
        const body = await res.text();
        console.error("Bridge HTTP", res.status, body.slice(0, 500));
      } else {
        const json = (await res.json()) as { value?: unknown[] };
        const raw = json.value?.[0];
        if (!raw || typeof raw !== "object") {
          console.log("Bridge returned no Property row for this ListingId.");
        } else {
          bridgeRaw = raw as Record<string, unknown>;
          const { Media, ...withoutMedia } = bridgeRaw;
          const mediaCount = Array.isArray(Media) ? Media.length : 0;

          console.log("\n=== Raw Bridge response (Media stripped, count:", mediaCount, ") ===\n");
          console.log(JSON.stringify(withoutMedia, null, 2));

          console.log("\n=== Key RESO fields from Bridge ===\n");
          console.log({
            ListingId: bridgeRaw.ListingId,
            ListingKey: bridgeRaw.ListingKey,
            LivingArea: bridgeRaw.LivingArea,
            BuildingAreaTotal: bridgeRaw.BuildingAreaTotal,
            AboveGradeFinishedArea: bridgeRaw.AboveGradeFinishedArea,
            AssociationFee: bridgeRaw.AssociationFee,
            AssociationFee2: bridgeRaw.AssociationFee2,
            AssociationFeeMonthly: bridgeRaw.AssociationFeeMonthly,
          });

          const normalized = normalizeBridgeInteractiveProperty(bridgeRaw);
          console.log("\n=== After normalizeBridgeInteractiveProperty ===\n");
          console.log({
            squareFeet: normalized?.squareFeet ?? null,
            hoaFeeCents: normalized?.hoaFeeCents ?? null,
            extractResoSquareFeet: extractResoSquareFeet(bridgeRaw),
            extractResoHoaFeeCents: extractResoHoaFeeCents(bridgeRaw),
          });
        }
      }
    }
  } else {
    const bridgeSources = await db
      .select()
      .from(inventorySources)
      .where(eq(inventorySources.provider, "bridge_interactive"));

    if (bridgeSources.length === 0) {
      console.log("\nNo bridge_interactive sources in DB; cannot fetch Bridge.");
    } else {
      const source = bridgeSources[0];
      const creds = bridgeInteractiveCredentialsSchema.parse(
        decryptSourceCredentials((source.credentialsEnc || {}) as Record<string, unknown>),
      );
      const cfg = bridgeInteractiveSourceConfigSchema.parse(source.config);
      const filter = encodeURIComponent(`ListingId eq '${providerListingId}'`);
      const url = `${BRIDGE_ODATA_BASE}/${cfg.datasetId}/Property?$filter=${filter}&$top=1`;

      console.log("\n=== Bridge API fetch (no DB row; using first bridge source) ===\n");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${creds.serverToken}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { value?: unknown[] };
        const raw = json.value?.[0];
        if (raw && typeof raw === "object") {
          bridgeRaw = raw as Record<string, unknown>;
          const { Media, ...withoutMedia } = bridgeRaw;
          console.log(JSON.stringify(withoutMedia, null, 2));
          console.log("\nKey fields:", {
            LivingArea: bridgeRaw.LivingArea,
            BuildingAreaTotal: bridgeRaw.BuildingAreaTotal,
            AssociationFee: bridgeRaw.AssociationFee,
          });
        }
      } else {
        console.error("Bridge HTTP", res.status, await res.text());
      }
    }
  }

  if (listing) {
    console.log("\n=== Flyer path: getPublicShareListing -> resolve* ===\n");
    const shareListing = await getPublicShareListing(listing.id);
    if (!shareListing) {
      console.log("getPublicShareListing returned undefined (not active/coming_soon or blocked).");
    } else {
      const flyerListing = inventoryRowToFlyerListing({
        id: shareListing.id,
        priceCents: shareListing.priceCents,
        beds: shareListing.beds,
        baths: shareListing.baths,
        squareFeet: shareListing.squareFeet ?? null,
        yearBuilt: shareListing.yearBuilt ?? null,
        hoaFeeCents: shareListing.hoaFeeCents ?? null,
        propertyType: shareListing.propertyType,
        propertySubtype: shareListing.propertySubtype ?? null,
        description: shareListing.description,
        features: shareListing.features,
        photos: shareListing.photos,
        addressLine1: shareListing.addressLine1,
        addressLine2: shareListing.addressLine2,
        city: shareListing.city,
        state: shareListing.state,
        zip: shareListing.zip,
        latitude: shareListing.latitude,
        longitude: shareListing.longitude,
        status: shareListing.status,
        providerListingId: shareListing.providerListingId,
        listingDetails: shareListing.listingDetails ?? {},
      });
      console.log({
        getPublicShareListing_squareFeet: shareListing.squareFeet,
        getPublicShareListing_hoaFeeCents: shareListing.hoaFeeCents,
        resolveDisplaySquareFeet: resolveDisplaySquareFeet(flyerListing),
        resolveDisplayHoaFee: resolveDisplayHoaFee(flyerListing),
      });
    }

    if (flyerCols) {
      console.log("\n=== Raw SQL flyer columns (independent check) ===\n");
      console.log(flyerCols);
    }
  }

  if (listing) {
    const desc = await pool.query(
      `SELECT LEFT(description, 500) AS description_preview FROM inventory_listings WHERE id = $1`,
      [listing.id],
    );
    console.log("\n=== DB description preview (text-parse haystack) ===\n");
    console.log(desc.rows[0]?.description_preview ?? "(null)");
  }

  const uuidCheck = await pool.query(
    `SELECT id, provider_listing_id, status FROM inventory_listings
     WHERE id = $1 OR provider_listing_id = $2`,
    ["503e45e9-0031-4f33-8498-7c9980e841f2", providerListingId],
  );
  console.log("\n=== Share UUID vs provider ID ===\n");
  console.log(uuidCheck.rows);

  await pool.end();
  console.log("\n=== Trace complete ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
