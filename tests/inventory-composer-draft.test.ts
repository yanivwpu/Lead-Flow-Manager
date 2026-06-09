/**
 * Listing composer draft builder tests.
 * Run: npx tsx tests/inventory-composer-draft.test.ts
 */
import {
  buildListingComposerMessage,
  formatBedsBathsForComposer,
  formatListingPriceForComposer,
  listingComposerDraftIncludesRequiredDetails,
} from "../shared/inventory/inventoryComposerDraft";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listing = {
  listingId: "lst-1",
  priceCents: 26_900_000,
  beds: 2,
  baths: 2,
  city: "Pompano Beach",
  state: "FL",
  propertyType: "condo",
  listingUrl: "https://example.com/listing/123",
  description: "Modern condo with ocean and golf views",
};

assert(formatListingPriceForComposer(26_900_000) === "$269,000", "price format");
assert(formatBedsBathsForComposer(2, 2) === "2 bed / 2 bath", "beds/baths format");

const withUrl = buildListingComposerMessage({
  listing,
  contactFirstName: "Susu",
  introDraft:
    "Hi Susu, I found a listing that matches your preferences. Would you like me to send you the details?",
  featureHints: ["Modern condo with ocean/golf view features"],
});

assert(withUrl.includes("Hi Susu"), "includes greeting");
assert(withUrl.includes("$269,000"), "includes price");
assert(withUrl.includes("2 bed / 2 bath"), "includes beds/baths");
assert(withUrl.includes("Pompano Beach, FL"), "includes location");
assert(withUrl.includes("View listing: https://example.com/listing/123"), "includes URL");
assert(
  listingComposerDraftIncludesRequiredDetails(withUrl, listing),
  "trace helper passes for full draft",
);

const withoutUrl = buildListingComposerMessage({
  listing: { ...listing, listingUrl: null },
  contactFirstName: "Susu",
  featureHints: ["Pool and updated kitchen"],
});

assert(!withoutUrl.includes("View listing:"), "no fake URL line");
assert(withoutUrl.includes("$269,000"), "no-url draft still has price");
assert(
  listingComposerDraftIncludesRequiredDetails(withoutUrl, { ...listing, listingUrl: null }),
  "trace helper passes without URL",
);

console.log("inventory-composer-draft.test.ts: all passed");
