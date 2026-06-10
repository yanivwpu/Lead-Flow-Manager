/** UUID v4 pattern for public listing share identifiers. */
export const LISTING_SHARE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isListingShareUuid(value: string): boolean {
  return LISTING_SHARE_UUID_REGEX.test(value.trim());
}

/** First 8 hex chars of listing UUID — stable unique suffix for every slug. */
export function listingPublicSlugSuffix(listingId: string): string {
  return listingId.replace(/-/g, "").slice(0, 8).toLowerCase();
}

const LISTING_SLUG_BASE_MAX_LEN = 90;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Street-only line for slug/SEO when line1 may contain UnparsedAddress with city/state/zip. */
export function resolveListingStreetForSlug(input: ListingPublicSlugInput): string {
  let street = (input.addressLine1 ?? "").trim();
  const city = (input.city ?? "").trim();
  const state = (input.state ?? "").trim();
  const zip = (input.zip ?? "").trim();

  if (city) {
    const cityRe = new RegExp(`[,\\s]+${escapeRegExp(city)}\\b`, "i");
    const match = street.match(cityRe);
    if (match?.index != null && match.index > 0) {
      street = street.slice(0, match.index).replace(/[,\s]+$/g, "").trim();
    }
  }

  if (state && zip) {
    street = street
      .replace(new RegExp(`[,\\s]+${escapeRegExp(state)}\\s*${escapeRegExp(zip)}\\s*$`, "i"), "")
      .trim();
  }
  if (zip) {
    street = street.replace(new RegExp(`[,\\s]+${escapeRegExp(zip)}\\s*$`, "i"), "").trim();
  }
  if (state) {
    street = street.replace(new RegExp(`[,\\s]+${escapeRegExp(state)}\\s*$`, "i"), "").trim();
  }

  const line2 = input.addressLine2?.trim();
  if (line2) {
    const unitToken = line2.replace(/^#/, "").trim().toLowerCase();
    if (unitToken && !street.toLowerCase().includes(unitToken)) {
      street = `${street} ${line2}`.trim();
    }
  }

  return street;
}

export function slugifyListingText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/#/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ListingPublicSlugInput = {
  id: string;
  addressLine1: string | null;
  addressLine2?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

/** True when address fields are sufficient to build a public slug. */
export function listingHasPublicSlugAddress(input: ListingPublicSlugInput): boolean {
  return Boolean(
    input.addressLine1?.trim() &&
      input.city?.trim() &&
      input.state?.trim() &&
      input.zip?.trim() &&
      input.id?.trim(),
  );
}

/**
 * Build SEO slug: address + city + state + zip + stable id suffix.
 * Example: 3503-oaks-way-308-pompano-beach-fl-33069-2e059e00
 */
export function buildListingPublicSlug(input: ListingPublicSlugInput): string | null {
  if (!listingHasPublicSlugAddress(input)) return null;

  const street = resolveListingStreetForSlug(input);
  if (!street) return null;

  const segments = [street, input.city!.trim(), input.state!.trim(), input.zip!.trim()];

  let base = slugifyListingText(segments.join(" "));
  if (!base) return null;

  if (base.length > LISTING_SLUG_BASE_MAX_LEN) {
    base = base.slice(0, LISTING_SLUG_BASE_MAX_LEN).replace(/-+$/g, "");
  }

  const suffix = listingPublicSlugSuffix(input.id);
  return `${base}-${suffix}`;
}
