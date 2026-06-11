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
  return "buy";
}
