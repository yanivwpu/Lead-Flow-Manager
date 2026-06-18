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

export type AgentPageSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; error: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validate slug input before save — used by API and settings UI. */
export function validateAgentPageSlugInput(raw: string): AgentPageSlugValidation {
  const normalized = normalizeAgentPageSlug(raw);
  if (!normalized) {
    return { ok: false, error: "Slug is required — use letters, numbers, and hyphens only." };
  }
  if (normalized.length < 3) {
    return { ok: false, error: "Slug must be at least 3 characters." };
  }
  if (normalized.length > 80) {
    return { ok: false, error: "Slug must be 80 characters or fewer." };
  }
  if (!SLUG_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: "Slug must use only lowercase letters, numbers, and single hyphens between words.",
    };
  }
  return { ok: true, slug: normalized };
}
