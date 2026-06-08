import type { BuyerPreferenceProfile } from "../buyerPreferenceSchema";
import { isMatchableInventoryStatus } from "./inventoryListingSchema";

const MIN_CONFIDENCE = 0.5;
const NEAR_PRICE_TOLERANCE = 0.12;

export type BuyerMatchCriteria = {
  hasAnyCriteria: boolean;
  areas: string[];
  priceMin: number | null;
  priceMax: number | null;
  bedsMin: number | null;
  bathsMin: number | null;
  propertyTypes: string[];
  mustHaves: string[];
  dealBreakers: string[];
  financingStatus: string | null;
  features: {
    pool: boolean;
    waterfront: boolean;
    modernStyle: boolean;
    gatedCommunity: boolean;
    parking: boolean;
    petFriendly: boolean;
    walkability: boolean;
    schoolPriority: boolean;
    investmentIntent: boolean;
  };
};

export type MatchListingInput = {
  id: string;
  providerListingId: string;
  status: string;
  priceCents: number | null;
  city: string | null;
  state: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  description: string | null;
  features: string[];
  listingUrl: string | null;
  photos: { url: string; order?: number }[];
};

export type ScoredInventoryMatch = {
  listingId: string;
  providerListingId: string;
  score: number;
  reasons: string[];
  listing: MatchListingInput;
};

function fieldValue<T>(
  profile: BuyerPreferenceProfile,
  key: keyof BuyerPreferenceProfile,
): T | null {
  const f = profile[key] as { value?: T; confidence?: number } | undefined;
  if (!f || typeof f !== "object" || !("value" in f)) return null;
  if (typeof f.confidence === "number" && f.confidence < MIN_CONFIDENCE) return null;
  return (f.value as T) ?? null;
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePropertyType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = normalizeText(raw).replace(/-/g, "_");
  if (s.includes("condo")) return "condo";
  if (s.includes("townhouse") || s.includes("town house")) return "townhouse";
  if (s.includes("multi")) return "multi_family";
  if (s.includes("land")) return "land";
  if (s.includes("house") || s.includes("single")) return "house";
  return s;
}

function titleCaseArea(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatPropertyLabel(type: string): string {
  const map: Record<string, string> = {
    condo: "Condo",
    house: "House",
    townhouse: "Townhouse",
    multi_family: "Multi-family",
    land: "Land",
  };
  return map[type] || titleCaseArea(type.replace(/_/g, " "));
}

function formatPrice(cents: number | null): string {
  if (cents == null) return "Price on request";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}k`;
  return `$${Math.round(dollars).toLocaleString()}`;
}

export function extractBuyerMatchCriteria(profile: BuyerPreferenceProfile): BuyerMatchCriteria {
  const areas = fieldValue<string[]>(profile, "targetAreas") ?? [];
  const priceMin = fieldValue<number>(profile, "priceMin");
  const priceMax = fieldValue<number>(profile, "priceMax");
  const bedsMin = fieldValue<number>(profile, "bedsMin");
  const bathsMin = fieldValue<number>(profile, "bathsMin");
  const propertyTypes = (fieldValue<string[]>(profile, "propertyTypes") ?? []).map(
    (t) => normalizePropertyType(t) ?? t,
  );
  const mustHaves = fieldValue<string[]>(profile, "mustHaves") ?? [];
  const dealBreakers = fieldValue<string[]>(profile, "dealBreakers") ?? [];
  const financingStatus = fieldValue<string>(profile, "financingStatus");

  const features = {
    pool: fieldValue<boolean>(profile, "pool") === true,
    waterfront: fieldValue<boolean>(profile, "waterfront") === true,
    modernStyle: fieldValue<boolean>(profile, "modernStyle") === true,
    gatedCommunity: fieldValue<boolean>(profile, "gatedCommunity") === true,
    parking: fieldValue<boolean>(profile, "parking") === true,
    petFriendly: fieldValue<boolean>(profile, "petFriendly") === true,
    walkability: fieldValue<boolean>(profile, "walkability") === true,
    schoolPriority: fieldValue<boolean>(profile, "schoolPriority") === true,
    investmentIntent: fieldValue<boolean>(profile, "investmentIntent") === true,
  };

  const hasAnyCriteria =
    areas.length > 0 ||
    priceMin != null ||
    priceMax != null ||
    bedsMin != null ||
    bathsMin != null ||
    propertyTypes.length > 0 ||
    mustHaves.length > 0 ||
    dealBreakers.length > 0 ||
    financingStatus != null ||
    Object.values(features).some(Boolean);

  return {
    hasAnyCriteria,
    areas,
    priceMin,
    priceMax,
    bedsMin,
    bathsMin,
    propertyTypes,
    mustHaves,
    dealBreakers,
    financingStatus,
    features,
  };
}

function listingHaystack(listing: MatchListingInput): string {
  const parts = [
    listing.city,
    listing.state,
    listing.addressLine1,
    listing.addressLine2,
    listing.zip,
    listing.description,
    listing.propertyType,
    ...listing.features,
  ];
  return normalizeText(parts.filter(Boolean).join(" "));
}

function areaMatchScore(
  listing: MatchListingInput,
  areas: string[],
): { points: number; max: number; reasons: string[] } {
  if (areas.length === 0) return { points: 0, max: 0, reasons: [] };
  const hay = listingHaystack(listing);
  const cityNorm = normalizeText(listing.city ?? "");

  for (const area of areas) {
    const a = normalizeText(area);
    if (!a) continue;
    if (cityNorm === a) {
      return { points: 30, max: 30, reasons: ["Matches preferred area"] };
    }
    if (cityNorm.includes(a) || a.includes(cityNorm)) {
      return { points: 24, max: 30, reasons: ["Near preferred area"] };
    }
    if (hay.includes(a)) {
      return { points: 18, max: 30, reasons: ["Matches preferred area"] };
    }
  }
  return { points: 0, max: 30, reasons: [] };
}

function priceMatchScore(
  priceCents: number | null,
  priceMin: number | null,
  priceMax: number | null,
): { points: number; max: number; reasons: string[] } {
  if (priceMin == null && priceMax == null) return { points: 0, max: 0, reasons: [] };
  if (priceCents == null) return { points: 0, max: 25, reasons: [] };

  const price = priceCents / 100;
  const max = 25;
  const reasons: string[] = [];

  const withinMin = priceMin == null || price >= priceMin;
  const withinMax = priceMax == null || price <= priceMax;

  if (withinMin && withinMax) {
    reasons.push("Within budget");
    return { points: 25, max, reasons };
  }

  if (priceMax != null && price > priceMax) {
    const overPct = (price - priceMax) / priceMax;
    if (overPct <= NEAR_PRICE_TOLERANCE) {
      reasons.push("Slightly above budget");
      return { points: 12, max, reasons };
    }
    return { points: 0, max, reasons: [] };
  }

  if (priceMin != null && price < priceMin) {
    const underPct = (priceMin - price) / priceMin;
    if (underPct <= NEAR_PRICE_TOLERANCE) {
      reasons.push("Slightly below minimum");
      return { points: 10, max, reasons };
    }
    return { points: 0, max, reasons: [] };
  }

  return { points: 0, max, reasons: [] };
}

function propertyTypeScore(
  listingType: string | null,
  wanted: string[],
): { points: number; max: number; reasons: string[] } {
  if (wanted.length === 0) return { points: 0, max: 0, reasons: [] };
  const lt = normalizePropertyType(listingType);
  if (!lt) return { points: 0, max: 15, reasons: [] };
  if (wanted.includes(lt)) {
    return { points: 15, max: 15, reasons: ["Matches property type"] };
  }
  return { points: 0, max: 15, reasons: [] };
}

function bedsBathsScore(
  listing: MatchListingInput,
  bedsMin: number | null,
  bathsMin: number | null,
): { points: number; max: number; reasons: string[] } {
  let points = 0;
  let max = 0;
  const reasons: string[] = [];

  if (bedsMin != null) {
    max += 10;
    if (listing.beds != null && listing.beds >= bedsMin) {
      points += 10;
      reasons.push("Matches bedroom count");
    }
  }
  if (bathsMin != null) {
    max += 5;
    if (listing.baths != null && listing.baths >= bathsMin) {
      points += 5;
      reasons.push("Matches bathroom count");
    }
  }
  return { points, max, reasons };
}

const FEATURE_KEYWORDS: Record<keyof BuyerMatchCriteria["features"], RegExp[]> = {
  pool: [/\bpool\b/, /\bswimming\b/],
  waterfront: [/\bwaterfront\b/, /\bwater view\b/, /\bocean\b/, /\bbay\b/, /\bcanal\b/],
  modernStyle: [/\bmodern\b/, /\bcontemporary\b/, /\brenovated\b/, /\bupdated\b/],
  gatedCommunity: [/\bgated\b/, /\bsecurity\b/],
  parking: [/\bparking\b/, /\bgarage\b/, /\bcovered parking\b/],
  petFriendly: [/\bpet friendly\b/, /\bpet-friendly\b/, /\bno pet restrictions\b/],
  walkability: [/\bwalkable\b/, /\bwalkability\b/, /\bpedestrian\b/],
  schoolPriority: [/\bschool\b/, /\bzone\b/],
  investmentIntent: [/\binvestment\b/, /\brental\b/, /\bcap rate\b/, /\btenant\b/],
};

const FEATURE_LABELS: Record<keyof BuyerMatchCriteria["features"], string> = {
  pool: "Includes pool",
  waterfront: "Waterfront",
  modernStyle: "Modern style",
  gatedCommunity: "Gated community",
  parking: "Parking",
  petFriendly: "Pet friendly",
  walkability: "Walkable area",
  schoolPriority: "Schools nearby",
  investmentIntent: "Investment potential",
};

const MUST_HAVE_REASON_LABELS: Record<string, string> = {
  pool: "Includes pool",
  pools: "Includes pool",
  modern: "Modern style",
  waterfront: "Waterfront",
  garage: "Garage parking",
  parking: "Garage parking",
  gated: "Gated community",
  "pet friendly": "Pet friendly",
  "pet-friendly": "Pet friendly",
};

function mustHaveReason(raw: string): string {
  const term = normalizeText(raw);
  return MUST_HAVE_REASON_LABELS[term] ?? `Includes ${titleCaseArea(raw)}`;
}

function featureAndMustHaveScore(
  listing: MatchListingInput,
  criteria: BuyerMatchCriteria,
): { points: number; max: number; reasons: string[] } {
  const hay = listingHaystack(listing);
  let points = 0;
  let max = 0;
  const reasons: string[] = [];

  const featureKeys = Object.keys(criteria.features) as (keyof BuyerMatchCriteria["features"])[];
  const activeFeatures = featureKeys.filter((k) => criteria.features[k]);
  max += activeFeatures.length > 0 ? 15 : 0;

  if (activeFeatures.length > 0) {
    let matched = 0;
    for (const key of activeFeatures) {
      const patterns = FEATURE_KEYWORDS[key];
      if (patterns.some((p) => p.test(hay))) {
        matched += 1;
        reasons.push(FEATURE_LABELS[key]);
      }
    }
    points += Math.round((matched / activeFeatures.length) * 15);
  }

  for (const raw of criteria.mustHaves) {
    const term = normalizeText(raw);
    if (!term) continue;
    max += 3;
    if (hay.includes(term)) {
      points += 3;
      reasons.push(mustHaveReason(raw));
    }
  }

  return { points, max, reasons };
}

function hitsDealBreaker(listing: MatchListingInput, dealBreakers: string[]): string | null {
  if (dealBreakers.length === 0) return null;
  const hay = listingHaystack(listing);
  for (const db of dealBreakers) {
    const term = normalizeText(db);
    if (term && hay.includes(term)) return titleCaseArea(db);
  }
  return null;
}

function financingBonus(
  financingStatus: string | null,
  pricePoints: number,
  priceMax: number,
): { points: number; reasons: string[] } {
  if (financingStatus !== "pre_approved" && financingStatus !== "cash") {
    return { points: 0, reasons: [] };
  }
  if (pricePoints >= 20) {
    const label = financingStatus === "cash" ? "Cash buyer fit" : "Pre-approved budget fit";
    return { points: 5, reasons: [label] };
  }
  return { points: 0, reasons: [] };
}

export function scoreListingAgainstCriteria(
  listing: MatchListingInput,
  criteria: BuyerMatchCriteria,
): ScoredInventoryMatch | null {
  if (!isMatchableInventoryStatus(listing.status)) return null;

  const breaker = hitsDealBreaker(listing, criteria.dealBreakers);
  if (breaker) return null;

  const area = areaMatchScore(listing, criteria.areas);
  const price = priceMatchScore(listing.priceCents, criteria.priceMin, criteria.priceMax);
  const pType = propertyTypeScore(listing.propertyType, criteria.propertyTypes);
  const bedsBaths = bedsBathsScore(listing, criteria.bedsMin, criteria.bathsMin);
  const features = featureAndMustHaveScore(listing, criteria);
  const financing = financingBonus(criteria.financingStatus, price.points, criteria.priceMax ?? 0);

  const earned =
    area.points +
    price.points +
    pType.points +
    bedsBaths.points +
    features.points +
    financing.points;
  const possible =
    area.max +
    price.max +
    pType.max +
    bedsBaths.max +
    features.max +
    (financing.points > 0 ? 5 : criteria.financingStatus ? 5 : 0);

  if (possible === 0) return null;

  let score = Math.round((earned / possible) * 100);
  if (area.points >= 24 && price.points >= 20 && pType.points >= 15) {
    score = Math.min(100, score + 5);
  }
  if (score <= 0) return null;

  const reasons = [
    ...area.reasons,
    ...price.reasons,
    ...pType.reasons,
    ...bedsBaths.reasons,
    ...features.reasons,
    ...financing.reasons,
  ];

  const uniqueReasons = [...new Set(reasons)].slice(0, 5);

  return {
    listingId: listing.id,
    providerListingId: listing.providerListingId,
    score,
    reasons: uniqueReasons,
    listing,
  };
}

export function rankInventoryMatches(
  listings: MatchListingInput[],
  criteria: BuyerMatchCriteria,
  limit = 10,
): ScoredInventoryMatch[] {
  if (!criteria.hasAnyCriteria) return [];

  const byProviderId = new Map<string, ScoredInventoryMatch>();

  for (const listing of listings) {
    const scored = scoreListingAgainstCriteria(listing, criteria);
    if (!scored) continue;
    const prev = byProviderId.get(scored.providerListingId);
    if (!prev || scored.score > prev.score) {
      byProviderId.set(scored.providerListingId, scored);
    }
  }

  return [...byProviderId.values()]
    .sort((a, b) => b.score - a.score || (b.listing.priceCents ?? 0) - (a.listing.priceCents ?? 0))
    .slice(0, limit);
}
