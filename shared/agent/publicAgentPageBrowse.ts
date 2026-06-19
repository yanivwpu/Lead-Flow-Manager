import { listingMatchesAgentPageFilter, type AgentPageListingFilter } from "./publicAgentPage";
import { agentPageBrowseFilterDollarsToCents } from "./agentPageBrowsePrice";
import { normalizeAgentPageBrowsePropertyType } from "./agentPageBrowsePropertyType";

export type AgentPageListingSort = "newest" | "price_desc" | "price_asc";

export type AgentPageListingBrowseInput = {
  status: string;
  listingLabel: "FOR SALE" | "FOR RENT";
  cityState: string;
  priceCents: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  propertySubtype: string | null;
  sortIndex: number;
};

export type AgentPageListingBrowseFilters = {
  listingType: AgentPageListingFilter;
  location: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  minBaths: number | null;
  minSqft: number | null;
  propertyType: string | null;
  sort: AgentPageListingSort;
};

export const AGENT_PAGE_PROPERTY_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "house", label: "House" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "multi_family", label: "Multi-family" },
  { value: "land", label: "Land" },
  { value: "other", label: "Other" },
] as const;

function normalizePropertyType(
  propertyType: string | null | undefined,
  propertySubtype?: string | null | undefined,
): string {
  return normalizeAgentPageBrowsePropertyType(propertyType, propertySubtype);
}

export function listingMatchesAgentPageBrowseFilters(
  listing: AgentPageListingBrowseInput,
  filters: AgentPageListingBrowseFilters,
): boolean {
  if (
    !listingMatchesAgentPageFilter(filters.listingType, {
      status: listing.status === "Coming Soon" ? "coming_soon" : listing.status,
      listingLabel: listing.listingLabel,
    })
  ) {
    return false;
  }

  const locationQuery = (filters.location ?? "").trim().toLowerCase();
  if (locationQuery) {
    const haystack = (listing.cityState ?? "").trim().toLowerCase();
    if (!haystack.includes(locationQuery)) return false;
  }

  const price = listing.priceCents;
  const minPriceCents =
    filters.minPrice != null ? agentPageBrowseFilterDollarsToCents(filters.minPrice) : null;
  const maxPriceCents =
    filters.maxPrice != null ? agentPageBrowseFilterDollarsToCents(filters.maxPrice) : null;
  if (minPriceCents != null && (price == null || price < minPriceCents)) return false;
  if (maxPriceCents != null && (price == null || price > maxPriceCents)) return false;
  if (filters.minBeds != null && (listing.beds == null || listing.beds < filters.minBeds)) return false;
  if (filters.minBaths != null && (listing.baths == null || listing.baths < filters.minBaths)) return false;
  if (filters.minSqft != null && (listing.sqft == null || listing.sqft < filters.minSqft)) return false;

  if (filters.propertyType) {
    if (normalizePropertyType(listing.propertyType, listing.propertySubtype) !== filters.propertyType) {
      return false;
    }
  }

  return true;
}

export function compareAgentPageListings(
  a: AgentPageListingBrowseInput,
  b: AgentPageListingBrowseInput,
  sort: AgentPageListingSort,
): number {
  if (sort === "newest") return a.sortIndex - b.sortIndex;
  const pa = a.priceCents ?? -1;
  const pb = b.priceCents ?? -1;
  if (sort === "price_desc") return pb - pa;
  return pa - pb;
}

export function normalizePropertyTypeForFilter(
  propertyType: string | null | undefined,
  propertySubtype?: string | null | undefined,
): string {
  return normalizePropertyType(propertyType, propertySubtype);
}
