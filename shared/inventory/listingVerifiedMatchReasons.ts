import type { InventoryListingDetails } from "./inventoryListingSchema";
import type { MatchListingInput } from "./inventoryMatchScoring";

/** Canonical customer-facing reason labels grounded in listing data only. */
export const VERIFIED_LISTING_REASON = {
  pool: "Includes pool",
  waterfront: "Waterfront",
  oceanView: "Ocean view",
  modernStyle: "Modern style",
  gatedCommunity: "Gated community",
  luxury: "Luxury home",
  renovated: "Renovated",
  parking: "Parking",
  petFriendly: "Pet friendly",
  walkability: "Walkable area",
  schoolPriority: "Schools nearby",
  investmentIntent: "Investment potential",
} as const;

export type VerifiedListingFeatureReason =
  (typeof VERIFIED_LISTING_REASON)[keyof typeof VERIFIED_LISTING_REASON];

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function listingFeatureTerms(listing: MatchListingInput): string[] {
  return Array.isArray(listing.features) ? listing.features.map(String) : [];
}

/** Description + RESO features + structured listing_details — not address/city. */
export function listingAttributeHaystack(listing: MatchListingInput): string {
  const detailBits: string[] = [];
  const details = listing.listingDetails ?? {};
  if (details.view) detailBits.push(details.view);
  if (details.parkingGarage) detailBits.push(details.parkingGarage);

  const parts = [listing.description, ...listingFeatureTerms(listing), ...detailBits];
  return normalizeText(parts.filter(Boolean).join(" "));
}

export function listingHasPoolAttribute(listing: MatchListingInput): boolean {
  if (listing.listingDetails?.pool === true) return true;
  if (listing.listingDetails?.pool === false) return false;
  for (const raw of listingFeatureTerms(listing)) {
    const term = normalizeText(raw);
    if (!term) continue;
    if (/\b(no pool|without pool)\b/.test(term)) return false;
    if (/\b(private pool|heated pool|pool|swimming pool|inground pool|community pool)\b/.test(term)) {
      return true;
    }
  }
  const hay = listingAttributeHaystack(listing);
  if (/\bno\s+pool\b/.test(hay) || /\bwithout\s+(?:a\s+)?pool\b/.test(hay)) return false;
  return /\bpool\b/.test(hay) || /\bswimming\b/.test(hay);
}

/** Strict waterfront — RESO flag or explicit "waterfront" on the listing. */
export function listingHasWaterfrontAttribute(listing: MatchListingInput): boolean {
  if (listing.listingDetails?.waterfront === true) return true;
  if (listing.listingDetails?.waterfront === false) return false;
  const hay = listingAttributeHaystack(listing);
  if (/\bnot\s+waterfront\b/.test(hay)) return false;
  return /\bwaterfront\b/.test(hay);
}

/** Ocean/water view — listing_details.view or explicit view phrases only. */
export function listingHasOceanViewAttribute(listing: MatchListingInput): boolean {
  const view = (listing.listingDetails?.view ?? "").trim().toLowerCase();
  if (view) {
    if (/\b(garden|city|park|golf|lake|mountain|courtyard)\b/.test(view) && !/\b(ocean|water|gulf|bay)\b/.test(view)) {
      return false;
    }
    if (/\b(ocean|water|gulf|bay|intracoastal|atlantic)\b/.test(view)) return true;
    if (/\b(ocean\s*view|water\s*view)\b/.test(view)) return true;
  }
  const hay = listingAttributeHaystack(listing);
  return (
    /\bocean\s+view\b/.test(hay) ||
    /\bwater\s+view\b/.test(hay) ||
    /\bviews?\s+of\s+the\s+ocean\b/.test(hay) ||
    /\bocean\s+and\s+golf\s+views?\b/.test(hay) ||
    /\bocean\s*\/\s*golf\s+view\b/.test(hay)
  );
}

export function listingHasModernStyleAttribute(listing: MatchListingInput): boolean {
  return /\b(modern|contemporary)\b/.test(listingAttributeHaystack(listing));
}

export function listingHasRenovatedAttribute(listing: MatchListingInput): boolean {
  return /\b(renovated|remodeled|fully updated|newly updated|updated kitchen|updated bath)\b/.test(
    listingAttributeHaystack(listing),
  );
}

export function listingHasGatedCommunityAttribute(listing: MatchListingInput): boolean {
  return /\b(gated community|gated entry|gated)\b/.test(listingAttributeHaystack(listing));
}

export function listingHasLuxuryAttribute(listing: MatchListingInput): boolean {
  return /\b(luxury|luxurious|high-end|prestigious|prestige)\b/.test(listingAttributeHaystack(listing));
}

export function listingHasParkingAttribute(listing: MatchListingInput): boolean {
  if (listing.listingDetails?.parkingGarage?.trim()) return true;
  return /\b(garage|parking|carport|assigned parking|covered parking)\b/.test(
    listingAttributeHaystack(listing),
  );
}

export function listingHasPetFriendlyAttribute(listing: MatchListingInput): boolean {
  return /\b(pet friendly|pet-friendly|no pet restrictions|pets allowed)\b/.test(
    listingAttributeHaystack(listing),
  );
}

export function listingHasWalkabilityAttribute(listing: MatchListingInput): boolean {
  return /\b(walkable|walkability|pedestrian)\b/.test(listingAttributeHaystack(listing));
}

export function listingHasSchoolPriorityAttribute(listing: MatchListingInput): boolean {
  return /\b(school zone|top schools|schools nearby|school district)\b/.test(
    listingAttributeHaystack(listing),
  );
}

export function listingHasInvestmentAttribute(listing: MatchListingInput): boolean {
  return /\b(investment property|income property|rental income|cap rate|tenant in place|airbnb)\b/.test(
    listingAttributeHaystack(listing),
  );
}

const FEATURE_REASON_CHECKS: { reason: VerifiedListingFeatureReason; check: (l: MatchListingInput) => boolean }[] =
  [
    { reason: VERIFIED_LISTING_REASON.pool, check: listingHasPoolAttribute },
    { reason: VERIFIED_LISTING_REASON.waterfront, check: listingHasWaterfrontAttribute },
    { reason: VERIFIED_LISTING_REASON.oceanView, check: listingHasOceanViewAttribute },
    { reason: VERIFIED_LISTING_REASON.modernStyle, check: listingHasModernStyleAttribute },
    { reason: VERIFIED_LISTING_REASON.renovated, check: listingHasRenovatedAttribute },
    { reason: VERIFIED_LISTING_REASON.gatedCommunity, check: listingHasGatedCommunityAttribute },
    { reason: VERIFIED_LISTING_REASON.luxury, check: listingHasLuxuryAttribute },
    { reason: VERIFIED_LISTING_REASON.parking, check: listingHasParkingAttribute },
    { reason: VERIFIED_LISTING_REASON.petFriendly, check: listingHasPetFriendlyAttribute },
    { reason: VERIFIED_LISTING_REASON.walkability, check: listingHasWalkabilityAttribute },
    { reason: VERIFIED_LISTING_REASON.schoolPriority, check: listingHasSchoolPriorityAttribute },
    { reason: VERIFIED_LISTING_REASON.investmentIntent, check: listingHasInvestmentAttribute },
  ];

/** All verified feature reasons present on this listing (deduped, stable order). */
export function collectVerifiedListingFeatureReasons(listing: MatchListingInput): VerifiedListingFeatureReason[] {
  const out: VerifiedListingFeatureReason[] = [];
  for (const { reason, check } of FEATURE_REASON_CHECKS) {
    if (check(listing)) out.push(reason);
  }
  return out;
}

/** Short phrase for composer/detail line — first verified attribute, humanized. */
export function pickVerifiedListingFeaturePhrase(listing: MatchListingInput): string | null {
  const reasons = collectVerifiedListingFeatureReasons(listing);
  if (reasons.length === 0) return null;
  const first = reasons[0];
  if (first === VERIFIED_LISTING_REASON.pool) return "Pool";
  if (first === VERIFIED_LISTING_REASON.waterfront) return "Waterfront";
  if (first === VERIFIED_LISTING_REASON.oceanView) return "Ocean view";
  if (first === VERIFIED_LISTING_REASON.modernStyle) return "Modern";
  if (first === VERIFIED_LISTING_REASON.renovated) return "Renovated";
  if (first === VERIFIED_LISTING_REASON.gatedCommunity) return "Gated community";
  if (first === VERIFIED_LISTING_REASON.luxury) return "Luxury";
  if (first === VERIFIED_LISTING_REASON.investmentIntent) return "Investment potential";
  return first;
}

/** Map a buyer must-have chip to a verified listing reason, or null if unsupported. */
export function verifiedMustHaveReason(
  raw: string,
  listing: MatchListingInput,
): VerifiedListingFeatureReason | null {
  const term = normalizeText(raw);
  if (!term || term.startsWith("sqft_")) return null;

  if (/\bpool\b/.test(term)) {
    return listingHasPoolAttribute(listing) ? VERIFIED_LISTING_REASON.pool : null;
  }
  if (/\bwaterfront\b/.test(term)) {
    return listingHasWaterfrontAttribute(listing) ? VERIFIED_LISTING_REASON.waterfront : null;
  }
  if (/\bocean\s*view\b/.test(term) || /\bwater\s*view\b/.test(term) || (term.includes("ocean") && term.includes("view"))) {
    return listingHasOceanViewAttribute(listing) ? VERIFIED_LISTING_REASON.oceanView : null;
  }
  if (/\bmodern\b/.test(term)) {
    return listingHasModernStyleAttribute(listing) ? VERIFIED_LISTING_REASON.modernStyle : null;
  }
  if (/\b(renovated|updated|remodeled)\b/.test(term)) {
    return listingHasRenovatedAttribute(listing) ? VERIFIED_LISTING_REASON.renovated : null;
  }
  if (/\bgated\b/.test(term)) {
    return listingHasGatedCommunityAttribute(listing) ? VERIFIED_LISTING_REASON.gatedCommunity : null;
  }
  if (/\bluxury\b/.test(term)) {
    return listingHasLuxuryAttribute(listing) ? VERIFIED_LISTING_REASON.luxury : null;
  }
  if (/\b(garage|parking)\b/.test(term)) {
    return listingHasParkingAttribute(listing) ? VERIFIED_LISTING_REASON.parking : null;
  }
  if (/\bpet\b/.test(term)) {
    return listingHasPetFriendlyAttribute(listing) ? VERIFIED_LISTING_REASON.petFriendly : null;
  }
  if (/\binvest/.test(term)) {
    return listingHasInvestmentAttribute(listing) ? VERIFIED_LISTING_REASON.investmentIntent : null;
  }

  return null;
}

const STRUCTURAL_REASON_PREFIXES = [
  "matches preferred area",
  "near preferred area",
  "within budget",
  "slightly above budget",
  "slightly below minimum",
  "matches property type",
  "matches bedroom",
  "matches bathroom",
  "meets minimum square footage",
  "within square footage",
  "low hoa",
  "hoa not listed",
  "cash buyer",
  "pre-approved",
  "east of",
  "west of",
  "north of",
  "south of",
  "new listing",
  "recently reduced",
  "price reduction",
];

function isStructuralMatchReason(reason: string): boolean {
  const lower = reason.trim().toLowerCase();
  return STRUCTURAL_REASON_PREFIXES.some((p) => lower.startsWith(p) || lower.includes(p));
}

/** Drop feature claims that are not verified on the listing (safety net for AI/stale reasons). */
export function filterReasonsToVerifiedListingFacts(
  reasons: string[],
  listing: MatchListingInput,
): string[] {
  const verified = new Set(collectVerifiedListingFeatureReasons(listing).map((r) => r.toLowerCase()));
  const aliasMap: Record<string, VerifiedListingFeatureReason> = {
    "includes pool": VERIFIED_LISTING_REASON.pool,
    pool: VERIFIED_LISTING_REASON.pool,
    waterfront: VERIFIED_LISTING_REASON.waterfront,
    "ocean view": VERIFIED_LISTING_REASON.oceanView,
    "offers ocean view": VERIFIED_LISTING_REASON.oceanView,
    "modern style": VERIFIED_LISTING_REASON.modernStyle,
    modern: VERIFIED_LISTING_REASON.modernStyle,
    "gated community": VERIFIED_LISTING_REASON.gatedCommunity,
    gated: VERIFIED_LISTING_REASON.gatedCommunity,
    "luxury home": VERIFIED_LISTING_REASON.luxury,
    luxury: VERIFIED_LISTING_REASON.luxury,
    renovated: VERIFIED_LISTING_REASON.renovated,
    parking: VERIFIED_LISTING_REASON.parking,
    "investment potential": VERIFIED_LISTING_REASON.investmentIntent,
  };

  return reasons.filter((reason) => {
    const trimmed = reason.trim();
    if (!trimmed) return false;
    if (isStructuralMatchReason(trimmed)) return true;
    if (/^includes\s+/i.test(trimmed)) return false;

    const lower = trimmed.toLowerCase();
    const canonical = aliasMap[lower];
    if (canonical) return verified.has(canonical.toLowerCase());

    for (const v of verified) {
      if (lower === v.toLowerCase() || lower.includes(v.toLowerCase())) return true;
    }
    return false;
  });
}

export type ListingVerifiedFactsSummary = {
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  city: string | null;
  state: string | null;
  price: string | null;
  pool: boolean;
  waterfront: boolean;
  oceanView: boolean;
  modernStyle: boolean;
  renovated: boolean;
  gatedCommunity: boolean;
  luxury: boolean;
  investmentPotential: boolean;
  view: string | null;
  verifiedFeatureReasons: VerifiedListingFeatureReason[];
};

export function buildListingVerifiedFactsSummary(
  listing: MatchListingInput,
  formatPrice: (cents: number | null) => string | null,
): ListingVerifiedFactsSummary {
  return {
    propertyType: listing.propertyType,
    beds: listing.beds,
    baths: listing.baths,
    city: listing.city,
    state: listing.state,
    price: formatPrice(listing.priceCents),
    pool: listingHasPoolAttribute(listing),
    waterfront: listingHasWaterfrontAttribute(listing),
    oceanView: listingHasOceanViewAttribute(listing),
    modernStyle: listingHasModernStyleAttribute(listing),
    renovated: listingHasRenovatedAttribute(listing),
    gatedCommunity: listingHasGatedCommunityAttribute(listing),
    luxury: listingHasLuxuryAttribute(listing),
    investmentPotential: listingHasInvestmentAttribute(listing),
    view: listing.listingDetails?.view ?? null,
    verifiedFeatureReasons: collectVerifiedListingFeatureReasons(listing),
  };
}

/** Fields used for each verified reason (audit/documentation helper). */
export const VERIFIED_REASON_SOURCE_FIELDS: Record<VerifiedListingFeatureReason, string> = {
  [VERIFIED_LISTING_REASON.pool]: "listing_details.pool | features[] | description",
  [VERIFIED_LISTING_REASON.waterfront]: "listing_details.waterfront | features[] | description (explicit waterfront)",
  [VERIFIED_LISTING_REASON.oceanView]: "listing_details.view | description/features (explicit ocean/water view)",
  [VERIFIED_LISTING_REASON.modernStyle]: "features[] | description (modern/contemporary)",
  [VERIFIED_LISTING_REASON.gatedCommunity]: "features[] | description (gated)",
  [VERIFIED_LISTING_REASON.luxury]: "features[] | description (luxury/prestigious)",
  [VERIFIED_LISTING_REASON.renovated]: "features[] | description (renovated/updated/remodeled)",
  [VERIFIED_LISTING_REASON.parking]: "listing_details.parkingGarage | features[] | description",
  [VERIFIED_LISTING_REASON.petFriendly]: "features[] | description",
  [VERIFIED_LISTING_REASON.walkability]: "features[] | description",
  [VERIFIED_LISTING_REASON.schoolPriority]: "features[] | description",
  [VERIFIED_LISTING_REASON.investmentIntent]: "features[] | description (investment/rental income)",
};
