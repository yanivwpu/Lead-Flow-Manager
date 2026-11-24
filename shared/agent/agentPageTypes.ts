export type AgentPageListingCard = {
  id: string;
  shareUrl: string;
  imageUrl: string | null;
  street: string | null;
  /** Street + city, state, zip for lead context and modal display */
  fullAddress: string;
  /** Price + beds + baths + sqft, e.g. "$2,300/mo • 2 bed • 2 bath • 1,008 sq ft" */
  metaSummary: string;
  cityState: string;
  price: string;
  priceCents: number | null;
  beds: string | null;
  baths: string | null;
  sqft: string | null;
  bedsNum: number | null;
  bathsNum: number | null;
  sqftNum: number | null;
  propertyType: string | null;
  propertySubtype: string | null;
  status: string;
  listingLabel: "FOR SALE" | "FOR RENT";
};

/** Public guide cards are server-selected; never trust a neighborhood name alone. */
export type NeighborhoodListingRenderData = {
  boundaryStatus: "verified" | "custom_area" | "unsupported" | "unmatched" | "unavailable";
  boundarySource: string | null;
  mode: "public" | "owner_preview";
  sale: AgentPageListingCard[];
  rent: AgentPageListingCard[];
  hasOlderMatchingInventory: boolean;
  /** Optional to preserve existing preview fixture and older serialized render data. */
  totalSale?: number;
  totalRent?: number;
  hasMoreSale?: boolean;
  hasMoreRent?: boolean;
  /** A bounded DB candidate scan may not include every matching property. */
  candidateLimitReached?: boolean;
};

export type PublicAgentPageSocialLinks = {
  websiteUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
};

export type PublicAgentPageRenderInput = {
  userId: string;
  displayName: string;
  bio: string;
  marketArea: string;
  brokerageName: string;
  avatarUrl: string | null;
  companyLogo: string | null;
  socialLinks: PublicAgentPageSocialLinks;
  publicPhone: string;
  schedulingUrl: string;
  widgetEnabled: boolean;
  widgetPublicId?: string;
  preferredLeadCapture: "webchat" | "email" | "phone";
  showHomeValueCta: boolean;
  agentPageSlug: string;
  canonicalUrl?: string;
  agentPageUrl?: string;
  neighborhood?: import("./neighborhoodPages").NeighborhoodContent & { slug: string; parentUrl: string; preview?: boolean };
  neighborhoodLinks?: Array<{ url: string; title: string }>;
  neighborhoodListings?: NeighborhoodListingRenderData;
  /** True only for the clean, canonical public route after checking publication eligibility. */
  allowSearchIndexing?: boolean;
  listings: AgentPageListingCard[];
  /** Total listings matching current browse filters (server-side). */
  browseTotal: number;
  browseHasMore: boolean;
  browsePageSize: number;
  /** iframe embed mode — listings browse only */
  embedMode?: boolean;
  /** Hide floating chat launchers inside an embed (requires embedMode) */
  hideChat?: boolean;
  /** Initial For Sale / For Rent chip when loaded inside an embed */
  initialListingType?: "all" | "sale" | "rent" | "coming_soon";
};
