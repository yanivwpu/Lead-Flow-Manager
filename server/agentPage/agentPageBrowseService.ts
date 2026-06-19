import type { AgentPageListingCard } from "@shared/agent/agentPageTypes";
import {
  AGENT_PAGE_BROWSE_FETCH_CAP,
  AGENT_PAGE_BROWSE_PAGE_SIZE,
} from "@shared/agent/agentPageBrowseConstants";
import type { PublicAgentBrowseListingsResponse } from "@shared/agent/agentPageSchema";
import {
  compareAgentPageListings,
  listingMatchesAgentPageBrowseFilters,
  type AgentPageListingBrowseFilters,
} from "@shared/agent/publicAgentPageBrowse";
import { fetchPublishedListingsForAgentPage } from "./agentPageDb";
import { inventoryListingToAgentPageCard } from "./agentPageListingCard";

export const DEFAULT_AGENT_PAGE_BROWSE_FILTERS: AgentPageListingBrowseFilters = {
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

export type BrowseAgentPageListingsInput = {
  userId: string;
  appOrigin: string;
  filters: AgentPageListingBrowseFilters;
  offset?: number;
  limit?: number;
  renderHtml: (cards: AgentPageListingCard[], startIndex: number) => string;
};

export async function browseAgentPageListings(
  input: BrowseAgentPageListingsInput,
): Promise<PublicAgentBrowseListingsResponse> {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? AGENT_PAGE_BROWSE_PAGE_SIZE;

  const rows = await fetchPublishedListingsForAgentPage(input.userId, AGENT_PAGE_BROWSE_FETCH_CAP);
  const cards = rows.map((row) => inventoryListingToAgentPageCard(row, input.appOrigin));

  const matched = cards
    .map((card, sortIndex) => ({ card, sortIndex }))
    .filter(({ card, sortIndex }) =>
      listingMatchesAgentPageBrowseFilters(
        {
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
        },
        input.filters,
      ),
    );

  matched.sort((a, b) =>
    compareAgentPageListings(
      {
        status: a.card.status,
        listingLabel: a.card.listingLabel,
        cityState: a.card.cityState,
        priceCents: a.card.priceCents,
        beds: a.card.bedsNum,
        baths: a.card.bathsNum,
        sqft: a.card.sqftNum,
        propertyType: a.card.propertyType,
        propertySubtype: a.card.propertySubtype,
        sortIndex: a.sortIndex,
      },
      {
        status: b.card.status,
        listingLabel: b.card.listingLabel,
        cityState: b.card.cityState,
        priceCents: b.card.priceCents,
        beds: b.card.bedsNum,
        baths: b.card.bathsNum,
        sqft: b.card.sqftNum,
        propertyType: b.card.propertyType,
        propertySubtype: b.card.propertySubtype,
        sortIndex: b.sortIndex,
      },
      input.filters.sort,
    ),
  );

  const total = matched.length;
  const page = matched.slice(offset, offset + limit).map(({ card }) => card);
  const hasMore = offset + page.length < total;

  return {
    listings: page,
    html: page.length > 0 ? input.renderHtml(page, offset) : "",
    total,
    offset,
    limit,
    hasMore,
  };
}

export function browseQueryToFilters(query: {
  listingType: AgentPageListingBrowseFilters["listingType"];
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  minSqft?: number;
  propertyType?: string | null;
  sort: AgentPageListingBrowseFilters["sort"];
}): AgentPageListingBrowseFilters {
  const location = query.location?.trim() || null;
  return {
    listingType: query.listingType,
    location,
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
    minBeds: query.minBeds ?? null,
    minBaths: query.minBaths ?? null,
    minSqft: query.minSqft ?? null,
    propertyType: query.propertyType ?? null,
    sort: query.sort,
  };
}
