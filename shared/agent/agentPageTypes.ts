export type AgentPageListingCard = {
  id: string;
  shareUrl: string;
  imageUrl: string | null;
  street: string | null;
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
  status: string;
  listingLabel: "FOR SALE" | "FOR RENT";
};

export type PublicAgentPageRenderInput = {
  userId: string;
  displayName: string;
  bio: string;
  marketArea: string;
  brokerageName: string;
  avatarUrl: string | null;
  companyLogo: string | null;
  publicEmail: string;
  publicPhone: string;
  schedulingUrl: string;
  widgetEnabled: boolean;
  preferredLeadCapture: "webchat" | "email" | "phone";
  showHomeValueCta: boolean;
  agentPageSlug: string;
  listings: AgentPageListingCard[];
};
