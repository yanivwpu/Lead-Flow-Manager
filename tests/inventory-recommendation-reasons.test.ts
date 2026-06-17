/**
 * Recommendation reasons must be grounded in verified listing attributes only.
 * Run: npx tsx tests/inventory-recommendation-reasons.test.ts
 */
import {
  extractBuyerMatchCriteria,
  rankInventoryMatches,
  scoreListingAgainstCriteria,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  VERIFIED_LISTING_REASON,
  VERIFIED_REASON_SOURCE_FIELDS,
  collectVerifiedListingFeatureReasons,
  filterReasonsToVerifiedListingFacts,
  listingHasOceanViewAttribute,
  verifiedMustHaveReason,
} from "../shared/inventory/listingVerifiedMatchReasons";
import { buildListingComposerMessage } from "../shared/inventory/inventoryComposerDraft";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T) => ({
  value,
  source: "explicit" as const,
  confidence: 1,
  updatedAt: now,
});

const baseListing = (overrides: Partial<MatchListingInput> = {}): MatchListingInput => ({
  id: "11111111-1111-1111-1111-111111111111",
  providerListingId: "MLS-1",
  status: "active",
  priceCents: 650_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "1220 NE 8th St",
  addressLine2: null,
  zip: "33060",
  beds: 4,
  baths: 2,
  propertyType: "house",
  squareFeet: 1489,
  description: "Fully renovated home in prestigious Old Pompano just minutes from the beach.",
  features: ["Central Air", "Tile"],
  listingDetails: { pool: false, waterfront: false, view: "Garden" },
  listingUrl: null,
  photos: [{ url: "https://cdn.example.com/a.jpg", order: 0 }],
  ...overrides,
});

const oceanViewBuyerProfile = {
  ...emptyBuyerPreferenceProfile(),
  targetAreas: inf(["Pompano Beach"]),
  priceMax: inf(1_000_000),
  bedsMin: inf(4),
  bathsMin: inf(2),
  propertyTypes: inf(["house"]),
  mustHaves: inf(["Ocean View"]),
  modernStyle: inf(true),
};

const criteria = extractBuyerMatchCriteria(oceanViewBuyerProfile);
const listing = baseListing();

assert(!listingHasOceanViewAttribute(listing), "fixture listing lacks ocean view");
assert(
  verifiedMustHaveReason("Ocean View", listing) === null,
  "must-have ocean view does not produce reason without listing support",
);

const scored = scoreListingAgainstCriteria(listing, criteria);
const reasonText = (scored?.reasons ?? []).join(" | ").toLowerCase();
assert(!reasonText.includes("ocean view"), "scored reasons must not contain ocean view");
assert(!reasonText.includes("offers ocean"), "scored reasons must not offer ocean view");
assert(!reasonText.includes("includes ocean"), "scored reasons must not include ocean view from buyer wish");
if (scored?.reasons.some((r) => /modern/i.test(r))) {
  assert(
    listing.description?.toLowerCase().includes("renovated") ||
      collectVerifiedListingFeatureReasons(listing).includes(VERIFIED_LISTING_REASON.modernStyle),
    "modern reason only when listing supports it",
  );
}

const ranked = rankInventoryMatches([listing], criteria, 5);
if (ranked.length > 0) {
  const rankedReasons = ranked[0].reasons.join(" | ").toLowerCase();
  assert(!rankedReasons.includes("ocean view"), "ranked match must not claim ocean view");
}

assert(
  filterReasonsToVerifiedListingFacts(
    ["Offers ocean view", "Within budget", "Includes Ocean View"],
    listing,
  ).join("|") === "Within budget",
  "filter strips unverified ocean-view claims",
);

const composer = buildListingComposerMessage({
  listing: {
    listingId: listing.id,
    priceCents: listing.priceCents,
    beds: listing.beds,
    baths: listing.baths,
    city: listing.city,
    state: listing.state,
    propertyType: listing.propertyType,
    listingUrl: "https://example.com/x",
    description: listing.description,
    features: listing.features,
    listingDetails: listing.listingDetails,
  },
  contactFirstName: "Alex",
  introDraft: "Hi Alex, I found a listing that may work for you:",
  featureHints: ["Offers ocean view", "Modern style"],
  viewUrl: null,
});
assert(!composer.text.toLowerCase().includes("ocean view"), "composer must not leak buyer ocean view hint");
assert(!composer.text.includes("Offers ocean view"), "composer must not echo buyer hint text");

const poolListing = baseListing({
  listingDetails: { pool: true, waterfront: false, view: "Garden" },
  features: ["Pool"],
});
const poolCriteria = extractBuyerMatchCriteria({
  ...emptyBuyerPreferenceProfile(),
  targetAreas: inf(["Pompano Beach"]),
  priceMax: inf(1_000_000),
  pool: inf(true),
});
assert(
  collectVerifiedListingFeatureReasons(poolListing).includes(VERIFIED_LISTING_REASON.pool),
  "pool reason when listing_details.pool is true",
);
const poolScored = scoreListingAgainstCriteria(poolListing, poolCriteria);
if (poolScored) {
  assert(
    !poolScored.reasons.join(" ").toLowerCase().includes("ocean"),
    "pool match does not invent ocean view",
  );
}

assert(
  VERIFIED_REASON_SOURCE_FIELDS[VERIFIED_LISTING_REASON.oceanView].includes("listing_details.view"),
  "audit map documents ocean view source field",
);

console.log("inventory-recommendation-reasons.test.ts: OK");
