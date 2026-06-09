/** Public share path for listings without an external MLS URL. */
export const LISTING_SHARE_PATH_PREFIX = "/share/listings/";

export function buildListingSharePath(listingId: string): string {
  return `${LISTING_SHARE_PATH_PREFIX}${listingId}`;
}

export function buildListingShareUrl(listingId: string, appOrigin: string): string {
  const base = appOrigin.replace(/\/+$/, "");
  return `${base}${buildListingSharePath(listingId)}`;
}

export function extractListingIdFromShareUrl(url: string): string | null {
  const match = url.match(/\/share\/listings\/([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

export type ResolveListingViewUrlInput = {
  listingId: string;
  listingUrl?: string | null;
  appOrigin?: string | null;
};

/** Always use the WhachatCRM public flyer — never external MLS / PropertyPanorama URLs. */
export function resolveListingViewUrl(input: ResolveListingViewUrlInput): string | null {
  if (!input.listingId) return null;
  const origin = (input.appOrigin || "").trim();
  if (!origin) return null;
  return buildListingShareUrl(input.listingId, origin);
}

export function pickPrimaryPhotoUrl(
  photos?: { url: string; order?: number }[] | null,
  thumbnailUrl?: string | null,
): string | null {
  if (Array.isArray(photos) && photos.length > 0) {
    const sorted = [...photos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const url = sorted[0]?.url?.trim();
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  const thumb = (thumbnailUrl || "").trim();
  if (thumb && /^https?:\/\//i.test(thumb)) return thumb;
  return null;
}
