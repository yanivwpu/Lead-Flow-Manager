/**
 * Public listing SEO slug utilities.
 * Run: npx tsx tests/inventory-listing-public-slug.test.ts
 */
import {
  buildListingPublicSlug,
  isListingShareUuid,
  listingHasPublicSlugAddress,
  listingPublicSlugSuffix,
  slugifyListingText,
} from "../shared/inventory/listingPublicSlug";
import {
  buildListingCanonicalShareUrl,
  buildListingSharePath,
  buildListingShareUrl,
  resolveListingShareSegment,
} from "../shared/inventory/listingViewUrl";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "2e059e00-0846-4f23-a606-cf0812b57bff";

assert(isListingShareUuid(listingId), "uuid detected");
assert(!isListingShareUuid("3503-oaks-way-308-pompano-beach-fl-33069-2e059e00"), "slug not uuid");

assert(slugifyListingText("3503 Oaks Way #308") === "3503-oaks-way-308", "unit slugify");
assert(listingPublicSlugSuffix(listingId) === "2e059e00", "stable suffix");

const slug = buildListingPublicSlug({
  id: listingId,
  addressLine1: "3503 Oaks Way",
  addressLine2: "#308",
  city: "Pompano Beach",
  state: "FL",
  zip: "33069",
});
assert(
  slug === "3503-oaks-way-308-pompano-beach-fl-33069-2e059e00",
  `expected full slug, got ${slug}`,
);

const slugFromUnparsed = buildListingPublicSlug({
  id: listingId,
  addressLine1: "3503 Oaks Way # 308, Pompano Beach FL 33069",
  addressLine2: null,
  city: "Pompano Beach",
  state: "FL",
  zip: "33069",
});
assert(
  slugFromUnparsed === "3503-oaks-way-308-pompano-beach-fl-33069-2e059e00",
  `unparsed line1 slug, got ${slugFromUnparsed}`,
);

assert(
  listingHasPublicSlugAddress({
    id: listingId,
    addressLine1: "3503 Oaks Way",
    city: "Pompano Beach",
    state: "FL",
    zip: "33069",
  }),
  "address sufficient",
);

assert(
  resolveListingShareSegment({ listingId, publicSlug: slug }) === slug,
  "prefer slug segment",
);
assert(
  resolveListingShareSegment({ listingId, publicSlug: null }) === listingId,
  "fallback uuid segment",
);

const origin = "https://app.whachatcrm.com";
assert(
  buildListingShareUrl({ listingId, publicSlug: slug }, origin) ===
    `${origin}/share/listings/${slug}`,
  "share url uses slug",
);
assert(
  buildListingCanonicalShareUrl({ listingId, publicSlug: slug }, origin).includes(slug!),
  "canonical uses slug",
);
assert(buildListingSharePath(listingId) === `/share/listings/${listingId}`, "uuid path preserved");

console.log("inventory-listing-public-slug.test.ts: OK");
