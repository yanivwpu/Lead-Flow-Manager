import type { InventoryMatchResult } from "@shared/inventory/inventoryMatchTypes";
import { formatListingPriceDisplay } from "@shared/inventory/listingTransactionIntent";

export function formatInventoryPrice(
  cents: number | null,
  listing?: InventoryMatchResult["listing"],
  transactionIntent?: "buy" | "rent" | "unknown",
): string {
  return formatListingPriceDisplay(
    cents,
    listing
      ? {
          propertyType: listing.propertyType,
          description: null,
          features: [],
          priceCents: listing.priceCents,
        }
      : null,
    { transactionIntent },
  );
}

export function formatInventoryBedsBaths(beds: number | null, baths: number | null): string | null {
  const parts: string[] = [];
  if (beds != null) parts.push(`${beds % 1 === 0 ? beds : beds.toFixed(1)} bd`);
  if (baths != null) parts.push(`${baths % 1 === 0 ? baths : baths.toFixed(1)} ba`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const INVENTORY_REASON_SHORT_LABELS: Record<string, string> = {
  "Matches preferred area": "Area",
  "Near preferred area": "Area",
  "Within budget": "Budget",
  "Slightly above budget": "Budget",
  "Slightly below minimum": "Budget",
  "Matches property type": "Type",
  "Matches bedroom count": "Beds",
  "Matches bathroom count": "Baths",
  "Includes pool": "Pool",
  "Waterfront": "Waterfront",
  "Meets minimum square footage": "Sq ft",
  "Low HOA": "HOA",
  "HOA not listed": "HOA",
  "East of Federal Hwy / US-1": "East Federal",
};

export function shortInventoryMatchReason(reason: string): string {
  if (INVENTORY_REASON_SHORT_LABELS[reason]) return INVENTORY_REASON_SHORT_LABELS[reason];
  const lower = reason.toLowerCase();
  if (lower.includes("pool")) return "Pool";
  if (lower.includes("waterfront")) return "Waterfront";
  if (lower.includes("budget") || lower.includes("price")) return "Budget";
  if (lower.includes("area") || lower.includes("location")) return "Area";
  if (lower.includes("bed")) return "Beds";
  if (lower.includes("bath")) return "Baths";
  if (lower.includes("type")) return "Type";
  const first = reason.split(/\s+/)[0];
  return first.length > 12 ? `${first.slice(0, 10)}…` : first;
}

export function mapInventoryMatchToRecommendation(match: InventoryMatchResult) {
  const cityLine = [match.listing.city, match.listing.state].filter(Boolean).join(", ");
  const title = match.listing.addressLine1?.trim() || cityLine || "Listing";
  const subtitle =
    match.listing.addressLine1 && cityLine ? cityLine : null;

  return {
    title,
    subtitle,
    primaryValue: formatInventoryPrice(match.listing.priceCents, match.listing),
    attributes: formatInventoryBedsBaths(match.listing.beds, match.listing.baths),
    score: match.score,
    matchReasons: match.reasons,
    imageSrc: match.listing.thumbnailUrl,
  };
}
