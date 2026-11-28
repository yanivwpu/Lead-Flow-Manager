import type { TFunction } from "i18next";
import { formatRegionalNumber } from "@/lib/regionalFormatting";
import type { InventoryMatchResult } from "@shared/inventory/inventoryMatchTypes";
import { formatListingPriceDisplay } from "@shared/inventory/listingTransactionIntent";

export function formatInventoryPrice(
  cents: number | null,
  listing?: InventoryMatchResult["listing"],
  transactionIntent?: "buy" | "rent" | "unknown",
  display?: { t: TFunction; language: string },
): string {
  const formatted = formatListingPriceDisplay(
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
  if (!display) return formatted;
  if (cents == null) return display.t("rgeMatching.priceUnknown");
  const price = formatRegionalNumber(cents / 100, display.language, {
    style: "currency", currency: listing?.currency && /^[A-Z]{3}$/.test(listing.currency) ? listing.currency : "USD",
    maximumFractionDigits: 2,
    ...(formatted.endsWith("/mo") ? {} : { notation: "compact" }),
  });
  return formatted.endsWith("/mo") ? display.t("rgeMatching.priceMonthly", { price }) : price;
}

export function formatInventoryBedsBaths(beds: number | null, baths: number | null, t: TFunction, language: string): string | null {
  const parts: string[] = [];
  if (beds != null) parts.push(t("rgeMatching.beds", { number: formatRegionalNumber(beds, language, { maximumFractionDigits: 1 }) }));
  if (baths != null) parts.push(t("rgeMatching.baths", { number: formatRegionalNumber(baths, language, { maximumFractionDigits: 1 }) }));
  return parts.length ? parts.join(" · ") : null;
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

export function mapInventoryMatchToRecommendation(match: InventoryMatchResult, t: TFunction, language: string) {
  const cityLine = [match.listing.city, match.listing.state].filter(Boolean).join(", ");
  const title = match.listing.addressLine1?.trim() || cityLine || t("rgeMatching.listing");
  const subtitle =
    match.listing.addressLine1 && cityLine ? cityLine : null;

  return {
    title,
    subtitle,
    primaryValue: formatInventoryPrice(match.listing.priceCents, match.listing, undefined, { t, language }),
    attributes: formatInventoryBedsBaths(match.listing.beds, match.listing.baths, t, language),
    score: match.score,
    matchReasons: match.reasons,
    imageSrc: match.listing.thumbnailUrl,
  };
}

export function localizedInventoryMatchReason(reason: string, t: TFunction): string {
  const key = shortInventoryMatchReason(reason);
  switch (key) {
    case "Area": return t("rgeMatching.area");
    case "Budget": return t("rgeMatching.budget");
    case "Type": return t("rgeMatching.type");
    case "Beds": return t("rgeMatching.bedrooms");
    case "Baths": return t("rgeMatching.bathrooms");
    case "Pool": return t("rgeMatching.pool");
    case "Waterfront": return t("rgeMatching.waterfront");
    case "Sq ft": return t("rgeMatching.sqft");
    case "HOA": return t("rgeMatching.hoa");
    case "East Federal": return t("rgeMatching.eastFederal");
    default: return key;
  }
}

export function localizedInventoryMatchExplanation(reason: string, t: TFunction): string {
  switch (reason) {
    case "Matches preferred area": return t("rgeMatching.matchArea");
    case "Near preferred area": return t("rgeMatching.nearArea");
    case "Within budget": return t("rgeMatching.withinBudget");
    case "Slightly above budget": return t("rgeMatching.aboveBudget");
    case "Slightly below minimum": return t("rgeMatching.belowBudget");
    case "Matches property type": return t("rgeMatching.matchType");
    case "Matches bedroom count": return t("rgeMatching.matchBeds");
    case "Matches bathroom count": return t("rgeMatching.matchBaths");
    case "Includes pool": return t("rgeMatching.includesPool");
    case "Waterfront": return t("rgeMatching.waterfront");
    case "Meets minimum square footage": return t("rgeMatching.minSqft");
    case "Low HOA": return t("rgeMatching.lowHoa");
    case "HOA not listed": return t("rgeMatching.hoaUnknown");
    case "East of Federal Hwy / US-1": return t("rgeMatching.eastOfFederal");
    default: return reason;
  }
}
