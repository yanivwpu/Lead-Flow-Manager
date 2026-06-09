/**
 * Regression: listing modal draft must work from match-card data when API draft fails.
 * Run: npx tsx tests/inventory-listing-draft-fallback.test.ts
 */
import {
  buildListingComposerMessage,
  listingComposerDraftIncludesRequiredDetails,
} from "../shared/inventory/inventoryComposerDraft";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "33333333-3333-4333-8333-333333333333";
const appOrigin = "https://app.example.com";

/** Minimal facts available from MatchingListingsPanel fallback summary. */
const matchCardFallback = {
  listingId,
  priceCents: 425_000_00,
  beds: 3,
  baths: 2,
  city: "Fort Lauderdale",
  state: "FL",
  propertyType: "house",
  listingUrl: null,
  thumbnailUrl: "https://cdn.example.com/thumb.jpg",
  appOrigin,
};

const clientFallback = buildListingComposerMessage({
  listing: matchCardFallback,
  contactFirstName: "Alex",
  featureHints: ["Within your budget", "3+ bedrooms in Fort Lauderdale"],
});

assert(clientFallback.text.includes("Hi Alex"), "deterministic greeting");
assert(clientFallback.text.includes("$425,000"), "includes price from match card");
assert(clientFallback.text.includes("3 bed / 2 bath"), "includes beds/baths");
assert(clientFallback.text.includes("Fort Lauderdale, FL"), "includes location");
assert(
  clientFallback.text.includes(`View Property Flyer: ${appOrigin}/share/listings/${listingId}`),
  "share URL in customer message",
);
assert(
  listingComposerDraftIncludesRequiredDetails(clientFallback.text, matchCardFallback),
  "required details present for client fallback",
);

console.log("inventory-listing-draft-fallback.test.ts: all passed");
