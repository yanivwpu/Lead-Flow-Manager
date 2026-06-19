/**
 * Agent Page browse filter audit (read-only).
 * Usage: npx tsx scripts/audit-agent-page-browse-filters.ts [userId]
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { aiBusinessKnowledge } from "../shared/schema";
import { getPublicAgentPageData } from "../server/agentPage/agentPageService";
import { computeAgentPageBrowseFilterFunnel } from "../shared/agent/agentPageBrowseDebug";

const DEFAULT_USER_ID = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5000";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const userId = (process.argv[2] || DEFAULT_USER_ID).trim();
  const [abk] = await db
    .select({ slug: aiBusinessKnowledge.agentPageSlug })
    .from(aiBusinessKnowledge)
    .where(eq(aiBusinessKnowledge.userId, userId))
    .limit(1);

  if (!abk?.slug) {
    console.error("No agent page slug for user", userId);
    process.exit(1);
  }

  const page = await getPublicAgentPageData(abk.slug, APP_ORIGIN);
  if (!page) {
    console.error("Agent page not found for slug", abk.slug);
    process.exit(1);
  }

  const baseline = computeAgentPageBrowseFilterFunnel(page.listings, {
    listingType: "all",
    location: null,
    minPrice: null,
    maxPrice: null,
    minBeds: null,
    minBaths: null,
    minSqft: null,
    propertyType: null,
    sort: "newest",
  });

  const rentMax7k = computeAgentPageBrowseFilterFunnel(page.listings, {
    listingType: "rent",
    location: null,
    minPrice: null,
    maxPrice: 7000,
    minBeds: null,
    minBaths: null,
    minSqft: null,
    propertyType: null,
    sort: "newest",
  });

  console.log("--- Agent Page browse filter audit ---");
  console.log("userId:", userId);
  console.log("slug:", abk.slug);
  console.log("published on page:", baseline.publishedCount);
  console.log("rentals on page:", baseline.rentalCount);
  console.log("sample rental prices:", baseline.sampleRentalPrices);
  console.log("");
  console.log("Filter: For Rent + Max Price $7000");
  console.log("  after listingType:", rentMax7k.afterListingType);
  console.log("  after maxPrice:", rentMax7k.afterMaxPrice);
  console.log("  final:", rentMax7k.finalCount);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
