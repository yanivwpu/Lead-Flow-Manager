/**
 * Public agent page publication gate.
 */
export type PublicAgentPageGateInput = {
  publishListingsPublicly: boolean;
  agentPageEnabled: boolean;
  agentPageSlug: string | null | undefined;
};

/** Whether /agents/:slug may resolve. */
export function canResolvePublicAgentPage(input: PublicAgentPageGateInput): boolean {
  if (!input.publishListingsPublicly) return false;
  if (!input.agentPageEnabled) return false;
  return Boolean(input.agentPageSlug?.trim());
}

export type AgentPageListingFilter = "all" | "sale" | "rent" | "coming_soon";

export function listingMatchesAgentPageFilter(
  filter: AgentPageListingFilter,
  listing: { status: string; listingLabel: "FOR SALE" | "FOR RENT" },
): boolean {
  if (filter === "all") return true;
  if (filter === "coming_soon") return listing.status === "coming_soon";
  if (filter === "rent") return listing.listingLabel === "FOR RENT" && listing.status !== "coming_soon";
  return listing.listingLabel === "FOR SALE" && listing.status !== "coming_soon";
}
