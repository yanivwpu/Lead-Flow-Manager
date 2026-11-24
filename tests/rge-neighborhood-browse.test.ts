import assert from "node:assert/strict";
import test from "node:test";
import { pageVerifiedNeighborhoodCards } from "../shared/agent/neighborhoodPropertyBrowse";
import { coordinateWithinNeighborhood, type NeighborhoodBoundary } from "../shared/agent/neighborhoodListingGeo";
import type { AgentPageListingCard } from "../shared/agent/agentPageTypes";
import type { AgentPageListingBrowseFilters } from "../shared/agent/publicAgentPageBrowse";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";

function card(id: string, label: "FOR SALE" | "FOR RENT", options: Partial<AgentPageListingCard> = {}): AgentPageListingCard {
  return {
    id, listingLabel: label, shareUrl: "https://app.whachatcrm.com/share/listings/" + id,
    imageUrl: null, street: null, fullAddress: "Fort Lauderdale, FL",
    metaSummary: "$2,000", cityState: "Fort Lauderdale, FL",
    price: "$2,000", priceCents: 200000, beds: "2 bed", baths: "2 bath",
    sqft: "1,000 sqft", bedsNum: 2, bathsNum: 2, sqftNum: 1000,
    propertyType: "Condo", propertySubtype: null, status: "Active", ...options,
  };
}

const filters: AgentPageListingBrowseFilters = {
  listingType: "sale", location: null,
  minPrice: null, maxPrice: null, minBeds: null, minBaths: null,
  minSqft: null, propertyType: null, sort: "newest",
};

test("neighborhood browse uses Agent Page filters, correct totals and repeatable pagination", () => {
  const cards = [
    card("a", "FOR SALE", { priceCents: 45000000, price: "$450,000", bedsNum: 3, propertyType: "Single Family Residence" }),
    card("b", "FOR RENT", { priceCents: 260000, price: "$2,600/mo", propertyType: "Residential Lease", propertySubtype: "Single Family Residence" }),
    card("c", "FOR SALE", { priceCents: 30000000, price: "$300,000", bedsNum: 2 }),
    card("d", "FOR SALE", { priceCents: 65000000, price: "$650,000", bedsNum: 4 }),
  ];
  const sorted = { ...filters, sort: "price_asc" as const };
  const first = pageVerifiedNeighborhoodCards({ cards, filters: sorted, limit: 2 });
  assert.deepEqual(first.listings.map((item) => item.id), ["c", "a"]);
  assert.equal(first.total, 3);
  assert.equal(first.hasMore, true);
  const next = pageVerifiedNeighborhoodCards({ cards, filters: sorted, offset: 2, limit: 2 });
  assert.deepEqual(next.listings.map((item) => item.id), ["d"]);
  assert.equal(next.total, 3);
  assert.equal(next.hasMore, false);

  const houses = pageVerifiedNeighborhoodCards({
    cards, filters: { ...filters, listingType: "rent", propertyType: "house" },
  });
  assert.deepEqual(houses.listings.map((item) => item.id), ["b"], "single-family rentals stay in the House bucket");
  const expensive = pageVerifiedNeighborhoodCards({
    cards, filters: { ...filters, minBeds: 3, minPrice: 400000 },
  });
  assert.deepEqual(expensive.listings.map((item) => item.id), ["a", "d"]);
});

test("city names can never act as neighborhood boundaries; outside same-city property is excluded", () => {
  const polygon: NeighborhoodBoundary = { type: "Polygon", coordinates: [[
    [-80.15, 26.11], [-80.12, 26.11], [-80.12, 26.14], [-80.15, 26.14], [-80.15, 26.11],
  ]] };
  const inventory = [
    { row: card("inside", "FOR SALE"), lat: 26.12, lon: -80.13 },
    { row: card("outside", "FOR SALE"), lat: 26.2, lon: -80.13 },
  ];
  const safeCards = inventory.filter(({ lat, lon }) =>
    coordinateWithinNeighborhood(lat, lon, polygon)).map(({ row }) => row);
  const result = pageVerifiedNeighborhoodCards({
    cards: safeCards, filters: { ...filters, location: "Fort Lauderdale" },
  });
  assert.deepEqual(result.listings.map((item) => item.id), ["inside"]);
  assert.equal(result.total, 1);
});

test("published neighborhood page exposes compact filter controls, counts and per-category load more", () => {
  const rendered = buildPublicAgentPageHtml({
    userId: "agent-1", displayName: "Example Agent", bio: "Local expertise.",
    marketArea: "Fort Lauderdale", brokerageName: "Example Realty",
    avatarUrl: null, companyLogo: null,
    socialLinks: { websiteUrl: "", facebookUrl: "", instagramUrl: "", linkedinUrl: "", youtubeUrl: "" },
    publicPhone: "9545550100", schedulingUrl: "", widgetEnabled: false,
    preferredLeadCapture: "email", showHomeValueCta: true, agentPageSlug: "example",
    agentPageUrl: "https://app.whachatcrm.com/agents/example",
    canonicalUrl: "https://app.whachatcrm.com/agents/example/victoria-park",
    allowSearchIndexing: true, listings: [], browseTotal: 0, browseHasMore: false, browsePageSize: 24,
    neighborhood: {
      name: "Victoria Park", city: "Fort Lauderdale", state: "Florida", slug: "victoria-park",
      parentUrl: "https://app.whachatcrm.com/agents/example",
      content: "Local guide copy.", photos: [],
    },
    neighborhoodListings: {
      boundaryStatus: "verified", boundarySource: "City GIS", mode: "public",
      sale: [card("s", "FOR SALE")], rent: [card("r", "FOR RENT")],
      totalSale: 15, totalRent: 1, hasMoreSale: true, hasMoreRent: false,
      hasOlderMatchingInventory: false,
    },
  });
  assert.match(rendered, /id="neighborhood-filters"/);
  assert.match(rendered, /id="neighborhood-sale-more"/);
  assert.match(rendered, /id="neighborhood-rent-more" hidden/);
  assert.match(rendered, /Showing 1 of 15 listings/);
  assert.match(rendered, /function initNeighborhoodBrowse/);
  assert.match(rendered, /id="homes-sale"/);
  assert.match(rendered, /id="homes-rent"/);
});

test("unsupported boundary never exposes interactive neighborhood filters", () => {
  const source = buildPublicAgentPageHtml({
    userId: "agent-1", displayName: "Example Agent", bio: "Local expertise.",
    marketArea: "Florida", brokerageName: "", avatarUrl: null, companyLogo: null,
    socialLinks: { websiteUrl: "", facebookUrl: "", instagramUrl: "", linkedinUrl: "", youtubeUrl: "" },
    publicPhone: "9545550100", schedulingUrl: "", widgetEnabled: false,
    preferredLeadCapture: "email", showHomeValueCta: true, agentPageSlug: "example",
    agentPageUrl: "https://app.whachatcrm.com/agents/example",
    canonicalUrl: "https://app.whachatcrm.com/agents/example/unknown",
    listings: [], browseTotal: 0, browseHasMore: false, browsePageSize: 24,
    neighborhood: { name: "Unknown", city: "Unknown", state: "Florida", slug: "unknown",
      parentUrl: "https://app.whachatcrm.com/agents/example", content: "Guide", photos: [] },
    neighborhoodListings: {
      boundaryStatus: "unsupported", boundarySource: null, mode: "public",
      sale: [], rent: [], hasOlderMatchingInventory: false,
    },
  });
  assert.doesNotMatch(source, /<form id="neighborhood-filters"/);
  assert.match(source, /verified local boundary/);
});
