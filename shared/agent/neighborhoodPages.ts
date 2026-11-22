import { buildAgentPageUrl } from "./agentPageSlug";

export const NEIGHBORHOOD_GUIDE_MAX_PHOTOS = 6;
export const NEIGHBORHOOD_GUIDE_MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type NeighborhoodPhoto = { url: string; alt: string };

export type NeighborhoodContent = {
  name: string;
  city: string;
  state: string;
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

export function neighborhoodTitle(page: Pick<NeighborhoodContent, "name" | "city" | "state">): string {
  return `${page.name}, ${page.city}, ${page.state}`;
}

export function buildNeighborhoodUrl(agentSlug: string, neighborhoodSlug: string, origin: string): string {
  return `${buildAgentPageUrl(agentSlug, origin)}/${neighborhoodSlug}`;
}

export function neighborhoodContentComplete(content: string): boolean {
  const paragraphs = new Set(content.trim().split(/\n\s*\n/)
    .map((part) => part.trim().replace(/\s+/g, " ").toLowerCase())
    .filter((part) => part.length >= 60));
  return paragraphs.size >= 2 && [...paragraphs].join(" ").length >= 240;
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
