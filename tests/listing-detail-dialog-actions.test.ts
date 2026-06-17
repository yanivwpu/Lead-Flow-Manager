/**
 * Listing modal action button visibility.
 * Run: npx tsx tests/listing-detail-dialog-actions.test.ts
 */
import {
  buildListingComposerMessage,
  composerDraftHasShareListingUrl,
} from "../shared/inventory/inventoryComposerDraft";
import {
  getShareListingButtonState,
  shouldShowPreviewFlyerButton,
} from "../shared/inventory/listingDetailDialogActions";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "33333333-3333-4333-8333-333333333333";

assert(shouldShowPreviewFlyerButton(listingId), "preview flyer always shown when listing id exists");
assert(!shouldShowPreviewFlyerButton(null), "no preview without listing id");

const allowedShare = getShareListingButtonState({
  listingId,
  directShare: { allowed: true, blockedReason: null },
  directShareLoaded: true,
});
assert(allowedShare.show && allowedShare.enabled, "share listing shown when allowed");

const blockedShare = getShareListingButtonState({
  listingId,
  directShare: { allowed: false, blockedReason: "missing attribution" },
  directShareLoaded: true,
});
assert(!blockedShare.show && !blockedShare.enabled, "share listing hidden when blocked");

const loadingShare = getShareListingButtonState({
  listingId,
  directShare: undefined,
  directShareLoaded: false,
});
assert(!loadingShare.show, "share button hidden until direct-share meta loads");

const nonShareableDraft = buildListingComposerMessage({
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
  contactFirstName: "Sam",
  viewUrl: null,
});
assert(
  !composerDraftHasShareListingUrl(nonShareableDraft.text),
  "non-shareable listing composer never includes /share/listings link",
);

console.log("listing-detail-dialog-actions.test.ts: all passed");
