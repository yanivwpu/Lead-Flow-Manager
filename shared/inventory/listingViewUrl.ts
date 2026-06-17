/** Public share path for listings without an external MLS URL. */
export const LISTING_SHARE_PATH_PREFIX = "/share/listings/";

export type ListingShareRef = {
  listingId: string;
  publicSlug?: string | null;
};

/** Pick the first non-empty slug candidate; UUID is implied when all are empty. */
export function coalesceListingShareRef(
  listingId: string,
  ...slugCandidates: (string | null | undefined)[]
): ListingShareRef {
  for (const candidate of slugCandidates) {
    const slug = candidate?.trim();
    if (slug) return { listingId, publicSlug: slug };
  }
  return { listingId, publicSlug: null };
}

/** Prefer SEO slug segment when assigned; otherwise UUID. */
export function resolveListingShareSegment(ref: ListingShareRef): string {
  const slug = ref.publicSlug?.trim();
  if (slug && !isListingShareUuidSegment(slug, ref.listingId)) return slug;
  return ref.listingId;
}

/** Slug candidates that equal the listing UUID are not treated as SEO slugs. */
function isListingShareUuidSegment(segment: string, listingId: string): boolean {
  if (segment.toLowerCase() === listingId.toLowerCase()) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment);
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
/** @deprecated Use server-issued viewUrl — do not build share links client-side. */
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
