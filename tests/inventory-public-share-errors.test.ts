/**
 * Public share error pages.
 * Run: npx tsx tests/inventory-public-share-errors.test.ts
 */
import {
  buildPublicListingLoadErrorHtml,
  buildPublicListingNotFoundHtml,
} from "../shared/inventory/publicListingFlyer";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const notFound = buildPublicListingNotFoundHtml();
assert(notFound.includes("Listing not available"), "not-found title");
assert(notFound.includes("sold"), "not-found explains inactive listing");
assert(!notFound.includes("Unable to load listing"), "not-found distinct from load error");

const loadError = buildPublicListingLoadErrorHtml();
assert(loadError.includes("Could not load listing"), "load error title");
assert(loadError.includes("try again"), "load error suggests retry");
assert(!loadError.includes("sold"), "load error distinct from not-found");

console.log("inventory-public-share-errors.test.ts: OK");
