import { slugifyListingText } from "../inventory/listingPublicSlug";

export const AGENT_PAGE_PATH_PREFIX = "/agents/";

export function agentPageSlugSuffix(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8).toLowerCase();
}

/** Build a stable SEO slug from display name + user id suffix. */
export function buildAgentPageSlug(displayName: string, userId: string): string | null {
  const base = slugifyListingText(displayName.trim());
  if (!base) return null;
  const suffix = agentPageSlugSuffix(userId);
  const maxBase = 60;
  const trimmedBase = base.length > maxBase ? base.slice(0, maxBase).replace(/-+$/g, "") : base;
  if (!trimmedBase) return null;
  return `${trimmedBase}-${suffix}`;
}

export function buildAgentPagePath(slug: string): string {
  return `${AGENT_PAGE_PATH_PREFIX}${slug.trim()}`;
}

export function buildAgentPageUrl(slug: string, appOrigin: string): string {
  const base = appOrigin.replace(/\/+$/, "");
  return `${base}${buildAgentPagePath(slug)}`;
}

export function normalizeAgentPageSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
