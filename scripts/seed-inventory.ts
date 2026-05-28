/**
 * Developer-only inventory seeder for RGE matching tests.
 *
 * Populates `inventory_listings` with realistic South Florida mock data when live
 * MLS credentials are unavailable. Not for production, not customer-facing CSV import,
 * and never invoked automatically — run manually in local/dev only.
 *
 * Usage:
 *   npx tsx scripts/seed-inventory.ts <userId> [--clearExisting]
 *
 * Requires:
 *   - DATABASE_URL in `.env`
 *   - NODE_ENV !== "production" (or set ALLOW_INVENTORY_SEED=1 to override)
 *
 * Creates a dev `mls_grid` inventory source if the workspace has none yet.
 */
import "dotenv/config";
import { eq, and, like } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings, inventorySources, users } from "../shared/schema";

const DEV_PROVIDER_LISTING_PREFIX = "dev-seed-";
const LISTING_COUNT = 40;

type SeedListing = {
  providerListingId: string;
  city: string;
  state: string;
  neighborhood: string;
  addressLine1: string;
  zip: string;
  priceCents: number;
  beds: number;
  baths: number;
  propertyType: "condo" | "house" | "townhouse";
  features: string[];
  description: string;
  latitude: number;
  longitude: number;
};

function assertDevEnvironment(): void {
  const isProd = process.env.NODE_ENV === "production";
  const allowed = process.env.ALLOW_INVENTORY_SEED === "1";
  if (isProd && !allowed) {
    console.error(
      "Refusing to seed inventory in production. Set ALLOW_INVENTORY_SEED=1 only if you truly intend to run this in a non-customer environment.",
    );
    process.exit(1);
  }
}

function parseArgs(): { userId: string; clearExisting: boolean } {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const clearExisting = args.includes("--clearExisting");
  const userId = args.find((a) => !a.startsWith("--"))?.trim() ?? "";
  if (!userId) {
    console.error("Usage: npx tsx scripts/seed-inventory.ts <userId> [--clearExisting]");
    process.exit(1);
  }
  return { userId, clearExisting };
}

function photoUrl(seed: string): { url: string; order: number }[] {
  const base = encodeURIComponent(seed);
  return [
    { url: `https://picsum.photos/seed/${base}-a/800/600`, order: 0 },
    { url: `https://picsum.photos/seed/${base}-b/800/600`, order: 1 },
  ];
}

/** Curated templates — includes several high-score targets for Brickell / 2bd / condo / pool / ~$800k. */
function buildSeedListings(): SeedListing[] {
  const listings: SeedListing[] = [
    // ── Strong match cluster (Brickell condo 2bd pool ~$800k) ──
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}brickell-001`,
      city: "Miami",
      state: "FL",
      neighborhood: "Brickell",
      addressLine1: "900 Brickell Key Blvd #1204",
      zip: "33131",
      priceCents: 795_000_00,
      beds: 2,
      baths: 2,
      propertyType: "condo",
      features: ["pool", "modern", "garage", "gym"],
      description:
        "Modern Brickell condo with resort-style pool, floor-to-ceiling windows, and updated kitchen. Walk to Brickell City Centre.",
      latitude: 25.7617,
      longitude: -80.1918,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}brickell-002`,
      city: "Miami",
      state: "FL",
      neighborhood: "Brickell",
      addressLine1: "1450 Brickell Ave #1802",
      zip: "33131",
      priceCents: 825_000_00,
      beds: 2,
      baths: 2,
      propertyType: "condo",
      features: ["pool", "waterfront", "modern", "concierge"],
      description:
        "Brickell high-rise with bay views, heated pool, and contemporary finishes. Pet friendly building.",
      latitude: 25.7589,
      longitude: -80.1925,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}brickell-003`,
      city: "Miami",
      state: "FL",
      neighborhood: "Brickell",
      addressLine1: "1065 Brickell Ave #2405",
      zip: "33131",
      priceCents: 779_000_00,
      beds: 2,
      baths: 2.5,
      propertyType: "condo",
      features: ["pool", "modern", "pet friendly"],
      description:
        "Sunny 2 bed Brickell condo steps from Mary Brickell Village. Pool deck and modern open layout.",
      latitude: 25.7631,
      longitude: -80.1934,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}brickell-004`,
      city: "Miami",
      state: "FL",
      neighborhood: "Brickell",
      addressLine1: "1100 S Miami Ave #1507",
      zip: "33130",
      priceCents: 810_000_00,
      beds: 2,
      baths: 2,
      propertyType: "condo",
      features: ["pool", "garage", "modern"],
      description: "Brickell urban condo with pool, assigned garage parking, and renovated baths.",
      latitude: 25.7598,
      longitude: -80.1962,
    },
    // ── Downtown Miami ──
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}downtown-001`,
      city: "Miami",
      state: "FL",
      neighborhood: "Downtown Miami",
      addressLine1: "50 Biscayne Blvd #3201",
      zip: "33132",
      priceCents: 650_000_00,
      beds: 1,
      baths: 1,
      propertyType: "condo",
      features: ["pool", "modern", "walkable"],
      description: "Downtown Miami condo near Bayside. Modern unit with pool and walkable lifestyle.",
      latitude: 25.7743,
      longitude: -80.187,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}downtown-002`,
      city: "Miami",
      state: "FL",
      neighborhood: "Downtown Miami",
      addressLine1: "244 Biscayne Blvd #410",
      zip: "33132",
      priceCents: 920_000_00,
      beds: 3,
      baths: 2,
      propertyType: "condo",
      features: ["waterfront", "pool", "garage"],
      description: "Downtown bayfront condo with waterfront views and covered garage parking.",
      latitude: 25.7755,
      longitude: -80.1888,
    },
    // ── Edgewater ──
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}edgewater-001`,
      city: "Miami",
      state: "FL",
      neighborhood: "Edgewater",
      addressLine1: "1800 N Bayshore Dr #1208",
      zip: "33132",
      priceCents: 715_000_00,
      beds: 2,
      baths: 2,
      propertyType: "condo",
      features: ["pool", "waterfront", "modern"],
      description: "Edgewater condo with Biscayne Bay views, modern kitchen, and resort pool.",
      latitude: 25.7965,
      longitude: -80.1865,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}edgewater-002`,
      city: "Miami",
      state: "FL",
      neighborhood: "Edgewater",
      addressLine1: "2020 N Bayshore Dr #508",
      zip: "33137",
      priceCents: 589_000_00,
      beds: 1,
      baths: 1.5,
      propertyType: "condo",
      features: ["pool", "pet friendly"],
      description: "Edgewater boutique building, pet friendly, pool and green space.",
      latitude: 25.7988,
      longitude: -80.1872,
    },
    // ── Miami Beach ──
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}miami-beach-001`,
      city: "Miami Beach",
      state: "FL",
      neighborhood: "Miami Beach",
      addressLine1: "1500 Ocean Dr #6",
      zip: "33139",
      priceCents: 1_250_000_00,
      beds: 2,
      baths: 2,
      propertyType: "condo",
      features: ["waterfront", "pool", "modern"],
      description: "South Beach condo steps from the ocean. Modern renovation, pool, and Art Deco charm.",
      latitude: 25.7825,
      longitude: -80.1301,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}miami-beach-002`,
      city: "Miami Beach",
      state: "FL",
      neighborhood: "Miami Beach",
      addressLine1: "450 Alton Rd #2103",
      zip: "33139",
      priceCents: 990_000_00,
      beds: 3,
      baths: 2,
      propertyType: "condo",
      features: ["pool", "garage", "waterfront"],
      description: "Miami Beach bayfront tower with pool, garage, and open water views.",
      latitude: 25.7712,
      longitude: -80.1415,
    },
    // ── Fort Lauderdale / Las Olas ──
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}ftl-001`,
      city: "Fort Lauderdale",
      state: "FL",
      neighborhood: "Las Olas",
      addressLine1: "333 Las Olas Blvd #1201",
      zip: "33301",
      priceCents: 875_000_00,
      beds: 2,
      baths: 2,
      propertyType: "condo",
      features: ["pool", "modern", "walkable"],
      description: "Las Olas Isles condo on the river. Modern finishes, pool, walkable to dining.",
      latitude: 26.119,
      longitude: -80.137,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}ftl-002`,
      city: "Fort Lauderdale",
      state: "FL",
      neighborhood: "Las Olas",
      addressLine1: "801 E Las Olas Blvd #504",
      zip: "33301",
      priceCents: 695_000_00,
      beds: 2,
      baths: 2,
      propertyType: "condo",
      features: ["pool", "garage"],
      description: "Fort Lauderdale Las Olas corridor condo with garage and rooftop pool.",
      latitude: 26.1185,
      longitude: -80.1355,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}ftl-003`,
      city: "Fort Lauderdale",
      state: "FL",
      neighborhood: "Fort Lauderdale",
      addressLine1: "2200 NE 32nd St",
      zip: "33308",
      priceCents: 1_450_000_00,
      beds: 4,
      baths: 3,
      propertyType: "house",
      features: ["pool", "waterfront", "garage", "modern"],
      description: "Fort Lauderdale waterfront home with pool, dock, and modern renovation.",
      latitude: 26.168,
      longitude: -80.106,
    },
    {
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}ftl-004`,
      city: "Fort Lauderdale",
      state: "FL",
      neighborhood: "Victoria Park",
      addressLine1: "1500 NE 4th Ave",
      zip: "33304",
      priceCents: 1_125_000_00,
      beds: 3,
      baths: 2.5,
      propertyType: "house",
      features: ["pool", "modern", "pet friendly"],
      description: "Victoria Park single-family home with pool and modern open floor plan.",
      latitude: 26.142,
      longitude: -80.128,
    },
  ];

  // Pad to LISTING_COUNT with varied inventory
  const padTemplates: Omit<SeedListing, "providerListingId">[] = [
    {
      city: "Miami",
      state: "FL",
      neighborhood: "Coconut Grove",
      addressLine1: "3200 S Dixie Hwy",
      zip: "33133",
      priceCents: 1_680_000_00,
      beds: 4,
      baths: 3,
      propertyType: "house",
      features: ["pool", "garage", "modern"],
      description: "Coconut Grove estate with pool and tropical landscaping.",
      latitude: 25.727,
      longitude: -80.238,
    },
    {
      city: "Miami",
      state: "FL",
      neighborhood: "Coral Gables",
      addressLine1: "450 Alhambra Cir",
      zip: "33134",
      priceCents: 2_100_000_00,
      beds: 5,
      baths: 4,
      propertyType: "house",
      features: ["pool", "garage", "gated"],
      description: "Coral Gables Mediterranean home with pool and gated entry.",
      latitude: 25.749,
      longitude: -80.263,
    },
    {
      city: "Miami Beach",
      state: "FL",
      neighborhood: "Mid-Beach",
      addressLine1: "4775 Collins Ave #1202",
      zip: "33140",
      priceCents: 1_350_000_00,
      beds: 3,
      baths: 3,
      propertyType: "condo",
      features: ["pool", "waterfront", "concierge"],
      description: "Mid-Beach oceanfront condo with pool and concierge.",
      latitude: 25.813,
      longitude: -80.122,
    },
    {
      city: "Miami",
      state: "FL",
      neighborhood: "Wynwood",
      addressLine1: "2800 NW 2nd Ave #401",
      zip: "33127",
      priceCents: 520_000_00,
      beds: 2,
      baths: 2,
      propertyType: "townhouse",
      features: ["modern", "walkable", "garage"],
      description: "Wynwood modern townhouse with rooftop terrace and garage.",
      latitude: 25.801,
      longitude: -80.199,
    },
    {
      city: "Fort Lauderdale",
      state: "FL",
      neighborhood: "Rio Vista",
      addressLine1: "1200 SE 12th St",
      zip: "33316",
      priceCents: 985_000_00,
      beds: 3,
      baths: 2,
      propertyType: "house",
      features: ["pool", "waterfront", "modern"],
      description: "Rio Vista canal-front home with pool and updated interior.",
      latitude: 26.108,
      longitude: -80.125,
    },
    {
      city: "Miami",
      state: "FL",
      neighborhood: "Brickell",
      addressLine1: "1200 Brickell Bay Dr #3301",
      zip: "33131",
      priceCents: 1_150_000_00,
      beds: 3,
      baths: 3,
      propertyType: "condo",
      features: ["pool", "waterfront", "modern", "garage"],
      description: "Premium Brickell penthouse-style unit with bay views and pool.",
      latitude: 25.7605,
      longitude: -80.1895,
    },
    {
      city: "Miami",
      state: "FL",
      neighborhood: "Design District",
      addressLine1: "3800 NE 1st Ave #702",
      zip: "33137",
      priceCents: 610_000_00,
      beds: 1,
      baths: 1,
      propertyType: "condo",
      features: ["modern", "pool", "walkable"],
      description: "Design District loft-style condo, modern build, walkable galleries.",
      latitude: 25.813,
      longitude: -80.192,
    },
    {
      city: "Fort Lauderdale",
      state: "FL",
      neighborhood: "Las Olas Isles",
      addressLine1: "88 Isle of Venice Dr",
      zip: "33301",
      priceCents: 2_350_000_00,
      beds: 4,
      baths: 4,
      propertyType: "house",
      features: ["waterfront", "pool", "garage", "modern"],
      description: "Las Olas Isles waterfront estate with dock and resort pool.",
      latitude: 26.115,
      longitude: -80.131,
    },
    {
      city: "Miami Beach",
      state: "FL",
      neighborhood: "North Beach",
      addressLine1: "7300 Ocean Ter #5",
      zip: "33141",
      priceCents: 740_000_00,
      beds: 2,
      baths: 2,
      propertyType: "condo",
      features: ["pool", "pet friendly"],
      description: "North Beach garden condo, pet friendly, community pool.",
      latitude: 25.849,
      longitude: -80.12,
    },
    {
      city: "Miami",
      state: "FL",
      neighborhood: "Little Havana",
      addressLine1: "1550 SW 8th St",
      zip: "33135",
      priceCents: 425_000_00,
      beds: 3,
      baths: 2,
      propertyType: "house",
      features: ["garage"],
      description: "Little Havana single-family with fenced yard and garage.",
      latitude: 25.765,
      longitude: -80.224,
    },
  ];

  let idx = listings.length;
  while (listings.length < LISTING_COUNT) {
    const t = padTemplates[(idx - 14) % padTemplates.length];
    listings.push({
      ...t,
      providerListingId: `${DEV_PROVIDER_LISTING_PREFIX}auto-${String(idx + 1).padStart(3, "0")}`,
      priceCents: t.priceCents + ((idx % 7) - 3) * 25_000_00,
      beds: idx % 4 === 0 ? 2 : t.beds,
    });
    idx += 1;
  }

  return listings.slice(0, LISTING_COUNT);
}

async function ensureInventorySource(userId: string) {
  const existing = await db
    .select()
    .from(inventorySources)
    .where(and(eq(inventorySources.userId, userId), eq(inventorySources.provider, "mls_grid")))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(inventorySources)
    .values({
      userId,
      provider: "mls_grid",
      displayName: "Dev seed — MLS inventory",
      connectionStatus: "connected",
      config: { originatingSystemName: "dev-seed", expandMedia: false },
      credentialsEnc: {},
      lastSyncAt: new Date(),
      lastSyncStatus: "success",
      lastSyncError: null,
      lastSyncStats: { seeded: true, source: "scripts/seed-inventory.ts" },
      isActive: true,
    })
    .returning();

  console.log(`Created dev inventory source: ${created.id}`);
  return created;
}

async function clearDevListings(userId: string, sourceId: string): Promise<number> {
  const deleted = await db
    .delete(inventoryListings)
    .where(
      and(
        eq(inventoryListings.userId, userId),
        eq(inventoryListings.sourceId, sourceId),
        like(inventoryListings.providerListingId, `${DEV_PROVIDER_LISTING_PREFIX}%`),
      ),
    )
    .returning({ id: inventoryListings.id });
  return deleted.length;
}

async function main(): Promise<void> {
  assertDevEnvironment();
  const { userId, clearExisting } = parseArgs();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    console.error(`User not found: ${userId}`);
    process.exit(1);
  }

  const source = await ensureInventorySource(userId);
  const seeds = buildSeedListings();

  if (clearExisting) {
    const removed = await clearDevListings(userId, source.id);
    console.log(`Cleared ${removed} existing dev-seed listing(s).`);
  }

  let inserted = 0;
  for (const seed of seeds) {
    await db
      .insert(inventoryListings)
      .values({
        userId,
        sourceId: source.id,
        provider: "mls_grid",
        providerListingId: seed.providerListingId,
        status: "active",
        priceCents: seed.priceCents,
        currency: "USD",
        addressLine1: seed.addressLine1,
        city: seed.city,
        state: seed.state,
        zip: seed.zip,
        country: "US",
        latitude: seed.latitude,
        longitude: seed.longitude,
        beds: String(seed.beds),
        baths: String(seed.baths),
        propertyType: seed.propertyType,
        description: `${seed.neighborhood}. ${seed.description}`,
        features: seed.features,
        photos: photoUrl(seed.providerListingId),
        listingUrl: null,
        sourceUpdatedAt: new Date(),
        syncedAt: new Date(),
        firstSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [inventoryListings.sourceId, inventoryListings.providerListingId],
        set: {
          status: "active",
          priceCents: seed.priceCents,
          city: seed.city,
          state: seed.state,
          beds: String(seed.beds),
          baths: String(seed.baths),
          propertyType: seed.propertyType,
          description: `${seed.neighborhood}. ${seed.description}`,
          features: seed.features,
          photos: photoUrl(seed.providerListingId),
          updatedAt: new Date(),
          syncedAt: new Date(),
        },
      });
    inserted += 1;
  }

  const strongMatches = seeds.filter(
    (s) =>
      s.neighborhood === "Brickell" &&
      s.propertyType === "condo" &&
      s.beds === 2 &&
      s.features.includes("pool") &&
      s.priceCents >= 750_000_00 &&
      s.priceCents <= 850_000_00,
  );

  console.log("\n✓ Inventory seed complete");
  console.log(`  User:     ${userId}`);
  console.log(`  Source:   ${source.id}`);
  console.log(`  Listings: ${inserted} (prefix ${DEV_PROVIDER_LISTING_PREFIX})`);
  console.log(`  Strong match targets (Brickell / 2bd / condo / pool / ~$800k): ${strongMatches.length}`);
  console.log("\nTest matching with buyer preferences e.g.:");
  console.log('  targetAreas: ["Brickell"], propertyTypes: ["condo"], bedsMin: 2, priceMax: 800000, pool: true');
  console.log(`  GET /api/contacts/:contactId/inventory-matches\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
