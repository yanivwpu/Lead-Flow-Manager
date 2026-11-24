import type { AgentPageListingCard } from "./agentPageTypes";
import {
  compareAgentPageListings,
  listingMatchesAgentPageBrowseFilters,
  type AgentPageListingBrowseFilters,
} from "./publicAgentPageBrowse";

export type NeighborhoodCardPage = {
  listings: AgentPageListingCard[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

const defaultFilters: AgentPageListingBrowseFilters = {
  listingType: "all",
  location: null,
  minPrice: null,
  maxPrice: null,
  minBeds: null,
  minBaths: null,
  minSqft: null,
  propertyType: null,
  sort: "newest",
};

/**
 * Run AFTER server-verified geometry and MLS publication/freshness gates.
 * A client-supplied city/ZIP can never replace the polygon restriction.
 */
export function pageVerifiedNeighborhoodCards(input: {
  cards: AgentPageListingCard[];
  filters?: AgentPageListingBrowseFilters;
  offset?: number;
  limit?: number;
}): NeighborhoodCardPage {
  const filters = { ...defaultFilters, ...input.filters, location: null };
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(48, Math.max(1, Math.floor(input.limit ?? 9)));
  const asBrowse = (card: AgentPageListingCard, sortIndex: number) => ({
    status: card.status,
    listingLabel: card.listingLabel,
    cityState: card.cityState,
    priceCents: card.priceCents,
    beds: card.bedsNum,
    baths: card.bathsNum,
    sqft: card.sqftNum,
    propertyType: card.propertyType,
    propertySubtype: card.propertySubtype,
    sortIndex,
  });
  const matched = input.cards
    .map((card, sortIndex) => ({ card, sortIndex }))
    .filter(({ card, sortIndex }) =>
      listingMatchesAgentPageBrowseFilters(asBrowse(card, sortIndex), filters));
  matched.sort((a, b) => compareAgentPageListings(
    asBrowse(a.card, a.sortIndex),
    asBrowse(b.card, b.sortIndex),
    filters.sort,
  ));
  const total = matched.length;
  const listings = matched.slice(offset, offset + limit).map(({ card }) => card);
  return { listings, total, offset, limit, hasMore: offset + listings.length < total };
}
