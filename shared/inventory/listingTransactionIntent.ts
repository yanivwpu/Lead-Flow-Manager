export type ListingTransactionInput = {
  propertyType: string | null;
  propertySubtype?: string | null;
  description: string | null;
  features: string[];
  priceCents: number | null;
};

export const RENTAL_LISTING_HINT_PATTERN =
  /\b(rent|rental|lease|leased|leasing|for\s+rent|rent\s+only|residential\s+lease|commercial\s+lease|lease\s+only)\b/i;

/** RESO / MLS text signals that a listing is for rent or lease — not a for-sale purchase. */
export function listingHaystackForTransaction(listing: ListingTransactionInput): string {
  return [
    listing.propertyType,
    listing.propertySubtype,
    listing.description,
    ...(Array.isArray(listing.features) ? listing.features : []),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/_/g, " ")
    .toLowerCase();
}

export function listingIsRentalOrLease(listing: ListingTransactionInput): boolean {
  const hay = listingHaystackForTransaction(listing);
  if (RENTAL_LISTING_HINT_PATTERN.test(hay)) return true;
  if (/\bresidential\s+lease\b/.test(hay)) return true;
  if (/\bcommercial\s+lease\b/.test(hay)) return true;
  return false;
}

/**
 * Monthly rent often stored as ListPrice ($5k–$15k/mo) while buyer cap is a sale budget ($1M+).
 */
export function listingIsLikelyMonthlyRentPrice(
  priceCents: number | null,
  options: { transactionIntent: "buy" | "rent" | "unknown"; priceMax: number | null },
): boolean {
  if (options.transactionIntent === "rent") return false;
  if (priceCents == null) return false;
  const price = priceCents / 100;
  const saleCap = options.priceMax;
  if (saleCap == null || saleCap < 150_000) return false;
  // Sale homes in this market are not $8k total; that is almost always monthly rent.
  if (price > 0 && price < 50_000) return true;
  return false;
}

export type BuyerTransactionIntent = "buy" | "rent" | "unknown";

export function resolveBuyerTransactionIntent(
  raw: BuyerTransactionIntent | null | undefined,
): BuyerTransactionIntent {
  if (raw === "rent" || raw === "buy") return raw;
  return "unknown";
}

/** Sale list prices are typically six figures+; monthly rent is usually under $50k. */
export function listingIsLikelySalePrice(priceCents: number | null): boolean {
  if (priceCents == null) return false;
  return priceCents / 100 >= 100_000;
}

export function listingPriceLooksLikeMonthlyRent(priceCents: number | null): boolean {
  if (priceCents == null) return false;
  const dollars = priceCents / 100;
  return dollars >= 400 && dollars <= 50_000;
}

export function listingMatchesRentIntent(listing: ListingTransactionInput): boolean {
  if (listingIsRentalOrLease(listing)) return true;
  return listingPriceLooksLikeMonthlyRent(listing.priceCents);
}

export function formatListingPriceDisplay(
  priceCents: number | null,
  listing?: ListingTransactionInput | null,
  options?: { transactionIntent?: BuyerTransactionIntent },
): string {
  if (priceCents == null) return "Price on request";
  const dollars = priceCents / 100;
  const intent = options?.transactionIntent ?? "unknown";
  const rentalListing =
    (listing && listingIsRentalOrLease(listing)) ||
    intent === "rent" ||
    (intent === "unknown" && listingPriceLooksLikeMonthlyRent(priceCents) && !listingIsLikelySalePrice(priceCents));

  if (rentalListing && dollars < 100_000) {
    if (dollars >= 1_000) {
      const rounded = Math.round(dollars);
      return `$${rounded.toLocaleString("en-US")}/mo`;
    }
    return `$${Math.round(dollars).toLocaleString("en-US")}/mo`;
  }

  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  }
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000).toLocaleString()}k`;
  return `$${Math.round(dollars).toLocaleString()}`;
}
