import type { BuyerGeoConstraint, BuyerPreferenceProfile } from "../buyerPreferenceSchema";
import type { InventoryListingDetails } from "./inventoryListingSchema";
import { parseSqftMinFromProfile, parseSqftMaxFromProfile } from "../buyerQualification";
import { resolveMatchingBudgetBounds } from "../buyerPreferenceBudget";
import {
  listingIsLikelyMonthlyRentPrice,
  listingIsLikelySalePrice,
  listingIsRentalOrLease,
  listingMatchesRentIntent,
  listingPriceLooksLikeMonthlyRent,
  resolveBuyerTransactionIntent,
  type BuyerTransactionIntent,
} from "./listingTransactionIntent";
import { mapResoPropertyType, addressIndicatesUnitNumber } from "./reso/resoListingClassification";
import { geoConstraintsMatchScore } from "./buyerGeoConstraints";
import { isMatchableInventoryStatus } from "./inventoryListingSchema";
import {
  VERIFIED_LISTING_REASON,
  filterReasonsToVerifiedListingFacts,
  listingHasPoolAttribute,
  listingHasWaterfrontAttribute,
  listingHasModernStyleAttribute,
  listingHasGatedCommunityAttribute,
  listingHasParkingAttribute,
  listingHasPetFriendlyAttribute,
  listingHasWalkabilityAttribute,
  listingHasSchoolPriorityAttribute,
  listingHasInvestmentAttribute,
  verifiedMustHaveReason,
} from "./listingVerifiedMatchReasons";

const MIN_CONFIDENCE = 0.5;
const NEAR_PRICE_TOLERANCE = 0.12;
export const MIN_STRONG_MATCH_SCORE = 35;

export type BuyerMatchCriteria = {
  hasAnyCriteria: boolean;
  areas: string[];
  priceMin: number | null;
  priceMax: number | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  propertyTypes: string[];
  transactionIntent: BuyerTransactionIntent;
  mustHaves: string[];
  dealBreakers: string[];
  financingStatus: string | null;
  sqftMin: number | null;
  sqftMax: number | null;
  lowHoa: boolean;
  hardRequirePool: boolean;
  hardRequireWaterfront: boolean;
  geoConstraints: BuyerGeoConstraint[];
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
  propertySubtype?: string | null;
  squareFeet?: number | null;
  yearBuilt?: number | null;
  hoaFeeCents?: number | null;
  listingDetails?: InventoryListingDetails;
  description: string | null;
  features: string[];
  listingUrl: string | null;
  photos: { url: string; order?: number }[];
  latitude?: number | null;
  longitude?: number | null;
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

export type ListingPropertyTypeInput = {
  propertyType?: string | null;
  propertySubtype?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  textHint?: string | null;
};

export function normalizeListingPropertyType(
  propertyType: string | null | undefined,
  propertySubtype?: string | null,
  textHint?: string | null,
  addressLine1?: string | null,
  addressLine2?: string | null,
): string | null {
  const mapped = mapResoPropertyType(propertyType, propertySubtype, {
    addressLine1,
    addressLine2,
  });
  const canonical = new Set(["house", "condo", "townhouse", "villa", "multi_family", "land"]);
  if (mapped && canonical.has(mapped)) return mapped;
  if (mapped === "residential_lease") return mapped;

  const combined = [propertyType, propertySubtype].filter(Boolean).join(" ");
  if (combined) {
    const s = normalizeText(combined).replace(/-/g, "_");
    if (/\b(townhouse|town[\s_]?house|townhome|town[\s_]?home)\b/.test(s)) return "townhouse";
    if (/\bvilla\b/.test(s)) return "villa";
    if (/\b(condo|condominium|apartment)\b/.test(s)) return "condo";
    if (/\bmulti[\s_]?family\b/.test(s)) return "multi_family";
    if (/\bland\b/.test(s)) return "land";
  }

  const hasUnit = addressIndicatesUnitNumber(addressLine1, addressLine2);
  if (textHint && !hasUnit) {
    const d = normalizeText(textHint);
    if (/\btownhouse\b|\btown[\s_]?home\b|\btownhome\b/.test(d)) return "townhouse";
    if (/\bcondo\b|\bapartment\b/.test(d)) return "condo";
    if (/\bvilla\b/.test(d)) return "villa";
    if (/\b(sfh|single[\s_]?family|single family home)\b/.test(d)) return "house";
    if (/\bduplex\b|\btriplex\b|\bfourplex\b/.test(d)) return "multi_family";
  }

  return mapped ?? (combined ? normalizeText(combined).replace(/-/g, "_") : null);
}

/** Property type for matching — RESO fields first; description never upgrades attached/unit rows to house. */
export function resolveListingPropertyType(listing: MatchListingInput): string | null {
  const hint = [listing.description, ...(listing.features ?? [])].filter(Boolean).join(" ");
  return normalizeListingPropertyType(
    listing.propertyType,
    listing.propertySubtype,
    hint || null,
    listing.addressLine1,
    listing.addressLine2,
  );
}

export function formatListingPropertyTypePassReason(listing: MatchListingInput): string {
  const resolved = resolveListingPropertyType(listing);
  const rawSub = listing.propertySubtype ?? "—";
  const rawType = listing.propertyType ?? "—";
  const txn = listing.listingDetails?.listingTransactionType ?? "unknown";
  return `PASS resolved=${resolved ?? "—"} rawType=${rawType} rawSub=${rawSub} txn=${txn}`;
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

function mustHaveRequiresPool(mustHaves: string[]): boolean {
  return mustHaves.some((raw) => /\b(must have pool|pool required|needs? pool)\b/i.test(raw));
}

function mustHaveRequiresWaterfront(mustHaves: string[]): boolean {
  return mustHaves.some((raw) => /\b(must have waterfront|waterfront required)\b/i.test(raw));
}

export function extractBuyerMatchCriteria(profile: BuyerPreferenceProfile): BuyerMatchCriteria {
  const areas = fieldValue<string[]>(profile, "targetAreas") ?? [];
  const budget = resolveMatchingBudgetBounds(profile);
  const priceMin = budget.priceMin;
  const priceMax = budget.priceMax;
  const bedsMin = fieldValue<number>(profile, "bedsMin");
  const bedsMax = fieldValue<number>(profile, "bedsMax");
  const bathsMin = fieldValue<number>(profile, "bathsMin");
  const propertyTypes = (fieldValue<string[]>(profile, "propertyTypes") ?? []).map(
    (t) => normalizeListingPropertyType(t) ?? t,
  );
  const mustHaves = fieldValue<string[]>(profile, "mustHaves") ?? [];
  const dealBreakers = fieldValue<string[]>(profile, "dealBreakers") ?? [];
  const financingStatus = fieldValue<string>(profile, "financingStatus");
  const sqftMin = parseSqftMinFromProfile(profile);
  const sqftMax = parseSqftMaxFromProfile(profile);
  const lowHoa = fieldValue<boolean>(profile, "lowHoa") === true;
  const transactionIntent = resolveBuyerTransactionIntent(
    fieldValue<BuyerTransactionIntent>(profile, "transactionIntent"),
  );

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

  const hardRequirePool = features.pool || mustHaveRequiresPool(mustHaves);
  const hardRequireWaterfront = features.waterfront || mustHaveRequiresWaterfront(mustHaves);
  const geoConstraints = fieldValue<BuyerGeoConstraint[]>(profile, "geoConstraints") ?? [];

  const hasAnyCriteria =
    areas.length > 0 ||
    geoConstraints.length > 0 ||
    priceMin != null ||
    priceMax != null ||
    bedsMin != null ||
    bedsMax != null ||
    bathsMin != null ||
    propertyTypes.length > 0 ||
    mustHaves.length > 0 ||
    dealBreakers.length > 0 ||
    financingStatus != null ||
    sqftMin != null ||
    sqftMax != null ||
    lowHoa ||
    Object.values(features).some(Boolean);

  return {
    hasAnyCriteria,
    areas,
    priceMin,
    priceMax,
    bedsMin,
    bedsMax,
    bathsMin,
    propertyTypes,
    transactionIntent,
    mustHaves,
    dealBreakers,
    financingStatus,
    sqftMin,
    sqftMax,
    lowHoa,
    hardRequirePool,
    hardRequireWaterfront,
    geoConstraints,
    features,
  };
}

function listingFeatureTerms(listing: MatchListingInput): string[] {
  return Array.isArray(listing.features) ? listing.features : [];
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
    listing.propertySubtype,
    ...listingFeatureTerms(listing),
  ];
  return normalizeText(parts.filter(Boolean).join(" "));
}

/** Deal-breaker scan — omit MLS feature tokens (noisy after RESO sync). */
function listingDealBreakerHaystack(listing: MatchListingInput): string {
  const parts = [
    listing.city,
    listing.state,
    listing.addressLine1,
    listing.addressLine2,
    listing.zip,
    listing.description,
    listing.propertyType,
    listing.propertySubtype,
  ];
  return normalizeText(parts.filter(Boolean).join(" "));
}

function listingHasPoolSignal(listing: MatchListingInput): boolean {
  return listingHasPoolAttribute(listing);
}

function listingHasWaterfrontSignal(listing: MatchListingInput): boolean {
  if (listing.listingDetails?.waterfront === true) return true;
  if (listing.listingDetails?.waterfront === false) return false;
  if (listingHasWaterfrontAttribute(listing)) return true;
  const hay = listingHaystack(listing);
  if (/\bnot\s+waterfront\b/i.test(hay)) return false;
  return (
    /\bwater view\b/.test(hay) ||
    /\bocean\b/.test(hay) ||
    /\bbay\b/.test(hay) ||
    /\bcanal\b/.test(hay)
  );
}

function passesHardGates(listing: MatchListingInput, criteria: BuyerMatchCriteria): boolean {
  if (criteria.transactionIntent === "buy") {
    if (listingIsRentalOrLease(listing)) return false;
    if (
      listingIsLikelyMonthlyRentPrice(listing.priceCents, {
        transactionIntent: criteria.transactionIntent,
        priceMax: criteria.priceMax,
        listing,
      })
    ) {
      return false;
    }
  } else if (criteria.transactionIntent === "rent") {
    if (listingIsLikelySalePrice(listing.priceCents) && !listingIsRentalOrLease(listing)) {
      return false;
    }
    if (!listingMatchesRentIntent(listing)) return false;
  }

  if (criteria.propertyTypes.length > 0) {
    const lt = resolveListingPropertyType(listing);
    if (!lt || !criteria.propertyTypes.includes(lt)) return false;
  }

  if (criteria.hardRequirePool && !listingHasPoolSignal(listing)) return false;
  if (criteria.hardRequireWaterfront && !listingHasWaterfrontSignal(listing)) return false;

  if (criteria.sqftMin != null) {
    const sqft = listing.squareFeet;
    if (sqft != null && sqft < criteria.sqftMin) return false;
  }

  if (criteria.sqftMax != null) {
    const sqft = listing.squareFeet;
    if (sqft != null && sqft > criteria.sqftMax) return false;
  }

  if (criteria.geoConstraints.length > 0) {
    const geo = geoConstraintsMatchScore(listing, criteria.geoConstraints);
    if (geo.hardExclude) return false;
  }

  if (criteria.priceMax != null && listing.priceCents != null) {
    const price = listing.priceCents / 100;
    if (price > criteria.priceMax) return false;
  }

  if (criteria.priceMin != null && listing.priceCents != null) {
    const price = listing.priceCents / 100;
    if (price < criteria.priceMin) return false;
  }

  if (criteria.bedsMin != null && listing.beds != null && listing.beds < criteria.bedsMin) {
    return false;
  }

  if (criteria.bedsMax != null && listing.beds != null && listing.beds > criteria.bedsMax) {
    return false;
  }

  if (criteria.bathsMin != null && listing.baths != null && listing.baths < criteria.bathsMin) {
    return false;
  }

  if (criteria.areas.length > 0) {
    const area = areaMatchScore(listing, criteria.areas);
    if (area.points === 0) return false;
  }

  return true;
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
      return { points: 10, max, reasons: [] };
    }
    return { points: 0, max, reasons: [] };
  }

  return { points: 0, max, reasons: [] };
}

function propertyTypeScore(
  listing: MatchListingInput,
  wanted: string[],
): { points: number; max: number; reasons: string[] } {
  if (wanted.length === 0) return { points: 0, max: 0, reasons: [] };
  const lt = resolveListingPropertyType(listing);
  if (!lt) return { points: 0, max: 15, reasons: [] };
  if (wanted.includes(lt)) {
    return { points: 15, max: 15, reasons: ["Matches property type"] };
  }
  return { points: 0, max: 15, reasons: [] };
}

function bedsBathsScore(
  listing: MatchListingInput,
  bedsMin: number | null,
  bedsMax: number | null,
  bathsMin: number | null,
): { points: number; max: number; reasons: string[] } {
  let points = 0;
  let max = 0;
  const reasons: string[] = [];

  if (bedsMin != null || bedsMax != null) {
    max += 10;
    if (listing.beds != null) {
      const withinMin = bedsMin == null || listing.beds >= bedsMin;
      const withinMax = bedsMax == null || listing.beds <= bedsMax;
      if (withinMin && withinMax) {
        points += 10;
        reasons.push(
          bedsMax != null && bedsMin === bedsMax
            ? "Matches bedroom count"
            : "Matches bedroom preference",
        );
      }
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

function sqftScore(
  listing: MatchListingInput,
  sqftMin: number | null,
  sqftMax: number | null,
): { points: number; max: number; reasons: string[] } {
  const sqft = listing.squareFeet;
  if (sqftMax != null) {
    if (sqft == null) return { points: 0, max: 8, reasons: [] };
    if (sqft <= sqftMax) {
      return { points: 8, max: 8, reasons: ["Within square footage limit"] };
    }
    return { points: 0, max: 8, reasons: [] };
  }
  if (sqftMin == null) return { points: 0, max: 0, reasons: [] };
  if (sqft == null) return { points: 0, max: 8, reasons: [] };
  if (sqft >= sqftMin) {
    return { points: 8, max: 8, reasons: ["Meets minimum square footage"] };
  }
  return { points: 0, max: 8, reasons: [] };
}

function lowHoaScore(
  listing: MatchListingInput,
  lowHoa: boolean,
): { points: number; max: number; reasons: string[] } {
  if (!lowHoa) return { points: 0, max: 0, reasons: [] };
  const max = 5;
  const hoa = listing.hoaFeeCents;
  if (hoa == null) return { points: 3, max, reasons: ["HOA not listed"] };
  if (hoa <= 25000) return { points: 5, max, reasons: ["Low HOA"] };
  return { points: 0, max, reasons: [] };
}

const FEATURE_PREFERENCE_CHECKS: {
  key: keyof BuyerMatchCriteria["features"];
  check: (listing: MatchListingInput) => boolean;
  reason: string;
}[] = [
  { key: "pool", check: listingHasPoolAttribute, reason: VERIFIED_LISTING_REASON.pool },
  { key: "waterfront", check: listingHasWaterfrontAttribute, reason: VERIFIED_LISTING_REASON.waterfront },
  { key: "modernStyle", check: listingHasModernStyleAttribute, reason: VERIFIED_LISTING_REASON.modernStyle },
  { key: "gatedCommunity", check: listingHasGatedCommunityAttribute, reason: VERIFIED_LISTING_REASON.gatedCommunity },
  { key: "parking", check: listingHasParkingAttribute, reason: VERIFIED_LISTING_REASON.parking },
  { key: "petFriendly", check: listingHasPetFriendlyAttribute, reason: VERIFIED_LISTING_REASON.petFriendly },
  { key: "walkability", check: listingHasWalkabilityAttribute, reason: VERIFIED_LISTING_REASON.walkability },
  { key: "schoolPriority", check: listingHasSchoolPriorityAttribute, reason: VERIFIED_LISTING_REASON.schoolPriority },
  { key: "investmentIntent", check: listingHasInvestmentAttribute, reason: VERIFIED_LISTING_REASON.investmentIntent },
];

function featureAndMustHaveScore(
  listing: MatchListingInput,
  criteria: BuyerMatchCriteria,
): { points: number; max: number; reasons: string[] } {
  let points = 0;
  let max = 0;
  const reasons: string[] = [];

  const activeFeatures = FEATURE_PREFERENCE_CHECKS.filter(({ key }) => criteria.features[key]);
  max += activeFeatures.length > 0 ? 15 : 0;

  if (activeFeatures.length > 0) {
    let matched = 0;
    for (const { check, reason } of activeFeatures) {
      if (check(listing)) {
        matched += 1;
        reasons.push(reason);
      }
    }
    points += Math.round((matched / activeFeatures.length) * 15);
  }

  for (const raw of criteria.mustHaves) {
    const reason = verifiedMustHaveReason(raw, listing);
    if (!reason) continue;
    max += 3;
    points += 3;
    reasons.push(reason);
  }

  return { points, max, reasons };
}

function hitsDealBreaker(listing: MatchListingInput, dealBreakers: string[]): string | null {
  if (dealBreakers.length === 0) return null;
  const hay = listingDealBreakerHaystack(listing);
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

  if (!passesHardGates(listing, criteria)) return null;

  const area = areaMatchScore(listing, criteria.areas);
  const price = priceMatchScore(listing.priceCents, criteria.priceMin, criteria.priceMax);
  const pType = propertyTypeScore(listing, criteria.propertyTypes);
  const bedsBaths = bedsBathsScore(listing, criteria.bedsMin, criteria.bedsMax, criteria.bathsMin);
  const sqft = sqftScore(listing, criteria.sqftMin, criteria.sqftMax);
  const hoa = lowHoaScore(listing, criteria.lowHoa);
  const features = featureAndMustHaveScore(listing, criteria);
  const geo = geoConstraintsMatchScore(listing, criteria.geoConstraints);
  const financing = financingBonus(criteria.financingStatus, price.points, criteria.priceMax ?? 0);

  const earned =
    area.points +
    price.points +
    pType.points +
    bedsBaths.points +
    sqft.points +
    hoa.points +
    features.points +
    geo.points +
    financing.points;
  const possible =
    area.max +
    price.max +
    pType.max +
    bedsBaths.max +
    sqft.max +
    hoa.max +
    features.max +
    geo.max +
    (financing.points > 0 ? 5 : criteria.financingStatus ? 5 : 0);

  if (possible === 0) return null;

  let score = Math.round((earned / possible) * 100);
  if (area.points >= 24 && price.points >= 20 && pType.points >= 15) {
    score = Math.min(100, score + 5);
  }
  if (score < MIN_STRONG_MATCH_SCORE) return null;

  const reasons = filterReasonsToVerifiedListingFacts(
    [
      ...area.reasons,
      ...price.reasons,
      ...pType.reasons,
      ...bedsBaths.reasons,
      ...sqft.reasons,
      ...hoa.reasons,
      ...features.reasons,
      ...geo.reasons,
      ...financing.reasons,
    ],
    listing,
  );

  const uniqueReasons = [...new Set(reasons)].slice(0, 5);

  return {
    listingId: listing.id,
    providerListingId: listing.providerListingId,
    score,
    reasons: uniqueReasons,
    listing,
  };
}

export function countQualifyingInventoryMatches(
  listings: MatchListingInput[],
  criteria: BuyerMatchCriteria,
): number {
  if (!criteria.hasAnyCriteria) return 0;
  const seen = new Set<string>();
  for (const listing of listings) {
    const scored = scoreListingAgainstCriteria(listing, criteria);
    if (!scored) continue;
    seen.add(scored.providerListingId);
  }
  return seen.size;
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

/** @internal Test helper — expose hard gate evaluation. */
export function listingPassesHardGatesForCriteria(
  listing: MatchListingInput,
  criteria: BuyerMatchCriteria,
): boolean {
  return passesHardGates(listing, criteria);
}

export function listingHasPool(listing: MatchListingInput): boolean {
  return listingHasPoolSignal(listing);
}

export type ListingExclusionSample = {
  listingId: string;
  providerListingId: string;
  city: string | null;
  priceCents: number | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  reason: string;
};

function formatPriceForExclusion(priceCents: number | null): string {
  if (priceCents == null) return "—";
  return `$${Math.round(priceCents / 100).toLocaleString("en-US")}`;
}

/** First hard-gate or score failure reason for diagnostics. */
export function getListingExclusionReason(
  listing: MatchListingInput,
  criteria: BuyerMatchCriteria,
): string | null {
  if (!isMatchableInventoryStatus(listing.status)) return "inactive or unmatchable status";

  const breaker = hitsDealBreaker(listing, criteria.dealBreakers);
  if (breaker) return `deal-breaker: ${breaker}`;

  if (criteria.transactionIntent === "buy") {
    if (listingIsRentalOrLease(listing)) return "rental/lease listing";
    if (
      listingIsLikelyMonthlyRentPrice(listing.priceCents, {
        transactionIntent: criteria.transactionIntent,
        priceMax: criteria.priceMax,
        listing,
      })
    ) {
      return "rental/lease listing";
    }
  } else if (criteria.transactionIntent === "rent") {
    if (listingIsLikelySalePrice(listing.priceCents) && !listingIsRentalOrLease(listing)) {
      return "for-sale listing";
    }
    if (!listingMatchesRentIntent(listing)) return "not a rental/lease listing";
  }

  if (criteria.propertyTypes.length > 0) {
    const lt = resolveListingPropertyType(listing);
    if (!lt || !criteria.propertyTypes.includes(lt)) return "wrong property type";
  }

  if (criteria.hardRequirePool && !listingHasPoolSignal(listing)) return "missing pool";
  if (criteria.hardRequireWaterfront && !listingHasWaterfrontSignal(listing)) return "missing waterfront";

  if (criteria.sqftMin != null && listing.squareFeet != null && listing.squareFeet < criteria.sqftMin) {
    return "under min sqft";
  }
  if (criteria.sqftMax != null && listing.squareFeet != null && listing.squareFeet > criteria.sqftMax) {
    return "over max sqft";
  }

  if (criteria.geoConstraints.length > 0) {
    const geo = geoConstraintsMatchScore(listing, criteria.geoConstraints);
    if (geo.hardExclude) return "outside geo constraint";
  }

  if (criteria.priceMax != null && listing.priceCents != null) {
    const price = listing.priceCents / 100;
    if (price > criteria.priceMax) {
      return criteria.transactionIntent === "rent" ? "over rent budget" : "over budget";
    }
  }

  if (criteria.priceMin != null && listing.priceCents != null) {
    const price = listing.priceCents / 100;
    if (price < criteria.priceMin) return "under budget floor";
  }

  if (criteria.bedsMax != null && listing.beds != null && listing.beds > criteria.bedsMax) {
    return "over bedroom max";
  }

  if (criteria.bedsMin != null && listing.beds != null && listing.beds < criteria.bedsMin) {
    return "under beds";
  }

  if (criteria.bathsMin != null && listing.baths != null && listing.baths < criteria.bathsMin) {
    return "under baths";
  }

  if (criteria.areas.length > 0) {
    const area = areaMatchScore(listing, criteria.areas);
    if (area.points === 0) return "outside area";
  }

  const scored = scoreListingAgainstCriteria(listing, criteria);
  if (!scored) return "low match score";

  return null;
}

/** Human-readable labels for Inventory Health exclusion breakdown. */
export const EXCLUSION_REASON_LABELS: Record<string, string> = {
  "over budget": "Over budget",
  "over rent budget": "Over rent budget",
  "under budget floor": "Under budget",
  "missing pool": "Missing pool",
  "missing waterfront": "Missing ocean view / waterfront",
  "not a rental/lease listing": "Wrong transaction type (not rental)",
  "for-sale listing": "Wrong transaction type (for sale)",
  "rental/lease listing": "Wrong transaction type (rental)",
  "wrong property type": "Wrong property type",
  "over max sqft": "Over sq ft max",
  "under min sqft": "Under min sq ft",
  "under beds": "Under beds",
  "under baths": "Under baths",
  "over bedroom max": "Over bedroom max",
  "outside area": "Outside area",
  "low match score": "Low match score",
  "outside geo constraint": "Outside geo constraint",
  "inactive or unmatchable status": "Inactive listing",
};

export function labelExclusionReason(reason: string): string {
  if (EXCLUSION_REASON_LABELS[reason]) return EXCLUSION_REASON_LABELS[reason];
  if (reason.startsWith("deal-breaker:")) return `Deal-breaker: ${reason.slice("deal-breaker:".length)}`;
  return reason;
}

export function countExclusionReasons(
  listings: MatchListingInput[],
  criteria: BuyerMatchCriteria,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    const reason = getListingExclusionReason(listing, criteria);
    if (!reason) continue;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return counts;
}

export function summarizeExclusionCounts(counts: Map<string, number>): string {
  if (counts.size === 0) return "";
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${labelExclusionReason(reason)} (${count})`)
    .join(", ");
}

export function buildExcludedListingSamples(
  listings: MatchListingInput[],
  criteria: BuyerMatchCriteria,
  limit = 8,
): ListingExclusionSample[] {
  const samples: ListingExclusionSample[] = [];

  for (const listing of listings) {
    if (samples.length >= limit) break;
    const reason = getListingExclusionReason(listing, criteria);
    if (!reason) continue;
    samples.push({
      listingId: listing.id,
      providerListingId: listing.providerListingId,
      city: listing.city,
      priceCents: listing.priceCents,
      beds: listing.beds,
      baths: listing.baths,
      squareFeet: listing.squareFeet ?? null,
      reason: labelExclusionReason(reason),
    });
  }

  return samples;
}

export function summarizeExclusionReasons(samples: ListingExclusionSample[]): string {
  if (samples.length === 0) return "";
  const counts = new Map<string, number>();
  for (const s of samples) {
    counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason} (${count})`)
    .join(", ");
}

export type MatchFunnelCandidate = {
  listingId: string;
  providerListingId: string;
  city: string | null;
  priceCents: number | null;
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  score: number | null;
  exclusionReason: string | null;
  matched: boolean;
  inRawShape: boolean;
};

export type MatchFunnelAudit = {
  totalActive: number;
  rawShapeMatches: number;
  passHardGates: number;
  passScoreThreshold: number;
  apiRankLimit: number;
  apiReturned: number;
  uiSidebarPreviewLimit: number;
  hardGateExcluded: number;
  scoreThresholdExcluded: number;
  /** Raw-shape listings excluded by profile gates (pool, type, area, etc.) before score. */
  preferenceExcludedFromRawShape: number;
  /** Raw-shape listings that pass gates but fail MIN_STRONG_MATCH_SCORE. */
  scoreExcludedFromRawShape: number;
  bedsRule: "exact" | "minimum" | "range" | "none";
  exclusionByReason: Record<string, number>;
  criteria: BuyerMatchCriteria;
  topCandidates: MatchFunnelCandidate[];
};

/** Simplified rent search shape — before scoring and legacy preference gates. */
export function passesRawRentalSearchShape(
  listing: MatchListingInput,
  shape: {
    areas: string[];
    bedsMin: number;
    bathsMin: number;
    priceMin: number;
    priceMax: number;
  },
): boolean {
  if (!isMatchableInventoryStatus(listing.status)) return false;
  if (listingIsLikelySalePrice(listing.priceCents) && !listingIsRentalOrLease(listing)) {
    return false;
  }
  if (!listingMatchesRentIntent(listing)) return false;

  const cityNorm = normalizeText(listing.city ?? "");
  const areaOk = shape.areas.some((area) => {
    const a = normalizeText(area);
    return a && (cityNorm === a || cityNorm.includes(a) || a.includes(cityNorm));
  });
  if (!areaOk) return false;

  if (listing.beds != null && listing.beds < shape.bedsMin) return false;
  if (listing.baths != null && listing.baths < shape.bathsMin) return false;

  if (listing.priceCents != null) {
    const price = listing.priceCents / 100;
    if (price < shape.priceMin || price > shape.priceMax) return false;
  }

  return true;
}

export function auditInventoryMatchFunnel(
  listings: MatchListingInput[],
  criteria: BuyerMatchCriteria,
  options?: {
    candidateLimit?: number;
    rankLimit?: number;
    uiPreviewLimit?: number;
    rawShape?: {
      areas: string[];
      bedsMin: number;
      bathsMin: number;
      priceMin: number;
      priceMax: number;
    };
  },
): MatchFunnelAudit {
  const rankLimit = options?.rankLimit ?? 10;
  const uiPreviewLimit = options?.uiPreviewLimit ?? 5;
  const candidateLimit = options?.candidateLimit ?? 20;

  let rawShapeMatches = 0;
  let passHardGates = 0;
  let passScoreThreshold = 0;
  let hardGateExcluded = 0;
  let scoreThresholdExcluded = 0;
  let preferenceExcludedFromRawShape = 0;
  let scoreExcludedFromRawShape = 0;
  const exclusionByReason: Record<string, number> = {};
  const candidates: MatchFunnelCandidate[] = [];

  for (const listing of listings) {
    const inRawShape = options?.rawShape
      ? passesRawRentalSearchShape(listing, options.rawShape)
      : false;
    if (inRawShape) rawShapeMatches += 1;

    const hardOk = listingPassesHardGatesForCriteria(listing, criteria);
    const scored = scoreListingAgainstCriteria(listing, criteria);
    const exclusionReason = getListingExclusionReason(listing, criteria);
    const labeledReason = exclusionReason ? labelExclusionReason(exclusionReason) : null;

    if (hardOk) {
      passHardGates += 1;
      if (scored) {
        passScoreThreshold += 1;
      } else {
        scoreThresholdExcluded += 1;
      }
    } else {
      hardGateExcluded += 1;
    }

    if (labeledReason) {
      exclusionByReason[labeledReason] = (exclusionByReason[labeledReason] ?? 0) + 1;
    }

    if (inRawShape) {
      if (scored) {
        // counted in passScoreThreshold
      } else if (exclusionReason === "low match score") {
        scoreExcludedFromRawShape += 1;
      } else if (exclusionReason) {
        preferenceExcludedFromRawShape += 1;
      }
    }

    candidates.push({
      listingId: listing.id,
      providerListingId: listing.providerListingId,
      city: listing.city,
      priceCents: listing.priceCents,
      beds: listing.beds,
      baths: listing.baths,
      propertyType: listing.propertyType,
      score: scored?.score ?? null,
      exclusionReason: scored ? null : labeledReason,
      matched: !!scored,
      inRawShape,
    });
  }

  const ranked = rankInventoryMatches(listings, criteria, rankLimit);

  const bedsRule: MatchFunnelAudit["bedsRule"] =
    criteria.bedsMin != null && criteria.bedsMax != null && criteria.bedsMin === criteria.bedsMax
      ? "exact"
      : criteria.bedsMin != null
        ? "minimum"
        : criteria.bedsMax != null
          ? "range"
          : "none";

  const matchedCandidates = candidates
    .filter((c) => c.matched)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const rawShapeNearMisses = candidates.filter((c) => c.inRawShape && !c.matched);
  const topCandidates = [...matchedCandidates, ...rawShapeNearMisses].slice(0, candidateLimit);

  return {
    totalActive: listings.length,
    rawShapeMatches,
    passHardGates,
    passScoreThreshold,
    apiRankLimit: rankLimit,
    apiReturned: ranked.length,
    uiSidebarPreviewLimit: uiPreviewLimit,
    hardGateExcluded,
    scoreThresholdExcluded,
    preferenceExcludedFromRawShape,
    scoreExcludedFromRawShape,
    bedsRule,
    exclusionByReason,
    criteria,
    topCandidates,
  };
}

export function buildMatchFunnelSummary(
  listingsScored: number,
  matchesReturned: number,
  exclusionCounts: Map<string, number>,
): string | null {
  if (listingsScored <= 0) return null;
  const excluded = [...exclusionCounts.values()].reduce((a, b) => a + b, 0);
  const exclusionLine = summarizeExclusionCounts(exclusionCounts);
  if (matchesReturned > 0) {
    const base = `${matchesReturned} of ${listingsScored} listings matched strong criteria`;
    return exclusionLine ? `${base}. Excluded: ${exclusionLine}` : base;
  }
  if (excluded <= 0) return `Scored ${listingsScored} listing(s); none met buyer criteria.`;
  return `Scored ${listingsScored} listing(s); none met buyer criteria. Top exclusions: ${exclusionLine}`;
}

export function formatListingExclusionLine(sample: ListingExclusionSample): string {
  const parts = [
    sample.city || "Unknown city",
    formatPriceForExclusion(sample.priceCents),
    sample.beds != null ? `${sample.beds}bd` : null,
    sample.baths != null ? `${sample.baths}ba` : null,
    sample.squareFeet != null ? `${sample.squareFeet}sf` : null,
    sample.reason,
  ].filter(Boolean);
  return parts.join(" · ");
}

export type BuyInventoryFunnelStep = {
  label: string;
  count: number;
};

export type BuyInventoryFunnelAudit = {
  steps: BuyInventoryFunnelStep[];
  dataQuality: Record<string, number>;
  exclusionByReason: Record<string, number>;
  excludedSamples: Array<{
    listingId: string;
    providerListingId: string;
    address: string | null;
    city: string | null;
    priceCents: number | null;
    beds: number | null;
    propertyType: string | null;
    propertySubtype: string | null;
    resolvedType: string | null;
    listingTransactionType: string | null;
    poolDetected: boolean;
    exclusionReason: string | null;
    matched: boolean;
    score: number | null;
  }>;
  criteria: BuyerMatchCriteria;
  rankedCount: number;
};

function passesAreaGate(listing: MatchListingInput, areas: string[]): boolean {
  if (areas.length === 0) return true;
  return areaMatchScore(listing, areas).points > 0;
}

function passesPropertyTypeGate(listing: MatchListingInput, types: string[]): boolean {
  if (types.length === 0) return true;
  const lt = resolveListingPropertyType(listing);
  return !!lt && types.includes(lt);
}

function isSaleListingForCriteria(
  listing: MatchListingInput,
  criteria: BuyerMatchCriteria,
): boolean {
  if (listingIsRentalOrLease(listing)) return false;
  if (
    listingIsLikelyMonthlyRentPrice(listing.priceCents, {
      transactionIntent: criteria.transactionIntent,
      priceMax: criteria.priceMax,
      listing,
    })
  ) {
    return false;
  }
  return true;
}

function isRentListingForCriteria(listing: MatchListingInput): boolean {
  return listingIsRentalOrLease(listing) || listingPriceLooksLikeMonthlyRent(listing.priceCents);
}

/** Step-by-step buy-search funnel for live DB diagnostics and Inventory Health. */
export function auditBuySearchMatchFunnel(
  listings: MatchListingInput[],
  criteria: BuyerMatchCriteria,
  options?: { rankLimit?: number; sampleLimit?: number },
): BuyInventoryFunnelAudit {
  const rankLimit = options?.rankLimit ?? 10;
  const sampleLimit = options?.sampleLimit ?? 20;
  const priceMax = criteria.priceMax;
  const bedsMin = criteria.bedsMin;
  const areaLabel =
    criteria.areas.length > 0 ? criteria.areas.join(" / ") : "any area";
  const typeLabel =
    criteria.propertyTypes.length > 0 ? criteria.propertyTypes.join(", ") : "any type";

  let nStatus = 0;
  let nTransaction = 0;
  let nArea = 0;
  let nType = 0;
  let nPrice = 0;
  let nBeds = 0;
  let nPool = 0;
  let nHardGates = 0;
  let nScored = 0;

  const dq = {
    nullCity: 0,
    nullPrice: 0,
    nullBeds: 0,
    nullPropertyType: 0,
    nullPoolField: 0,
  };

  const exclusionByReason: Record<string, number> = {};
  const samples: BuyInventoryFunnelAudit["excludedSamples"] = [];

  for (const listing of listings) {
    if (listing.city == null || listing.city.trim() === "") dq.nullCity += 1;
    if (listing.priceCents == null) dq.nullPrice += 1;
    if (listing.beds == null) dq.nullBeds += 1;
    if (!listing.propertyType && !listing.propertySubtype) dq.nullPropertyType += 1;
    if (listing.listingDetails?.pool == null && !listingHasPoolSignal(listing)) dq.nullPoolField += 1;

    if (!isMatchableInventoryStatus(listing.status)) continue;
    nStatus += 1;

    const passesTxn =
      criteria.transactionIntent === "rent"
        ? isRentListingForCriteria(listing)
        : criteria.transactionIntent === "buy"
          ? isSaleListingForCriteria(listing, criteria)
          : true;
    if (!passesTxn) continue;
    nTransaction += 1;

    if (!passesAreaGate(listing, criteria.areas)) continue;
    nArea += 1;

    if (!passesPropertyTypeGate(listing, criteria.propertyTypes)) continue;
    nType += 1;

    if (priceMax != null && listing.priceCents != null && listing.priceCents / 100 > priceMax) continue;
    nPrice += 1;

    if (bedsMin != null && listing.beds != null && listing.beds < bedsMin) continue;
    nBeds += 1;

    if (criteria.hardRequirePool && !listingHasPoolSignal(listing)) continue;
    nPool += 1;

    if (listingPassesHardGatesForCriteria(listing, criteria)) nHardGates += 1;
    if (scoreListingAgainstCriteria(listing, criteria)) nScored += 1;
  }

  const ranked = rankInventoryMatches(listings, criteria, rankLimit);
  const totalMatches = countQualifyingInventoryMatches(listings, criteria);
  let matchedSamplesAdded = 0;

  for (const listing of listings) {
    const scored = scoreListingAgainstCriteria(listing, criteria);
    const exclusionReason = getListingExclusionReason(listing, criteria);
    const labeled = exclusionReason ? labelExclusionReason(exclusionReason) : null;
    if (labeled) exclusionByReason[labeled] = (exclusionByReason[labeled] ?? 0) + 1;

    const isMatch = !!scored && !exclusionReason;
    if (samples.length >= sampleLimit) continue;
    if (!isMatch && !labeled) continue;
    if (isMatch && matchedSamplesAdded >= 5) continue;

    samples.push({
      listingId: listing.id,
      providerListingId: listing.providerListingId,
      address: listing.addressLine1,
      city: listing.city,
      priceCents: listing.priceCents,
      beds: listing.beds,
      propertyType: listing.propertyType,
      propertySubtype: listing.propertySubtype ?? null,
      resolvedType: resolveListingPropertyType(listing),
      listingTransactionType: listing.listingDetails?.listingTransactionType ?? null,
      poolDetected: listingHasPoolSignal(listing),
      exclusionReason: isMatch ? formatListingPropertyTypePassReason(listing) : labeled,
      matched: isMatch,
      score: scored?.score ?? null,
    });
    if (isMatch) matchedSamplesAdded += 1;
  }

  const steps: BuyInventoryFunnelStep[] = [
    { label: "Total loaded for matching", count: listings.length },
    { label: "active/coming_soon", count: nStatus },
    {
      label:
        criteria.transactionIntent === "rent"
          ? "rental/lease only"
          : criteria.transactionIntent === "buy"
            ? "sale only (not rental/lease)"
            : "transaction intent pass",
      count: nTransaction,
    },
    { label: `area: ${areaLabel}`, count: nArea },
    { label: `property type: ${typeLabel}`, count: nType },
    ...(priceMax != null
      ? [{ label: `price <= $${priceMax.toLocaleString()}`, count: nPrice }]
      : [{ label: "price cap (none)", count: nPrice }]),
    ...(bedsMin != null
      ? [{ label: `beds >= ${bedsMin} (or unknown)`, count: nBeds }]
      : [{ label: "beds min (none)", count: nBeds }]),
    ...(criteria.hardRequirePool
      ? [{ label: "verified pool", count: nPool }]
      : [{ label: "pool optional (no pool gate)", count: nBeds }]),
    { label: "pass all profile hard gates", count: nHardGates },
    { label: `pass score threshold (>=${MIN_STRONG_MATCH_SCORE})`, count: nScored },
    { label: `total qualifying matches`, count: totalMatches },
    { label: `returned matches (limit ${rankLimit})`, count: ranked.length },
  ];

  return {
    steps,
    dataQuality: dq,
    exclusionByReason,
    excludedSamples: samples,
    criteria,
    rankedCount: totalMatches,
  };
}

/** @deprecated Use auditBuySearchMatchFunnel */
export function auditBuyInventoryFunnel(
  listings: MatchListingInput[],
  criteria: BuyerMatchCriteria,
  options?: { rankLimit?: number; sampleLimit?: number },
): BuyInventoryFunnelAudit {
  return auditBuySearchMatchFunnel(listings, criteria, options);
}
