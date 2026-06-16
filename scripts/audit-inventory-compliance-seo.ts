/**
 * MLS compliance + public SEO surface audit (read-only).
 * Run: npx tsx scripts/audit-inventory-compliance-seo.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings, inventorySources } from "@shared/schema";
import {
  auditResoComplianceFieldAvailability,
  PROVIDER_COMPLIANCE_FIELD_MATRIX,
} from "../shared/inventory/inventoryListingCompliance";

const SAMPLE_ROWS = {
  mls_grid: {
    ListingId: "SAMPLE-MLS",
    OriginatingSystemName: "example_mls",
    MlgCanView: true,
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    ListOfficeName: "Sample Office",
    ListAgentFullName: "Sample Agent",
  },
  bridge_interactive: {
    ListingId: "SAMPLE-BRIDGE",
    OriginatingSystemName: "example_dataset",
    InternetEntireListingDisplayYN: true,
    ListOfficeName: "Sample Office",
    ListAgentFullName: "Sample Agent",
  },
  trestle: {
    ListingId: "SAMPLE-TRESTLE",
    OriginatingSystemName: "example_orig",
    InternetDisplayYN: true,
    ListOfficeName: "Sample Office",
    ListAgentFullName: "Sample Agent",
  },
} as const;

function printProviderFieldReport() {
  console.log("\n=== Provider compliance field matrix (expected RESO keys) ===\n");
  for (const [provider, meta] of Object.entries(PROVIDER_COMPLIANCE_FIELD_MATRIX)) {
    if (!meta.fields.length) {
      console.log(`${provider}: (no listing sync) — ${meta.notes}`);
      continue;
    }
    const sample = SAMPLE_ROWS[provider as keyof typeof SAMPLE_ROWS];
    const availability = sample
      ? auditResoComplianceFieldAvailability(sample as Record<string, unknown>)
      : null;
    console.log(`\n${provider}`);
    console.log(`  Notes: ${meta.notes}`);
    for (const field of meta.fields) {
      const present = availability ? availability[field as keyof typeof availability] : "?";
      console.log(`  - ${field}: ${present === "?" ? "n/a" : present ? "available (sample)" : "missing (sample)"}`);
    }
  }
}

async function printSeoAudit() {
  console.log("\n=== Public SEO / share surface audit ===\n");

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      matchable: sql<number>`count(*) filter (where ${inventoryListings.status} in ('active', 'coming_soon'))::int`,
      withSlug: sql<number>`count(*) filter (where ${inventoryListings.publicSlug} is not null)::int`,
      matchableWithSlug: sql<number>`count(*) filter (where ${inventoryListings.status} in ('active', 'coming_soon') and ${inventoryListings.publicSlug} is not null)::int`,
      withComplianceOffice: sql<number>`count(*) filter (where coalesce(${inventoryListings.listingCompliance}->>'listOfficeName', '') <> '')::int`,
      withComplianceAgent: sql<number>`count(*) filter (where coalesce(${inventoryListings.listingCompliance}->>'listAgentName', '') <> '')::int`,
      withComplianceMls: sql<number>`count(*) filter (where coalesce(${inventoryListings.listingCompliance}->>'mlsSourceName', '') <> '')::int`,
    })
    .from(inventoryListings);

  console.log("Inventory listings (DB):");
  console.log(`  Total synced:              ${counts?.total ?? 0}`);
  console.log(`  Matchable (active/CS):     ${counts?.matchable ?? 0}`);
  console.log(`  With public_slug:          ${counts?.withSlug ?? 0}`);
  console.log(`  Matchable + public_slug:   ${counts?.matchableWithSlug ?? 0}`);
  console.log(`  With list office (stored): ${counts?.withComplianceOffice ?? 0}`);
  console.log(`  With list agent (stored):  ${counts?.withComplianceAgent ?? 0}`);
  console.log(`  With MLS source (stored):  ${counts?.withComplianceMls ?? 0}`);
  console.log(`  Sitemap-eligible today:    ${counts?.matchable ?? 0} (all matchable statuses, cross-tenant)`);

  const sources = await db
    .select({
      provider: inventorySources.provider,
      count: sql<number>`count(${inventoryListings.id})::int`,
    })
    .from(inventorySources)
    .leftJoin(inventoryListings, sql`${inventoryListings.sourceId} = ${inventorySources.id}`)
    .groupBy(inventorySources.provider);

  console.log("\nListings by provider:");
  for (const row of sources) {
    console.log(`  ${row.provider}: ${row.count}`);
  }

  console.log("\nPublic routes (no auth):");
  console.log("  GET /share/listings/:identifier");
  console.log("  GET /public-listings-sitemap.xml");
  console.log("  GET /public-listings-sitemap-:page.xml");
  console.log("  GET /robots.txt (Allow: /share/, Sitemap advertised)");

  console.log("\nPublication controls: workspace publish_listings_publicly + per-listing publish_publicly (default false)");
  console.log("Sitemap / robots: only published listings with workspace flag; sitemap omitted when count=0");
  console.log("Attribution on /share/: ENABLED only when list office/agent + MLS source + MLS# stored");
}

async function main() {
  printProviderFieldReport();
  try {
    await printSeoAudit();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("listing_compliance")) {
      console.log("\n=== Public SEO / share surface audit (schema pending) ===\n");
      console.log("  listing_compliance column not migrated yet — run migration 0045 or startup patches");
    } else {
      console.error("\nSEO DB audit skipped:", message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
