import type { AgentPageListingCard } from "./agentPageTypes";
import {
  listingMatchesAgentPageBrowseFilters,
  normalizePropertyTypeForFilter,
  type AgentPageListingBrowseFilters,
  type AgentPageListingBrowseInput,
} from "./publicAgentPageBrowse";
import { listingMatchesAgentPageFilter } from "./publicAgentPage";
import { agentPageBrowseFilterDollarsToCents, agentPageListingPriceDollars } from "./agentPageBrowsePrice";

export type AgentPageBrowseFilterFunnel = {
  publishedCount: number;
  rentalCount: number;
  afterListingType: number;
  afterLocation: number;
  afterMinPrice: number;
  afterMaxPrice: number;
  afterBeds: number;
  afterBaths: number;
  afterSqft: number;
  afterPropertyType: number;
  finalCount: number;
  sampleRentalPrices: Array<{
    id: string;
    cityState: string;
    priceCents: number | null;
    priceDollars: number | null;
    listingLabel: "FOR SALE" | "FOR RENT";
  }>;
};

export function listingCardToBrowseInput(
  card: AgentPageListingCard,
  sortIndex: number,
): AgentPageListingBrowseInput {
  return {
    status: card.status,
    listingLabel: card.listingLabel,
    cityState: card.cityState,
    priceCents: card.priceCents,
    beds: card.bedsNum,
    baths: card.bathsNum,
    sqft: card.sqftNum,
    propertyType: card.propertyType,
    sortIndex,
  };
}

function passesListingType(
  listing: AgentPageListingBrowseInput,
  listingType: AgentPageListingBrowseFilters["listingType"],
): boolean {
  return listingMatchesAgentPageFilter(listingType, {
    status: listing.status === "Coming Soon" ? "coming_soon" : listing.status,
    listingLabel: listing.listingLabel,
  });
}

function passesLocation(listing: AgentPageListingBrowseInput, location: string | null): boolean {
  const locationQuery = (location ?? "").trim().toLowerCase();
  if (!locationQuery) return true;
  return (listing.cityState ?? "").trim().toLowerCase().includes(locationQuery);
}

function passesMinPrice(listing: AgentPageListingBrowseInput, minPriceDollars: number | null): boolean {
  if (minPriceDollars == null) return true;
  const price = listing.priceCents;
  const minCents = agentPageBrowseFilterDollarsToCents(minPriceDollars);
  return price != null && price >= minCents;
}

function passesMaxPrice(listing: AgentPageListingBrowseInput, maxPriceDollars: number | null): boolean {
  if (maxPriceDollars == null) return true;
  const price = listing.priceCents;
  const maxCents = agentPageBrowseFilterDollarsToCents(maxPriceDollars);
  return price != null && price <= maxCents;
}

export function computeAgentPageBrowseFilterFunnel(
  listings: AgentPageListingCard[],
  filters: AgentPageListingBrowseFilters,
): AgentPageBrowseFilterFunnel {
  const inputs = listings.map((card, index) => listingCardToBrowseInput(card, index));
  const rentals = inputs.filter((l) => l.listingLabel === "FOR RENT");

  const afterListingType = inputs.filter((l) => passesListingType(l, filters.listingType));
  const afterLocation = afterListingType.filter((l) => passesLocation(l, filters.location));
  const afterMinPrice = afterLocation.filter((l) => passesMinPrice(l, filters.minPrice));
  const afterMaxPrice = afterMinPrice.filter((l) => passesMaxPrice(l, filters.maxPrice));
  const afterBeds = afterMaxPrice.filter((l) => {
    if (filters.minBeds == null) return true;
    return l.beds != null && l.beds >= filters.minBeds;
  });
  const afterBaths = afterBeds.filter((l) => {
    if (filters.minBaths == null) return true;
    return l.baths != null && l.baths >= filters.minBaths;
  });
  const afterSqft = afterBaths.filter((l) => {
    if (filters.minSqft == null) return true;
    return l.sqft != null && l.sqft >= filters.minSqft;
  });
  const afterPropertyType = afterSqft.filter((l) => {
    if (!filters.propertyType) return true;
    return normalizePropertyTypeForFilter(l.propertyType) === filters.propertyType;
  });
  const finalCount = inputs.filter((l) => listingMatchesAgentPageBrowseFilters(l, filters)).length;

  return {
    publishedCount: listings.length,
    rentalCount: rentals.length,
    afterListingType: afterListingType.length,
    afterLocation: afterLocation.length,
    afterMinPrice: afterMinPrice.length,
    afterMaxPrice: afterMaxPrice.length,
    afterBeds: afterBeds.length,
    afterBaths: afterBaths.length,
    afterSqft: afterSqft.length,
    afterPropertyType: afterPropertyType.length,
    finalCount,
    sampleRentalPrices: listings
      .filter((c) => c.listingLabel === "FOR RENT")
      .slice(0, 12)
      .map((c) => ({
        id: c.id,
        cityState: c.cityState,
        priceCents: c.priceCents,
        priceDollars: agentPageListingPriceDollars(c.priceCents),
        listingLabel: c.listingLabel,
      })),
  };
}
