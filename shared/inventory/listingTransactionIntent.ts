import type { InventoryListingDetails } from "./inventoryListingSchema";
import type { MatchListingInput } from "./inventoryMatchScoring";
import {
  mapResoPropertyType,
  type ResoListingTransactionType,
} from "./reso/resoListingClassification";

export type ListingTransactionInput = {
  propertyType: string | null;
  propertySubtype?: string | null;
  description: string | null;
  features: string[];
  priceCents: number | null;
  listingDetails?: InventoryListingDetails | null;
};

export const RENTAL_LISTING_HINT_PATTERN =
  /\b(rent|rental|lease|leased|leasing|for\s+rent|rent\s+only|residential\s+lease|commercial\s+lease|lease\s+only)\b/i;

function storedListingTransactionType(
  listing: ListingTransactionInput,
): ResoListingTransactionType | null {
  const t = listing.listingDetails?.listingTransactionType;
  return t === "sale" || t === "rent" ? t : null;
}

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

export const RENT_PRICE_SCALE_MISMATCH = "RENT_PRICE_SCALE_MISMATCH";

/** Max plausible monthly rent in dollars — above this without lease fields is sale-scale. */
export const REASONABLE_MAX_MONTHLY_RENT_DOLLARS = 50_000;

function listingDetailsRecord(
  listing: ListingTransactionInput,
): Record<string, unknown> | null {
  const details = listing.listingDetails;
  if (!details || typeof details !== "object") return null;
  return details as Record<string, unknown>;
}

/** Explicit lease/rent amount on listing details (not list-price alone). */
export function listingHasExplicitRentAmount(listing: ListingTransactionInput): boolean {
  const details = listingDetailsRecord(listing);
  if (!details) return false;
  for (const key of ["leaseAmount", "rentAmount", "monthlyRent", "totalActualRent"]) {
    const v = details[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= REASONABLE_MAX_MONTHLY_RENT_DOLLARS) {
      return true;
    }
  }
  return false;
}

/**
 * Stored rent classification conflicts with sale-scale list price and no lease/rent amount.
 * Used to exclude misclassified MLS rows from rental matching.
 */
export function listingStoredRentConflictsWithSalePrice(listing: ListingTransactionInput): boolean {
  if (storedListingTransactionType(listing) !== "rent") return false;
  if (listingHasExplicitRentAmount(listing)) return false;
  return listingIsLikelySalePrice(listing.priceCents);
}

export function listingIsRentalOrLease(listing: ListingTransactionInput): boolean {
  if (listingStoredRentConflictsWithSalePrice(listing)) return false;
  const stored = storedListingTransactionType(listing);
  if (stored === "sale") return false;
  if (stored === "rent") return true;

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
  options: {
    transactionIntent: "buy" | "rent" | "unknown";
    priceMax: number | null;
    listing?: ListingTransactionInput | null;
  },
): boolean {
  if (options.transactionIntent === "rent") return false;
  const stored = options.listing ? storedListingTransactionType(options.listing) : null;
  if (stored === "sale") return false;
  if (stored === "rent") return true;

  if (priceCents == null) return false;
  const price = priceCents / 100;
  const saleCap = options.priceMax;
  if (saleCap == null || saleCap < 150_000) return false;
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

/** Prefer stored normalized property type; fall back to RESO mapper. */
export function resolveStoredListingPropertyType(listing: ListingTransactionInput): string | null {
  const mapped = mapResoPropertyType(listing.propertyType, listing.propertySubtype ?? null);
  return mapped ?? listing.propertyType;
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
