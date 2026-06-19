/**
 * Agent Page browse filter audit — property type + rent price funnel (read-only).
 * Usage: npx tsx scripts/audit-agent-page-browse-filters.ts [userId]
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { aiBusinessKnowledge } from "../shared/schema";
import { getPublicAgentPageData } from "../server/agentPage/agentPageService";
import { fetchPublishedListingsForAgentPage } from "../server/agentPage/agentPageDb";
import {
  listingMatchesAgentPageBrowseFilters,
  normalizePropertyTypeForFilter,
} from "../shared/agent/publicAgentPageBrowse";
import { agentPageBrowseFilterDollarsToCents, agentPageListingPriceDollars } from "../shared/agent/agentPageBrowsePrice";
import { resolveFlyerListingLabel, type PublicListingFlyerListing } from "../shared/inventory/publicListingFlyer";

const DEFAULT_USER_ID = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5000";
const PAGE_LIMIT = 200;

function flyerFromRow(row: (typeof inventoryListings.$inferSelect)): PublicListingFlyerListing {
  return {
    id: row.id,
    priceCents: row.priceCents,
    beds: row.beds != null ? Number(row.beds) : null,
    baths: row.baths != null ? Number(row.baths) : null,
    squareFeet: row.squareFeet,
    yearBuilt: row.yearBuilt,
    hoaFeeCents: row.hoaFeeCents,
    propertyType: row.propertyType,
    propertySubtype: row.propertySubtype,
    description: row.description,
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    photos: Array.isArray(row.photos) ? (row.photos as { url: string }[]) : [],
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    providerListingId: row.providerListingId,
    listingDetails: (row.listingDetails || {}) as PublicListingFlyerListing["listingDetails"],
    listingCompliance: row.listingCompliance,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const userId = (process.argv[2] || DEFAULT_USER_ID).trim();
  const maxPriceDollars = Number(process.argv[3] || 7777);

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

  const pageCards = page.listings;
  const allPublished = await fetchPublishedListingsForAgentPage(userId, 10_000);

  type RentalRow = {
    id: string;
    city: string | null;
    propertyType: string | null;
    propertySubtype: string | null;
    priceCents: number | null;
    mappedBucket: string;
    onAgentPage: boolean;
  };

  function toRentals(rows: typeof allPublished, onPageIds: Set<string>): RentalRow[] {
    return rows
      .filter((row) => resolveFlyerListingLabel(flyerFromRow(row)) === "FOR RENT")
      .map((row) => ({
        id: row.id,
        city: row.city,
        propertyType: row.propertyType,
        propertySubtype: row.propertySubtype,
        priceCents: row.priceCents,
        mappedBucket: normalizePropertyTypeForFilter(row.propertyType, row.propertySubtype),
        onAgentPage: onPageIds.has(row.id),
      }));
  }

  const onPageIds = new Set(pageCards.map((c) => c.id));
  const pageRentals = toRentals(allPublished.slice(0, PAGE_LIMIT), onPageIds);
  const allRentals = toRentals(allPublished, onPageIds);

  const maxCents = agentPageBrowseFilterDollarsToCents(maxPriceDollars);
  const underMax = (r: RentalRow) => r.priceCents != null && r.priceCents <= maxCents;

  const pageRentalsUnderMax = pageRentals.filter(underMax);
  const allRentalsUnderMax = allRentals.filter(underMax);

  const shouldBeHouse = (r: RentalRow) => {
    const hay = `${r.propertyType ?? ""} ${r.propertySubtype ?? ""}`.toLowerCase();
    return (
      /\b(single[\s_]?family|sfh|sfr|detached|residence)\b/.test(hay) ||
      (/\bresidential[\s_]?lease\b/.test(hay) &&
        !/\b(condo|apartment|town|multi|duplex)\b/.test(hay))
    );
  };

  const pageHouseCandidates = pageRentalsUnderMax.filter(shouldBeHouse);
  const pageHouseMatches = pageRentalsUnderMax.filter((r) => r.mappedBucket === "house");

  const filterInput = pageCards.map((card, index) => ({
    status: card.status,
    listingLabel: card.listingLabel,
    cityState: card.cityState,
    priceCents: card.priceCents,
    beds: card.bedsNum,
    baths: card.bathsNum,
    sqft: card.sqftNum,
    propertyType: card.propertyType,
    propertySubtype: card.propertySubtype,
    sortIndex: index,
  }));

  const matchingHouse = filterInput.filter((l) =>
    listingMatchesAgentPageBrowseFilters(l, {
      listingType: "rent",
      location: null,
      minPrice: null,
      maxPrice: maxPriceDollars,
      minBeds: null,
      minBaths: null,
      minSqft: null,
      propertyType: "house",
      sort: "newest",
    }),
  );

  console.log("--- Agent Page property type audit ---");
  console.log("userId:", userId);
  console.log("slug:", abk.slug);
  console.log("maxPrice:", `$${maxPriceDollars}`);
  console.log("");
  console.log("Published listings on Agent Page (cap):", pageCards.length);
  console.log("Total published in DB:", allPublished.length);
  console.log("Rentals on Agent Page:", pageRentals.length);
  console.log("Total rentals in DB:", allRentals.length);
  console.log("Rentals on page under max price:", pageRentalsUnderMax.length);
  console.log("Total rentals in DB under max price:", allRentalsUnderMax.length);
  console.log("");
  console.log("Rentals under max — raw type/subtype samples (page, up to 20):");
  for (const r of pageRentalsUnderMax.slice(0, 20)) {
    console.log(" ", {
      city: r.city,
      price: agentPageListingPriceDollars(r.priceCents),
      propertyType: r.propertyType,
      propertySubtype: r.propertySubtype,
      mappedBucket: r.mappedBucket,
    });
  }
  console.log("");
  console.log("SFH/residential-lease candidates under max (heuristic):", pageHouseCandidates.length);
  console.log("Currently mapped to House bucket:", pageHouseMatches.length);
  console.log("Filter matches (rent + max + House) on page cards:", matchingHouse.length);
  console.log("");
  console.log("200-cap impact:");
  const allHouseUnderMax = allRentalsUnderMax.filter((r) => r.mappedBucket === "house");
  const missingFromPage = allHouseUnderMax.filter((r) => !r.onAgentPage);
  console.log("  House rentals under max in full DB:", allHouseUnderMax.length);
  console.log("  House rentals under max on page:", pageHouseMatches.length);
  console.log("  House rentals under max NOT on page (beyond 200 cap):", missingFromPage.length);
  if (missingFromPage.length > 0) {
    console.log("  Sample missing:", missingFromPage.slice(0, 5).map((r) => ({
      city: r.city,
      price: agentPageListingPriceDollars(r.priceCents),
      propertyType: r.propertyType,
      propertySubtype: r.propertySubtype,
    })));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
