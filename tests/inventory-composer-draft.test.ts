/**
 * Listing composer draft builder tests.
 * Run: npx tsx tests/inventory-composer-draft.test.ts
 */
import {
  buildListingComposerMessage,
  composerDraftHasShareListingUrl,
  formatBedsBathsForComposer,
  formatListingPriceForComposer,
  listingComposerDraftIncludesRequiredDetails,
  stripListingShareUrlsFromComposerText,
} from "../shared/inventory/inventoryComposerDraft";
import { buildListingShareUrl } from "../shared/inventory/listingViewUrl";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "22222222-2222-4222-8222-222222222222";
const appOrigin = "https://app.example.com";
const shareUrl = buildListingShareUrl(listingId, appOrigin);

const listing = {
  listingId,
  priceCents: 26_900_000,
  beds: 2,
  baths: 2,
  city: "Pompano Beach",
  state: "FL",
  propertyType: "condo",
  listingUrl: "https://example.com/listing/123",
  description: "Modern condo with ocean and golf views",
  photos: [{ url: "https://example.com/photo.jpg", order: 0 }],
};

assert(formatListingPriceForComposer(26_900_000) === "$269,000", "price format");
assert(formatBedsBathsForComposer(2, 2) === "2 bed / 2 bath", "beds/baths format");

const withUrl = buildListingComposerMessage({
  listing,
  contactFirstName: "Susu",
  introDraft:
    "Hi Susu, I found a listing that matches your preferences. Would you like me to send you the details?",
  featureHints: ["Modern condo with ocean/golf view features"],
  viewUrl: shareUrl,
});

assert(withUrl.text.includes("Hi Susu"), "includes greeting");
assert(withUrl.text.includes("$269,000"), "includes price");
assert(withUrl.text.includes("2 bed / 2 bath"), "includes beds/baths");
assert(withUrl.text.includes("Pompano Beach, FL"), "includes location");
assert(withUrl.text.includes(`View Property Flyer: ${shareUrl}`), "includes server share URL");
assert(withUrl.viewUrl === shareUrl, "viewUrl is server share URL");
assert(!withUrl.text.includes("example.com/listing/123"), "no external MLS URL");
assert(withUrl.primaryPhotoUrl === "https://example.com/photo.jpg", "primary photo");
assert(
  listingComposerDraftIncludesRequiredDetails(withUrl.text, listing, { viewUrl: shareUrl }),
  "trace helper passes for full draft",
);

const withoutUrl = buildListingComposerMessage({
  listing: { ...listing, listingUrl: null },
  contactFirstName: "Susu",
  featureHints: ["Pool and updated kitchen"],
  viewUrl: null,
});

assert(!withoutUrl.text.includes("/share/listings/"), "no share URL without server viewUrl");
assert(
  listingComposerDraftIncludesRequiredDetails(withoutUrl.text, { ...listing, listingUrl: null }),
  "trace helper passes without share URL",
);

const staleApiDraft = `Hi Susu:\n\n$269,000\n\nView Property Flyer: ${shareUrl}\n\nWould you like more details?`;
const stripped = stripListingShareUrlsFromComposerText(staleApiDraft);
assert(!composerDraftHasShareListingUrl(stripped), "strip removes stale share links");

console.log("inventory-composer-draft.test.ts: all passed");
