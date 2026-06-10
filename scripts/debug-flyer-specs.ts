/**
 * Debug public listing flyer specs pipeline.
 * Usage:
 *   npx tsx scripts/debug-flyer-specs.ts <listing-uuid>
 *   npx tsx scripts/debug-flyer-specs.ts --address "Cypress Bend"
 */
import "dotenv/config";
import { Pool } from "pg";
import { eq, ilike, or } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings } from "../shared/schema";
import { getPublicShareListing } from "../server/inventory/inventoryDb";
import {
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
  resolveFlyerSpecFields,
} from "../shared/inventory/publicListingFlyer";
import { formatListingPriceForComposer } from "../shared/inventory/inventoryComposerDraft";

async function findListingId(arg: string): Promise<string | null> {
  if (arg.startsWith("--address")) {
    const needle = (process.argv[3] || "").trim();
    if (!needle) {
      console.error("Provide search text after --address");
      process.exit(1);
    }
    const rows = await db
      .select({
        id: inventoryListings.id,
        addressLine1: inventoryListings.addressLine1,
        city: inventoryListings.city,
        status: inventoryListings.status,
      })
      .from(inventoryListings)
      .where(
        or(
          ilike(inventoryListings.addressLine1, `%${needle}%`),
          ilike(inventoryListings.city, `%${needle}%`),
        ),
      )
      .limit(10);
    console.log("\n=== Address search matches ===\n");
    for (const row of rows) {
      console.log({ id: row.id, addressLine1: row.addressLine1, city: row.city, status: row.status });
    }
    const active = rows.find((r) => r.status === "active" || r.status === "coming_soon");
    return (active ?? rows[0])?.id ?? null;
  }
  return arg.trim() || null;
}

function extractKeyStatsHtml(html: string): string {
  const match = html.match(/<div class="key-stats">([\s\S]*?)<\/div>/);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "(not found)";
}

function parseSpecsFromHtml(html: string): string[] {
  const inner = extractKeyStatsHtml(html);
  return [...inner.matchAll(/class="key-stat[^"]*">([^<]+)</g)].map((m) => m[1].trim());
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const arg = process.argv[2] || "--address";
  const listingId = await findListingId(arg);
  if (!listingId) {
    console.error("No listing found");
    process.exit(1);
  }

  console.log("\n=== Listing ID ===\n", listingId);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let dbFlyerCols: Record<string, unknown> = { migration_0038: "unknown" };
  try {
    const result = await pool.query(
      `SELECT id, address_line1, city, state, status,
              square_feet, hoa_fee_cents, year_built,
              beds, baths, price_cents
       FROM inventory_listings WHERE id = $1 LIMIT 1`,
      [listingId],
    );
    dbFlyerCols = { migration_0038: "present", ...result.rows[0] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    dbFlyerCols = { migration_0038: msg.includes("does not exist") ? "missing" : "error", error: msg };
  } finally {
    await pool.end();
  }

  console.log("\n=== 1. Database (inventory_listings) ===\n");
  console.log(JSON.stringify(dbFlyerCols, null, 2));

  try {
    const pool2 = new Pool({ connectionString: process.env.DATABASE_URL });
    const extras = await pool2.query(
      `SELECT features, description FROM inventory_listings WHERE id = $1 LIMIT 1`,
      [listingId],
    );
    await pool2.end();
    const row = extras.rows[0];
    console.log("\n=== 1b. MLS text (features + description snippet) ===\n");
    console.log({
      featuresCount: Array.isArray(row?.features) ? row.features.length : 0,
      featuresSample: Array.isArray(row?.features) ? row.features.slice(0, 8) : row?.features,
      descriptionSnippet:
        typeof row?.description === "string" ? row.description.slice(0, 200) : row?.description,
    });
  } catch (error) {
    console.log("\n=== 1b. MLS text — query failed ===\n", error);
  }

  const shareListing = await getPublicShareListing(listingId);
  console.log("\n=== 2. getPublicShareListing() (server data layer) ===\n");
  if (!shareListing) {
    console.log("null — listing not shareable (inactive/missing)");
    process.exit(0);
  }
  console.log(
    JSON.stringify(
      {
        id: shareListing.id,
        addressLine1: shareListing.addressLine1,
        status: shareListing.status,
        squareFeet: shareListing.squareFeet,
        hoaFeeCents: shareListing.hoaFeeCents,
        yearBuilt: shareListing.yearBuilt,
        beds: shareListing.beds,
        baths: shareListing.baths,
        priceCents: shareListing.priceCents,
      },
      null,
      2,
    ),
  );

  const flyerListing = inventoryRowToFlyerListing(shareListing);
  console.log("\n=== 3. inventoryRowToFlyerListing() (parsed flyer listing) ===\n");
  console.log(
    JSON.stringify(
      {
        squareFeet: flyerListing.squareFeet,
        hoaFeeCents: flyerListing.hoaFeeCents,
        yearBuilt: flyerListing.yearBuilt,
        beds: flyerListing.beds,
        baths: flyerListing.baths,
        priceCents: flyerListing.priceCents,
      },
      null,
      2,
    ),
  );

  const price = formatListingPriceForComposer(flyerListing.priceCents) || "Price on request";
  const specs = resolveFlyerSpecFields(flyerListing);
  console.log("\n=== 4. resolveFlyerSpecFields() (spec strings) ===\n");
  console.log(JSON.stringify(specs, null, 2));

  const specsArray = [
    price,
    flyerListing.beds != null ? `${flyerListing.beds} Beds` : null,
    flyerListing.baths != null ? `${flyerListing.baths} Baths` : null,
    specs.sqft,
    specs.hoa,
    specs.yearBuilt ? `Built ${specs.yearBuilt}` : null,
  ].filter(Boolean);

  console.log("\n=== 5. Final specs array (would render) ===\n");
  console.log(specsArray);

  const html = buildPublicListingFlyerHtml({
    listing: flyerListing,
    agent: {
      name: "Debug Agent",
      email: null,
      phone: null,
      avatarUrl: null,
      brokerageName: null,
      bookingLink: null,
    },
    shareUrl: `http://localhost/share/listings/${listingId}`,
    qrDataUrl: "data:image/png;base64,DEBUG",
  });

  console.log("\n=== 6. Rendered key-stats in full HTML ===\n");
  console.log(extractKeyStatsHtml(html));
  console.log("\nParsed from HTML:", parseSpecsFromHtml(html));

  console.log("\n=== Endpoint note ===\n");
  console.log(
    "There is NO GET /api/share/listings/:id JSON API. The public page is server-rendered HTML at GET /share/listings/:id",
  );
  console.log("This flyer is NOT a React component — it is HTML from buildPublicListingFlyerHtml().");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
