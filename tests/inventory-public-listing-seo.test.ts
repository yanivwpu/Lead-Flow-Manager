/**
 * Public listing SEO metadata and sitemap helpers.
 * Run: npx tsx tests/inventory-public-listing-seo.test.ts
 */
import {
  buildListingOpenGraphMeta,
  buildListingSeoMeta,
  buildListingStructuredDataJson,
  buildPublicListingFlyerHtml,
  buildPublicListingLoadErrorHtml,
  buildPublicListingNotFoundHtml,
  inventoryRowToFlyerListing,
  LISTING_OG_IMAGE_HEIGHT,
  LISTING_OG_IMAGE_WIDTH,
  renderListingOpenGraphTags,
} from "../shared/inventory/publicListingFlyer";
import { mock } from "node:test";
import { db } from "../drizzle/db";
import { buildListingPublicSlug } from "../shared/inventory/listingPublicSlug";
import { ensurePublicSlugForListing, resolvePublicShareListing } from "../server/inventory/inventoryDb";
import { renderUrlset, sitemapLocForEntry } from "../server/routes/publicListingsSitemap";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "2e059e00-0846-4f23-a606-cf0812b57bff";
const address = {
  addressLine1: "3503 Oaks Way",
  addressLine2: "#308",
  city: "Pompano Beach",
  state: "FL",
  zip: "33069",
};
const publicSlug = buildListingPublicSlug({ id: listingId, ...address });
if (publicSlug !== "3503-oaks-way-308-pompano-beach-fl-33069-2e059e00") {
  throw new Error(`Expected the existing address slug, got ${publicSlug}`);
}
const origin = "https://app.whachatcrm.com";
const canonicalUrl = `${origin}/share/listings/${publicSlug}`;

const publicAddressCompliance = { internetEntireListingDisplay: true, internetAddressDisplay: true };
const listing = inventoryRowToFlyerListing({
  id: listingId,
  priceCents: 26500000,
  beds: "2",
  baths: "2",
  squareFeet: 1225,
  yearBuilt: 1981,
  hoaFeeCents: 80500,
  propertyType: "condo",
  propertySubtype: "Condominium",
  description: "Bright corner unit.",
  features: ["Pool"],
  photos: [{ url: "https://cdn.example.com/a.jpg", order: 0 }],
  ...address,
  latitude: 26.2,
  longitude: -80.1,
  status: "active",
  providerListingId: "A11996737",
  listingDetails: {},
  listingCompliance: publicAddressCompliance,
});

const agent = {
  name: "Jane Agent",
  email: "jane@broker.com",
  phone: "+1 954-555-0100",
  avatarUrl: null,
  brokerageName: "Summit Realty",
  bookingLink: null,
};

const seo = buildListingSeoMeta({ listing, agent, shareUrl: canonicalUrl });
assert(seo.title.includes("3503 Oaks Way #308"), "seo title includes street");
assert(seo.title.includes("2 Beds 2 Baths"), "seo title includes beds baths");
assert(seo.title.includes("Pompano Beach, FL Real Estate"), "seo title includes market");
assert(seo.description.includes("View 3503 Oaks Way #308."), "seo description lead");
assert(seo.description.includes("1,225 sq ft"), "seo description sqft");
assert(seo.description.includes("$265,000"), "seo description price");

const og = buildListingOpenGraphMeta({ listing, agent, shareUrl: canonicalUrl });
assert(og.shareUrl === canonicalUrl, "og url canonical");
assert(og.imageUrl === "https://cdn.example.com/a.jpg", "og image");

const jsonLd = buildListingStructuredDataJson({ listing, agent, shareUrl: canonicalUrl });
assert(jsonLd != null, "json-ld generated");
assert(jsonLd!.includes('"@type":["RealEstateListing","Residence"]'), "schema types");
assert(jsonLd!.includes('"price":"265000"'), "schema price");
assert(jsonLd!.includes('"yearBuilt":1981'), "schema year built");

const html = buildPublicListingFlyerHtml({
  listing,
  agent,
  shareUrl: canonicalUrl,
  qrDataUrl: "data:image/png;base64,TEST",
});
assert(html.includes(`<link rel="canonical" href="${canonicalUrl}"`), "canonical tag");
assert(html.includes('property="og:url"'), "og url tag");
assert(html.includes('name="twitter:card" content="summary_large_image"'), "twitter card");
assert(
  html.includes(`property="og:image:width" content="${LISTING_OG_IMAGE_WIDTH}"`),
  "og image width",
);
assert(
  html.includes(`property="og:image:height" content="${LISTING_OG_IMAGE_HEIGHT}"`),
  "og image height",
);
assert(html.includes("application/ld+json"), "json-ld script");
assert(html.includes(`<title>${seo.title}</title>`), "document title includes permitted street and market");

const uuidUrl = `${origin}/share/listings/${listingId}`;
for (const internetAddressDisplay of [false, undefined]) {
  const listingCompliance = { internetEntireListingDisplay: true, internetAddressDisplay };
  const restrictedHtml = buildPublicListingFlyerHtml({
    listing: {
      ...listing,
      listingCompliance,
      description: "Welcome to 3503 Oaks Way #308.",
      photos: [{ url: "https://cdn.example.com/3503-oaks-way.jpg", order: 0 }],
    },
    agent,
    shareUrl: canonicalUrl,
    qrDataUrl: "data:image/png;base64,TEST",
  });
  const restrictedHead = restrictedHtml.split("</head>")[0];
  assert(restrictedHead.includes(`rel="canonical" href="${uuidUrl}"`), "restricted canonical uses UUID");
  assert(restrictedHead.includes(`property="og:url" content="${uuidUrl}"`), "restricted social URL uses UUID");
  assert(restrictedHead.includes(`"url":"${uuidUrl}"`), "restricted JSON-LD uses UUID");
  assert(!restrictedHead.includes('"streetAddress"'), "restricted JSON-LD masks the street");
  assert(!restrictedHead.includes("3503"), "restricted address absent from SEO metadata");
  assert(!restrictedHtml.includes("3503 Oaks Way"), "restricted remarks do not reintroduce the address");
  assert(!restrictedHtml.includes("3503-oaks-way"), "restricted page omits the legacy slug and provider photo URL");

  const restrictedSitemap = renderUrlset([{ id: listingId, publicSlug, listingCompliance, lastmod: new Date("2026-06-01") }], origin);
  assert(restrictedSitemap.includes(`<loc>${uuidUrl}</loc>`), "restricted sitemap uses UUID");
  assert(!restrictedSitemap.includes(publicSlug), "restricted sitemap omits the stored address slug");
}

const ogTags = renderListingOpenGraphTags(og);
assert(ogTags.includes('property="og:image:width"'), "renderListingOpenGraphTags width");
assert(ogTags.includes('property="og:image:height"'), "renderListingOpenGraphTags height");

const notFoundHtml = buildPublicListingNotFoundHtml();
assert(
  notFoundHtml.includes('property="og:title" content="Listing not available | WhachatCRM"'),
  "404 og title",
);
assert(
  notFoundHtml.includes(
    'property="og:description" content="This listing may be unavailable or expired."',
  ),
  "404 og description",
);

const loadErrorHtml = buildPublicListingLoadErrorHtml();
assert(
  loadErrorHtml.includes('property="og:title" content="Listing not available | WhachatCRM"'),
  "500 og title",
);
assert(
  loadErrorHtml.includes(
    'property="og:description" content="This listing may be unavailable or expired."',
  ),
  "500 og description",
);

const urlset = renderUrlset(
  [{ id: listingId, publicSlug, listingCompliance: publicAddressCompliance, lastmod: new Date("2026-06-01") }],
  origin,
);
assert(urlset.includes(canonicalUrl), "sitemap uses slug url");
assert(urlset.includes("<lastmod>2026-06-01</lastmod>"), "sitemap lastmod");

const uuidFallback = sitemapLocForEntry(
  { id: listingId, publicSlug: null, listingCompliance: publicAddressCompliance, lastmod: new Date() },
  origin,
);
assert(uuidFallback === `${origin}/share/listings/${listingId}`, "sitemap uuid fallback");

// Exercise the lookup and slug assignment against an MLS row with a stored legacy slug.
const legacyRow = {
  id: listingId,
  publicSlug,
  providerListingId: "A11996737",
  status: "active",
  listingCompliance: {
    ...publicAddressCompliance,
    internetAddressDisplay: false,
    listOfficeName: "Summit Realty",
    mlsSourceName: "Example MLS",
    mlsListingId: "A11996737",
  },
};
const select = mock.method(db, "select", () => ({
  from: () => ({ where: () => ({ limit: async () => [legacyRow] }) }),
}) as unknown as ReturnType<typeof db.select>);
try {
  assert(await ensurePublicSlugForListing(listingId) === null, "restricted legacy slug is not reissued");
  assert(await resolvePublicShareListing(publicSlug) === undefined, "restricted legacy URL stops resolving");
  assert((await resolvePublicShareListing(listingId))?.id === listingId, "restricted UUID remains shareable");

  legacyRow.listingCompliance.internetAddressDisplay = true;
  assert(await ensurePublicSlugForListing(listingId) === publicSlug, "permitted slug is preserved");
  assert((await resolvePublicShareListing(publicSlug))?.id === listingId, "permitted slug still resolves");
} finally {
  select.mock.restore();
}

console.log("inventory-public-listing-seo.test.ts: OK");
