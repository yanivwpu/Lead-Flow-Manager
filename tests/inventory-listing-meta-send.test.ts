/**
 * Listing recommendation + Meta outbound sequencing tests.
 * Run: npx tsx tests/inventory-listing-meta-send.test.ts
 */
import {
  buildListingComposerMessage,
  listingComposerDraftIncludesRequiredDetails,
} from "../shared/inventory/inventoryComposerDraft";
import {
  buildMetaOutboundSteps,
  metaOutboundRequiresTextWithMedia,
} from "../shared/metaOutboundMessagePlan";
import { buildListingShareUrl } from "../shared/inventory/listingViewUrl";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "33333333-3333-4333-8333-333333333333";
const appOrigin = "https://app.whachatcrm.com";

const composer = buildListingComposerMessage({
  listing: {
    listingId,
    priceCents: 26_900_000,
    beds: 2,
    baths: 2,
    city: "Pompano Beach",
    state: "FL",
    propertyType: "condo",
    listingUrl: null,
    photos: [{ url: "https://cdn.example.com/listing.jpg", order: 0 }],
    appOrigin,
  },
  contactFirstName: "Susu",
  introDraft: "Hi Susu, I found a condo in Pompano Beach that matches what you're looking for:",
  featureHints: ["Modern condo with ocean/golf view features"],
});

const shareUrl = buildListingShareUrl(listingId, appOrigin);
assert(composer.text.includes("$269,000"), "composer price");
assert(composer.text.includes("2 bed / 2 bath"), "composer beds/baths");
assert(composer.text.includes(`View listing: ${shareUrl}`), "composer share URL");
assert(composer.primaryPhotoUrl === "https://cdn.example.com/listing.jpg", "composer photo");
assert(
  listingComposerDraftIncludesRequiredDetails(composer.text, {
    listingId,
    priceCents: 26_900_000,
    beds: 2,
    baths: 2,
    city: "Pompano Beach",
    listingUrl: null,
    appOrigin,
  }),
  "required listing details in text",
);

const metaSteps = buildMetaOutboundSteps({
  content: composer.text,
  mediaUrl: composer.primaryPhotoUrl!,
  contentType: "image",
});

assert(metaSteps.length === 2, "Meta sends text then attachment");
assert(metaSteps[0].kind === "text", "first step is text");
assert(metaSteps[1].kind === "attachment", "second step is attachment");
if (metaSteps[0].kind === "text") {
  assert(metaSteps[0].text.includes(shareUrl), "text step includes share URL");
  assert(metaSteps[0].text.includes("$269,000"), "text step includes price");
}
assert(metaOutboundRequiresTextWithMedia(metaSteps) === false, "not image-only");

const imageOnly = buildMetaOutboundSteps({
  content: "",
  mediaUrl: "https://cdn.example.com/listing.jpg",
  contentType: "image",
});
assert(metaOutboundRequiresTextWithMedia(imageOnly) === true, "detects image-only plan");

console.log("inventory-listing-meta-send.test.ts: all passed");
