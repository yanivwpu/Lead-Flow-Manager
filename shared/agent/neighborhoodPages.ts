import { buildAgentPageUrl } from "./agentPageSlug";
import type { PolygonBoundary } from "./neighborhoodListingGeo";

export const NEIGHBORHOOD_GUIDE_MAX_PHOTOS = 6;
export const NEIGHBORHOOD_GUIDE_MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type NeighborhoodPhoto = { url: string; alt: string };

export type NeighborhoodContent = {
  publicLanguage?: string;
  name: string;
  city: string;
  state: string;
  /** ISO 3166-1 alpha-2; omitted only on pre-migration US drafts. */
  country?: string;
  /** Owner-defined map shape, not official GIS boundary; null selects official source. */
  customBoundary?: PolygonBoundary | null;
  content: string;
  /** Optional for existing pages and previously saved browser drafts. */
  photos?: NeighborhoodPhoto[];
};

export type NeighborhoodPageSettings = NeighborhoodContent & {
  id: string;
  slug: string;
  published: boolean;
  updatedAt: string;
  publicUrl: string | null;
};

export function neighborhoodTitle(page: Pick<NeighborhoodContent, "name" | "city" | "state" | "country">): string {
  const suffix = page.country && page.country.toUpperCase() !== "US" ? `, ${page.country.toUpperCase()}` : "";
  return `${page.name}, ${page.city}, ${page.state}${suffix}`;
}

export function buildNeighborhoodUrl(agentSlug: string, neighborhoodSlug: string, origin: string): string {
  return `${buildAgentPageUrl(agentSlug, origin)}/${neighborhoodSlug}`;
}

export function neighborhoodContentComplete(content: string): boolean {
  const sections = content.trim().split(/\n\s*\n/).map((part) => part.trim());
  const paragraphs = [...new Set(sections
    .filter((part) => !part.startsWith("## ") && !/^\[\[photo:[a-f0-9-]{36}(?:\|\d{2,3})?\]\]$/i.test(part))
    .map((part) => part.replace(/\*+/g, "").replace(/\s+/g, " ").toLowerCase())
    .filter((part) => part.length >= 60))];
  const proseLength = paragraphs.join(" ").length;
  const meaningfulHeading = sections.some((part) => part.startsWith("## ") && part.slice(3).trim().length >= 6);
  // Two informative paragraphs are ideal, but a substantial introduction with
  // a meaningful section heading can also be published while the agent expands
  // the guide. A heading or photo alone never counts as prose.
  return proseLength >= 240 && (paragraphs.length >= 2 ||
    (paragraphs.length === 1 && paragraphs[0].length >= 240 && meaningfulHeading));
}

/** Only permanent, tenant-scoped R2 images may be published on neighborhood guides. */
export function isOwnedNeighborhoodGuidePhotoUrl(
  value: string, userId: string, r2PublicUrl: string | undefined,
): boolean {
  if (!r2PublicUrl || !value || !userId) return false;
  try {
    const base = new URL(r2PublicUrl.replace(/\/$/, "") + "/");
    const photo = new URL(value);
    if (photo.origin !== base.origin || photo.search || photo.hash ||
        photo.username || photo.password) return false;
    const root = base.pathname.replace(/\/+$/, "");
    const expected = `${root}/media/${encodeURIComponent(userId)}/neighborhood-guide/`;
    if (!photo.pathname.startsWith(expected)) return false;
    const filename = photo.pathname.slice(expected.length);
    return /^[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(filename);
  } catch { return false; }
}

/**
 * Stable inline reference to an existing, owner-validated neighborhood photo.
 * Never render an arbitrary URL from article text: the public renderer resolves
 * this marker only against the page's saved photo list.
 */
export function neighborhoodPhotoMarker(photoUrl: string): string | null {
  try {
    const match = new URL(photoUrl).pathname.match(/\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\.(?:jpg|png|webp)$/i);
    return match ? `[[photo:${match[1].toLowerCase()}]]` : null;
  } catch {
    return null;
  }
}
