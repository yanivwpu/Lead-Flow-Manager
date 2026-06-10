/** Public share path for listings without an external MLS URL. */
export const LISTING_SHARE_PATH_PREFIX = "/share/listings/";

export type ListingShareRef = {
  listingId: string;
  publicSlug?: string | null;
};

/** Prefer SEO slug segment when assigned; otherwise UUID. */
export function resolveListingShareSegment(ref: ListingShareRef): string {
  const slug = ref.publicSlug?.trim();
  if (slug) return slug;
  return ref.listingId;
}

export function buildListingSharePath(
  listingIdOrRef: string | ListingShareRef,
): string {
  const segment =
    typeof listingIdOrRef === "string"
      ? listingIdOrRef
      : resolveListingShareSegment(listingIdOrRef);
  return `${LISTING_SHARE_PATH_PREFIX}${segment}`;
}

export function buildListingShareUrl(
  listingIdOrRef: string | ListingShareRef,
  appOrigin: string,
): string {
  const base = appOrigin.replace(/\/+$/, "");
  return `${base}${buildListingSharePath(listingIdOrRef)}`;
}

/** Canonical public URL — slug when available, else UUID. */
export function buildListingCanonicalShareUrl(
  ref: ListingShareRef,
  appOrigin: string,
): string {
  return buildListingShareUrl(ref, appOrigin);
}

export function extractListingIdFromShareUrl(url: string): string | null {
  const match = url.match(/\/share\/listings\/([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

export function extractListingShareSegmentFromUrl(url: string): string | null {
  const match = url.match(/\/share\/listings\/([^/?#]+)/i);
  return match?.[1]?.trim() ?? null;
}

export type ResolveListingViewUrlInput = {
  listingId: string;
  publicSlug?: string | null;
  listingUrl?: string | null;
  appOrigin?: string | null;
};

/** Always use the WhachatCRM public flyer — never external MLS / PropertyPanorama URLs. */
export function resolveListingViewUrl(input: ResolveListingViewUrlInput): string | null {
  if (!input.listingId) return null;
  const origin = (input.appOrigin || "").trim();
  if (!origin) return null;
  return buildListingShareUrl(
    { listingId: input.listingId, publicSlug: input.publicSlug },
    origin,
  );
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
