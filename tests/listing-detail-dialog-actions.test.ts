/**
 * Listing modal action button visibility.
 * Run: npx tsx tests/listing-detail-dialog-actions.test.ts
 */
import {
  getShareListingButtonState,
  resolveComposerShareOrigin,
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
assert(allowedShare.show && allowedShare.enabled, "share listing enabled when allowed");

const blockedShare = getShareListingButtonState({
  listingId,
  directShare: { allowed: false, blockedReason: "missing attribution" },
  directShareLoaded: true,
});
assert(blockedShare.show && !blockedShare.enabled, "share listing shown but disabled when blocked");

const loadingShare = getShareListingButtonState({
  listingId,
  directShare: undefined,
  directShareLoaded: false,
});
assert(!loadingShare.show, "share button hidden until direct-share meta loads");

assert(
  resolveComposerShareOrigin({ appOrigin: "https://app.example.com", directShareAllowed: true }) ===
    "https://app.example.com",
  "composer may include share URL when direct-share allowed",
);
assert(
  resolveComposerShareOrigin({ appOrigin: "https://app.example.com", directShareAllowed: false }) ===
    null,
  "composer omits share URL when direct-share blocked",
);

console.log("listing-detail-dialog-actions.test.ts: all passed");
