import { validateAgentPageSlugInput } from "./agentPageSlug";
export type PublicAgentPageGateInput = {
  agentPageEnabled: boolean;
  agentPageSlug: string | null | undefined;
};

/** Whether /agents/:slug may resolve. */
export function canResolvePublicAgentPage(input: PublicAgentPageGateInput): boolean {
  if (!input.agentPageEnabled || !input.agentPageSlug) return false;
  const slug = validateAgentPageSlugInput(input.agentPageSlug);
  return slug.ok && slug.slug === input.agentPageSlug;
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
