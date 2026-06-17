/**
 * Copilot pool = direct-share eligible listings only; drafts always include verified share URL.
 * Run: npx tsx tests/copilot-shareable-matching.test.ts
 */
import {
  buildListingComposerMessage,
  composerDraftHasShareListingUrl,
} from "../shared/inventory/inventoryComposerDraft";
import {
  canDirectShareListing,
  getDirectShareRejectionReason,
  isCopilotAgentShareListing,
} from "../shared/inventory/publicListingPublication";
import { buildListingShareUrl } from "../shared/inventory/listingViewUrl";
import { getListingDirectShareMeta } from "../server/inventory/inventoryDb";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const COMPLIANT = {
  mlgCanView: true,
  internetEntireListingDisplay: true,
  internetDisplay: true,
  internetAddressDisplay: true,
  listOfficeName: "Premier Realty",
  listAgentName: "Pat Seller",
  mlsSourceName: "mfrmls",
  mlsListingId: "A1234567",
  provider: "mls_grid" as const,
  extractedAt: "2026-01-01T00:00:00.000Z",
};

const listingId = "22222222-2222-4222-8222-222222222222";
const origin = "https://app.example.com";
const shareUrl = buildListingShareUrl(listingId, origin);

assert(
  isCopilotAgentShareListing({ status: "active", listingCompliance: COMPLIANT }),
  "compliant active listing is in Copilot pool",
);

const nonShareableCompliance = { ...COMPLIANT, mlsListingId: "" };
assert(
  !isCopilotAgentShareListing({ status: "active", listingCompliance: nonShareableCompliance }),
  "non-shareable listing excluded from Copilot pool",
);
assert(
  getDirectShareRejectionReason({ status: "active", listingCompliance: nonShareableCompliance }) !=
    null,
  "non-shareable has rejection reason",
);

const meta = getListingDirectShareMeta({
  id: listingId,
  userId: "u1",
  sourceId: "s1",
  providerListingId: "A123",
  status: "active",
  publishPublicly: false,
  publishedAt: null,
  publicSlug: null,
  listingCompliance: COMPLIANT,
} as Parameters<typeof getListingDirectShareMeta>[0]);
assert(meta.allowed === true, "Copilot-visible listing has directShare.allowed=true");

const composer = buildListingComposerMessage({
  listing: {
    listingId,
    priceCents: 550_000_00,
    beds: 3,
    baths: 2,
    city: "Pompano Beach",
    state: "FL",
    propertyType: "house",
    listingUrl: null,
  },
  contactFirstName: "Susu",
  introDraft: "Hi Susu, I found a home in Pompano Beach that matches what you're looking for:",
  viewUrl: shareUrl,
});

assert(composer.text.includes("View Property Flyer:"), "composer includes flyer line");
assert(composer.text.includes(shareUrl), "composer includes verified shareUrl");
assert(composer.viewUrl === shareUrl, "composer viewUrl matches server shareUrl");
assert(composerDraftHasShareListingUrl(composer.text), "share path present in Copilot draft");

const withoutServerUrl = buildListingComposerMessage({
  listing: {
    listingId,
    priceCents: 550_000_00,
    beds: 3,
    baths: 2,
    city: "Pompano Beach",
    state: "FL",
    propertyType: "house",
    listingUrl: null,
  },
  contactFirstName: "Susu",
  viewUrl: null,
});
assert(
  !composerDraftHasShareListingUrl(withoutServerUrl.text),
  "composer never invents /share/listings without server viewUrl",
);

assert(
  canDirectShareListing({ status: "active", listingCompliance: COMPLIANT }),
  "canDirectShareListing aligns with Copilot pool",
);

console.log("copilot-shareable-matching.test.ts: all passed");
