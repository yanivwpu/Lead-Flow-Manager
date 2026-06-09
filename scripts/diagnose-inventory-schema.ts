/**
 * Production inventory schema + sync failure diagnostics.
 * Usage: npx tsx scripts/diagnose-inventory-schema.ts
 */
import "dotenv/config";
import { Pool } from "pg";

const DRIZZLE_INVENTORY_LISTINGS_COLUMNS: Record<string, string> = {
  id: "varchar PRIMARY KEY DEFAULT gen_random_uuid()",
  user_id: "varchar NOT NULL",
  source_id: "varchar NOT NULL",
  provider: "text NOT NULL",
  provider_listing_id: "text NOT NULL",
  status: "text NOT NULL DEFAULT 'active'",
  price_cents: "integer",
  currency: "text NOT NULL DEFAULT 'USD'",
  address_line1: "text",
  address_line2: "text",
  city: "text",
  state: "text",
  zip: "text",
  country: "text DEFAULT 'US'",
  latitude: "double precision",
  longitude: "double precision",
  beds: "numeric(4,1)",
  baths: "numeric(4,1)",
  property_type: "text",
  property_subtype: "text", // 0038
  square_feet: "integer", // 0038
  year_built: "integer", // 0038
  hoa_fee_cents: "integer", // 0038
  listing_details: "jsonb NOT NULL DEFAULT '{}'", // 0038
  description: "text",
  features: "jsonb NOT NULL DEFAULT '[]'",
  photos: "jsonb NOT NULL DEFAULT '[]'",
  listing_url: "text",
  source_updated_at: "timestamptz",
  synced_at: "timestamptz NOT NULL DEFAULT now()",
  first_seen_at: "timestamptz NOT NULL DEFAULT now()",
  sync_alert_status: "text NOT NULL DEFAULT 'existing'", // 0034
  previous_price_cents: "integer", // 0034
  last_price_change_at: "timestamptz", // 0034
  created_at: "timestamptz DEFAULT now()",
  updated_at: "timestamptz DEFAULT now()",
};

const DRIZZLE_0039_AI_BUSINESS_COLUMNS = [
  "display_name",
  "company_logo",
  "public_phone",
  "public_email",
  "public_website",
  "about_text",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("\n========== SYNC FAILURE (inventory_sources) ==========\n");
  const sources = await pool.query(`
    SELECT id, provider, display_name, last_sync_status, last_sync_error,
           last_sync_at, last_sync_stats, connection_status
    FROM inventory_sources
    WHERE provider = 'bridge_interactive'
    ORDER BY last_sync_at DESC NULLS LAST
    LIMIT 5
  `);
  for (const s of sources.rows) {
    console.log("--- source:", s.id, s.display_name || s.provider, "---");
    console.log("last_sync_status:", s.last_sync_status);
    console.log("last_sync_at:", s.last_sync_at);
    console.log("connection_status:", s.connection_status);
    console.log("\nlast_sync_error (FULL):\n", s.last_sync_error ?? "(null)");
    console.log("\nlast_sync_stats (FULL JSON):\n", JSON.stringify(s.last_sync_stats, null, 2));
    console.log("");
  }

  console.log("\n========== inventory_listings SCHEMA (Neon) ==========\n");
  const cols = await pool.query(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_listings'
    ORDER BY ordinal_position
  `);
  const neonCols = new Map<string, (typeof cols.rows)[0]>();
  for (const c of cols.rows) {
    neonCols.set(c.column_name, c);
    console.log(
      `${c.column_name}: ${c.data_type} (${c.udt_name}) nullable=${c.is_nullable} default=${c.column_default ?? "none"}`,
    );
  }

  console.log("\n========== SCHEMA DIFF (code expects vs Neon) ==========\n");
  const expected = Object.keys(DRIZZLE_INVENTORY_LISTINGS_COLUMNS);
  const present = [...neonCols.keys()];
  const missingInNeon = expected.filter((c) => !neonCols.has(c));
  const extraInNeon = present.filter((c) => !expected.includes(c));

  console.log("MISSING in Neon (expected by Drizzle/code):");
  for (const c of missingInNeon) {
    console.log(`  - ${c}  (${DRIZZLE_INVENTORY_LISTINGS_COLUMNS[c]})`);
  }
  if (missingInNeon.length === 0) console.log("  (none)");

  console.log("\nEXTRA in Neon (not in Drizzle schema):");
  for (const c of extraInNeon) {
    const r = neonCols.get(c)!;
    console.log(`  + ${c}: ${r.data_type}`);
  }
  if (extraInNeon.length === 0) console.log("  (none)");

  console.log("\n========== MIGRATION 0038 CHECK ==========\n");
  const m38 = ["square_feet", "year_built", "hoa_fee_cents", "property_subtype", "listing_details"];
  for (const c of m38) {
    console.log(`${c}: ${neonCols.has(c) ? "PRESENT" : "MISSING"}`);
  }

  console.log("\n========== MIGRATION 0039 CHECK (ai_business_knowledge) ==========\n");
  const bkCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_business_knowledge'
    ORDER BY ordinal_position
  `);
  const bkSet = new Set(bkCols.rows.map((r: { column_name: string }) => r.column_name));
  for (const c of DRIZZLE_0039_AI_BUSINESS_COLUMNS) {
    console.log(`${c}: ${bkSet.has(c) ? "PRESENT" : "MISSING"}`);
  }

  console.log("\n========== SIMULATED INSERT (drizzle-shaped) ==========\n");
  const insertCols = expected.filter((c) => c !== "id" && c !== "created_at" && c !== "updated_at");
  const insertSql = `INSERT INTO inventory_listings (${insertCols.join(", ")}) VALUES (...)`;
  console.log(insertSql);
  console.log(`\nColumn count: ${insertCols.length}`);
  console.log("Columns that would fail if missing:", missingInNeon.join(", ") || "(none)");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
